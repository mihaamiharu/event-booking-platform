import { useEffect, useState } from "react";
import { ApiError, api, errorReference } from "../lib/api.ts";
import { Link } from "../router.tsx";
import { formatIdr, formatWibRange } from "../lib/format.ts";
import { StatusBadge } from "../components/StatusBadge.tsx";

// Booking detail + immediate confirmation (BKG-004, UF-006; UI-DESIGN §3.5).
// The success banner shows only when arriving with ?fresh=1 (set by checkout);
// the param is stripped on mount so revisits render the durable detail.
interface BookingDetailData {
  reference: string;
  eventSlug: string;
  eventName: string;
  eventSessionId: string;
  sessionStartAt: string;
  sessionEndAt: string;
  ticketTypeId: string;
  ticketName: string;
  quantity: number;
  unitPriceIdr: number;
  totalIdr: number;
  currency: string;
  paymentStatus: string;
  bookingStatus: string;
  createdAt: string;
}

type State =
  | { kind: "loading" }
  | { kind: "signin" }
  | { kind: "ready"; booking: BookingDetailData; fresh: boolean }
  | { kind: "not-found" }
  | { kind: "error"; code: string; retry: () => void };

export function BookingDetail({ reference }: { reference: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const fresh = params.get("fresh") === "1";
    if (fresh) {
      window.history.replaceState(null, "", `/bookings/${encodeURIComponent(reference)}`);
    }
    const load = async () => {
      setState({ kind: "loading" });
      try {
        const res = await api<{ data: BookingDetailData }>(
          `/api/bookings/${encodeURIComponent(reference)}`,
        );
        if (!cancelled) setState({ kind: "ready", booking: res.data, fresh });
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.code === "AUTH_REQUIRED") {
          setState({ kind: "signin" });
        } else if (e instanceof ApiError && e.code === "BOOKING_NOT_FOUND") {
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
  }, [reference]);

  if (state.kind === "loading") {
    return (
      <>
        <div className="page-heading compact-heading">
          <p className="eyebrow">Booking record</p>
          <h1>Loading booking</h1>
        </div>
        <div className="skeleton-card skeleton-detail" aria-busy="true" aria-label="Loading booking" />
      </>
    );
  }
  if (state.kind === "signin") {
    const next = encodeURIComponent(`/bookings/${encodeURIComponent(reference)}`);
    return (
      <>
        <div className="page-heading compact-heading">
          <p className="eyebrow">Private booking record</p>
          <h1>Sign in to view this booking</h1>
          <p className="lede">Your confirmation belongs to the attendee account that made the reservation.</p>
        </div>
        <div className="state-card empty">
          <p>Sign in to continue. We will return you to this booking afterwards.</p>
          <Link className="button button-primary" to={`/sign-in?next=${next}`}>
            Sign in
          </Link>
        </div>
      </>
    );
  }
  if (state.kind === "not-found") {
    return (
      <>
        <div className="page-heading compact-heading">
          <p className="eyebrow">Booking record</p>
          <h1>Booking not found</h1>
          <p className="lede">The booking does not exist or belongs to another attendee.</p>
        </div>
        <div className="state-card empty">
          <p>Check the reference or browse your confirmed bookings.</p>
          <Link className="button button-secondary" to="/bookings">
            Back to my bookings
          </Link>
        </div>
      </>
    );
  }
  if (state.kind === "error") {
    return (
      <>
        <div className="page-heading compact-heading">
          <p className="eyebrow">Booking record</p>
          <h1>Could not load booking</h1>
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

  const booking = state.booking;
  return (
    <>
      <div className="page-heading compact-heading">
        <p className="eyebrow">{state.fresh ? "Reservation complete" : "Booking record"}</p>
        <h1>{state.fresh ? "Booking confirmed" : `Booking ${booking.reference}`}</h1>
        <p className="lede">Keep this reference handy when you arrive.</p>
      </div>
      {state.fresh && (
        <div className="confirmation-panel" role="status">
          <div>
            <p className="eyebrow">You are all set</p>
            <p>
              Booking <strong>{booking.reference}</strong> is confirmed for {booking.quantity} × {booking.eventName}.
            </p>
          </div>
          <Link className="button button-secondary button-small" to="/bookings">
            View my bookings
          </Link>
        </div>
      )}
      <section className="surface booking-detail-card" aria-label="Booking details">
        <div className="booking-detail-header">
          <div>
            <p className="eyebrow">{booking.eventName}</p>
            <h2>{booking.ticketName}</h2>
          </div>
          <StatusBadge tone={booking.bookingStatus === "CONFIRMED" ? "confirmed" : "neutral"}>
            {booking.bookingStatus}
          </StatusBadge>
        </div>
        <dl className="detail">
          <div className="detail-item">
            <dt>Reference</dt>
            <dd>
              <span>{booking.reference}</span>
              <button
                className="button button-secondary button-small"
                type="button"
                onClick={() => void navigator.clipboard?.writeText(booking.reference)}
                aria-label="Copy booking reference"
              >
                Copy
              </button>
            </dd>
          </div>
          <div className="detail-item">
            <dt>Event</dt>
            <dd>{booking.eventName}</dd>
          </div>
          <div className="detail-item">
            <dt>Session</dt>
            <dd>{formatWibRange(booking.sessionStartAt, booking.sessionEndAt)}</dd>
          </div>
          <div className="detail-item">
            <dt>Ticket</dt>
            <dd>{booking.ticketName}</dd>
          </div>
          <div className="detail-item">
            <dt>Quantity</dt>
            <dd>{booking.quantity}</dd>
          </div>
          <div className="detail-item">
            <dt>Unit price</dt>
            <dd className="price">{formatIdr(booking.unitPriceIdr)}</dd>
          </div>
          <div className="detail-item detail-item-total">
            <dt>Total</dt>
            <dd className="price">{formatIdr(booking.totalIdr)}</dd>
          </div>
          <div className="detail-item">
            <dt>Payment</dt>
            <dd><StatusBadge tone={booking.paymentStatus === "PAID" ? "paid" : "neutral"}>{booking.paymentStatus}</StatusBadge></dd>
          </div>
        </dl>
      </section>
    </>
  );
}
