import { useEffect, useState } from "react";
import { Link } from "../router.tsx";
import { ApiError, api, errorReference, getAttendee } from "../lib/api.ts";
import { formatIdr, formatWibDate } from "../lib/format.ts";
import { StatusBadge } from "../components/StatusBadge.tsx";

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
          setState({ kind: "error", code: errorReference(e), retry: load });
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
      <div className="page-heading compact-heading">
        <p className="eyebrow">Your attendee record</p>
        <h1>My bookings</h1>
        <p className="lede">Your confirmed places, ready whenever you need the details.</p>
      </div>
      {state.kind === "loading" && (
        <div className="skeleton-grid" aria-busy="true">
          <div className="skeleton-card" aria-hidden="true" />
        </div>
      )}
      {state.kind === "signin" && (
        <div className="state-card empty">
          <p className="eyebrow">Attendee access</p>
          <h2>Sign in to view your bookings.</h2>
          <p>Your bookings are private to your attendee account and workspace.</p>
          <Link className="button button-primary" to="/sign-in?next=%2Fbookings">
            Sign in
          </Link>
        </div>
      )}
      {state.kind === "empty" && (
        <div className="state-card empty">
          <p className="eyebrow">No reservations yet</p>
          <h2>No bookings yet.</h2>
          <p>When you reserve a place, the confirmation will stay here.</p>
          <Link className="button button-primary" to="/events">
            Browse events
          </Link>
        </div>
      )}
      {state.kind === "error" && (
        <div className="state-card error" role="alert">
          <p className="eyebrow">Could not load bookings</p>
          <h2>Something interrupted your booking list.</h2>
          <p>Reference: {state.code}</p>
          <button className="button button-secondary" type="button" onClick={state.retry}>
            Retry
          </button>
        </div>
      )}
      {state.kind === "ready" && (
        <section className="content-section" aria-labelledby="confirmed-bookings-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Confirmed reservations</p>
              <h2 id="confirmed-bookings-heading">Your places</h2>
            </div>
            <span className="muted">Newest first</span>
          </div>
          <ul className="cards booking-grid">
            {state.items.map((booking) => (
              <li key={booking.reference}>
                <article className="card booking-card" aria-labelledby={`booking-${booking.reference}`}>
                  <div className="card-topline">
                    <span className="eyebrow">Booking reference</span>
                    <StatusBadge tone={booking.bookingStatus === "CONFIRMED" ? "confirmed" : "neutral"}>
                      {booking.bookingStatus}
                    </StatusBadge>
                  </div>
                  <h2 id={`booking-${booking.reference}`}>{booking.reference}</h2>
                  <p className="booking-event">{booking.eventName}</p>
                  <p className="booking-session">Session · {formatWibDate(booking.sessionStartAt)}</p>
                  <div className="booking-card-footer">
                    <span>{booking.quantity} {booking.quantity === 1 ? "ticket" : "tickets"}</span>
                    <strong className="price">{formatIdr(booking.totalIdr)}</strong>
                  </div>
                  <Link className="button button-secondary button-small" to={`/bookings/${encodeURIComponent(booking.reference)}`}>
                    View booking
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
