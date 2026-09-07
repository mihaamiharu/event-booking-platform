import { useEffect, useState } from "react";
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
  return (
    <>
      <h1>{event.name}</h1>
      <p className="muted">
        {event.venue.name} · {event.venue.city}
      </p>
      <p>{event.description}</p>
      <h2>Schedule (WIB)</h2>
      <ul>
        {event.sessions.map((s) => (
          <li key={s.id}>
            {formatWibRange(s.startAt, s.endAt)} · {s.remainingCapacity} left ·{" "}
            {s.bookable ? <span className="badge">Bookable</span> : <span className="badge">{s.reason}</span>}
          </li>
        ))}
      </ul>
      <h2>Tickets</h2>
      <dl className="detail">
        {event.ticketTypes.map((t) => (
          <div key={t.id}>
            <dt>{t.name}</dt>
            <dd className="price">{formatIdr(t.priceIdr)}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
