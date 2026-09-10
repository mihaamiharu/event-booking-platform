import { useEffect, useState } from "react";
import { Link } from "../router.tsx";
import { ApiError, api, errorReference, getAttendee } from "../lib/api.ts";
import { formatIdr, formatWibRange } from "../lib/format.ts";
import { StatusBadge } from "../components/StatusBadge.tsx";

interface Venue {
  id: string;
  name: string;
  city: string;
}

interface OrganizerSession {
  id: string;
  status: string;
  startAt: string;
  endAt: string;
  capacity: number;
  confirmedQuantity: number;
  remainingCapacity: number;
}

interface OrganizerTicket {
  id: string;
  sessionIndex: number;
  name: string;
  priceIdr: number;
}

interface OrganizerEvent {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: string;
  venue: Venue;
  salesOpenAt: string;
  salesCloseAt: string;
  sessions: OrganizerSession[];
  ticketTypes: OrganizerTicket[];
}

interface OrganizerForm {
  id?: string;
  name: string;
  description: string;
  venueId: string;
  salesOpenAt: string;
  salesCloseAt: string;
  sessions: Array<{ id?: string; startAt: string; endAt: string; capacity: number }>;
  ticketTypes: Array<{ id?: string; sessionIndex: number; name: string; priceIdr: number }>;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; venues: Venue[]; events: OrganizerEvent[] }
  | { kind: "signin" }
  | { kind: "forbidden" }
  | { kind: "error"; code: string; retry: () => void };

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toInputDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromInputDate(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function newForm(venueId: string): OrganizerForm {
  const start = new Date(Date.now() + 14 * 86_400_000);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 3 * 3_600_000);
  const close = new Date(start.getTime() - 86_400_000);
  return {
    name: "",
    description: "",
    venueId,
    salesOpenAt: toInputDate(new Date().toISOString()),
    salesCloseAt: toInputDate(close.toISOString()),
    sessions: [{ startAt: toInputDate(start.toISOString()), endAt: toInputDate(end.toISOString()), capacity: 20 }],
    ticketTypes: [{ sessionIndex: 0, name: "General", priceIdr: 100000 }],
  };
}

function formFromEvent(event: OrganizerEvent): OrganizerForm {
  return {
    id: event.id,
    name: event.name,
    description: event.description,
    venueId: event.venue.id,
    salesOpenAt: toInputDate(event.salesOpenAt),
    salesCloseAt: toInputDate(event.salesCloseAt),
    sessions: event.sessions.map((s) => ({ id: s.id, startAt: toInputDate(s.startAt), endAt: toInputDate(s.endAt), capacity: s.capacity })),
    ticketTypes: event.ticketTypes.map((t) => ({ id: t.id, sessionIndex: t.sessionIndex, name: t.name, priceIdr: t.priceIdr })),
  };
}

function statusTone(status: string): "bookable" | "cancelled" | "neutral" {
  return status === "PUBLISHED" ? "bookable" : status === "CANCELLED" ? "cancelled" : "neutral";
}

