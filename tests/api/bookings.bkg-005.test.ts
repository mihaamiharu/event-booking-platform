// Booking list tests (BKG-005; API-CONTRACT §3.5, TEST-STRATEGY T-01 shape).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { baseUrl, headers, provision, resetRateCounters, startWorker, type ApiMeta } from "./support/harness.ts";

const PORT = Number(process.env.EBP_API_PORT ?? 8790);
const BASE = baseUrl(PORT);
const ID = "s6-bookings-bkg005";
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

function cookies(ws: string, sess?: string): string {
  return sess ? `ebp_workspace=${ws}; ebp_session=${sess}` : `ebp_workspace=${ws}`;
}

interface ListItem {
  reference: string;
  eventName: string;
  sessionStartAt: string;
  quantity: number;
  totalIdr: number;
  currency: string;
  bookingStatus: string;
}

interface ListBody {
  data: ListItem[];
  pagination: { page: number; perPage: number; total: number };
  meta: ApiMeta;
}

async function list(ws: string, sess: string | null, identity: string, query = ""): Promise<Response> {
  return fetch(`${BASE}/api/bookings${query}`, {
    headers: { ...headers(identity), cookie: cookies(ws, sess ?? undefined) },
  });
}

describe("bkg-005 GET /api/bookings", () => {
  it("requires a session (AUTH_REQUIRED)", async () => {
    const ws = await provision(BASE, `${ID}-auth`);
    const res = await list(ws, null, `${ID}-auth`);
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, "AUTH_REQUIRED");
  });

  it("returns an explicit empty list for alex", async () => {
    const id = `${ID}-empty`;
    const { ws, sess } = await setup(id, "alex.attendee@example.test");
    const res = await list(ws, sess, id);
    assert.equal(res.status, 200);
    const body = (await res.json()) as ListBody;
    assert.deepEqual(body.data, []);
    assert.deepEqual(body.pagination, { page: 1, perPage: 20, total: 0 });
  });

  it("returns maya's seeded booking with list shape and budgets", async () => {
    const id = `${ID}-seeded`;
    const { ws, sess } = await setup(id, "maya.attendee@example.test");
    const res = await list(ws, sess, id);
    assert.equal(res.status, 200);
    const body = (await res.json()) as ListBody;
    assert.equal(body.pagination.total, 1);
    assert.deepEqual(body.data, [
      {
        reference: "BKG-SEED-MAYA-001",
        eventName: "Jakarta Design Systems Workshop",
        sessionStartAt: body.data[0]!.sessionStartAt,
        quantity: 2,
        totalIdr: 300000,
        currency: "IDR",
        bookingStatus: "CONFIRMED",
      },
    ]);
    assert.ok(Date.parse(body.data[0]!.sessionStartAt) > 0);
    assert.ok(body.meta.rows_read <= 15, `rows_read ${body.meta.rows_read}`);
    assert.ok(body.meta.rows_written <= 15, `rows_written ${body.meta.rows_written}`);
  });

  it("lists newest first with pagination", async () => {
    const id = `${ID}-paging`;
    const { ws, sess } = await setup(id, "maya.attendee@example.test");
    const d = (await (
      await fetch(`${BASE}/api/events/${DESIGN}`, { headers: headers(id, ws) })
    ).json()) as {
      data: { sessions: { id: string }[]; ticketTypes: { id: string; eventSessionId: string }[] };
    };
    const sessionId = d.data.sessions[0]!.id;
    const ticketId = d.data.ticketTypes.find((t) => t.eventSessionId === sessionId)!.id;
    const refs: string[] = [];
    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${BASE}/api/checkout`, {
        method: "POST",
        headers: { ...headers(id), cookie: cookies(ws, sess), "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          eventSlug: DESIGN,
          eventSessionId: sessionId,
          ticketTypeId: ticketId,
          quantity: 1,
          paymentCode: "SIMULATE-SUCCESS",
        }),
      });
      assert.equal(res.status, 201);
      refs.push(((await res.json()) as { booking: { reference: string } }).booking.reference);
    }

    const page1 = (await (await list(ws, sess, id, "?perPage=2")).json()) as ListBody;
    assert.equal(page1.pagination.total, 3);
    assert.deepEqual(
      page1.data.map((b) => b.reference),
      [refs[1], refs[0]],
      "newest first",
    );
    const page2 = (await (await list(ws, sess, id, "?perPage=2&page=2")).json()) as ListBody;
    assert.deepEqual(
      page2.data.map((b) => b.reference),
      ["BKG-SEED-MAYA-001"],
      "seeded booking is oldest",
    );
  });

  it("rejects bad pagination without leaking state", async () => {
    const id = `${ID}-paging-bad`;
    const { ws, sess } = await setup(id, "alex.attendee@example.test");
    const res = await list(ws, sess, id, "?page=0");
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, "VALIDATION_FAILED");
  });
});
