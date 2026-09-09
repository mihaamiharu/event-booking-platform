// Organizer lifecycle endpoints (ORG-001/ORG-002/ORG-003, NFR-011).
// The route intentionally keeps one workspace-scoped organizer surface: a
// nested event write updates the event, its sessions, and its ticket types in
// one D1 batch so a draft cannot be partially persisted.
import { Hono, type Context } from "hono";
import type { AppContext } from "../app.ts";
import { d1BatchDb, all, first, newMeta, type D1Meta } from "../db.ts";
import { err } from "../errors.ts";
import { resolveSession } from "../session.ts";
import { touchActivity } from "./workspaces.ts";

const MAX_NAME = 120;
const MAX_DESCRIPTION = 2_000;
const MAX_SESSIONS = 12;
const MAX_TICKETS = 40;

interface OrganizerContext {
  displayName: string;
}

interface DraftSession {
  id?: string;
  startAt: string;
  endAt: string;
  capacity: number;
}

interface DraftTicket {
  id?: string;
  sessionIndex: number;
  name: string;
  priceIdr: number;
}

export interface OrganizerDraft {
  name: string;
  description: string;
  venueId: string;
  salesOpenAt: string;
  salesCloseAt: string;
  sessions: DraftSession[];
  ticketTypes: DraftTicket[];
  publish: boolean;
}

interface ExistingSession {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  capacity: number;
  confirmed_quantity: number;
}

interface ExistingTicket {
  id: string;
  event_session_id: string;
  name: string;
  price_idr: number;
}

interface EventRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: string;
  venue_id: string;
  venue_name: string;
  city: string;
  sales_open_at: string;
  sales_close_at: string;
}

function organizerError(status: 401 | 403) {
  return status === 401
    ? err(401, "AUTH_REQUIRED", { message: "Sign in to manage events." })
    : err(403, "ORGANIZER_FORBIDDEN", { message: "Organizer access is required." });
}

async function requireOrganizer(c: Context<AppContext>, meta: D1Meta): Promise<OrganizerContext | Response> {
  const ws = c.get("workspace");
  const session = await resolveSession(meta, c.env.DB, c.req.raw, ws.id, Date.now());
  if (!session) return organizerError(401);
  const user = await first<{ display_name: string; role: string }>(
    meta,
    c.env.DB,
    "SELECT display_name, role FROM users WHERE workspace_id = ?1 AND id = ?2",
    ws.id,
    session.userId,
  );
  if (!user || user.role !== "ORGANIZER") return organizerError(403);
  return { displayName: user.display_name };
}

function textField(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result.length > 0 && result.length <= max ? result : null;
}

function isoField(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function optionalId(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(value)) return null;
  return value;
}

