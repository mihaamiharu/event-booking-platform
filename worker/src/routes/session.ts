// Session endpoints (ACC-001; API-CONTRACT §3.2, AUTH-SECURITY §3–§5).
// POST /api/session signs in with a seeded attendee credential; DELETE
// /api/session signs out. Workspace context comes from app.ts middleware.
import { Hono } from "hono";
import type { AppContext } from "../app.ts";
import { first, newMeta, run } from "../db.ts";
import { err } from "../errors.ts";
import { verifyPassword } from "../password.ts";
import { checkRateLimit, clientIp, resetRateLimit } from "../ratelimit.ts";
import { recordRateLimitHit } from "../turnstile.ts";
import {
  clearSessionCookieHeader,
  DUMMY_HASH_HEX,
  DUMMY_SALT_B64,
  newSessionToken,
  sessionCookieHeader,
  sessionExpiryIso,
  sha256Hex,
} from "../session.ts";
import { touchActivity } from "./workspaces.ts";
import { scenarioEnabled } from "../scenario.ts";
import { getCookie, requestIsSecure } from "../workspace.ts";

const SIGNIN_SCOPE = "signin-fail";
const SIGNIN_WINDOW_MS = 10 * 60_000;
const SIGNIN_LIMIT = 10;
const MAX_CREDENTIAL_CHARS = 256;

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  password_salt: string;
  role: "ATTENDEE" | "ORGANIZER";
}

function invalidCredentials() {
  return err(401, "AUTH_INVALID_CREDENTIALS", {
    message: "Invalid email or password.",
  });
}

export const session = new Hono<AppContext>();

session.post("/", async (c) => {
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
  const email = typeof (body as { email?: unknown })?.email === "string"
    ? ((body as { email: string }).email.trim())
    : "";
  const password = typeof (body as { password?: unknown })?.password === "string"
    ? (body as { password: string }).password
    : "";
  if (
    email.length === 0 || email.length > MAX_CREDENTIAL_CHARS ||
    password.length === 0 || password.length > MAX_CREDENTIAL_CHARS
  ) {
    return err(400, "VALIDATION_FAILED", {
      message: "Email and password are required.",
      fields: { email: "EMAIL_REQUIRED", password: "PASSWORD_REQUIRED" },
    });
  }

  const identity = clientIp(c.req.raw);
  const rl = await checkRateLimit(meta, db, {
    scope: SIGNIN_SCOPE,
    identity,
    limit: SIGNIN_LIMIT,
    windowMs: SIGNIN_WINDOW_MS,
    nowMs,
  });
  if (!rl.allowed) {
    // Throttle hits arm Turnstile for provision/reset (AUTH-SECURITY §5).
    await recordRateLimitHit(meta, db, identity, nowMs);
    const res = err(429, "AUTH_RATE_LIMITED", {
      message: "Too many sign-in attempts; retry later.",
    });
    res.headers.set("Retry-After", String(rl.retryAfterSec));
    return res;
  }

  const user = await first<UserRow>(
    meta,
    db,
    "SELECT id, email, display_name, password_hash, password_salt, role FROM users WHERE workspace_id = ?1 AND email = ?2",
    ws.id,
    email,
  );
  // Identical work on both paths (T-05): one PBKDF2 verify either way.
  const ok = user
    ? await verifyPassword(password, user.password_salt, user.password_hash)
    : await verifyPassword(password, DUMMY_SALT_B64, DUMMY_HASH_HEX).then(() => false);
  if (!ok || !user) {
    return invalidCredentials();
  }

  await resetRateLimit(meta, db, {
    scope: SIGNIN_SCOPE,
    identity,
    windowMs: SIGNIN_WINDOW_MS,
    nowMs,
  });
  const { token, tokenHash } = await newSessionToken();
  await run(
    meta,
    db,
    "INSERT INTO sessions (token_hash, workspace_id, user_id, expires_at, revoked_at) VALUES (?1, ?2, ?3, ?4, NULL)",
    tokenHash,
    ws.id,
    user.id,
    sessionExpiryIso(nowMs),
  );
  await touchActivity(meta, db, ws.id, nowIso, !scenarioEnabled(c.env, "wsp-activity-frozen"));
  return c.json(
    {
      attendee: { email: user.email, displayName: user.display_name },
      role: user.role,
      meta,
    },
    200,
    { "set-cookie": sessionCookieHeader(token, requestIsSecure(c.req.raw)) },
  );
});

session.delete("/", async (c) => {
  const meta = newMeta();
  const db = c.env.DB;
  const ws = c.get("workspace");
  const nowIso = new Date().toISOString();
  const secure = requestIsSecure(c.req.raw);

  // Scoped revoke (T-04): a session from workspace A presented with workspace
  // B context revokes nothing. Absent/invalid sessions still return 204 —
  // no oracle (API-CONTRACT §3.2).
  const token = getCookie(c.req.raw, "ebp_session");
  if (token) {
    const tokenHash = await sha256Hex(token);
    await run(
      meta,
      db,
      "UPDATE sessions SET revoked_at = ?1 WHERE token_hash = ?2 AND workspace_id = ?3 AND revoked_at IS NULL",
      nowIso,
      tokenHash,
      ws.id,
    );
  }
  await touchActivity(meta, db, ws.id, nowIso, !scenarioEnabled(c.env, "wsp-activity-frozen"));
  return new Response(null, {
    status: 204,
    headers: { "set-cookie": clearSessionCookieHeader(secure) },
  });
});
