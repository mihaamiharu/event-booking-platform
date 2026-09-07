import { useEffect, useState } from "react";
import { Link } from "../router.tsx";
import { ApiError, api, getAttendee } from "../lib/api.ts";
import { formatIdr } from "../lib/format.ts";

// Booking list (BKG-005, UF-006; UI-DESIGN §3.6). Newest first; explicit empty
// state; sign-in prompt when anonymous.
interface BookingItem {
  reference: string;
  eventName: string;
  sessionStartAt: string;
  quantity: number;
  totalIdr: number;
  currency: string;
  bookingStatus: string;
}

type State =
  | { kind: "loading" }
  | { kind: "signin" }
  | { kind: "ready"; items: BookingItem[] }
  | { kind: "empty" }
  | { kind: "error"; code: string; retry: () => void };

export function Bookings() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!getAttendee()) {
        setState({ kind: "signin" });
        return;
      }
      setState({ kind: "loading" });
      try {
        const res = await api<{ data: BookingItem[] }>("/api/bookings");
        if (cancelled) return;
        setState(res.data.length === 0 ? { kind: "empty" } : { kind: "ready", items: res.data });
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.code === "AUTH_REQUIRED") {
          setState({ kind: "signin" });
        } else {
          setState({ kind: "error", code: e instanceof ApiError ? e.code : "UNEXPECTED_ERROR", retry: load });
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <h1>My bookings</h1>
      {state.kind === "loading" && (
        <div className="skeleton" aria-busy="true">
          <div aria-hidden="true">Loading bookings…</div>
        </div>
      )}
      {state.kind === "signin" && (
        <div className="empty">
          <p>Sign in to view your bookings.</p>
          <Link to="/sign-in?next=%2Fbookings">Sign in</Link>
        </div>
      )}
      {state.kind === "empty" && (
        <div className="empty">
          <p>No bookings yet.</p>
          <Link to="/events">Browse events</Link>
        </div>
      )}
      {state.kind === "error" && (
        <div className="error" role="alert">
          <p>Could not load bookings ({state.code}).</p>
          <button type="button" onClick={state.retry}>
            Retry
          </button>
        </div>
      )}
      {state.kind === "ready" && (
        <ul className="cards">
          {state.items.map((b) => (
            <li key={b.reference}>
              <article className="card" aria-labelledby={`booking-${b.reference}`}>
                <h2 id={`booking-${b.reference}`}>{b.reference}</h2>
                <p className="muted">{b.eventName}</p>
                <p className="price">
                  {b.quantity} × {formatIdr(b.totalIdr)} · <span className="badge">{b.bookingStatus}</span>
                </p>
                <Link to={`/bookings/${encodeURIComponent(b.reference)}`}>View booking</Link>
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
