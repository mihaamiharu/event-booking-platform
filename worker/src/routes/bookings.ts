// Booking reads (BKG-004, BKG-005; API-CONTRACT §3.5, AUTH-SECURITY T-01).
// Every query binds (workspace_id, user_id) from server-side context;
// missing vs. foreign references return the identical BOOKING_NOT_FOUND.
import { Hono } from "hono";
import type { AppContext } from "../app.ts";
import { all, first, newMeta } from "../db.ts";
import { err } from "../errors.ts";
import { resolveSession } from "../session.ts";
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

  await touchActivity(meta, db, ws.id, new Date(nowMs).toISOString());
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
  }>(
    meta,
    db,
    `SELECT b.reference, e.slug, e.name AS event_name, b.event_session_id,
            s.start_at AS session_start_at, s.end_at AS session_end_at,
            i.ticket_type_id, t.name AS ticket_name,
            b.quantity, i.unit_price_idr, b.total_idr, b.currency, b.created_at
       FROM bookings b
       JOIN events e ON e.id = b.event_id
       JOIN event_sessions s ON s.id = b.event_session_id
       JOIN booking_items i ON i.booking_id = b.id
       JOIN ticket_types t ON t.id = i.ticket_type_id
      WHERE b.workspace_id = ?1 AND b.user_id = ?2 AND b.reference = ?3`,
    ws.id,
    session.userId,
    reference,
  );
  if (!row) {
    return err(404, "BOOKING_NOT_FOUND", { message: "Booking not found." });
  }

  await touchActivity(meta, db, ws.id, new Date(nowMs).toISOString());
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
      bookingStatus: "CONFIRMED",
      createdAt: row.created_at,
    },
    meta,
  });
});
