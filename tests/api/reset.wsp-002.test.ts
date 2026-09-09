// Workspace reset tests (WSP-002; API-CONTRACT §3.1, AUTH-SECURITY §4–§5).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { baseUrl, headers, provision, resetRateCounters, startWorker, type ApiMeta } from "./support/harness.ts";

const PORT = Number(process.env.EBP_API_PORT ?? 8790);
const BASE = baseUrl(PORT);
const ID = "s7-reset-wsp002";
const DESIGN = "jakarta-design-systems-workshop";

let stop: () => void;
before(async () => {
  stop = await startWorker(PORT);
  resetRateCounters(BASE);
});
after(() => stop());

async function signIn(ws: string, identity: string, email = "alex.attendee@example.test"): Promise<string> {
  const password = email.startsWith("maya") ? "Booked123!" : "Attend123!";
  const inRes = await fetch(`${BASE}/api/session`, {
    method: "POST",
    headers: { ...headers(identity), cookie: `ebp_workspace=${ws}` },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(inRes.status, 200);
  const sess = inRes.headers
    .getSetCookie()
    .map((c) => c.match(/^ebp_session=([^;]*)/)?.[1])
    .find(Boolean);
  assert.ok(sess);
  return sess!;
}

async function setup(identity: string, email = "alex.attendee@example.test", wipe = true): Promise<{ ws: string; sess: string }> {
  if (wipe) resetRateCounters(BASE);
  const ws = await provision(BASE, identity);
  return { ws, sess: await signIn(ws, identity, email) };
}

function cookies(ws: string, sess?: string): string {
  return sess ? `ebp_workspace=${ws}; ebp_session=${sess}` : `ebp_workspace=${ws}`;
}

async function reset(ws: string, identity: string, body: unknown, sess?: string): Promise<Response> {
  return fetch(`${BASE}/api/workspaces/reset`, {
    method: "POST",
    headers: { ...headers(identity), cookie: cookies(ws, sess) },
    body: JSON.stringify(body),
  });
}

async function seatIds(ws: string, identity: string): Promise<{ sessionId: string; ticketId: string }> {
  const res = await fetch(`${BASE}/api/events/${DESIGN}`, { headers: headers(identity, ws) });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    data: { sessions: { id: string }[]; ticketTypes: { id: string; eventSessionId: string }[] };
  };
  const sessionId = body.data.sessions[0]!.id;
  return { sessionId, ticketId: body.data.ticketTypes.find((t) => t.eventSessionId === sessionId)!.id };
}

async function book(ws: string, sess: string, identity: string, qty: number): Promise<string> {
  const seat = await seatIds(ws, identity);
  const res = await fetch(`${BASE}/api/checkout`, {
    method: "POST",
    headers: { ...headers(identity), cookie: cookies(ws, sess), "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({
      eventSlug: DESIGN,
      eventSessionId: seat.sessionId,
      ticketTypeId: seat.ticketId,
      quantity: qty,
      paymentCode: "SIMULATE-SUCCESS",
    }),
  });
  assert.equal(res.status, 201);
  return ((await res.json()) as { booking: { reference: string } }).booking.reference;
}

async function bookingCount(ws: string, sess: string, identity: string): Promise<number> {
  const res = await fetch(`${BASE}/api/bookings`, { headers: { ...headers(identity), cookie: cookies(ws, sess) } });
  assert.equal(res.status, 200);
  return ((await res.json()) as { data: unknown[] }).data.length;
}

async function remaining(ws: string, identity: string): Promise<number> {
  const res = await fetch(`${BASE}/api/events/${DESIGN}`, { headers: headers(identity, ws) });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: { sessions: { remainingCapacity: number }[] } };
  return body.data.sessions[0]!.remainingCapacity;
}