/** Pure request normalization used by API tests and the organizer route. */
export function parseOrganizerDraft(body: unknown): { draft: OrganizerDraft } | { code: string; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { code: "VALIDATION_FAILED", message: "Event body must be an object." };
  }
  const b = body as Record<string, unknown>;
  const name = textField(b.name, MAX_NAME);
  const description = typeof b.description === "string" ? b.description.trim() : "";
  const venueId = textField(b.venueId, 128);
  const salesOpenAt = isoField(b.salesOpenAt);
  const salesCloseAt = isoField(b.salesCloseAt);
  if (!name) return { code: "EVENT_NAME_INVALID", message: "Event name is required." };
  if (description.length > MAX_DESCRIPTION) return { code: "EVENT_DESCRIPTION_INVALID", message: "Event description is too long." };
  if (!venueId) return { code: "VENUE_REQUIRED", message: "Choose a venue or room." };
  if (!salesOpenAt || !salesCloseAt || salesOpenAt >= salesCloseAt) {
    return { code: "SALES_WINDOW_INVALID", message: "Sales opening and closing times are invalid." };
  }
  if (!Array.isArray(b.sessions) || b.sessions.length === 0 || b.sessions.length > MAX_SESSIONS) {
    return { code: "SESSION_REQUIRED", message: "Add at least one session." };
  }
  if (!Array.isArray(b.ticketTypes) || b.ticketTypes.length > MAX_TICKETS) {
    return { code: "TICKET_LIST_INVALID", message: "Ticket configuration is invalid." };
  }

  const sessions: DraftSession[] = [];
  for (const raw of b.sessions) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { code: "SESSION_INVALID", message: "Each session needs a time and room capacity." };
    }
    const s = raw as Record<string, unknown>;
    const id = optionalId(s.id);
    const startAt = isoField(s.startAt);
    const endAt = isoField(s.endAt);
    const capacity = s.capacity;
    if (id === null || !startAt || !endAt || startAt >= endAt || !Number.isInteger(capacity) || (capacity as number) < 1 || (capacity as number) > 100_000) {
      return { code: "SESSION_INVALID", message: "Each session needs a valid time and positive capacity." };
    }
    sessions.push({ id, startAt, endAt, capacity: capacity as number });
  }

  const sorted = [...sessions].sort((a, b) => a.startAt.localeCompare(b.startAt));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.startAt < sorted[i - 1]!.endAt) {
      return { code: "SESSION_OVERLAP", message: "Sessions cannot overlap." };
    }
  }

  const ticketTypes: DraftTicket[] = [];
  for (const raw of b.ticketTypes) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { code: "TICKET_INVALID", message: "Each ticket needs a name, price, and session." };
    }
    const t = raw as Record<string, unknown>;
    const id = optionalId(t.id);
    const ticketName = textField(t.name, 100);
    const sessionIndex = t.sessionIndex;
    const priceIdr = t.priceIdr;
    if (id === null || !ticketName || !Number.isInteger(sessionIndex) || (sessionIndex as number) < 0 || (sessionIndex as number) >= sessions.length || !Number.isInteger(priceIdr) || (priceIdr as number) < 0 || (priceIdr as number) > 100_000_000) {
      return { code: "TICKET_INVALID", message: "Each ticket needs a valid name, price, and session." };
    }
    ticketTypes.push({ id, sessionIndex: sessionIndex as number, name: ticketName, priceIdr: priceIdr as number });
  }

  return {
    draft: {
      name,
      description,
      venueId,
      salesOpenAt,
      salesCloseAt,
      sessions,
      ticketTypes,
      publish: b.publish === true,
    },
  };
}

function slugBase(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "organizer-event";
}

