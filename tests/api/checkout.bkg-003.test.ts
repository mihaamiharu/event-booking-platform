// Checkout endpoint tests (BKG-001/002/003, PAY-001; API-CONTRACT §3.4).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { baseUrl, headers, provision, resetRateCounters, startWorker, type ApiMeta } from "./support/harness.ts";

const PORT = Number(process.env.EBP_API_PORT ?? 8790);
const BASE = baseUrl(PORT);
const ID = "s5-checkout-bkg003";
const DESIGN = "jakarta-design-systems-workshop";
const MEETUP = "community-product-meetup";
const PAST = "product-leadership-forum";

let stop: () => void;
before(async () => {
  stop = await startWorker(PORT);
  resetRateCounters(BASE);
});
after(() => stop());

function sessionCookie(res: Response): string {
  const match = res.headers
    .getSetCookie()
    .map((c) => c.match(/^ebp_session=([^;]*)/)?.[1])
    .find((v) => v !== undefined);
  assert.ok(match, "sign-in sets ebp_session");
  return match;
}

async function setup(identity: string): Promise<{ ws: string; sess: string }> {
  // Fresh provision bucket per test: the harness supplies a unique Cloudflare
  // client identity so per-test identities do not share the 10/hour counter.
  // Provision abuse itself is covered in wsp-004 tests.
  resetRateCounters(BASE);
  const ws = await provision(BASE, identity);
  const inRes = await fetch(`${BASE}/api/session`, {
    method: "POST",
    headers: { ...headers(identity), cookie: `ebp_workspace=${ws}` },
    body: JSON.stringify({ email: "alex.attendee@example.test", password: "Attend123!" }),
  });
  assert.equal(inRes.status, 200);
  return { ws, sess: sessionCookie(inRes) };
}

interface Detail {
  data: {
    sessions: { id: string; remainingCapacity: number; bookable: boolean }[];
    ticketTypes: { id: string; name: string; eventSessionId: string }[];
  };
}

async function detail(ws: string, identity: string, slug: string): Promise<Detail> {
  const res = await fetch(`${BASE}/api/events/${slug}`, { headers: headers(identity, ws) });
  assert.equal(res.status, 200);
  return (await res.json()) as Detail;
}

async function checkout(
  ws: string,
  sess: string | null,
  identity: string,
  key: string | null,
  body: Record<string, unknown>,
): Promise<Response> {
  const h: Record<string, string> = { ...headers(identity), cookie: `ebp_workspace=${ws}${sess ? `; ebp_session=${sess}` : ""}` };
  if (key !== null) h["Idempotency-Key"] = key;
  return fetch(`${BASE}/api/checkout`, { method: "POST", headers: h, body: JSON.stringify(body) });
}

interface BookingBody {
  booking: {
    reference: string;
    eventSlug: string;
    eventSessionId: string;
    ticketTypeId: string;
    quantity: number;
    unitPriceIdr: number;
    totalIdr: number;
    currency: string;
    paymentStatus: string;
    bookingStatus: string;
    createdAt: string;
  };
  meta: ApiMeta;
}

