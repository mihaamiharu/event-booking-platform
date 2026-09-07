// Checkout endpoint (BKG-001/002/003, PAY-001; API-CONTRACT §3.4).
// SPIKE-B decision: serialized conditional-UPDATE capacity gate FIRST, then
// inserts — never the naive full batch (a 0-row UPDATE is a successful
// statement, so batch() would not roll back losers' INSERTs). The insert set
// itself goes through one batch() call, which is error-atomic.
import { Hono, type Context } from "hono";
import type { AppContext } from "../app.ts";
import { d1BatchDb, first, newMeta, run, type D1Meta } from "../db.ts";
import { err } from "../errors.ts";
import { checkoutFingerprint, isIdempotencyKey, newBookingReference } from "../idempotency.ts";
import { resolveSession } from "../session.ts";
import { touchActivity } from "./workspaces.ts";

const SUCCESS_CODE = "SIMULATE-SUCCESS";
const DECLINE_CODE = "SIMULATE-DECLINE";
const MAX_FIELD_CHARS = 256;

interface BookingView {
  reference: string;
  eventSlug: string;
  eventSessionId: string;
  ticketTypeId: string;
  quantity: number;
  unitPriceIdr: number;
  totalIdr: number;
  currency: string;
  paymentStatus: "SUCCEEDED";
  bookingStatus: "CONFIRMED";
  createdAt: string;
}

interface StoredKey {
  fingerprint: string;
  booking_id: string | null;
  outcome: string | null;
}

async function replayBooking(
  c: Context<AppContext>,
  meta: D1Meta,
  bookingId: string,
): Promise<Response> {
  const ws = c.get("workspace");
  const row = await first<{
    reference: string;
    slug: string;
    event_session_id: string;
    ticket_type_id: string;
    quantity: number;
    unit_price_idr: number;
    total_idr: number;
    currency: string;
    created_at: string;
  }>(
    meta,
    c.env.DB,
    `SELECT b.reference, e.slug, b.event_session_id, i.ticket_type_id,
            b.quantity, i.unit_price_idr, b.total_idr, b.currency, b.created_at
       FROM bookings b
       JOIN events e ON e.id = b.event_id
       JOIN booking_items i ON i.booking_id = b.id
      WHERE b.workspace_id = ?1 AND b.id = ?2`,
    ws.id,
    bookingId,
  );
  if (!row) {
    return err(503, "SERVICE_UNAVAILABLE", { message: "Checkout unsettled; retry with a new key." });
  }
  return c.json({
    booking: {
      reference: row.reference,
      eventSlug: row.slug,
      eventSessionId: row.event_session_id,
      ticketTypeId: row.ticket_type_id,
      quantity: row.quantity,
      unitPriceIdr: row.unit_price_idr,
      totalIdr: row.total_idr,
      currency: row.currency,
      paymentStatus: "SUCCEEDED",
      bookingStatus: "CONFIRMED",
      createdAt: row.created_at,
    } satisfies BookingView,
    meta,
  });
}

export const checkout = new Hono<AppContext>();