export function Organizer() {
  const attendee = getAttendee();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [form, setForm] = useState<OrganizerForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setState({ kind: "loading" });
    try {
      const res = await api<{ venues: Venue[]; events: OrganizerEvent[] }>("/api/organizer");
      setState({ kind: "ready", venues: res.venues, events: res.events });
    } catch (err) {
      if (err instanceof ApiError && err.code === "AUTH_REQUIRED") setState({ kind: "signin" });
      else if (err instanceof ApiError && err.code === "ORGANIZER_FORBIDDEN") setState({ kind: "forbidden" });
      else setState({ kind: "error", code: errorReference(err), retry: load });
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (!attendee) {
    return <AccessState kind="signin" />;
  }
  if (state.kind === "loading") {
    return <><div className="page-heading compact-heading"><p className="eyebrow">Organizer workspace</p><h1>Loading events</h1></div><div className="skeleton-card skeleton-detail" aria-busy="true" aria-label="Loading organizer events" /></>;
  }
  if (state.kind === "signin" || state.kind === "forbidden") return <AccessState kind={state.kind} />;
  if (state.kind === "error") {
    return <div className="state-card error" role="alert"><p className="eyebrow">Organizer workspace</p><h1>Could not load events</h1><p>Reference: {state.code}</p><button className="button button-secondary" type="button" onClick={state.retry}>Retry</button></div>;
  }

  const selectEvent = (event: OrganizerEvent) => {
    setForm(formFromEvent(event));
    setNotice(null);
    setError(null);
  };
  const startNew = () => {
    setForm(newForm(state.venues[0]?.id ?? ""));
    setNotice(null);
    setError(null);
  };
  const updateForm = (patch: Partial<OrganizerForm>) => setForm((current) => current ? { ...current, ...patch } : current);

  const save = async (publish: boolean) => {
    if (!form || saving) return;
    const salesOpenAt = fromInputDate(form.salesOpenAt);
    const salesCloseAt = fromInputDate(form.salesCloseAt);
    const sessions = form.sessions.map((s) => ({ ...s, startAt: fromInputDate(s.startAt), endAt: fromInputDate(s.endAt) }));
    if (!salesOpenAt || !salesCloseAt || sessions.some((s) => !s.startAt || !s.endAt)) {
      setError("Enter valid date and time values before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const body = { ...form, publish, salesOpenAt, salesCloseAt, sessions };
      const res = form.id
        ? await api<{ event: OrganizerEvent }>(`/api/organizer/events/${encodeURIComponent(form.id)}`, { method: "PUT", body: JSON.stringify(body) })
        : await api<{ event: OrganizerEvent }>("/api/organizer/events", { method: "POST", body: JSON.stringify(body) });
      setForm(formFromEvent(res.event));
      setNotice(`${publish ? "Published" : "Draft saved"}: ${res.event.name}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? `${errorReference(err)}: ${err.message}` : "UNEXPECTED_ERROR");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="page-heading organizer-heading" aria-labelledby="organizer-heading">
        <div><p className="eyebrow">R2 organizer lifecycle</p><h1 id="organizer-heading">Shape the room, then sell the place.</h1><p className="lede">Create drafts, choose a workspace venue, set session capacity, and price the ticket types attendees will see.</p></div>
        <button className="button button-primary" type="button" onClick={startNew}>New event</button>
      </section>

      {notice && <div className="confirmation-panel compact-panel" role="status"><p>{notice}</p></div>}
      {error && <div className="state-card error organizer-error" role="alert"><p>{error}</p></div>}

      <div className="organizer-layout">
        <section className="surface organizer-list" aria-labelledby="organizer-events-heading">
          <div className="section-heading"><div><p className="eyebrow">Workspace inventory</p><h2 id="organizer-events-heading">Your events</h2></div><span className="muted">{state.events.length} total</span></div>
          <div className="organizer-event-list">
            {state.events.map((event) => (
              <button key={event.id} className={`organizer-event-row ${form?.id === event.id ? "is-selected" : ""}`} type="button" onClick={() => selectEvent(event)}>
                <span className="organizer-event-copy"><strong>{event.name}</strong><span>{event.venue.name} · {event.sessions.length} session{event.sessions.length === 1 ? "" : "s"}</span></span>
                <StatusBadge tone={statusTone(event.status)}>{event.status}</StatusBadge>
              </button>
            ))}
          </div>
        </section>

        <section className="surface organizer-editor" aria-labelledby="organizer-editor-heading">
          {form ? <>
            <div className="section-heading"><div><p className="eyebrow">Event editor</p><h2 id="organizer-editor-heading">{form.id ? "Edit event" : "New draft"}</h2></div><span className="muted">All prices in IDR</span></div>
            <form onSubmit={(e) => { e.preventDefault(); void save(false); }}>
              <div className="field"><label htmlFor="organizer-name">Event name</label><input id="organizer-name" value={form.name} required maxLength={120} onChange={(e) => updateForm({ name: e.target.value })} /></div>
              <div className="field"><label htmlFor="organizer-description">Description</label><textarea id="organizer-description" rows={3} maxLength={2000} value={form.description} onChange={(e) => updateForm({ description: e.target.value })} /></div>
              <div className="field"><label htmlFor="organizer-venue">Room / venue</label><select id="organizer-venue" value={form.venueId} onChange={(e) => updateForm({ venueId: e.target.value })}>{state.venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name} · {venue.city}</option>)}</select></div>
              <div className="form-grid">
                <div className="field"><label htmlFor="organizer-sales-open">Sales open</label><input id="organizer-sales-open" type="datetime-local" value={form.salesOpenAt} onChange={(e) => updateForm({ salesOpenAt: e.target.value })} /></div>
                <div className="field"><label htmlFor="organizer-sales-close">Sales close</label><input id="organizer-sales-close" type="datetime-local" value={form.salesCloseAt} onChange={(e) => updateForm({ salesCloseAt: e.target.value })} /></div>
              </div>

              <fieldset className="organizer-fieldset"><legend>Sessions and room capacity</legend><p className="form-note">Each session has its own room limit. Confirmed bookings already consume that limit.</p>
                {form.sessions.map((session, index) => <div className="organizer-repeat-row" key={session.id ?? `session-${index}`}>
                  <div className="form-grid"><div className="field"><label htmlFor={`session-start-${index}`}>Start</label><input id={`session-start-${index}`} type="datetime-local" value={session.startAt} onChange={(e) => { const sessions = [...form.sessions]; sessions[index] = { ...session, startAt: e.target.value }; updateForm({ sessions }); }} /></div><div className="field"><label htmlFor={`session-end-${index}`}>End</label><input id={`session-end-${index}`} type="datetime-local" value={session.endAt} onChange={(e) => { const sessions = [...form.sessions]; sessions[index] = { ...session, endAt: e.target.value }; updateForm({ sessions }); }} /></div><div className="field"><label htmlFor={`session-capacity-${index}`}>Room capacity</label><input id={`session-capacity-${index}`} type="number" min={1} max={100000} value={session.capacity} onChange={(e) => { const sessions = [...form.sessions]; sessions[index] = { ...session, capacity: Number(e.target.value) }; updateForm({ sessions }); }} /></div></div>
                  {form.sessions.length > 1 && <button className="button button-secondary button-small" type="button" onClick={() => updateForm({ sessions: form.sessions.filter((_, i) => i !== index), ticketTypes: form.ticketTypes.filter((ticket) => ticket.sessionIndex !== index).map((ticket) => ({ ...ticket, sessionIndex: ticket.sessionIndex > index ? ticket.sessionIndex - 1 : ticket.sessionIndex })) })}>Remove session</button>}
                </div>)}
                <button className="button button-secondary button-small" type="button" onClick={() => updateForm({ sessions: [...form.sessions, { startAt: form.sessions.at(-1)?.startAt ?? "", endAt: form.sessions.at(-1)?.endAt ?? "", capacity: 20 }] })}>Add session</button>
              </fieldset>

              <fieldset className="organizer-fieldset"><legend>Ticket types</legend><p className="form-note">Ticket types share the selected session&apos;s room capacity.</p>
                {form.ticketTypes.map((ticket, index) => <div className="organizer-repeat-row" key={ticket.id ?? `ticket-${index}`}><div className="form-grid"><div className="field"><label htmlFor={`ticket-name-${index}`}>Ticket name</label><input id={`ticket-name-${index}`} value={ticket.name} onChange={(e) => { const tickets = [...form.ticketTypes]; tickets[index] = { ...ticket, name: e.target.value }; updateForm({ ticketTypes: tickets }); }} /></div><div className="field"><label htmlFor={`ticket-price-${index}`}>Price (IDR)</label><input id={`ticket-price-${index}`} type="number" min={0} max={100000000} value={ticket.priceIdr} onChange={(e) => { const tickets = [...form.ticketTypes]; tickets[index] = { ...ticket, priceIdr: Number(e.target.value) }; updateForm({ ticketTypes: tickets }); }} /></div><div className="field"><label htmlFor={`ticket-session-${index}`}>Session</label><select id={`ticket-session-${index}`} value={ticket.sessionIndex} onChange={(e) => { const tickets = [...form.ticketTypes]; tickets[index] = { ...ticket, sessionIndex: Number(e.target.value) }; updateForm({ ticketTypes: tickets }); }}>{form.sessions.map((_, sessionIndex) => <option key={sessionIndex} value={sessionIndex}>Session {sessionIndex + 1}</option>)}</select></div></div>{form.ticketTypes.length > 1 && <button className="button button-secondary button-small" type="button" onClick={() => updateForm({ ticketTypes: form.ticketTypes.filter((_, i) => i !== index) })}>Remove ticket</button>}</div>)}
                <button className="button button-secondary button-small" type="button" onClick={() => updateForm({ ticketTypes: [...form.ticketTypes, { sessionIndex: 0, name: "", priceIdr: 0 }] })}>Add ticket type</button>
              </fieldset>

              <div className="organizer-actions"><button className="button button-secondary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save draft"}</button><button className="button button-primary" type="button" disabled={saving} onClick={() => void save(true)}>{saving ? "Saving…" : "Publish event"}</button></div>
            </form>
          </> : <div className="state-card empty organizer-empty"><p className="eyebrow">Ready to configure</p><h2>Select an event or start a new draft.</h2><p>Set the room capacity and ticket price before you publish.</p><button className="button button-primary" type="button" onClick={startNew}>Create a draft</button></div>}
        </section>
      </div>
    </>
  );
}

function AccessState({ kind }: { kind: "signin" | "forbidden" }) {
  return <><div className="page-heading compact-heading"><p className="eyebrow">Organizer workspace</p><h1>{kind === "signin" ? "Sign in to manage events" : "Organizer access required"}</h1><p className="lede">This surface changes rooms, capacities, schedules, and ticket prices.</p></div><div className="state-card empty"><p>{kind === "signin" ? "Use the seeded organizer account to continue." : "Your current account is an attendee and cannot change event inventory."}</p><Link className="button button-primary" to="/sign-in?next=/organizer">Sign in as organizer</Link></div></>;
}
