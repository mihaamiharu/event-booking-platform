// D1-backed rate limiting (AUTH-SECURITY §5, usage-model §5).
// One row per key/window; keys hash the IP (never raw addresses, §7).
// Table: db/migrations/0002_rate_limits.sql. Turnstile arming rides in S8.
import { first, run, type D1Database, type D1Meta } from "./db.ts";

const enc = new TextEncoder();

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function clientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.split(",")[0]!.trim();
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return "unknown-local";
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

export async function checkRateLimit(
  meta: D1Meta,
  db: D1Database,
  opts: { scope: string; identity: string; limit: number; windowMs: number; nowMs: number },
): Promise<RateLimitResult> {
  const bucket = Math.floor(opts.nowMs / opts.windowMs);
  const key = `${opts.scope}:${await sha256Hex(opts.identity)}:${bucket}`;
  const row = await first<{ count: number }>(
    meta,
    db,
    "SELECT count FROM rate_counters WHERE key = ?1",
    key,
  );
  if (row && row.count >= opts.limit) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil(((bucket + 1) * opts.windowMs - opts.nowMs) / 1000),
    );
    return { allowed: false, retryAfterSec };
  }
  await run(
    meta,
    db,
    `INSERT INTO rate_counters (key, count, window_start) VALUES (?1, 1, ?2)
     ON CONFLICT (key) DO UPDATE SET count = count + 1`,
    key,
    new Date(bucket * opts.windowMs).toISOString(),
  );
  return { allowed: true, retryAfterSec: 0 };
}
