// Turnstile challenge arming (S8; AUTH-SECURITY §5, usage-model §6).
// Repeated rate-limit hits arm an IP; the next provision/reset then requires
// a Turnstile token before any write executes. Passes cache 10 min/IP.
// Counters reuse rate_counters (no migration); keys hash the IP (§7).
// Local/dev secrets are dummy: only the documented dummy token verifies —
// real verification always hits siteverify (stubbed in unit tests).
import { first, run, type D1Database, type D1Meta } from "./db.ts";

export const TURNSTILE_ARMED_AFTER_HITS = 3;
export const TURNSTILE_HIT_WINDOW_MS = 3_600_000;
export const TURNSTILE_PASS_MS = 10 * 60_000;
/** Accepted only when the secret is dummy (local/dev), never in prod. */
export const DUMMY_TOKEN_LOCAL = "DUMMY-PASS-LOCAL";

const enc = new TextEncoder();

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hitKey(ip: string, nowMs: number): Promise<string> {
  return sha256Hex(ip).then(
    (h) => `thit:${h}:${Math.floor(nowMs / TURNSTILE_HIT_WINDOW_MS)}`,
  );
}

async function passKey(ip: string, nowMs: number): Promise<string> {
  const h = await sha256Hex(ip);
  return `tpass:${h}:${Math.floor(nowMs / TURNSTILE_PASS_MS)}`;
}

/** Record one rate-limit rejection for later arming. Never throws the caller. */
export async function recordRateLimitHit(
  meta: D1Meta,
  db: D1Database,
  ip: string,
  nowMs: number,
): Promise<void> {
  await run(
    meta,
    db,
    `INSERT INTO rate_counters (key, count, window_start) VALUES (?1, 1, ?2)
     ON CONFLICT (key) DO UPDATE SET count = count + 1`,
    await hitKey(ip, nowMs),
    new Date(Math.floor(nowMs / TURNSTILE_HIT_WINDOW_MS) * TURNSTILE_HIT_WINDOW_MS).toISOString(),
  );
}

/** Armed when hits reached the threshold and no fresh pass exists. */
export async function isArmed(
  meta: D1Meta,
  db: D1Database,
  ip: string,
  nowMs: number,
): Promise<boolean> {
  const hits = await first<{ count: number }>(
    meta,
    db,
    "SELECT count FROM rate_counters WHERE key = ?1",
    await hitKey(ip, nowMs),
  );
  if (!hits || hits.count < TURNSTILE_ARMED_AFTER_HITS) return false;
  const pass = await first<{ count: number }>(
    meta,
    db,
    "SELECT count FROM rate_counters WHERE key = ?1",
    await passKey(ip, nowMs),
  );
  return !pass;
}

/** Cache a passed challenge for the pass window. */
export async function recordPass(
  meta: D1Meta,
  db: D1Database,
  ip: string,
  nowMs: number,
): Promise<void> {
  await run(
    meta,
    db,
    `INSERT INTO rate_counters (key, count, window_start) VALUES (?1, 1, ?2)
     ON CONFLICT (key) DO UPDATE SET count = count + 1`,
    await passKey(ip, nowMs),
    new Date(Math.floor(nowMs / TURNSTILE_PASS_MS) * TURNSTILE_PASS_MS).toISOString(),
  );
}

/**
 * Verify a token. Real secrets always verify server-side (one subrequest of
 * the 50-call budget); network failure throws so callers fail closed with
 * SERVICE_UNAVAILABLE (usage-model §8). `fetcher` is injectable for tests.
 */
export async function verifyToken(
  token: string,
  secret: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!secret || secret.startsWith("dummy")) {
    return token === DUMMY_TOKEN_LOCAL;
  }
  const body = new URLSearchParams({ secret, response: token });
  const res = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}
