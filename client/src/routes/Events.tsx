import { useEffect, useState } from "react";
import { ApiError, api, errorReference } from "../lib/api.ts";
import { EventCard, type CatalogEvent } from "../components/EventCard.tsx";

interface CatalogResponse {
  data: CatalogEvent[];
  pagination: { page: number; perPage: number; total: number };
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; items: CatalogEvent[] }
  | { kind: "empty" }
  | { kind: "error"; code: string; retry: () => void };

export function Events() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState({ kind: "loading" });
      try {
        const res = await api<CatalogResponse>("/api/events");
        if (cancelled) return;
        setState(res.data.length === 0 ? { kind: "empty" } : { kind: "ready", items: res.data });
      } catch (e) {
        if (cancelled) return;
        setState({ kind: "error", code: errorReference(e), retry: load });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = state.kind === "ready" ? state.items : [];

  return (
    <>
      <section className="page-heading events-heading" aria-labelledby="events-heading">
        <div>
          <p className="eyebrow">R1 attendee booking</p>
          <h1 id="events-heading">Find your next event</h1>
          <p className="lede">
            Explore upcoming sessions, compare availability, and keep the booking details that matter.
          </p>
        </div>
        {state.kind === "ready" && (
          <div className="heading-stat" aria-label={`${items.length} published events`}>
            <strong>{items.length}</strong>
            <span>published events</span>
          </div>
        )}
      </section>

      {state.kind === "loading" && (
        <div className="skeleton-grid" aria-busy="true">
          <div className="skeleton-card" aria-hidden="true" />
          <div className="skeleton-card" aria-hidden="true" />
        </div>
      )}
      {state.kind === "empty" && (
        <div className="state-card empty">
          <p className="eyebrow">Nothing scheduled</p>
          <h2>No published events right now.</h2>
          <p>Check again soon for the next session.</p>
          <button className="button button-secondary" type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      )}
      {state.kind === "error" && (
        <div className="state-card error" role="alert">
          <p className="eyebrow">Could not load events</p>
          <h2>Something interrupted the event list.</h2>
          <p>Reference: {state.code}</p>
          <button className="button button-secondary" type="button" onClick={state.retry}>
            Retry
          </button>
        </div>
      )}
      {state.kind === "ready" && (
        <section className="content-section" aria-labelledby="upcoming-events-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Open for booking</p>
              <h2 id="upcoming-events-heading">Upcoming events</h2>
            </div>
            <span className="muted">Availability changes as bookings are confirmed.</span>
          </div>
          <ul className="cards event-grid">
            {state.items.map((event) => (
              <li key={event.slug}>
                <EventCard event={event} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
