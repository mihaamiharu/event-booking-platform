// Unit: Turnstile arming, passes, and token verification (NFR-001).
// Fake D1Database over a Map — no I/O, no Worker needed.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { D1Database, D1Meta } from "../../worker/src/db.ts";
import {
  DUMMY_TOKEN_LOCAL,
  isArmed,
  recordPass,
  recordRateLimitHit,
  TURNSTILE_ARMED_AFTER_HITS,
  verifyToken,
} from "../../worker/src/turnstile.ts";

const HOUR = 3_600_000;

function fakeDb(): { db: D1Database; counters: Map<string, number> } {
  const counters = new Map<string, number>();
  const db: D1Database = {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          const key = values[0] as string;
          const select = /^\s*SELECT/i.test(query);
          return {
            async first<T>(): Promise<T | null> {
              if (!select) return null;
              return (
                counters.has(key) ? ({ count: counters.get(key) } as T) : null
              );
            },
            async all<T>(): Promise<{ results: T[]; meta: D1Meta }> {
              throw new Error("unused");
            },
            async run(): Promise<{ meta: D1Meta & { changes: number } }> {
              if (/^\s*DELETE/i.test(query)) counters.delete(key);
              else counters.set(key, (counters.get(key) ?? 0) + 1);
              return { meta: { rows_read: 0, rows_written: 1, changes: 1 } };
            },
          };
        },
      };
    },
    async batch() {
      return [];
    },
  };
  return { db, counters };
}

const meta = (): D1Meta => ({ rows_read: 0, rows_written: 0 });

describe("nfr-001 turnstile arming counts denials per IP hour", () => {
  it("arms after three hits, passes clear it, IPs isolated", async () => {
    const { db } = fakeDb();
    const now = Date.now();
    assert.equal(await isArmed(meta(), db, "9.9.9.9", now), false);
    await recordRateLimitHit(meta(), db, "9.9.9.9", now);
    await recordRateLimitHit(meta(), db, "9.9.9.9", now);
    assert.equal(await isArmed(meta(), db, "9.9.9.9", now), false);
    assert.equal(await isArmed(meta(), db, "8.8.8.8", now), false);
    await recordRateLimitHit(meta(), db, "9.9.9.9", now);
    assert.equal(await isArmed(meta(), db, "9.9.9.9", now), true);
    assert.equal(await isArmed(meta(), db, "8.8.8.8", now), false);
    await recordPass(meta(), db, "9.9.9.9", now);
    assert.equal(await isArmed(meta(), db, "9.9.9.9", now), false);
    assert.equal(TURNSTILE_ARMED_AFTER_HITS, 3);
  });

  it("hour buckets isolate old hits", async () => {
    const { db } = fakeDb();
    const now = Date.now();
    const lastHour = now - HOUR - 1;
    for (let i = 0; i < 5; i++) await recordRateLimitHit(meta(), db, "7.7.7.7", lastHour);
    assert.equal(await isArmed(meta(), db, "7.7.7.7", now), false);
  });
});

describe("nfr-001 token verification", () => {
  it("dummy secrets accept only the documented dummy token", async () => {
    assert.equal(await verifyToken(DUMMY_TOKEN_LOCAL, "dummy-disabled-locally"), true);
    assert.equal(await verifyToken("anything-else", "dummy-disabled-locally"), false);
    assert.equal(await verifyToken(DUMMY_TOKEN_LOCAL, undefined), true);
    assert.equal(await verifyToken("", "dummy-disabled-locally"), false);
  });

  it("real secrets always verify server-side via one subrequest", async () => {
    const calls: string[] = [];
    const okFetch = (async (url: unknown, init: unknown) => {
      calls.push(String(url));
      assert.match((init as { body: string }).body, /secret=prod-secret/);
      return { ok: true, json: async () => ({ success: true }) };
    }) as unknown as typeof fetch;
    assert.equal(await verifyToken("tok", "prod-secret", okFetch), true);
    assert.deepEqual(calls, ["https://challenges.cloudflare.com/turnstile/v0/siteverify"]);

    const noFetch = (async () => ({ ok: true, json: async () => ({ success: false }) })) as unknown as typeof fetch;
    assert.equal(await verifyToken("tok", "prod-secret", noFetch), false);

    const downFetch = (async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    await assert.rejects(verifyToken("tok", "prod-secret", downFetch), /boom/);
  });
});
