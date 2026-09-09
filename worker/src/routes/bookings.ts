// Booking reads and lifecycle writes (BKG-004/005/006/007; API-CONTRACT §3.5).
// Every query binds (workspace_id, user_id) from server-side context;
// missing vs. foreign references return the identical BOOKING_NOT_FOUND.
import { Hono } from "hono";
import type { AppContext } from "../app.ts";
import { all, d1BatchDb, first, newMeta } from "../db.ts";
import { err } from "../errors.ts";
import { resolveSession } from "../session.ts";
import { scenarioEnabled } from "../scenario.ts";
import { touchActivity } from "./workspaces.ts";

function parsePaging(url: URL): { page: number; perPage: number } | Response {
  const page = url.searchParams.get("page") === null ? 1 : Number(url.searchParams.get("page"));
  const perPage = url.searchParams.get("perPage") === null ? 20 : Number(url.searchParams.get("perPage"));
  const bad: Record<string, string> = {};
  if (!Number.isInteger(page) || page < 1) bad.page = "PAGE_INVALID";
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > 50) bad.perPage = "PER_PAGE_INVALID";
  if (Object.keys(bad).length > 0) {
    return err(400, "VALIDATION_FAILED", {
      message: "Invalid pagination.",
      fields: bad,
      correlation: false,
    });
  }
  return { page, perPage };
}

/** Server-authoritative cancellation boundary (BKG-006/007, BR-BKG-007). */
export function canCancelBooking(status: string, sessionStartAt: string, nowIso: string): boolean {
  return status === "CONFIRMED" && sessionStartAt > nowIso;
}

export const bookings = new Hono<AppContext>();

bookings.get("/", async (c) => {
  const meta = newMeta();
  const db = c.env.DB;
  const ws = c.get("workspace");
  const nowMs = Date.now();

  const session = await resolveSession(meta, db, c.req.raw, ws.id, nowMs);
  if (!session) {
    return err(401, "AUTH_REQUIRED", { message: "Sign in to view bookings." });
  }

  const paging = parsePaging(new URL(c.req.url));
  if (paging instanceof Response) return paging;
  const { page, perPage } = paging;

  const totalRow = await first<{ n: number }>(
    meta,
    db,
    "SELECT COUNT(*) AS n FROM bookings WHERE workspace_id = ?1 AND user_id = ?2",
    ws.id,
    session.userId,
  );
  const rows = await all<{
    reference: string;
    event_name: string;
    session_start_at: string;
    quantity: number;
    total_idr: number;
    currency: string;
    status: string;
  }>(
    meta,
    db,
    `SELECT b.reference, e.name AS event_name, s.start_at AS session_start_at,
            b.quantity, b.total_idr, b.currency, b.status
       FROM bookings b
       JOIN events e ON e.id = b.event_id
       JOIN event_sessions s ON s.id = b.event_session_id
      WHERE b.workspace_id = ?1 AND b.user_id = ?2
      ORDER BY b.created_at DESC, b.reference DESC
      LIMIT ?3 OFFSET ?4`,
    ws.id,
    session.userId,
    perPage,
    (page - 1) * perPage,
  );

  await touchActivity(meta, db, ws.id, new Date(nowMs).toISOString(), !scenarioEnabled(c.env, "wsp-activity-frozen"));
  return c.json({
    data: rows.map((r) => ({
      reference: r.reference,
      eventName: r.event_name,
      sessionStartAt: r.session_start_at,
      quantity: r.quantity,
      totalIdr: r.total_idr,
      currency: r.currency,
      bookingStatus: r.status,
    })),
    pagination: { page, perPage, total: totalRow?.n ?? 0 },
    meta,
  });
});

bookings.get("/:reference", async (c) => {
  const meta = newMeta();
  const db = c.env.DB;
  const ws = c.get("workspace");
  const nowMs = Date.now();
  const reference = c.req.param("reference");

  const session = await resolveSession(meta, db, c.req.raw, ws.id, nowMs);
  if (!session) {
    return err(401, "AUTH_REQUIRED", { message: "Sign in to view bookings." });
  }

  const ownershipLeak = scenarioEnabled(c.env, "bkg-ownership-leak");
  const row = await first<{
    reference: string;
    slug: string;
    event_name: string;
    event_session_id: string;
    session_start_at: string;
    session_end_at: string;
    ticket_type_id: string;
    ticket_name: string;
    quantity: number;
    unit_price_idr: number;
    total_idr: number;
    currency: string;
    created_at: string;
    status: string;
    cancelled_at: string | null;
  }>(
    meta,
    db,
    `SELECT b.reference, e.slug, e.name AS event_name, b.event_session_id,
            s.start_at AS session_start_at, s.end_at AS session_end_at,
            i.ticket_type_id, t.name AS ticket_name,
            b.quantity, i.unit_price_idr, b.total_idr, b.currency, b.created_at,
            b.status, b.cancelled_at
       FROM bookings b
       JOIN events e ON e.id = b.event_id
       JOIN event_sessions s ON s.id = b.event_session_id
       JOIN booking_items i ON i.booking_id = b.id
       JOIN ticket_types t ON t.id = i.ticket_type_id
      WHERE b.workspace_id = ?1 ${ownershipLeak ? "" : "AND b.user_id = ?2"} AND b.reference = ?${ownershipLeak ? "2" : "3"}`,
    ...(ownershipLeak ? [ws.id, reference] : [ws.id, session.userId, reference]),
  );
  if (!row) {
    return err(404, "BOOKING_NOT_FOUND", { message: "Booking not found." });
  }

  await touchActivity(meta, db, ws.id, new Date(nowMs).toISOString(), !scenarioEnabled(c.env, "wsp-activity-frozen"));
  return c.json({
    data: {
      reference: row.reference,
      eventSlug: row.slug,
      eventName: row.event_name,
      eventSessionId: row.event_session_id,
      sessionStartAt: row.session_start_at,
      sessionEndAt: row.session_end_at,
      ticketTypeId: row.ticket_type_id,
      ticketName: row.ticket_name,
      quantity: row.quantity,
      unitPriceIdr: row.unit_price_idr,
      totalIdr: row.total_idr,
      currency: row.currency,
      paymentStatus: "SUCCEEDED",
      bookingStatus: row.status,
      cancelledAt: row.cancelled_at,
      createdAt: row.created_at,
    },
    meta,
  });
});