describe("wsp-002 POST /api/workspaces/reset", () => {
  it("requires explicit confirmation", async () => {
    const id = `${ID}-confirm`;
    const { ws } = await setup(id);
    for (const body of [{}, { confirm: false }, { confirm: "yes" }]) {
      const res = await reset(ws, id, body);
      assert.equal(res.status, 400);
      assert.equal(((await res.json()) as { error: { code: string } }).error.code, "VALIDATION_FAILED");
    }
  });

  it("restores seed state with a new T0 and refuses stale sessions", async () => {
    const id = `${ID}-restore`;
    const { ws, sess } = await setup(id);
    await book(ws, sess, id, 2);
    assert.equal(await bookingCount(ws, sess, id), 1);
    const before = (await (
      await fetch(`${BASE}/api/workspaces/status`, { headers: headers(id, ws) })
    ).json()) as { workspace: { seedReferenceAt: string } };

    const res = await reset(ws, id, { confirm: true }, sess);
    assert.equal(res.status, 200);
    assert.match(res.headers.getSetCookie().join(";"), /ebp_workspace=[^;]+;.*HttpOnly/);
    const body = (await res.json()) as {
      workspace: { status: string; seedVersion: string; seedReferenceAt: string };
      reset: { seedVersion: string };
      meta: ApiMeta;
    };
    assert.equal(body.workspace.status, "ACTIVE");
    assert.equal(body.workspace.seedVersion, "r1-v1");
    assert.equal(body.reset.seedVersion, "r1-v1");
    assert.notEqual(body.workspace.seedReferenceAt, before.workspace.seedReferenceAt);
    assert.ok(body.meta.rows_written <= 150, `rows_written ${body.meta.rows_written}`);

    // Old session died with the reset; fresh sign-in sees restored seed.
    const stale = await fetch(`${BASE}/api/bookings`, {
      headers: { ...headers(id), cookie: cookies(ws, sess) },
    });
    assert.equal(stale.status, 401);
    const sess2 = await signIn(ws, id);
    assert.equal(await bookingCount(ws, sess2, id), 0);
    assert.equal(await remaining(ws, id), 18);
  });

  it("affects only its own workspace (isolation soak)", async () => {
    const a = await setup(`${ID}-iso-a`);
    const b = await setup(`${ID}-iso-b`);
    await book(a.ws, a.sess, `${ID}-iso-a`, 1);
    assert.equal(await remaining(a.ws, `${ID}-iso-a`), 17);

    const res = await reset(b.ws, `${ID}-iso-b`, { confirm: true }, b.sess);
    assert.equal(res.status, 200);

    assert.equal(await bookingCount(a.ws, a.sess, `${ID}-iso-a`), 1);
    assert.equal(await remaining(a.ws, `${ID}-iso-a`), 17);
  });

  it("rejects a session from another workspace (never cross-processed)", async () => {
    const a = await setup(`${ID}-xa`);
    const b = await setup(`${ID}-xb`);
    const before = (await (
      await fetch(`${BASE}/api/workspaces/status`, { headers: headers(`${ID}-xb`, b.ws) })
    ).json()) as { workspace: { seedReferenceAt: string } };

    const res = await reset(b.ws, `${ID}-xb`, { confirm: true }, a.sess);
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, "WORKSPACE_REQUIRED");

    const after = (await (
      await fetch(`${BASE}/api/workspaces/status`, { headers: headers(`${ID}-xb`, b.ws) })
    ).json()) as { workspace: { seedReferenceAt: string } };
    assert.equal(after.workspace.seedReferenceAt, before.workspace.seedReferenceAt);
  });

  it("throttles at 20/hour per workspace and 30/hour per IP", async () => {
    const a = await setup(`${ID}-rl-a`);
    for (let i = 0; i < 20; i++) {
      const res = await reset(a.ws, `${ID}-rl-a`, { confirm: true });
      assert.equal(res.status, 200, `reset ${i}`);
    }
    const limited = await reset(a.ws, `${ID}-rl-a`, { confirm: true });
    assert.equal(limited.status, 429);
    assert.equal(((await limited.json()) as { error: { code: string } }).error.code, "WORKSPACE_RATE_LIMITED");
    assert.ok(Number(limited.headers.get("retry-after")) > 0);

    // Deliberately reuse the same forwarded IP for a fresh workspace WITHOUT
    // wiping: 10 more fit (IP count 20 → 30) regardless of local runtime.
    const wsB = await provision(BASE, `${ID}-rl-b`);
    for (let i = 0; i < 10; i++) {
      const res = await reset(wsB, `${ID}-rl-a`, { confirm: true });
      assert.equal(res.status, 200, `ip reset ${i}`);
    }
    const ipLimited = await reset(wsB, `${ID}-rl-a`, { confirm: true });
    assert.equal(ipLimited.status, 429);
    assert.equal(((await ipLimited.json()) as { error: { code: string } }).error.code, "WORKSPACE_RATE_LIMITED");
    resetRateCounters(BASE);
  });
});
