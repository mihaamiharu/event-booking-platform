// Workspace endpoints (WSP-004, WSP-003, WSP-001; API-CONTRACT §3.1).
import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppContext } from "../app.ts";
import { first, newMeta, run, type D1Database, type D1Meta } from "../db.ts";
import { err } from "../errors.ts";
import { checkRateLimit, clientIp } from "../ratelimit.ts";
import { isArmed, recordPass, recordRateLimitHit, verifyToken } from "../turnstile.ts";
import { provisionWorkspace, resetWorkspace } from "../seed.ts";
import { resolveSession } from "../session.ts";
import { d1BatchDb } from "../db.ts";
import {
  getCookie,
  isExpired,
  requestIsSecure,
  signWorkspace,
  verifyWorkspace,
  WORKSPACE_TTL_MS,
  type WorkspaceRow,
} from "../workspace.ts";

export async function touchActivity(
  meta: D1Meta,
  db: D1Database,
  workspaceId: string,
  nowIso: string,
): Promise<void> {
  await run(meta, db, "UPDATE workspaces SET last_active_at = ?1 WHERE id = ?2", nowIso, workspaceId);
}

function workspaceShape(ws: WorkspaceRow) {  return {
    workspace: {
      status: ws.status,
      seedVersion: ws.seed_version,
      seedReferenceAt: ws.seed_reference_at,
      expiresAt: new Date(Date.parse(ws.last_active_at) + WORKSPACE_TTL_MS).toISOString(),
    },
  };
}

function withCookieAndMeta(
  c: Context<AppContext>,
  data: unknown,
  meta: D1Meta,
  cookieValue: string,
  secure: boolean,
  status: ContentfulStatusCode = 200,
): Response {
  const parts = [
    "ebp_workspace=" + cookieValue,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=604800",
  ];
  if (secure) parts.push("Secure");
  return c.json({ ...(data as object), meta }, status, {
    "set-cookie": parts.join("; "),
  });
}

export const workspaces = new Hono<AppContext>();

/**
 * Enforce an armed Turnstile challenge. Returns null when the caller may
 * proceed (valid token, pass cached), else the 403/503 response to send.
 * Token travels in the JSON body (`turnstileToken`), never in logs.
 */
export async function requireChallenge(
  c: Context<AppContext>,
  meta: D1Meta,
  db: D1Database,
  ip: string,
  offeredToken: unknown,
  nowMs: number,
): Promise<Response | null> {
  if (typeof offeredToken !== "string" || offeredToken.length === 0) {
    return err(403, "TURNSTILE_REQUIRED", {
      message: "Verification required before this action; complete the challenge and retry.",
    });
  }
  let ok = false;
  try {
    ok = await verifyToken(offeredToken, c.env.TURNSTILE_SECRET);
  } catch {
    // Challenge outage fails closed; unchallenged routes unaffected (§8).
    return err(503, "SERVICE_UNAVAILABLE", {
      message: "Verification unavailable; retry later.",
    });
  }
  if (!ok) {
    return err(403, "TURNSTILE_REQUIRED", {
      message: "Challenge verification failed; try again.",
    });
  }
  await recordPass(meta, db, ip, nowMs);
  return null;
}

workspaces.post("/provision", async (c) => {
  const meta = newMeta();
  const db = c.env.DB;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const secret = c.env.WORKSPACE_SECRET;
  if (!secret) {
    return err(500, "UNEXPECTED_ERROR", { message: "Server misconfigured." });
  }

  const ip = clientIp(c.req.raw);

  // AUTH-SECURITY §6: state-changing endpoints require JSON bodies.
  if (!c.req.header("content-type")?.includes("application/json")) {
    return err(400, "VALIDATION_FAILED", { message: "Request body must be JSON." });
  }
  let offeredToken: unknown;
  try {
    offeredToken = (await c.req.json() as { turnstileToken?: unknown })?.turnstileToken;
  } catch {
    return err(400, "VALIDATION_FAILED", { message: "Request body must be JSON." });
  }

  // Turnstile brake (AUTH-SECURITY §5, usage-model §6): armed IPs prove a
  // challenge before any write executes.
  if (await isArmed(meta, db, ip, nowMs)) {
    const challenge = await requireChallenge(c, meta, db, ip, offeredToken, nowMs);
    if (challenge) return challenge;
  }

  const rl = await checkRateLimit(meta, db, {
    scope: "provision",
    identity: ip,
    limit: 10,
    windowMs: 3_600_000,
    nowMs,
  });
  if (!rl.allowed) {
    await recordRateLimitHit(meta, db, ip, nowMs);
    const res = err(429, "WORKSPACE_RATE_LIMITED", {
      message: "Too many workspaces from this address; retry later.",
    });
    res.headers.set("Retry-After", String(rl.retryAfterSec));
    return res;
  }

  // Reuse: valid cookie + active fresh workspace returns unchanged.
  const cookie = getCookie(c.req.raw, "ebp_workspace");
  if (cookie) {
    const wid = await verifyWorkspace(cookie, secret);
    if (wid) {
      const existing = await first<WorkspaceRow>(
        meta,
        db,
        "SELECT id, seed_version, seed_reference_at, last_active_at, status FROM workspaces WHERE id = ?1",
        wid,
      );
      if (
        existing &&
        existing.status === "ACTIVE" &&
        !isExpired(existing.last_active_at, nowMs)
      ) {
        await touchActivity(meta, db, wid, nowIso);
        return withCookieAndMeta(
          c,
          workspaceShape({ ...existing, last_active_at: nowIso }),
          meta,
          await signWorkspace(wid, secret),
          requestIsSecure(c.req.raw),
        );
      }
    }
  }

  // Create: all-or-nothing seed (WSP-004); never a partial workspace.
  let created: { workspaceId: string };
  try {
    created = await provisionWorkspace(d1BatchDb(db, meta), { now: new Date(nowMs) });
  } catch {
    return err(503, "WORKSPACE_PROVISION_FAILED", {
      message: "Provisioning failed; retry later.",
    });
  }
  const ws = await first<WorkspaceRow>(
    meta,
    db,
    "SELECT id, seed_version, seed_reference_at, last_active_at, status FROM workspaces WHERE id = ?1",
    created.workspaceId,
  );
  if (!ws) {
    return err(503, "WORKSPACE_PROVISION_FAILED", {
      message: "Provisioning failed; retry later.",
    });
  }
  return withCookieAndMeta(
    c,
    workspaceShape(ws),
    meta,
    await signWorkspace(ws.id, secret),
    requestIsSecure(c.req.raw),
  );
});