bookings.post("/:reference/cancel", async (c) => {
  const meta = newMeta();
  const db = c.env.DB;
  const ws = c.get("workspace");
  const nowIso = new Date().toISOString();
  const reference = c.req.param("reference");

  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return err(400, "VALIDATION_FAILED", {
      message: "Cancellation requests must use application/json.",
      fields: { contentType: "JSON_REQUIRED" },
      correlation: false,
    });
  }
  try {
    await c.req.json();
  } catch {
    return err(400, "VALIDATION_FAILED", {
      message: "Cancellation request body must be valid JSON.",
      fields: { body: "JSON_INVALID" },
      correlation: false,
    });
  }

  const session = await resolveSession(meta, db, c.req.raw, ws.id, Date.parse(nowIso));
  if (!session) {
    return err(401, "AUTH_REQUIRED", { message: "Sign in to cancel a booking." });
  }

  const row = await first<{
    id: string;
    event_session_id: string;
    quantity: number;
    status: string;
    session_start_at: string;
  }>(
    meta,
    db,
    `SELECT b.id, b.event_session_id, b.quantity, b.status,
            s.start_at AS session_start_at
       FROM bookings b
       JOIN event_sessions s ON s.id = b.event_session_id
      WHERE b.workspace_id = ?1 AND b.user_id = ?2 AND b.reference = ?3`,
    ws.id,
    session.userId,
    reference,
  );
  if (!row) {
    return err(404, "BOOKING_NOT_FOUND", { message: "Booking not found." });
  }
  if (row.status === "CANCELLED") {
    return err(409, "BOOKING_ALREADY_CANCELLED", { message: "This booking is already cancelled." });
  }
  if (!canCancelBooking(row.status, row.session_start_at, nowIso)) {
    return err(409, "BOOKING_CANCELLATION_CLOSED", {
      message: "This booking can no longer be cancelled.",
    });
  }

  // The operation token makes the two-statement batch single-use. A duplicate
  // request can never match the token created by a different cancellation,
  // so it cannot release capacity a second time (BKG-006/007).
  const cancellationId = crypto.randomUUID();
  let results: { changes: number }[];
  try {
    results = await d1BatchDb(db, meta).batch([
      {
        sql: `UPDATE bookings
                 SET status = 'CANCELLED', cancelled_at = ?1, cancellation_id = ?2
               WHERE id = ?3 AND workspace_id = ?4 AND user_id = ?5
                 AND status = 'CONFIRMED'
                 AND EXISTS (
                   SELECT 1 FROM event_sessions
                    WHERE id = ?6 AND workspace_id = ?4 AND start_at > ?1
                      AND confirmed_quantity >= ?7
                 )`,
        params: [nowIso, cancellationId, row.id, ws.id, session.userId, row.event_session_id, row.quantity],
      },
      {
        sql: `UPDATE event_sessions
                 SET confirmed_quantity = confirmed_quantity - ?1
               WHERE id = ?2 AND workspace_id = ?3 AND confirmed_quantity >= ?1
                 AND EXISTS (
                   SELECT 1 FROM bookings
                    WHERE id = ?4 AND workspace_id = ?3 AND user_id = ?5
                      AND event_session_id = ?2 AND status = 'CANCELLED'
                      AND cancellation_id = ?6
                 )`,
        params: [row.quantity, row.event_session_id, ws.id, row.id, session.userId, cancellationId],
      },
    ]);
  } catch {
    return err(503, "SERVICE_UNAVAILABLE", {
      message: "Cancellation unsettled; refresh the booking and retry.",
    });
  }

  if (results[0]?.changes !== 1) {
    const latest = await first<{ status: string; session_start_at: string }>(
      meta,
      db,
      `SELECT b.status, s.start_at AS session_start_at
         FROM bookings b
         JOIN event_sessions s ON s.id = b.event_session_id
        WHERE b.workspace_id = ?1 AND b.user_id = ?2 AND b.reference = ?3`,
      ws.id,
      session.userId,
      reference,
    );
    if (!latest) {
      return err(404, "BOOKING_NOT_FOUND", { message: "Booking not found." });
    }
    if (latest.status === "CANCELLED") {
      return err(409, "BOOKING_ALREADY_CANCELLED", { message: "This booking is already cancelled." });
    }
    if (!canCancelBooking(latest.status, latest.session_start_at, nowIso)) {
      return err(409, "BOOKING_CANCELLATION_CLOSED", {
        message: "This booking can no longer be cancelled.",
      });
    }
    return err(409, "BOOKING_CANCELLATION_CONFLICT", {
      message: "Booking state changed; refresh and retry.",
    });
  }
  if (results[1]?.changes !== 1) {
    return err(503, "SERVICE_UNAVAILABLE", {
      message: "Cancellation state is unsettled; refresh the booking.",
    });
  }

  await touchActivity(meta, db, ws.id, nowIso, !scenarioEnabled(c.env, "wsp-activity-frozen"));
  return c.json({
    data: {
      reference,
      bookingStatus: "CANCELLED",
      cancelledAt: nowIso,
      releasedQuantity: row.quantity,
    },
    meta,
  });
});
