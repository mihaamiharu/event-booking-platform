// Attendee booking cancellation contract (BKG-006, BKG-007, NFR-010, UF-007).
// The future seeded session is the deterministic success fixture; DB tests
// cover the manipulated-time boundary without adding a test-only HTTP hook.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { baseUrl, headers, provision, resetRateCounters, startWorker } from "./support/harness.ts";

const PORT = Number(process.env.EBP_API_PORT ?? 8790);
const BASE = baseUrl(PORT);
const DESIGN = "jakarta-design-systems-workshop";

let stop: () => void;
before(async () => {
  stop = await startWorker(PORT);
  resetRateCounters(BASE);
});
after(() => stop());

async function setup(identity: string, email: "alex.attendee@example.test" | "maya.attendee@example.test") {
  resetRateCounters(BASE);
  const ws = await provision(BASE, identity);
  const password = email.startsWith("maya") ? "Booked123!" : "Attend123!";
  const signIn = await fetch(`${BASE}/api/session`, {
    method: "POST",
    headers: { ...headers(identity), cookie: `ebp_workspace=${ws}` },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(signIn.status, 200);
  const sess = signIn.headers
    .getSetCookie()
    .map((value) => value.match(/^ebp_session=([^;]*)/)?.[1])
    .find(Boolean);
  assert.ok(sess);
  return { ws, sess: sess! };
}

function cookies(ws: string, sess: string): string {
  return `ebp_workspace=${ws}; ebp_session=${sess}`;
}

async function cancel(ws: string, sess: string, identity: string, reference: string): Promise<Response> {
  return fetch(`${BASE}/api/bookings/${encodeURIComponent(reference)}/cancel`, {
    method: "POST",
    headers: { ...headers(identity), cookie: cookies(ws, sess) },
    body: "{}",
  });
}

async function eventDetail(ws: string, identity: string) {
  const response = await fetch(`${BASE}/api/events/${DESIGN}`, {
    headers: { ...headers(identity), cookie: `ebp_workspace=${ws}` },
  });
  assert.equal(response.status, 200);
  return (await response.json()) as {
    data: { sessions: { id: string; remainingCapacity: number }[] };
  };
}

describe("bkg-006/007 POST /api/bookings/:reference/cancel", () => {
  it("rejects non-JSON mutations before changing booking state", async () => {
    const id = "s-cancel-json-bkg006";
    const { ws, sess } = await setup(id, "maya.attendee@example.test");
    const before = await eventDetail(ws, id);
    const response = await fetch(`${BASE}/api/bookings/BKG-SEED-MAYA-001/cancel`, {
      method: "POST",
      headers: { ...headers(id), "content-type": "text/plain", cookie: cookies(ws, sess) },
      body: "{}",
    });
    assert.equal(response.status, 400);
    assert.equal(((await response.json()) as { error: { code: string } }).error.code, "VALIDATION_FAILED");
    const after = await eventDetail(ws, id);
    assert.equal(after.data.sessions[0]!.remainingCapacity, before.data.sessions[0]!.remainingCapacity);
  });

  it("requires an attendee session", async () => {
    const id = "s-cancel-auth-bkg006";
    const ws = await provision(BASE, id);
    const response = await cancel(ws, "missing-session", id, "BKG-SEED-MAYA-001");
    assert.equal(response.status, 401);
    assert.equal(((await response.json()) as { error: { code: string } }).error.code, "AUTH_REQUIRED");
  });

  it("cancels once, releases capacity, and keeps a readable lifecycle record", async () => {
    const id = "s-cancel-success-bkg006";
    const { ws, sess } = await setup(id, "maya.attendee@example.test");
    const before = await eventDetail(ws, id);
    assert.equal(before.data.sessions[0]!.remainingCapacity, 18);

    const response = await cancel(ws, sess, id, "BKG-SEED-MAYA-001");
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      data: { reference: string; bookingStatus: string; cancelledAt: string; releasedQuantity: number };
      meta: { rows_read: number; rows_written: number };
    };
    assert.deepEqual(body.data.reference, "BKG-SEED-MAYA-001");
    assert.equal(body.data.bookingStatus, "CANCELLED");
    assert.equal(body.data.releasedQuantity, 2);
    assert.ok(Date.parse(body.data.cancelledAt) > 0);
    assert.ok(body.meta.rows_read <= 10, `rows_read ${body.meta.rows_read}`);
    assert.ok(body.meta.rows_written <= 10, `rows_written ${body.meta.rows_written}`);

    const after = await eventDetail(ws, id);
    assert.equal(after.data.sessions[0]!.remainingCapacity, 20);
    const detail = await fetch(`${BASE}/api/bookings/BKG-SEED-MAYA-001`, {
      headers: { ...headers(id), cookie: cookies(ws, sess) },
    });
    assert.equal(detail.status, 200);
    const detailBody = (await detail.json()) as { data: { bookingStatus: string; cancelledAt: string | null } };
    assert.equal(detailBody.data.bookingStatus, "CANCELLED");
    assert.equal(detailBody.data.cancelledAt, body.data.cancelledAt);

    const duplicate = await cancel(ws, sess, id, "BKG-SEED-MAYA-001");
    assert.equal(duplicate.status, 409);
    const duplicateBody = (await duplicate.json()) as { error: { code: string; message: string } };
    assert.equal(duplicateBody.error.code, "BOOKING_ALREADY_CANCELLED");
    const afterDuplicate = await eventDetail(ws, id);
    assert.equal(afterDuplicate.data.sessions[0]!.remainingCapacity, 20, "duplicate cannot release again");
  });

  it("uses one safe not-found outcome for missing and foreign references", async () => {
    const id = "s-cancel-parity-bkg007";
    const owner = await setup(`${id}-owner`, "alex.attendee@example.test");
    const detail = await eventDetail(owner.ws, `${id}-owner`);
    const sessionId = detail.data.sessions[0]!.id;
    const event = (await (
      await fetch(`${BASE}/api/events/${DESIGN}`, {
        headers: { ...headers(`${id}-owner`), cookie: `ebp_workspace=${owner.ws}` },
      })
    ).json()) as { data: { ticketTypes: { id: string; eventSessionId: string }[] } };
    const ticketId = event.data.ticketTypes.find((ticket) => ticket.eventSessionId === sessionId)!.id;
    const created = await fetch(`${BASE}/api/checkout`, {
      method: "POST",
      headers: {
        ...headers(`${id}-owner`),
        cookie: cookies(owner.ws, owner.sess),
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        eventSlug: DESIGN,
        eventSessionId: sessionId,
        ticketTypeId: ticketId,
        quantity: 1,
        paymentCode: "SIMULATE-SUCCESS",
      }),
    });
    assert.equal(created.status, 201);
    const ownReference = ((await created.json()) as { booking: { reference: string } }).booking.reference;

    const foreign = await setup(`${id}-foreign`, "alex.attendee@example.test");
    const responses = [
      await cancel(owner.ws, owner.sess, `${id}-owner`, "BKG-NOPE"),
      await cancel(owner.ws, owner.sess, `${id}-owner`, "BKG-SEED-MAYA-001"),
      await cancel(foreign.ws, foreign.sess, `${id}-foreign`, ownReference),
    ];
    const shapes = [] as { code: string; message: string }[];
    for (const response of responses) {
      assert.equal(response.status, 404);
      const body = (await response.json()) as { error: { code: string; message: string } };
      shapes.push({ code: body.error.code, message: body.error.message });
    }
    assert.deepEqual(shapes[0], shapes[1]);
    assert.deepEqual(shapes[0], shapes[2]);
    assert.equal(shapes[0]!.code, "BOOKING_NOT_FOUND");
    assert.ok(!JSON.stringify(shapes).includes("maya"));
  });
});
