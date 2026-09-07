import { useEffect, useState } from "react";
import { Link } from "../router.tsx";
import { ApiError, api } from "../lib/api.ts";
import { formatIdr } from "../lib/format.ts";

interface CatalogItem {
  slug: string;
  name: string;
  venue: { name: string; city: string };
  dateRange: { startAt: string; endAt: string };
  startingPriceIdr: number;
  currency: string;
  availabilityStatus: "AVAILABLE" | "SOLD_OUT";
}

interface CatalogResponse {
  data: CatalogItem[];
  pagination: { page: number; perPage: number; total: number };
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; items: CatalogItem[] }
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
        setState({ kind: "error", code: e instanceof ApiError ? e.code : "UNEXPECTED_ERROR", retry: load });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <h1>Events</h1>
      {state.kind === "loading" && (
        <div className="skeleton" aria-busy="true">
          <div aria-hidden="true">Loading events…</div>
          <div aria-hidden="true">Loading events…</div>
        </div>
      )}
      {state.kind === "empty" && (
        <div className="empty">
          <p>No published events right now.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      )}
      {state.kind === "error" && (
        <div className="error" role="alert">
          <p>Could not load events ({state.code}).</p>
          <button type="button" onClick={state.retry}>
            Retry
          </button>
        </div>
      )}
      {state.kind === "ready" && (
        <ul className="cards">
          {state.items.map((e) => (
            <li key={e.slug}>
              <article className="card" aria-labelledby={`event-${e.slug}`}>
                <h2 id={`event-${e.slug}`}>{e.name}</h2>
                <p className="muted">
                  {e.venue.name} · {e.venue.city}
                </p>
                <p className="price">
                  From {formatIdr(e.startingPriceIdr)} ·{" "}
                  <span className="badge">{e.availabilityStatus === "AVAILABLE" ? "Available" : "Sold out"}</span>
                </p>
                <Link to={`/events/${e.slug}`}>View details</Link>
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
