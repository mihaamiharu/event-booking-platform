// Seeded-attendee sessions (ACC-001, AUTH-SECURITY §3).
// Token: 256-bit crypto.getRandomValues, base64url raw value in the cookie,
// SHA-256 hex digest as sessions.token_hash PK — a DB read never yields a
// usable token. Cookie: HttpOnly; SameSite=Lax; Path=/api; Max-Age=7d;
// Secure except on localhost (mirrors workspace.ts posture).
import { first, run, type D1Database, type D1Meta } from "./db.ts";
import { getCookie } from "./workspace.ts";

const enc = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Fresh token + its storage hash. The raw token goes to the cookie only. */
export async function newSessionToken(): Promise<{ token: string; tokenHash: string }> {
  const token = b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
  return { token, tokenHash: await sha256Hex(token) };
}

function cookieParts(value: string, clear: boolean): string[] {
  const parts = [
    `ebp_session=${value}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/api",
    clear ? "Max-Age=0" : `Max-Age=${SESSION_TTL_MS / 1000}`,
  ];
  return parts;
}

export function sessionCookieHeader(token: string, secure: boolean): string {
  const parts = cookieParts(token, false);
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookieHeader(secure: boolean): string {
  const parts = [...cookieParts("", true), "Expires=Thu, 01 Jan 1970 00:00:00 GMT"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export const SESSION_TTL_MS = 7 * 86_400_000;

export function sessionExpiryIso(nowMs: number): string {
  return new Date(nowMs + SESSION_TTL_MS).toISOString();
}

// Fixed dummy credential for the unknown-email path: one PBKDF2 verify with
// identical work so wrong-email and wrong-password are indistinguishable
// (AUTH-SECURITY T-05). Never a real user salt/hash.
export const DUMMY_SALT_B64 = "AAAAAAAAAAAAAAAAAAAAAA==";
export const DUMMY_HASH_HEX = "0".repeat(64);

export interface SessionIdentity {
  userId: string;
}

/**
 * Resolve the attendee session for a workspace-scoped request (BKG-003,
 * AUTH-SECURITY §3). Returns null for missing/foreign/revoked/expired
 * sessions — callers answer 401 AUTH_REQUIRED with no oracle. Valid sessions
 * slide their expiry (7d, capped in practice by workspace expiry enforced in
 * middleware).
 */
export async function resolveSession(
  meta: D1Meta,
  db: D1Database,
  request: Request,
  workspaceId: string,
  nowMs: number,
): Promise<SessionIdentity | null> {
  const token = getCookie(request, "ebp_session");
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await first<{ user_id: string; expires_at: string }>(
    meta,
    db,
    "SELECT user_id, expires_at FROM sessions WHERE token_hash = ?1 AND workspace_id = ?2 AND revoked_at IS NULL",
    tokenHash,
    workspaceId,
  );
  if (!row) return null;
  const exp = Date.parse(row.expires_at);
  if (Number.isNaN(exp) || exp <= nowMs) return null;
  await run(meta, db, "UPDATE sessions SET expires_at = ?1 WHERE token_hash = ?2", sessionExpiryIso(nowMs), tokenHash);
  return { userId: row.user_id };
}
