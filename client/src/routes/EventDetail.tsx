import { useEffect, useState } from "react";
import { navigate } from "../router.tsx";
import { ApiError, api } from "../lib/api.ts";
import { formatIdr, formatWibRange } from "../lib/format.ts";

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

interface EventDetail {
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
  | { kind: "ready"; event: EventDetail }
  | { kind: "not-found" }
  | { kind: "error"; code: string; retry: () => void };

export function EventDetail({ slug }: { slug: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState({ kind: "loading" });
      try {
        const res = await api<{ data: EventDetail }>(`/api/events/${encodeURIComponent(slug)}`);
        if (!cancelled) setState({ kind: "ready", event: res.data });
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.code === "EVENT_NOT_FOUND") {
          setState({ kind: "not-found" });
        } else {
          setState({ kind: "error", code: e instanceof ApiError ? e.code : "UNEXPECTED_ERROR", retry: load });
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
        <h1>Event</h1>
        <div className="skeleton" aria-busy="true">
          <div aria-hidden="true">Loading event…</div>
        </div>
      </>
    );
  }
  if (state.kind === "not-found") {
    return (
      <>
        <h1>Event not found</h1>
        <div className="empty">
          <p>This event is unavailable. It may be a draft, cancelled, or past event.</p>
        </div>
      </>
    );
  }
  if (state.kind === "error") {
    return (
      <>
        <h1>Event</h1>
        <div className="error" role="alert">
          <p>Could not load this event ({state.code}).</p>
          <button type="button" onClick={state.retry}>
            Retry
          </button>
        </div>
      </>
    );
  }

  const { event } = state;
  // Keyed by slug so selection resets when navigating between events.
  return <SelectableDetail key={event.slug} event={event} />;
}

function SelectableDetail({ event }: { event: EventDetail }) {
  const bookableSessions = event.sessions.filter((s) => s.bookable);
  const [sessionId, setSessionId] = useState<string>(bookableSessions[0]?.id ?? "");
  const activeSession = event.sessions.find((s) => s.id === sessionId) ?? bookableSessions[0];
  const sessionTickets = event.ticketTypes.filter((t) => t.eventSessionId === activeSession?.id);
  const [ticketId, setTicketId] = useState<string>("");
  const activeTicket = sessionTickets.find((t) => t.id === ticketId) ?? sessionTickets[0];

  return (
    <>
      <h1>{event.name}</h1>
      <p className="muted">
        {event.venue.name} · {event.venue.city}
      </p>
      <p>{event.description}</p>
      <h2 id="schedule-heading">Schedule (WIB)</h2>
      <div role="radiogroup" aria-labelledby="schedule-heading">
        {event.sessions.map((s) => (
          <label key={s.id} className="radio">
            <input
              type="radio"
              name="session"
              value={s.id}
              checked={activeSession?.id === s.id}
              disabled={!s.bookable}
              onChange={() => {
                setSessionId(s.id);
                setTicketId("");
              }}
            />
            {formatWibRange(s.startAt, s.endAt)} · {s.remainingCapacity} left ·{" "}
            {s.bookable ? <span className="badge">Bookable</span> : <span className="badge">{s.reason}</span>}
          </label>
        ))}
      </div>
      <h2 id="tickets-heading">Tickets</h2>
      <div role="radiogroup" aria-labelledby="tickets-heading">
        {sessionTickets.map((t) => (
          <label key={t.id} className="radio">
            <input
              type="radio"
              name="ticket"
              value={t.id}
              checked={(activeTicket?.id ?? sessionTickets[0]?.id) === t.id}
              onChange={() => setTicketId(t.id)}
            />
            {t.name} — <span className="price">{formatIdr(t.priceIdr)}</span>
          </label>
        ))}
      </div>
      <p>
        <button
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
          Continue
        </button>
      </p>
    </>
  );
}