async function uniqueSlug(meta: D1Meta, db: AppContext["Bindings"]["DB"], workspaceId: string, name: string): Promise<string> {
  const base = slugBase(name);
  const existing = await all<{ slug: string }>(
    meta,
    db,
    "SELECT slug FROM events WHERE workspace_id = ?1 AND slug LIKE ?2",
    workspaceId,
    `${base}%`,
  );
  if (!existing.some((row) => row.slug === base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`;
    if (!existing.some((row) => row.slug === candidate)) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

function publicationError(draft: OrganizerDraft, venueExists: boolean, existingSessions: ExistingSession[], nowIso: string): { code: string; message: string } | null {
  if (!venueExists) return { code: "VENUE_INVALID", message: "Choose a venue from this workspace." };
  if (draft.salesCloseAt <= nowIso) return { code: "PUBLICATION_INVALID", message: "Sales must close after the current time." };
  if (draft.sessions.some((s) => {
    const existing = s.id ? existingSessions.find((row) => row.id === s.id) : undefined;
    return s.startAt <= nowIso || existing?.status === "COMPLETED" || existing?.status === "CANCELLED";
  })) {
    return { code: "PUBLICATION_INVALID", message: "Published sessions must be scheduled in the future." };
  }
  if (draft.ticketTypes.length === 0) return { code: "TICKET_REQUIRED", message: "Add at least one ticket before publishing." };
  return null;
}

function respondValidation(_c: Context<AppContext>, result: { code: string; message: string }): Response {
  const status = result.code === "PUBLICATION_INVALID" || result.code === "SESSION_OVERLAP" ? 409 : 400;
  return err(status as 400 | 409, result.code, { message: result.message });
}

async function getEventView(meta: D1Meta, db: AppContext["Bindings"]["DB"], workspaceId: string, eventId: string): Promise<Record<string, unknown> | null> {
  const event = await first<EventRow>(
    meta,
    db,
    `SELECT e.id, e.slug, e.name, e.description, e.status, e.venue_id,
            v.name AS venue_name, v.city, e.sales_open_at, e.sales_close_at
       FROM events e JOIN venues v ON v.id = e.venue_id
      WHERE e.workspace_id = ?1 AND e.id = ?2`,
    workspaceId,
    eventId,
  );
  if (!event) return null;
  const sessions = await all<ExistingSession>(
    meta,
    db,
    "SELECT id, status, start_at, end_at, capacity, confirmed_quantity FROM event_sessions WHERE workspace_id = ?1 AND event_id = ?2 ORDER BY start_at, id",
    workspaceId,
    eventId,
  );
  const tickets = await all<ExistingTicket>(
    meta,
    db,
    "SELECT id, event_session_id, name, price_idr FROM ticket_types WHERE workspace_id = ?1 AND event_id = ?2 ORDER BY id",
    workspaceId,
    eventId,
  );
  const sessionIndex = new Map(sessions.map((s, index) => [s.id, index]));
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    description: event.description,
    status: event.status,
    venue: { id: event.venue_id, name: event.venue_name, city: event.city },
    salesOpenAt: event.sales_open_at,
    salesCloseAt: event.sales_close_at,
    sessions: sessions.map((s) => ({
      id: s.id,
      status: s.status,
      startAt: s.start_at,
      endAt: s.end_at,
      capacity: s.capacity,
      confirmedQuantity: s.confirmed_quantity,
      remainingCapacity: Math.max(0, s.capacity - s.confirmed_quantity),
    })),
    ticketTypes: tickets.map((t) => ({
      id: t.id,
      sessionIndex: sessionIndex.get(t.event_session_id) ?? 0,
      name: t.name,
      priceIdr: t.price_idr,
    })),
  };
}

export const organizer = new Hono<AppContext>();

organizer.get("/", async (c) => {
  const meta = newMeta();
  const access = await requireOrganizer(c, meta);
  if (access instanceof Response) return access;
  const ws = c.get("workspace");
  const venues = await all<{ id: string; name: string; city: string }>(
    meta,
    c.env.DB,
    "SELECT id, name, city FROM venues WHERE workspace_id = ?1 ORDER BY name",
    ws.id,
  );
  const events = await all<{ id: string }>(meta, c.env.DB, "SELECT id FROM events WHERE workspace_id = ?1 ORDER BY name", ws.id);
  const data: Record<string, unknown>[] = [];
  for (const event of events) {
    const view = await getEventView(meta, c.env.DB, ws.id, event.id);
    if (view) data.push(view);
  }
  await touchActivity(meta, c.env.DB, ws.id, new Date().toISOString());
  return c.json({ organizer: { displayName: access.displayName }, venues, events: data, meta });
});

async function parseBody(c: Context<AppContext>): Promise<{ draft: OrganizerDraft } | Response> {
  if (!c.req.header("content-type")?.includes("application/json")) {
    return err(400, "VALIDATION_FAILED", { message: "Request body must be JSON." });
  }
  try {
    const parsed = parseOrganizerDraft(await c.req.json());
    return "draft" in parsed ? parsed : respondValidation(c, parsed);
  } catch {
    return err(400, "VALIDATION_FAILED", { message: "Request body must be JSON." });
  }
}

organizer.post("/events", async (c) => {
  const meta = newMeta();
  const access = await requireOrganizer(c, meta);
  if (access instanceof Response) return access;
  const parsed = await parseBody(c);
  if (parsed instanceof Response) return parsed;
  const { draft } = parsed;
  const ws = c.get("workspace");
  const nowIso = new Date().toISOString();
  const venue = await first<{ id: string }>(meta, c.env.DB, "SELECT id FROM venues WHERE workspace_id = ?1 AND id = ?2", ws.id, draft.venueId);
  const pub = draft.publish ? publicationError(draft, Boolean(venue), [], nowIso) : null;
  if (pub) return respondValidation(c, pub);
  if (!venue) return respondValidation(c, { code: "VENUE_INVALID", message: "Choose a venue from this workspace." });

  const eventId = crypto.randomUUID();
  const sessionIds = draft.sessions.map(() => crypto.randomUUID());
  const ticketIds = draft.ticketTypes.map(() => crypto.randomUUID());
  const slug = await uniqueSlug(meta, c.env.DB, ws.id, draft.name);
  const statements = [
    {
      sql: "INSERT INTO events (id, workspace_id, venue_id, slug, name, description, status, sales_open_at, sales_close_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
      params: [eventId, ws.id, draft.venueId, slug, draft.name, draft.description, draft.publish ? "PUBLISHED" : "DRAFT", draft.salesOpenAt, draft.salesCloseAt],
    },
    ...draft.sessions.map((s, index) => ({
      sql: "INSERT INTO event_sessions (id, workspace_id, event_id, status, start_at, end_at, capacity, confirmed_quantity) VALUES (?1, ?2, ?3, 'SCHEDULED', ?4, ?5, ?6, 0)",
      params: [sessionIds[index]!, ws.id, eventId, s.startAt, s.endAt, s.capacity],
    })),
    ...draft.ticketTypes.map((t, index) => ({
      sql: "INSERT INTO ticket_types (id, workspace_id, event_id, event_session_id, name, price_idr) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      params: [ticketIds[index]!, ws.id, eventId, sessionIds[t.sessionIndex]!, t.name, t.priceIdr],
    })),
  ];
  try {
    await d1BatchDb(c.env.DB, meta).batch(statements);
  } catch {
    return err(503, "SERVICE_UNAVAILABLE", { message: "Event could not be saved; retry later." });
  }
  const event = await getEventView(meta, c.env.DB, ws.id, eventId);
  await touchActivity(meta, c.env.DB, ws.id, nowIso);
  return c.json({ event, meta }, 201);
});

organizer.put("/events/:id", async (c) => {
  const meta = newMeta();
  const access = await requireOrganizer(c, meta);
  if (access instanceof Response) return access;
  const parsed = await parseBody(c);
  if (parsed instanceof Response) return parsed;
  const { draft } = parsed;
  const ws = c.get("workspace");
  const eventId = c.req.param("id");
  const existingEvent = await first<{ id: string; slug: string }>(meta, c.env.DB, "SELECT id, slug FROM events WHERE workspace_id = ?1 AND id = ?2", ws.id, eventId);
  if (!existingEvent) return err(404, "EVENT_NOT_FOUND", { message: "Event not found." });
  const venue = await first<{ id: string }>(meta, c.env.DB, "SELECT id FROM venues WHERE workspace_id = ?1 AND id = ?2", ws.id, draft.venueId);
  const existingSessions = await all<ExistingSession>(meta, c.env.DB, "SELECT id, status, start_at, end_at, capacity, confirmed_quantity FROM event_sessions WHERE workspace_id = ?1 AND event_id = ?2 ORDER BY start_at, id", ws.id, eventId);
  const existingTickets = await all<ExistingTicket>(meta, c.env.DB, "SELECT id, event_session_id, name, price_idr FROM ticket_types WHERE workspace_id = ?1 AND event_id = ?2", ws.id, eventId);
  const existingSessionIds = new Set(existingSessions.map((s) => s.id));
  const existingTicketIds = new Set(existingTickets.map((t) => t.id));
  if (draft.sessions.some((s) => s.id !== undefined && !existingSessionIds.has(s.id))) return err(400, "SESSION_INVALID", { message: "Session does not belong to this event." });
  if (draft.ticketTypes.some((t) => t.id !== undefined && !existingTicketIds.has(t.id))) return err(400, "TICKET_INVALID", { message: "Ticket does not belong to this event." });

  const sessionIds = draft.sessions.map((s) => s.id ?? crypto.randomUUID());
  const retainedSessions = new Set(sessionIds);
  const removedSessions = existingSessions.filter((s) => !retainedSessions.has(s.id));
  if (removedSessions.some((s) => s.confirmed_quantity > 0)) return err(409, "CAPACITY_IN_USE", { message: "A session with confirmed bookings cannot be removed." });
  for (const session of removedSessions) {
    const booking = await first<{ n: number }>(meta, c.env.DB, "SELECT COUNT(*) AS n FROM bookings WHERE workspace_id = ?1 AND event_session_id = ?2", ws.id, session.id);
    if ((booking?.n ?? 0) > 0) return err(409, "SESSION_IN_USE", { message: "A session with booking history cannot be removed." });
  }
  const ticketIds = draft.ticketTypes.map((t) => t.id ?? crypto.randomUUID());
  const retainedTickets = new Set(ticketIds);
  const removedTickets = existingTickets.filter((t) => !retainedTickets.has(t.id));
  for (const ticket of removedTickets) {
    const booking = await first<{ n: number }>(meta, c.env.DB, "SELECT COUNT(*) AS n FROM booking_items WHERE workspace_id = ?1 AND ticket_type_id = ?2", ws.id, ticket.id);
    if ((booking?.n ?? 0) > 0) return err(409, "TICKET_IN_USE", { message: "A ticket with booking history cannot be removed." });
  }
  const finalSessions: ExistingSession[] = draft.sessions.map((s, index) => {
    const old = existingSessions.find((row) => row.id === s.id);
    return { id: sessionIds[index]!, status: old?.status ?? "SCHEDULED", start_at: s.startAt, end_at: s.endAt, capacity: s.capacity, confirmed_quantity: old?.confirmed_quantity ?? 0 };
  });
  const pub = draft.publish ? publicationError(draft, Boolean(venue), finalSessions, new Date().toISOString()) : null;
  if (pub) return respondValidation(c, pub);
  if (!venue) return respondValidation(c, { code: "VENUE_INVALID", message: "Choose a venue from this workspace." });
  for (const session of finalSessions) {
    if (session.capacity < session.confirmed_quantity) return respondValidation(c, { code: "CAPACITY_INVALID", message: "Capacity cannot be below confirmed bookings." });
  }
  const statements = [
    { sql: "UPDATE events SET venue_id = ?1, name = ?2, description = ?3, status = ?4, sales_open_at = ?5, sales_close_at = ?6 WHERE workspace_id = ?7 AND id = ?8", params: [draft.venueId, draft.name, draft.description, draft.publish ? "PUBLISHED" : "DRAFT", draft.salesOpenAt, draft.salesCloseAt, ws.id, eventId] },
    ...removedTickets.map((t) => ({ sql: "DELETE FROM ticket_types WHERE workspace_id = ?1 AND id = ?2 AND event_id = ?3", params: [ws.id, t.id, eventId] })),
    ...removedSessions.map((s) => ({ sql: "DELETE FROM event_sessions WHERE workspace_id = ?1 AND id = ?2 AND event_id = ?3", params: [ws.id, s.id, eventId] })),
    ...draft.sessions.map((s, index) => s.id !== undefined
      ? { sql: "UPDATE event_sessions SET start_at = ?1, end_at = ?2, capacity = ?3 WHERE workspace_id = ?4 AND id = ?5 AND event_id = ?6", params: [s.startAt, s.endAt, s.capacity, ws.id, sessionIds[index]!, eventId] }
      : { sql: "INSERT INTO event_sessions (id, workspace_id, event_id, status, start_at, end_at, capacity, confirmed_quantity) VALUES (?1, ?2, ?3, 'SCHEDULED', ?4, ?5, ?6, 0)", params: [sessionIds[index]!, ws.id, eventId, s.startAt, s.endAt, s.capacity] }),
    ...draft.ticketTypes.map((t, index) => t.id !== undefined
      ? { sql: "UPDATE ticket_types SET event_session_id = ?1, name = ?2, price_idr = ?3 WHERE workspace_id = ?4 AND id = ?5 AND event_id = ?6", params: [sessionIds[t.sessionIndex]!, t.name, t.priceIdr, ws.id, ticketIds[index]!, eventId] }
      : { sql: "INSERT INTO ticket_types (id, workspace_id, event_id, event_session_id, name, price_idr) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params: [ticketIds[index]!, ws.id, eventId, sessionIds[t.sessionIndex]!, t.name, t.priceIdr] }),
  ];
  try {
    await d1BatchDb(c.env.DB, meta).batch(statements);
  } catch {
    return err(503, "SERVICE_UNAVAILABLE", { message: "Event could not be saved; retry later." });
  }
  const event = await getEventView(meta, c.env.DB, ws.id, eventId);
  await touchActivity(meta, c.env.DB, ws.id, new Date().toISOString());
  return c.json({ event, meta });
});