checkout.post("/", async (c) => {
  const meta = newMeta();
  const db = c.env.DB;
  const ws = c.get("workspace");
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  if (!c.req.header("content-type")?.includes("application/json")) {
    return err(400, "VALIDATION_FAILED", { message: "Request body must be JSON." });
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return err(400, "VALIDATION_FAILED", { message: "Request body must be JSON." });
  }

  const key = c.req.header("Idempotency-Key");
  if (!isIdempotencyKey(key)) {
    return err(400, "IDEMPOTENCY_KEY_REQUIRED", {
      message: "Idempotency-Key header (uuid-v4) is required.",
    });
  }

  const session = await resolveSession(meta, db, c.req.raw, ws.id, nowMs);
  if (!session) {
    return err(401, "AUTH_REQUIRED", { message: "Sign in to check out." });
  }

  const b = body as Record<string, unknown>;
  const eventSlug = typeof b.eventSlug === "string" ? b.eventSlug : "";
  const eventSessionId = typeof b.eventSessionId === "string" ? b.eventSessionId : "";
  const ticketTypeId = typeof b.ticketTypeId === "string" ? b.ticketTypeId : "";
  const quantity = b.quantity;
  const paymentCode = typeof b.paymentCode === "string" ? b.paymentCode : "";
  if (
    eventSlug.length === 0 || eventSlug.length > MAX_FIELD_CHARS ||
    eventSessionId.length === 0 || eventSessionId.length > MAX_FIELD_CHARS ||
    ticketTypeId.length === 0 || ticketTypeId.length > MAX_FIELD_CHARS
  ) {
    return err(400, "VALIDATION_FAILED", {
      message: "Event, session, and ticket selection are required.",
    });
  }
  if (!Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 5) {
    return err(400, "QUANTITY_INVALID", {
      message: "Quantity must be an integer from 1 through 5.",
      fields: { quantity: "QUANTITY_INVALID" },
    });
  }
  if (paymentCode !== SUCCESS_CODE && paymentCode !== DECLINE_CODE) {
    return err(400, "PAYMENT_CODE_INVALID", {
      message: "Payment code must be SIMULATE-SUCCESS or SIMULATE-DECLINE.",
      fields: { paymentCode: "PAYMENT_CODE_INVALID" },
    });
  }
  const qty = quantity as number;

  const fingerprint = await checkoutFingerprint({
    eventSlug,
    eventSessionId,
    ticketTypeId,
    quantity: qty,
    paymentCode,
  });

  // Idempotency gate: same key + same input replays, same key + altered
  // input conflicts — both without touching capacity (BR-BKG-004, T-08).
  const prior = await first<StoredKey>(
    meta,
    db,
    "SELECT fingerprint, booking_id, outcome FROM idempotency_keys WHERE workspace_id = ?1 AND user_id = ?2 AND key = ?3",
    ws.id,
    session.userId,
    key,
  );
  if (prior) {
    if (prior.fingerprint !== fingerprint) {
      return err(409, "IDEMPOTENCY_CONFLICT", {
        message: "This checkout key was already used with different input; start a new attempt.",
      });
    }
    if (prior.booking_id) return replayBooking(c, meta, prior.booking_id);
    return err(422, "PAYMENT_DECLINED", { message: "Payment was declined; start a new attempt." });
  }

  // Server revalidation (BKG-002): publication, membership, window, price.
  const event = await first<{
    id: string;
    sales_open_at: string;
    sales_close_at: string;
  }>(
    meta,
    db,
    "SELECT id, sales_open_at, sales_close_at FROM events WHERE workspace_id = ?1 AND slug = ?2 AND status = 'PUBLISHED'",
    ws.id,
    eventSlug,
  );
  if (!event) {
    return err(404, "EVENT_NOT_FOUND", { message: "Event not found." });
  }
  const es = await first<{
    id: string;
    status: string;
    start_at: string;
    capacity: number;
    confirmed_quantity: number;
  }>(
    meta,
    db,
    "SELECT id, status, start_at, capacity, confirmed_quantity FROM event_sessions WHERE workspace_id = ?1 AND id = ?2 AND event_id = ?3",
    ws.id,
    eventSessionId,
    event.id,
  );
  const salesOpen = event.sales_open_at <= nowIso && nowIso < event.sales_close_at;
  if (
    !es || es.status !== "SCHEDULED" || es.start_at <= nowIso || !salesOpen
  ) {
    return err(409, "SESSION_NOT_BOOKABLE", {
      message: "This session is no longer bookable; refresh availability.",
    });
  }
  const ticket = await first<{ id: string; price_idr: number }>(
    meta,
    db,
    "SELECT id, price_idr FROM ticket_types WHERE workspace_id = ?1 AND id = ?2 AND event_id = ?3 AND event_session_id = ?4",
    ws.id,
    ticketTypeId,
    event.id,
    es.id,
  );
  if (!ticket) {
    return err(400, "TICKET_TYPE_INVALID", {
      message: "Ticket type does not belong to the selected session.",
    });
  }
  const totalIdr = ticket.price_idr * qty;
  if (es.capacity - es.confirmed_quantity < qty) {
    return err(409, "CAPACITY_INSUFFICIENT", {
      message: "Not enough places remain for this session.",
    });
  }

  const bookingId = crypto.randomUUID();
  const now = nowIso;

  // Decline path: record attempt + idempotency outcome only — no booking row,
  // no capacity consumed (PAY-001, BR-BKG-006).
  if (paymentCode === DECLINE_CODE) {
    try {
      await d1BatchDb(db, meta).batch([
        {
          sql: "INSERT INTO payment_attempts (id, workspace_id, user_id, booking_id, outcome, created_at) VALUES (?1, ?2, ?3, NULL, 'DECLINED', ?4)",
          params: [crypto.randomUUID(), ws.id, session.userId, now],
        },
        {
          sql: "INSERT INTO idempotency_keys (workspace_id, user_id, key, fingerprint, booking_id, outcome, created_at) VALUES (?1, ?2, ?3, ?4, NULL, 'DECLINED', ?5)",
          params: [ws.id, session.userId, key, fingerprint, now],
        },
      ]);
    } catch {
      return err(503, "SERVICE_UNAVAILABLE", { message: "Checkout unsettled; retry with a new key." });
    }
    await touchActivity(meta, db, ws.id, now);
    return err(422, "PAYMENT_DECLINED", { message: "Payment was declined; start a new attempt." });
  }

  // Success path (SPIKE-B gated): standalone conditional UPDATE first. A 0-row
  // result is a lost race or stale read → stable conflict, zero writes so far.
  const gated = await run(
    meta,
    db,
    `UPDATE event_sessions SET confirmed_quantity = confirmed_quantity + ?1
      WHERE id = ?2 AND workspace_id = ?3
        AND confirmed_quantity + ?1 <= capacity`,
    qty,
    es.id,
    ws.id,
  );
  if (gated !== 1) {
    return err(409, "CAPACITY_INSUFFICIENT", {
      message: "Not enough places remain for this session.",
    });
  }

  // Unique reference (pre-check; UNIQUE constraint is the final arbiter).
  let reference = newBookingReference();
  for (let i = 0; i < 3; i++) {
    const taken = await first<{ reference: string }>(
      meta,
      db,
      "SELECT reference FROM bookings WHERE workspace_id = ?1 AND reference = ?2",
      ws.id,
      reference,
    );
    if (!taken) break;
    reference = newBookingReference();
  }

  try {
    await d1BatchDb(db, meta).batch([
      {
        sql: "INSERT INTO bookings (id, workspace_id, user_id, event_id, event_session_id, reference, status, quantity, total_idr, currency, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'CONFIRMED', ?7, ?8, 'IDR', ?9)",
        params: [bookingId, ws.id, session.userId, event.id, es.id, reference, qty, totalIdr, now],
      },
      {
        sql: "INSERT INTO booking_items (id, workspace_id, booking_id, ticket_type_id, quantity, unit_price_idr, subtotal_idr) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params: [crypto.randomUUID(), ws.id, bookingId, ticket.id, qty, ticket.price_idr, totalIdr],
      },
      {
        sql: "INSERT INTO payment_attempts (id, workspace_id, user_id, booking_id, outcome, created_at) VALUES (?1, ?2, ?3, ?4, 'SUCCEEDED', ?5)",
        params: [crypto.randomUUID(), ws.id, session.userId, bookingId, now],
      },
      {
        sql: "INSERT INTO idempotency_keys (workspace_id, user_id, key, fingerprint, booking_id, outcome, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'SUCCEEDED', ?6)",
        params: [ws.id, session.userId, key, fingerprint, bookingId, now],
      },
    ]);
  } catch {
    // Key race (parallel same-key submit): re-read and replay if settled.
    const raced = await first<StoredKey>(
      meta,
      db,
      "SELECT fingerprint, booking_id, outcome FROM idempotency_keys WHERE workspace_id = ?1 AND user_id = ?2 AND key = ?3",
      ws.id,
      session.userId,
      key,
    );
    if (raced && raced.fingerprint === fingerprint && raced.booking_id) {
      return replayBooking(c, meta, raced.booking_id);
    }
    return err(503, "SERVICE_UNAVAILABLE", { message: "Checkout unsettled; retry with a new key." });
  }

  await touchActivity(meta, db, ws.id, now);
  return c.json(
    {
      booking: {
        reference,
        eventSlug,
        eventSessionId: es.id,
        ticketTypeId: ticket.id,
        quantity: qty,
        unitPriceIdr: ticket.price_idr,
        totalIdr,
        currency: "IDR",
        paymentStatus: "SUCCEEDED",
        bookingStatus: "CONFIRMED",
        createdAt: now,
      } satisfies BookingView,
      meta,
    },
    201,
  );
});
