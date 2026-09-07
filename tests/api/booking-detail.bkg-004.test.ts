// Booking detail tests (BKG-004; API-CONTRACT §3.5, AUTH-SECURITY T-01).
// Missing, cross-attendee, and cross-workspace references share one
// non-enumerating 404 shape.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { baseUrl, headers, provision, resetRateCounters, startWorker, type ApiMeta } from "./support/harness.ts";

const PORT = Number(process.env.EBP_API_PORT ?? 8790);
const BASE = baseUrl(PORT);
const ID = "s6-detail-bkg004";
const DESIGN = "jakarta-design-systems-workshop";

let stop: () => void;
before(async () => {
  stop = await startWorker(PORT);
  resetRateCounters(BASE);
});
after(() => stop());

async function setup(identity: string, email: string): Promise<{ ws: string; sess: string }> {
  resetRateCounters(BASE);
  const ws = await provision(BASE, identity);
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
  return { ws, sess: sess! };
}

async function getDetail(ws: string, sess: string | null, identity: string, ref: string): Promise<Response> {
  return fetch(`${BASE}/api/bookings/${encodeURIComponent(ref)}`, {
    headers: {
      ...headers(identity),
      cookie: `ebp_workspace=${ws}${sess ? `; ebp_session=${sess}` : ""}`,
    },
  });
}

describe("bkg-004 GET /api/bookings/:reference", () => {
  it("returns maya's seeded booking with full shape and budgets", async () => {
    const id = `${ID}-seeded`;
    const { ws, sess } = await setup(id, "maya.attendee@example.test");
    const res = await getDetail(ws, sess, id, "BKG-SEED-MAYA-001");
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      data: {
        reference: string;
        eventSlug: string;
        eventName: string;
        eventSessionId: string;
        sessionStartAt: string;
        sessionEndAt: string;
        ticketTypeId: string;
        ticketName: string;
        quantity: number;
        unitPriceIdr: number;
        totalIdr: number;
        currency: string;
        paymentStatus: string;
        bookingStatus: string;
        createdAt: string;
      };
      meta: ApiMeta;
    };
    assert.equal(body.data.reference, "BKG-SEED-MAYA-001");
    assert.equal(body.data.eventSlug, DESIGN);
    assert.equal(body.data.eventName, "Jakarta Design Systems Workshop");
    assert.equal(body.data.ticketName, "General");
    assert.equal(body.data.quantity, 2);
    assert.equal(body.data.unitPriceIdr, 150000);
    assert.equal(body.data.totalIdr, 300000);
    assert.equal(body.data.currency, "IDR");
    assert.equal(body.data.paymentStatus, "SUCCEEDED");
    assert.equal(body.data.bookingStatus, "CONFIRMED");
    assert.ok(Date.parse(body.data.sessionStartAt) < Date.parse(body.data.sessionEndAt));
    assert.ok(body.meta.rows_read <= 15, `rows_read ${body.meta.rows_read}`);
    assert.ok(body.meta.rows_written <= 15, `rows_written ${body.meta.rows_written}`);
  });

  it("missing, cross-attendee, and cross-workspace refs share one 404 (T-01)", async () => {
    const id = `${ID}-parity`;
    const { ws, sess } = await setup(`${id}-alex`, "alex.attendee@example.test");
    const maya = await setup(`${id}-maya`, "maya.attendee@example.test");

    // Cross-workspace needs a user-created ref: seeded refs exist everywhere.
    const d = (await (
      await fetch(`${BASE}/api/events/${DESIGN}`, { headers: headers(`${id}-alex`, ws) })
    ).json()) as {
      data: { sessions: { id: string }[]; ticketTypes: { id: string; eventSessionId: string }[] };
    };
    const sessionId = d.data.sessions[0]!.id;
    const ticketId = d.data.ticketTypes.find((t) => t.eventSessionId === sessionId)!.id;
    const created = await fetch(`${BASE}/api/checkout`, {
      method: "POST",
      headers: { ...headers(`${id}-alex`), cookie: `ebp_workspace=${ws}; ebp_session=${sess}`, "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        eventSlug: DESIGN,
        eventSessionId: sessionId,
        ticketTypeId: ticketId,
        quantity: 1,
        paymentCode: "SIMULATE-SUCCESS",
      }),
    });
    assert.equal(created.status, 201);
    const ownRef = ((await created.json()) as { booking: { reference: string } }).booking.reference;

    const shapes: { code: string; message: string }[] = [];
    for (const [w, s, ref, label] of [
      [ws, sess, "BKG-NOPE", "missing"],
      [ws, sess, "BKG-SEED-MAYA-001", "cross-attendee"],
      [maya.ws, maya.sess, ownRef, "cross-workspace"],
    ] as const) {
      const res = await getDetail(w, s, `${id}-${label}`, ref);
      assert.equal(res.status, 404, label);
      const body = (await res.json()) as { error: { code: string; message: string; correlationId: string } };
      assert.equal(body.error.code, "BOOKING_NOT_FOUND", label);
      assert.ok(body.error.correlationId, label);
      shapes.push({ code: body.error.code, message: body.error.message });
    }
    assert.deepEqual(shapes[0], shapes[1], "missing ≡ cross-attendee");
    assert.deepEqual(shapes[0], shapes[2], "missing ≡ cross-workspace");
    assert.ok(!JSON.stringify(shapes).includes("maya"), "no identity leakage");
  });

  it("requires a session (AUTH_REQUIRED)", async () => {
    const ws = await provision(BASE, `${ID}-auth`);
    const res = await getDetail(ws, null, `${ID}-auth`, "BKG-SEED-MAYA-001");
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, "AUTH_REQUIRED");
  });
});