describe("bkg-003 POST /api/checkout success and replay", () => {
  it("creates one confirmed booking and consumes capacity once (UF-004)", async () => {
    const id = `${ID}-success`;
    const { ws, sess } = await setup(id);
    const d = await detail(ws, id, DESIGN);
    const session = d.data.sessions[0]!;
    const ticket = d.data.ticketTypes.find((t) => t.eventSessionId === session.id)!;
    const before = session.remainingCapacity;

    const res = await checkout(ws, sess, id, crypto.randomUUID(), {
      eventSlug: DESIGN,
      eventSessionId: session.id,
      ticketTypeId: ticket.id,
      quantity: 2,
      paymentCode: "SIMULATE-SUCCESS",
      totalIdr: 1, // client totals are ignored (BKG-002)
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as BookingBody;
    assert.match(body.booking.reference, /^BKG-[A-Z2-9]{6}$/);
    assert.equal(body.booking.eventSlug, DESIGN);
    assert.equal(body.booking.quantity, 2);
    assert.equal(body.booking.unitPriceIdr, 150000);
    assert.equal(body.booking.totalIdr, 300000);
    assert.equal(body.booking.currency, "IDR");
    assert.equal(body.booking.paymentStatus, "SUCCEEDED");
    assert.equal(body.booking.bookingStatus, "CONFIRMED");
    assert.ok(body.meta.rows_read <= 30, `rows_read ${body.meta.rows_read}`);
    assert.ok(body.meta.rows_written <= 30, `rows_written ${body.meta.rows_written}`);

    const after = (await detail(ws, id, DESIGN)).data.sessions[0]!.remainingCapacity;
    assert.equal(after, before - 2);
  });

  it("replays same key + same input as 200 without consuming capacity", async () => {
    const id = `${ID}-replay`;
    const { ws, sess } = await setup(id);
    const d = await detail(ws, id, DESIGN);
    const session = d.data.sessions[0]!;
    const ticket = d.data.ticketTypes.find((t) => t.eventSessionId === session.id)!;
    const input = {
      eventSlug: DESIGN,
      eventSessionId: session.id,
      ticketTypeId: ticket.id,
      quantity: 1,
      paymentCode: "SIMULATE-SUCCESS",
    };
    const key = crypto.randomUUID();
    const first = await checkout(ws, sess, id, key, input);
    assert.equal(first.status, 201);
    const ref = ((await first.json()) as BookingBody).booking.reference;
    const mid = (await detail(ws, id, DESIGN)).data.sessions[0]!.remainingCapacity;

    const second = await checkout(ws, sess, id, key, { ...input });
    assert.equal(second.status, 200);
    assert.equal(((await second.json()) as BookingBody).booking.reference, ref);
    const end = (await detail(ws, id, DESIGN)).data.sessions[0]!.remainingCapacity;
    assert.equal(end, mid);
  });

  it("rejects same key + altered input as conflict with capacity unchanged (T-08)", async () => {
    const id = `${ID}-conflict`;
    const { ws, sess } = await setup(id);
    const d = await detail(ws, id, DESIGN);
    const session = d.data.sessions[0]!;
    const ticket = d.data.ticketTypes.find((t) => t.eventSessionId === session.id)!;
    const key = crypto.randomUUID();
    const first = await checkout(ws, sess, id, key, {
      eventSlug: DESIGN,
      eventSessionId: session.id,
      ticketTypeId: ticket.id,
      quantity: 1,
      paymentCode: "SIMULATE-SUCCESS",
    });
    assert.equal(first.status, 201);
    const mid = (await detail(ws, id, DESIGN)).data.sessions[0]!.remainingCapacity;

    const second = await checkout(ws, sess, id, key, {
      eventSlug: DESIGN,
      eventSessionId: session.id,
      ticketTypeId: ticket.id,
      quantity: 2,
      paymentCode: "SIMULATE-SUCCESS",
    });
    assert.equal(second.status, 409);
    assert.equal(((await second.json()) as { error: { code: string } }).error.code, "IDEMPOTENCY_CONFLICT");
    const end = (await detail(ws, id, DESIGN)).data.sessions[0]!.remainingCapacity;
    assert.equal(end, mid);
  });
});

describe("pay-001 payment simulation outcomes", () => {
  it("decline creates no booking and consumes no capacity; replays as decline (UF-005)", async () => {
    const id = `${ID}-decline`;
    const { ws, sess } = await setup(id);
    const d = await detail(ws, id, DESIGN);
    const session = d.data.sessions[0]!;
    const ticket = d.data.ticketTypes.find((t) => t.eventSessionId === session.id)!;
    const before = session.remainingCapacity;
    const input = {
      eventSlug: DESIGN,
      eventSessionId: session.id,
      ticketTypeId: ticket.id,
      quantity: 2,
      paymentCode: "SIMULATE-DECLINE",
    };
    const key = crypto.randomUUID();

    const declined = await checkout(ws, sess, id, key, input);
    assert.equal(declined.status, 422);
    assert.equal(((await declined.json()) as { error: { code: string } }).error.code, "PAYMENT_DECLINED");
    assert.equal((await detail(ws, id, DESIGN)).data.sessions[0]!.remainingCapacity, before);

    const replay = await checkout(ws, sess, id, key, { ...input });
    assert.equal(replay.status, 422);
    assert.equal((await detail(ws, id, DESIGN)).data.sessions[0]!.remainingCapacity, before);

    const changed = await checkout(ws, sess, id, key, { ...input, paymentCode: "SIMULATE-SUCCESS" });
    assert.equal(changed.status, 409);
    assert.equal(((await changed.json()) as { error: { code: string } }).error.code, "IDEMPOTENCY_CONFLICT");
  });

  it("invalid simulation code is rejected with no side effects", async () => {
    const id = `${ID}-badcode`;
    const { ws, sess } = await setup(id);
    const d = await detail(ws, id, DESIGN);
    const session = d.data.sessions[0]!;
    const ticket = d.data.ticketTypes.find((t) => t.eventSessionId === session.id)!;
    const before = session.remainingCapacity;

    const res = await checkout(ws, sess, id, crypto.randomUUID(), {
      eventSlug: DESIGN,
      eventSessionId: session.id,
      ticketTypeId: ticket.id,
      quantity: 1,
      paymentCode: "VISA-4111",
    });
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, "PAYMENT_CODE_INVALID");
    assert.equal((await detail(ws, id, DESIGN)).data.sessions[0]!.remainingCapacity, before);
  });
});

describe("bkg-001/bkg-002 checkout validation", () => {
  it("rejects quantities outside 1–5", async () => {
    const id = `${ID}-qty`;
    const { ws, sess } = await setup(id);
    for (const quantity of [0, 6, 2.5]) {
      const res = await checkout(ws, sess, id, crypto.randomUUID(), {
        eventSlug: DESIGN,
        eventSessionId: "x",
        ticketTypeId: "y",
        quantity,
        paymentCode: "SIMULATE-SUCCESS",
      });
      assert.equal(res.status, 400, `quantity ${quantity}`);
      assert.equal(((await res.json()) as { error: { code: string } }).error.code, "QUANTITY_INVALID");
    }
  });

  it("requires an idempotency key", async () => {
    const id = `${ID}-key`;
    const { ws, sess } = await setup(id);
    const res = await checkout(ws, sess, id, null, {
      eventSlug: DESIGN,
      eventSessionId: "x",
      ticketTypeId: "y",
      quantity: 1,
      paymentCode: "SIMULATE-SUCCESS",
    });
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, "IDEMPOTENCY_KEY_REQUIRED");
  });

  it("requires a session (AUTH_REQUIRED)", async () => {
    resetRateCounters(BASE);
    const ws = await provision(BASE, `${ID}-auth`);
    const res = await checkout(ws, null, `${ID}-auth`, crypto.randomUUID(), {
      eventSlug: DESIGN,
      eventSessionId: "x",
      ticketTypeId: "y",
      quantity: 1,
      paymentCode: "SIMULATE-SUCCESS",
    });
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, "AUTH_REQUIRED");
  });

  it("rejects unknown and draft events as not found", async () => {
    const id = `${ID}-noevent`;
    const { ws, sess } = await setup(id);
    for (const eventSlug of ["no-such-event", "modern-web-conference"]) {
      const res = await checkout(ws, sess, id, crypto.randomUUID(), {
        eventSlug,
        eventSessionId: "x",
        ticketTypeId: "y",
        quantity: 1,
        paymentCode: "SIMULATE-SUCCESS",
      });
      assert.equal(res.status, 404, eventSlug);
      assert.equal(((await res.json()) as { error: { code: string } }).error.code, "EVENT_NOT_FOUND");
    }
  });

  it("rejects foreign ticket types and unbookable sessions", async () => {
    const id = `${ID}-domain`;
    const { ws, sess } = await setup(id);
    const design = await detail(ws, id, DESIGN);
    const meetup = await detail(ws, id, MEETUP);
    const session = design.data.sessions[0]!;
    const foreignTicket = meetup.data.ticketTypes[0]!;

    const ticketRes = await checkout(ws, sess, id, crypto.randomUUID(), {
      eventSlug: DESIGN,
      eventSessionId: session.id,
      ticketTypeId: foreignTicket.id,
      quantity: 1,
      paymentCode: "SIMULATE-SUCCESS",
    });
    assert.equal(ticketRes.status, 400);
    assert.equal(((await ticketRes.json()) as { error: { code: string } }).error.code, "TICKET_TYPE_INVALID");

    // Past sessions are undiscoverable (detail 404s on no-future-session), so a
    // client-guessed id for the PUBLISHED past event must fail closed without
    // revealing whether the session exists.
    const pastRes = await checkout(ws, sess, id, crypto.randomUUID(), {
      eventSlug: PAST,
      eventSessionId: "sess_past_01",
      ticketTypeId: "ticket_past_general",
      quantity: 1,
      paymentCode: "SIMULATE-SUCCESS",
    });
    // Past fixture: PUBLISHED event, COMPLETED session, closed sales window.
    assert.equal(pastRes.status, 409);
    assert.equal(((await pastRes.json()) as { error: { code: string } }).error.code, "SESSION_NOT_BOOKABLE");
  });

  it("rejects over-capacity requests without consuming anything", async () => {
    const id = `${ID}-capacity`;
    const { ws, sess } = await setup(id);
    const d = await detail(ws, id, DESIGN);
    const session = d.data.sessions[0]!;
    const ticket = d.data.ticketTypes.find((t) => t.eventSessionId === session.id)!;
    assert.equal(session.remainingCapacity, 18, "seed leaves 18 remaining");

    // Drain 18 → 3 with qty-5 checkouts (5+5+5).
    for (let i = 0; i < 3; i++) {
      const drain = await checkout(ws, sess, id, crypto.randomUUID(), {
        eventSlug: DESIGN,
        eventSessionId: session.id,
        ticketTypeId: ticket.id,
        quantity: 5,
        paymentCode: "SIMULATE-SUCCESS",
      });
      assert.equal(drain.status, 201);
    }
    assert.equal((await detail(ws, id, DESIGN)).data.sessions[0]!.remainingCapacity, 3);

    const over = await checkout(ws, sess, id, crypto.randomUUID(), {
      eventSlug: DESIGN,
      eventSessionId: session.id,
      ticketTypeId: ticket.id,
      quantity: 5,
      paymentCode: "SIMULATE-SUCCESS",
    });
    assert.equal(over.status, 409);
    assert.equal(((await over.json()) as { error: { code: string } }).error.code, "CAPACITY_INSUFFICIENT");
    assert.equal((await detail(ws, id, DESIGN)).data.sessions[0]!.remainingCapacity, 3);

    const exact = await checkout(ws, sess, id, crypto.randomUUID(), {
      eventSlug: DESIGN,
      eventSessionId: session.id,
      ticketTypeId: ticket.id,
      quantity: 3,
      paymentCode: "SIMULATE-SUCCESS",
    });
    assert.equal(exact.status, 201);
    assert.equal((await detail(ws, id, DESIGN)).data.sessions[0]!.remainingCapacity, 0);
  });
});