workspaces.get("/status", async (c) => {
  const meta = newMeta();
  const ws = c.get("workspace");
  const nowIso = new Date().toISOString();
  await touchActivity(meta, c.env.DB, ws.id, nowIso);
  return c.json({
    workspace: { ...workspaceShape(ws).workspace, lastActiveAt: nowIso },
    meta,
  });
});

workspaces.post("/reset", async (c) => {
  const meta = newMeta();
  const db = c.env.DB;
  const ws = c.get("workspace");
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // AUTH-SECURITY §6: state-changing endpoints require JSON bodies.
  if (!c.req.header("content-type")?.includes("application/json")) {
    return err(400, "VALIDATION_FAILED", { message: "Request body must be JSON." });
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return err(400, "VALIDATION_FAILED", { message: "Request body must be JSON." });
  }
  if ((body as { confirm?: unknown })?.confirm !== true) {
    return err(400, "VALIDATION_FAILED", {
      message: "Reset requires explicit confirmation.",
      fields: { confirm: "CONFIRM_REQUIRED" },
    });
  }

  // Session optional; when present it must belong to this workspace
  // (AUTH-SECURITY §4) — never processed cross-workspace.
  if (getCookie(c.req.raw, "ebp_session")) {
    const session = await resolveSession(meta, db, c.req.raw, ws.id, nowMs);
    if (!session) {
      return err(401, "WORKSPACE_REQUIRED", { message: "Workspace required." });
    }
  }

  // Dual abuse controls (AUTH-SECURITY §5); denials arm Turnstile (S8).
  const ip = clientIp(c.req.raw);
  if (await isArmed(meta, db, ip, nowMs)) {
    const challenge = await requireChallenge(
      c,
      meta,
      db,
      ip,
      (body as { turnstileToken?: unknown })?.turnstileToken,
      nowMs,
    );
    if (challenge) return challenge;
  }
  const byWorkspace = await checkRateLimit(meta, db, {
    scope: "reset-ws",
    identity: ws.id,
    limit: 20,
    windowMs: 3_600_000,
    nowMs,
  });
  if (!byWorkspace.allowed) {
    await recordRateLimitHit(meta, db, ip, nowMs);
    const res = err(429, "WORKSPACE_RATE_LIMITED", {
      message: "Too many resets for this workspace; retry later.",
    });
    res.headers.set("Retry-After", String(byWorkspace.retryAfterSec));
    return res;
  }
  const byIp = await checkRateLimit(meta, db, {
    scope: "reset-ip",
    identity: ip,
    limit: 30,
    windowMs: 3_600_000,
    nowMs,
  });
  if (!byIp.allowed) {
    await recordRateLimitHit(meta, db, ip, nowMs);
    const res = err(429, "WORKSPACE_RATE_LIMITED", {
      message: "Too many resets from this address; retry later.",
    });
    res.headers.set("Retry-After", String(byIp.retryAfterSec));
    return res;
  }

  try {
    await resetWorkspace(d1BatchDb(db, meta), ws.id, { now: new Date(nowMs) });
  } catch {
    return err(500, "WORKSPACE_RESET_FAILED", {
      message: "Reset failed; workspace state is unknown — retry or provision anew.",
    });
  }
  const updated = await first<WorkspaceRow>(
    meta,
    db,
    "SELECT id, seed_version, seed_reference_at, last_active_at, status FROM workspaces WHERE id = ?1",
    ws.id,
  );
  if (!updated) {
    return err(500, "WORKSPACE_RESET_FAILED", {
      message: "Reset failed; workspace state is unknown — retry or provision anew.",
    });
  }
  const secret = c.env.WORKSPACE_SECRET;
  if (!secret) {
    return err(500, "UNEXPECTED_ERROR", { message: "Server misconfigured." });
  }
  return withCookieAndMeta(
    c,
    {
      workspace: {
        ...workspaceShape(updated).workspace,
        lastActiveAt: updated.last_active_at,
      },
      reset: { seedVersion: updated.seed_version },
    },
    meta,
    await signWorkspace(updated.id, secret),
    requestIsSecure(c.req.raw),
  );
});
