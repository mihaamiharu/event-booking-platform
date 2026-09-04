// SPIKE-B worker (BKG-002, BKG-003) — Closes #22.
// Scratch schema only (`spike_*` tables). Never prod, never db/migrations.
// Two checkout paths behind `mode`:
//   batch — inserts + conditional UPDATE in one DB.batch (DATA-DESIGN §3 naive read)
//   gated — conditional UPDATE solo first, inserts only on success (fallback)

// Minimal structural D1 typing (spike-only; S2/S5 choose prod typing).
interface D1Result<T = Record<string, unknown>> {
  results: T[];
  meta: { changes: number };
}
interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  first<T>(col?: string): Promise<T | null>;
  run(): Promise<D1Result>;
}
interface D1Database {
  prepare(query: string): D1Prepared;
  batch(statements: D1Prepared[]): Promise<D1Result[]>;
}

interface Env {
  DB: D1Database;
}

const SESSION_ID = "spike_s1";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function fingerprint(qty: number): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`spike_s1:${qty}`),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/__spike/health") {
      return json({ status: "ok", spike: "spike-b" });
    }

    if (request.method === "POST" && url.pathname === "/__spike/reset") {
      let capacity = 5;
      try {
        const body = (await request.json()) as { capacity?: unknown };
        if (typeof body.capacity === "number") capacity = body.capacity;
      } catch {
        /* default */
      }
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
        return json({ error: { code: "VALIDATION_FAILED" } }, 400);
      }
      await env.DB.batch([
        env.DB.prepare("DROP TABLE IF EXISTS spike_bookings"),
        env.DB.prepare("DROP TABLE IF EXISTS spike_idempotency"),
        env.DB.prepare("DROP TABLE IF EXISTS spike_sessions"),
        env.DB.prepare(
          "CREATE TABLE spike_sessions (id TEXT PRIMARY KEY, capacity INTEGER NOT NULL, confirmed_quantity INTEGER NOT NULL DEFAULT 0)",
        ),
        env.DB.prepare(
          "CREATE TABLE spike_bookings (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, qty INTEGER NOT NULL, idem_key TEXT NOT NULL)",
        ),
        env.DB.prepare(
          "CREATE TABLE spike_idempotency (`key` TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, outcome TEXT NOT NULL, booking_id TEXT)",
        ),
        env.DB.prepare(
          "INSERT INTO spike_sessions (id, capacity, confirmed_quantity) VALUES (?1, ?2, 0)",
        ).bind(SESSION_ID, capacity),
      ]);
      return json({ capacity, confirmed: 0 });
    }

    if (request.method === "GET" && url.pathname === "/__spike/state") {
      const sess = await env.DB.prepare(
        "SELECT capacity, confirmed_quantity FROM spike_sessions WHERE id = ?1",
      )
        .bind(SESSION_ID)
        .first<{ capacity: number; confirmed_quantity: number }>();
      const booked = await env.DB.prepare(
        "SELECT COUNT(*) AS n, COALESCE(SUM(qty), 0) AS q FROM spike_bookings WHERE session_id = ?1",
      )
        .bind(SESSION_ID)
        .first<{ n: number; q: number }>();
      const keys = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM spike_idempotency",
      ).first<{ n: number }>();
      return json({
        capacity: sess?.capacity ?? null,
        confirmed: sess?.confirmed_quantity ?? null,
        bookingRows: booked?.n ?? 0,
        bookedQty: booked?.q ?? 0,
        idempotencyRows: keys?.n ?? 0,
      });
    }

    if (request.method === "POST" && url.pathname === "/__spike/checkout") {
      let body: { key?: unknown; qty?: unknown; mode?: unknown };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return json({ error: { code: "VALIDATION_FAILED" } }, 400);
      }
      const { key, qty, mode } = body;
      if (
        typeof key !== "string" ||
        key.length === 0 ||
        key.length > 128 ||
        typeof qty !== "number" ||
        !Number.isInteger(qty) ||
        qty < 1 ||
        qty > 5 ||
        (mode !== undefined && mode !== "batch" && mode !== "gated")
      ) {
        return json({ error: { code: "VALIDATION_FAILED" } }, 400);
      }
      const fp = await fingerprint(qty);
      const useGated = mode === "gated";

      const existing = await env.DB.prepare(
        "SELECT fingerprint, outcome, booking_id FROM spike_idempotency WHERE `key` = ?1",
      )
        .bind(key)
        .first<{ fingerprint: string; outcome: string; booking_id: string | null }>();
      if (existing) {
        if (existing.fingerprint === fp) {
          return json(
            { outcome: existing.outcome, bookingId: existing.booking_id },
            200,
          );
        }
        return json({ error: { code: "IDEMPOTENCY_CONFLICT" } }, 409);
      }

      const bookingId = crypto.randomUUID();
      const gate = env.DB.prepare(
        `UPDATE spike_sessions SET confirmed_quantity = confirmed_quantity + ?1
         WHERE id = ?2 AND confirmed_quantity + ?1 <= capacity`,
      ).bind(qty, SESSION_ID);

      if (useGated) {
        const gateRes = await env.DB.prepare(
          `UPDATE spike_sessions SET confirmed_quantity = confirmed_quantity + ?1
           WHERE id = ?2 AND confirmed_quantity + ?1 <= capacity`,
        )
          .bind(qty, SESSION_ID)
          .run();
        if (gateRes.meta.changes !== 1) {
          return json({ error: { code: "CAPACITY_INSUFFICIENT" } }, 409);
        }
        await env.DB.batch([
          env.DB.prepare(
            "INSERT INTO spike_bookings (id, session_id, qty, idem_key) VALUES (?1, ?2, ?3, ?4)",
          ).bind(bookingId, SESSION_ID, qty, key),
          env.DB.prepare(
            "INSERT INTO spike_idempotency (`key`, fingerprint, outcome, booking_id) VALUES (?1, ?2, 'SUCCEEDED', ?3)",
          ).bind(key, fp, bookingId),
        ]);
        return json({ outcome: "SUCCEEDED", bookingId }, 201);
      }

      // batch mode: inserts + conditional UPDATE in one batch (atomicity under test)
      const results = await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO spike_bookings (id, session_id, qty, idem_key) VALUES (?1, ?2, ?3, ?4)",
        ).bind(bookingId, SESSION_ID, qty, key),
        env.DB.prepare(
          "INSERT INTO spike_idempotency (`key`, fingerprint, outcome, booking_id) VALUES (?1, ?2, 'SUCCEEDED', ?3)",
        ).bind(key, fp, bookingId),
        gate,
      ]);
      const updateRes = results[results.length - 1]!;
      if (updateRes.meta.changes !== 1) {
        return json({ error: { code: "CAPACITY_INSUFFICIENT" } }, 409);
      }
      return json({ outcome: "SUCCEEDED", bookingId }, 201);
    }

    return json({ error: { code: "NOT_FOUND" } }, 404);
  },
};
