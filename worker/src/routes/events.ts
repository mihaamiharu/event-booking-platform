// Event read endpoints (EVT-001, EVT-002, NFR-009; API-CONTRACT §3.3).
// Row budgets asserted by tests from `meta` (usage-model §3).
import { Hono } from "hono";
import type { AppContext } from "../app.ts";
import { all, first, newMeta } from "../db.ts";
import { err } from "../errors.ts";
import { touchActivity } from "./workspaces.ts";

export const events = new Hono<AppContext>();

interface CatalogRow {
  slug: string;
  name: string;
  venue_name: string;
  city: string;
  session_id: string;
  start_at: string;
  end_at: string;
  capacity: number;
  confirmed_quantity: number;
  starting_price: number;
}

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

events.get("/", async (c) => {
  const meta = newMeta();
  const db = c.env.DB;
  const ws = c.get("workspace");
  const nowIso = new Date().toISOString();

  const paging = parsePaging(new URL(c.req.url));
  if (paging instanceof Response) return paging;
  const { page, perPage } = paging;

  const totalRow = await first<{ n: number }>(
    meta,
    db,
    `SELECT COUNT(*) AS n FROM events e
     WHERE e.workspace_id = ?1 AND e.status = 'PUBLISHED'
       AND EXISTS (SELECT 1 FROM event_sessions s
         WHERE s.workspace_id = ?1 AND s.event_id = e.id
           AND s.status = 'SCHEDULED' AND s.start_at > ?2)`,
    ws.id,
    nowIso,
  );
  const total = totalRow?.n ?? 0;

  const rows = await all<CatalogRow>(
    meta,
    db,
    `SELECT e.slug, e.name, v.name AS venue_name, v.city,
            s.id AS session_id, s.start_at, s.end_at,
            s.capacity, s.confirmed_quantity,
            (SELECT MIN(t.price_idr) FROM ticket_types t
              WHERE t.workspace_id = e.workspace_id AND t.event_id = e.id) AS starting_price
       FROM events e
       JOIN venues v ON v.id = e.venue_id
       JOIN event_sessions s ON s.event_id = e.id
      WHERE e.workspace_id = ?1 AND s.workspace_id = ?1 AND e.status = 'PUBLISHED'
        AND s.status = 'SCHEDULED' AND s.start_at > ?2
      ORDER BY s.start_at
      LIMIT ?3 OFFSET ?4`,
    ws.id,
    nowIso,
    perPage,
    (page - 1) * perPage,
  );

  // One row per session; fold to one card per event (earliest session first).
  const bySlug = new Map<string, { item: Record<string, unknown>; earliest: string; available: boolean }>();
  for (const r of rows) {
    const remaining = r.capacity - r.confirmed_quantity;
    const entry = bySlug.get(r.slug);
    if (!entry) {
      bySlug.set(r.slug, {
        item: {
          slug: r.slug,
          name: r.name,
          venue: { name: r.venue_name, city: r.city },
          dateRange: { startAt: r.start_at, endAt: r.end_at },
          startingPriceIdr: r.starting_price,
          currency: "IDR",
          availabilityStatus: remaining > 0 ? "AVAILABLE" : "SOLD_OUT",
        },
        earliest: r.start_at,
        available: remaining > 0,
      });
    } else if (remaining > 0) {
      entry.available = true;
      (entry.item as Record<string, unknown>).availabilityStatus = "AVAILABLE";
    }
  }

  await touchActivity(meta, db, ws.id, new Date().toISOString());
  return c.json({
    data: [...bySlug.values()].map((e) => e.item),
    pagination: { page, perPage, total },
    meta,
  });
});

interface DetailSession {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  capacity: number;
  confirmed_quantity: number;
}

interface DetailTicket {
  id: string;
  name: string;
  price_idr: number;
  event_session_id: string;
}

events.get("/:slug", async (c) => {
  const meta = newMeta();
  const db = c.env.DB;
  const ws = c.get("workspace");
  const nowIso = new Date().toISOString();
  const slug = c.req.param("slug");

  const event = await first<{
    id: string;
    slug: string;
    name: string;
    description: string;
    status: string;
    sales_open_at: string;
    sales_close_at: string;
    venue_name: string;
    city: string;
  }>(
    meta,
    db,
    `SELECT e.id, e.slug, e.name, e.description, e.status,
            e.sales_open_at, e.sales_close_at,
            v.name AS venue_name, v.city
       FROM events e JOIN venues v ON v.id = e.venue_id
      WHERE e.workspace_id = ?1 AND e.slug = ?2`,
    ws.id,
    slug,
  );
  if (!event || event.status !== "PUBLISHED") {
    return err(404, "EVENT_NOT_FOUND", { message: "Event not found." });
  }

  const sessions = await all<DetailSession>(
    meta,
    db,
    `SELECT id, start_at, end_at, status, capacity, confirmed_quantity
       FROM event_sessions WHERE workspace_id = ?1 AND event_id = ?2
       ORDER BY start_at`,
    ws.id,
    event.id,
  );
  const future = sessions.filter((s) => s.status === "SCHEDULED" && s.start_at > nowIso);
  if (future.length === 0) {
    return err(404, "EVENT_NOT_FOUND", { message: "Event not found." });
  }

  const tickets = await all<DetailTicket>(
    meta,
    db,
    `SELECT id, name, price_idr, event_session_id FROM ticket_types
      WHERE workspace_id = ?1 AND event_id = ?2`,
    ws.id,
    event.id,
  );

  const salesOpen = event.sales_open_at <= nowIso && nowIso < event.sales_close_at;
  const sessionViews = sessions.map((s) => {
    const remaining = s.capacity - s.confirmed_quantity;
    let bookable = true;
    let reason: string | undefined;
    if (s.status === "COMPLETED" || s.start_at <= nowIso) {
      bookable = false;
      reason = "SESSION_COMPLETED";
    } else if (s.status !== "SCHEDULED") {
      bookable = false;
      reason = "SESSION_NOT_BOOKABLE";
    } else if (!salesOpen) {
      bookable = false;
      reason = "SALES_CLOSED";
    } else if (remaining <= 0) {
      bookable = false;
      reason = "SOLD_OUT";
    }
    return {
      id: s.id,
      startAt: s.start_at,
      endAt: s.end_at,
      status: s.status,
      remainingCapacity: Math.max(0, remaining),
      bookable,
      ...(reason ? { reason } : {}),
    };
  });

  await touchActivity(meta, db, ws.id, new Date().toISOString());
  return c.json({
    data: {
      slug: event.slug,
      name: event.name,
      description: event.description,
      venue: { name: event.venue_name, city: event.city },
      sessions: sessionViews,
      ticketTypes: tickets.map((t) => ({
        id: t.id,
        name: t.name,
        priceIdr: t.price_idr,
        eventSessionId: t.event_session_id,
      })),
      currency: "IDR",
    },
    meta,
  });
});
