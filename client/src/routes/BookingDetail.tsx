import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.ts";
import { formatIdr, formatWibRange } from "../lib/format.ts";

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
        if (e instanceof ApiError && e.code === "BOOKING_NOT_FOUND") {
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
  }, [reference]);

  if (state.kind === "loading") {
    return (
      <>
        <h1>Booking</h1>
        <div className="skeleton" aria-busy="true">
          <div aria-hidden="true">Loading booking…</div>
        </div>
      </>
    );
  }
  if (state.kind === "not-found") {
    return (
      <>
        <h1>Booking not found</h1>
        <div className="empty">
          <p>This booking does not exist or belongs to another attendee.</p>
        </div>
      </>
    );
  }
  if (state.kind === "error") {
    return (
      <>
        <h1>Booking</h1>
        <div className="error" role="alert">
          <p>Could not load this booking ({state.code}).</p>
          <button type="button" onClick={state.retry}>
            Retry
          </button>
        </div>
      </>
    );
  }

  const b = state.booking;
  return (
    <>
      <h1>{state.fresh ? "Booking confirmed" : `Booking ${b.reference}`}</h1>
      {state.fresh && (
        <div className="empty" role="status">
          <p>
            Booking <strong>{b.reference}</strong> is confirmed for {b.quantity} × {b.eventName}.
          </p>
        </div>
      )}
      <dl className="detail">
        <div>
          <dt>Reference</dt>
          <dd>
            {b.reference}{" "}
            <button type="button" onClick={() => void navigator.clipboard?.writeText(b.reference)} aria-label="Copy booking reference">
              Copy
            </button>
          </dd>
        </div>
        <div>
          <dt>Event</dt>
          <dd>{b.eventName}</dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd>{formatWibRange(b.sessionStartAt, b.sessionEndAt)}</dd>
        </div>
        <div>
          <dt>Ticket</dt>
          <dd>{b.ticketName}</dd>
        </div>
        <div>
          <dt>Quantity</dt>
          <dd>{b.quantity}</dd>
        </div>
        <div>
          <dt>Unit price</dt>
          <dd className="price">{formatIdr(b.unitPriceIdr)}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd className="price">{formatIdr(b.totalIdr)}</dd>
        </div>
        <div>
          <dt>Payment</dt>
          <dd>{b.paymentStatus}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{b.bookingStatus}</dd>
        </div>
      </dl>
    </>
  );
}
