// Checkout concurrency proof (BKG-003, T-09; SPIKE-B gated pattern).
// Parallel last-seat checkouts: total confirmed ≤ capacity, losers get stable
// 409 with no booking rows (verified by capacity math + stable same-key
// outcomes — no list endpoint exists until S6).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { baseUrl, headers, provision, resetRateCounters, startWorker } from "./support/harness.ts";

const PORT = Number(process.env.EBP_API_PORT ?? 8790);
const BASE = baseUrl(PORT);
const ID = "s5-concurrency-bkg003";
const DESIGN = "jakarta-design-systems-workshop";
const MEETUP = "community-product-meetup";

let stop: () => void;
before(async () => {
  stop = await startWorker(PORT);
  resetRateCounters(BASE);
});
after(() => stop());

async function setup(identity: string): Promise<{ ws: string; sess: string }> {
  // Fresh provision bucket per test (the harness supplies a unique Cloudflare
  // client identity; provision abuse is covered in wsp-004 tests).
  resetRateCounters(BASE);
  const ws = await provision(BASE, identity);
  const inRes = await fetch(`${BASE}/api/session`, {
    method: "POST",
    headers: { ...headers(identity), cookie: `ebp_workspace=${ws}` },
    body: JSON.stringify({ email: "alex.attendee@example.test", password: "Attend123!" }),
  });
  assert.equal(inRes.status, 200);
  const sess = inRes.headers
    .getSetCookie()
    .map((c) => c.match(/^ebp_session=([^;]*)/)?.[1])
    .find(Boolean);
  assert.ok(sess);
  return { ws, sess: sess! };
}

async function remaining(ws: string, identity: string, slug: string, sessionId: string): Promise<number> {
  const res = await fetch(`${BASE}/api/events/${slug}`, { headers: headers(identity, ws) });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: { sessions: { id: string; remainingCapacity: number }[] } };
  return body.data.sessions.find((s) => s.id === sessionId)!.remainingCapacity;
}

async function seatIds(ws: string, identity: string, slug: string): Promise<{ sessionId: string; ticketId: string }> {
  const res = await fetch(`${BASE}/api/events/${slug}`, { headers: headers(identity, ws) });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    data: { sessions: { id: string }[]; ticketTypes: { id: string; eventSessionId: string }[] };
  };
  const sessionId = body.data.sessions[0]!.id;
  const ticketId = body.data.ticketTypes.find((t) => t.eventSessionId === sessionId)!.id;
  return { sessionId, ticketId };
}

function attempt(
  ws: string,
  sess: string,
  identity: string,
  slug: string,
  seat: { sessionId: string; ticketId: string },
  key: string,
): Promise<Response> {
  return fetch(`${BASE}/api/checkout`, {
    method: "POST",
    headers: {
      ...headers(identity),
      cookie: `ebp_workspace=${ws}; ebp_session=${sess}`,
      "Idempotency-Key": key,
    },
    body: JSON.stringify({
      eventSlug: slug,
      eventSessionId: seat.sessionId,
      ticketTypeId: seat.ticketId,
      quantity: 1,
      paymentCode: "SIMULATE-SUCCESS",
    }),
  });
}

describe("bkg-003 checkout concurrency gate (T-09)", () => {
  it("sold-out session: 10 parallel checkouts all conflict, capacity untouched", async () => {
    const id = `${ID}-soldout`;
    const { ws, sess } = await setup(id);
    const seat = await seatIds(ws, id, MEETUP);
    assert.equal(await remaining(ws, id, MEETUP, seat.sessionId), 0);

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => attempt(ws, sess, `${id}-${i}`, MEETUP, seat, crypto.randomUUID())),
    );
    for (const res of results) {
      assert.equal(res.status, 409);
      assert.equal(((await res.json()) as { error: { code: string } }).error.code, "CAPACITY_INSUFFICIENT");
    }
    assert.equal(await remaining(ws, id, MEETUP, seat.sessionId), 0);
  });

  it("last seat: 5 parallel checkouts yield exactly one booking", async () => {
    const id = `${ID}-lastseat`;
    const { ws, sess } = await setup(id);
    const seat = await seatIds(ws, id, DESIGN);
    // Drain 18 → 1 sequentially (17 × qty 1).
    for (let i = 0; i < 17; i++) {
      const drain = await attempt(ws, sess, id, DESIGN, seat, crypto.randomUUID());
      assert.equal(drain.status, 201, `drain ${i}`);
    }
    assert.equal(await remaining(ws, id, DESIGN, seat.sessionId), 1);

    const keys = Array.from({ length: 5 }, () => crypto.randomUUID());
    const results = await Promise.all(
      keys.map((key, i) => attempt(ws, sess, `${id}-${i}`, DESIGN, seat, key)),
    );
    const statuses = results.map((r) => r.status);
    assert.equal(statuses.filter((s) => s === 201).length, 1, "exactly one winner");
    assert.equal(statuses.filter((s) => s === 409).length, 4, "four stable conflicts");
    for (const res of results.filter((r) => r.status === 409)) {
      assert.equal(((await res.json()) as { error: { code: string } }).error.code, "CAPACITY_INSUFFICIENT");
    }
    assert.equal(await remaining(ws, id, DESIGN, seat.sessionId), 0);

    // Loser keys replay the same stable outcome (no hidden bookings).
    for (const [i, res] of results.entries()) {
      if (res.status !== 409) continue;
      const retry = await attempt(ws, sess, id, DESIGN, seat, keys[i]!);
      assert.equal(retry.status, 409);
    }
    assert.equal(await remaining(ws, id, DESIGN, seat.sessionId), 0);
  });
});
