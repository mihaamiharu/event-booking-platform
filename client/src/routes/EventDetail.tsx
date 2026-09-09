import { useEffect, useState } from "react";
import { navigate } from "../router.tsx";
import { ApiError, api, errorReference } from "../lib/api.ts";
import { formatIdr, formatWibDateRange, formatWibRange } from "../lib/format.ts";
import { StatusBadge } from "../components/StatusBadge.tsx";

interface EventSession {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  remainingCapacity: number;
  bookable: boolean;
  reason?: string;
}

interface TicketType {
  id: string;
  name: string;
  priceIdr: number;
  eventSessionId: string;
}

interface EventDetailData {
  slug: string;
  name: string;
  description: string;
  venue: { name: string; city: string };
  sessions: EventSession[];
  ticketTypes: TicketType[];
  currency: string;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; event: EventDetailData }
  | { kind: "not-found" }
  | { kind: "error"; code: string; retry: () => void };

export function EventDetail({ slug }: { slug: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState({ kind: "loading" });
      try {
        const res = await api<{ data: EventDetailData }>(`/api/events/${encodeURIComponent(slug)}`);
        if (!cancelled) setState({ kind: "ready", event: res.data });
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.code === "EVENT_NOT_FOUND") {
          setState({ kind: "not-found" });
        } else {
          setState({ kind: "error", code: errorReference(e), retry: load });
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state.kind === "loading") {
    return (
      <>
        <div className="page-heading compact-heading">
          <p className="eyebrow">Event details</p>
          <h1>Loading event</h1>
        </div>
        <div className="skeleton-card skeleton-detail" aria-busy="true" aria-label="Loading event" />
      </>
    );
  }
  if (state.kind === "not-found") {
    return (
      <>
        <div className="page-heading compact-heading">
          <p className="eyebrow">Unavailable</p>
          <h1>Event not found</h1>
          <p className="lede">This event may be a draft, cancelled, or already past.</p>
        </div>
        <div className="state-card empty">
          <p>This event is not available for public booking.</p>
          <button className="button button-secondary" type="button" onClick={() => navigate("/events")}>
            Back to events
          </button>
        </div>
      </>
    );
  }
  if (state.kind === "error") {
    return (
      <>
        <div className="page-heading compact-heading">
          <p className="eyebrow">Event details</p>
          <h1>Could not load event</h1>
        </div>
        <div className="state-card error" role="alert">
          <p>Reference: {state.code}</p>
          <button className="button button-secondary" type="button" onClick={state.retry}>
            Retry
          </button>
        </div>
      </>
    );
  }

  return <SelectableDetail key={state.event.slug} event={state.event} />;
}

function SelectableDetail({ event }: { event: EventDetailData }) {
  const bookableSessions = event.sessions.filter((s) => s.bookable);
  const firstSession = bookableSessions[0] ?? event.sessions[0];
  const [sessionId, setSessionId] = useState<string>(firstSession?.id ?? "");
  const activeSession = event.sessions.find((s) => s.id === sessionId) ?? firstSession;
  const sessionTickets = event.ticketTypes.filter((t) => t.eventSessionId === activeSession?.id);
  const [ticketId, setTicketId] = useState<string>("");
  const activeTicket = sessionTickets.find((t) => t.id === ticketId) ?? sessionTickets[0];
  const soldOut = !activeSession?.bookable;

  return (
    <>
      <section className="page-heading detail-heading" aria-labelledby="event-heading">
        <div>
          <p className="eyebrow">Event details</p>
          <h1 id="event-heading">{event.name}</h1>
          <p className="lede">{event.description}</p>
        </div>
        <div className="detail-heading-meta">
          <span>{event.venue.name}</span>
          <span>{event.venue.city}</span>
          {activeSession && <span>{formatWibDateRange(activeSession.startAt, activeSession.endAt)}</span>}
        </div>
      </section>

      <div className="detail-layout">
        <div className="detail-content">
          <section className="surface detail-section" aria-labelledby="schedule-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Choose a time</p>
                <h2 id="schedule-heading">Schedule (WIB)</h2>
              </div>
              <span className="muted">All times in WIB</span>
            </div>
            <div className="radio-list" role="radiogroup" aria-labelledby="schedule-heading">
              {event.sessions.map((session) => (
                <label key={session.id} className={`choice-card ${!session.bookable ? "choice-card-disabled" : ""}`}>
                  <input
                    type="radio"
                    name="session"
                    value={session.id}
                    checked={activeSession?.id === session.id}
                    disabled={!session.bookable}
                    onChange={() => {
                      setSessionId(session.id);
                      setTicketId("");
                    }}
                  />
                  <span className="choice-copy">
                    <strong>{formatWibRange(session.startAt, session.endAt)}</strong>
                    <span>{session.remainingCapacity} places remaining</span>
                  </span>
                  <StatusBadge tone={session.bookable ? "bookable" : "unavailable"}>
                    {session.bookable ? "Bookable" : session.reason ?? "Unavailable"}
                  </StatusBadge>
                </label>
              ))}
            </div>
          </section>

          <section className="surface detail-section" aria-labelledby="tickets-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Pick your place</p>
                <h2 id="tickets-heading">Tickets</h2>
              </div>
              <span className="muted">Transparent IDR pricing</span>
            </div>
            <div className="radio-list" role="radiogroup" aria-labelledby="tickets-heading">
              {sessionTickets.map((ticket) => (
                <label key={ticket.id} className={`choice-card ${soldOut ? "choice-card-disabled" : ""}`}>
                  <input
                    type="radio"
                    name="ticket"
                    value={ticket.id}
                    checked={(activeTicket?.id ?? sessionTickets[0]?.id) === ticket.id}
                    disabled={soldOut}
                    onChange={() => setTicketId(ticket.id)}
                  />
                  <span className="choice-copy">
                    <strong>{ticket.name}</strong>
                    <span>One ticket for this session</span>
                  </span>
                  <span className="price">{formatIdr(ticket.priceIdr)}</span>
                </label>
              ))}
              {sessionTickets.length === 0 && <p className="muted">No ticket types are available for this session.</p>}
            </div>
          </section>
        </div>

        <aside className="surface booking-summary" aria-label="Booking summary">
          <p className="eyebrow">Ready when you are</p>
          <h2>{soldOut ? "This session is full" : "Reserve your place"}</h2>
          <p className="muted">
            {soldOut
              ? "You can review the event details, but this session cannot accept more bookings."
              : "Choose a ticket and continue to the secure demo checkout."}
          </p>
          <dl className="summary-list">
            <div>
              <dt>Session</dt>
              <dd>{activeSession ? formatWibRange(activeSession.startAt, activeSession.endAt) : "Unavailable"}</dd>
            </div>
            <div>
              <dt>Ticket</dt>
              <dd>{activeTicket ? `${activeTicket.name} · ${formatIdr(activeTicket.priceIdr)}` : "Unavailable"}</dd>
            </div>
          </dl>
          <button
            className="button button-primary button-wide"
            type="button"
            disabled={!activeSession?.bookable || !activeTicket}
            onClick={() => {
              const params = new URLSearchParams({
                event: event.slug,
                session: activeSession!.id,
                ticket: activeTicket!.id,
              });
              navigate(`/checkout?${params.toString()}`);
            }}
          >
            Continue to checkout
          </button>
          <p className="fine-print">No card details are requested. Payment is simulated for this demo.</p>
        </aside>
      </div>
    </>
  );
}
