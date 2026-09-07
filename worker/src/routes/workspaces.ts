// Workspace endpoints (WSP-004, WSP-003, WSP-001; API-CONTRACT §3.1).
import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppContext } from "../app.ts";
import { first, newMeta, run, type D1Database, type D1Meta } from "../db.ts";
import { err } from "../errors.ts";
import { checkRateLimit, clientIp } from "../ratelimit.ts";
import { provisionWorkspace } from "../seed.ts";
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

function workspaceShape(ws: WorkspaceRow) {
  return {
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

workspaces.post("/provision", async (c) => {
  const meta = newMeta();
  const db = c.env.DB;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const secret = c.env.WORKSPACE_SECRET;
  if (!secret) {
    return err(500, "UNEXPECTED_ERROR", { message: "Server misconfigured." });
  }

  const rl = await checkRateLimit(meta, db, {
    scope: "provision",
    identity: clientIp(c.req.raw),
    limit: 10,
    windowMs: 3_600_000,
    nowMs,
  });
  if (!rl.allowed) {
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
