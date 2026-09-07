import { useEffect, useState } from "react";
import { Link } from "../router.tsx";
import { ApiError, api, getAttendee } from "../lib/api.ts";
import { formatIdr, formatWibRange } from "../lib/format.ts";

// Checkout route (BKG-001/002/003, PAY-001; UF-004/005; UI-DESIGN §3.4, §3.5).
// Selection arrives as ?event=&session=&ticket= from event detail; quantity
// and simulation code are chosen here. One idempotency key per attempt
// (regenerated after decline/conflict so retry = new attempt). Server totals
// rule; the client total is display-only.
interface DetailSession {
  id: string;
  startAt: string;
  endAt: string;
  remainingCapacity: number;
  bookable: boolean;
  reason?: string;
}

interface DetailTicket {
  id: string;
  name: string;
  priceIdr: number;
  eventSessionId: string;
}

interface Detail {
  slug: string;
  name: string;
  sessions: DetailSession[];
  ticketTypes: DetailTicket[];
  currency: string;
}

interface Booking {
  reference: string;
  eventSlug: string;
  eventSessionId: string;
  ticketTypeId: string;
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
  | { kind: "form"; event: Detail }
  | { kind: "confirmed"; event: Detail; booking: Booking }
  | { kind: "error"; code: string; event?: Detail; retry: () => void };

export function Checkout() {
  const attendee = getAttendee();
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const [sessionId, setSessionId] = useState(params.get("session") ?? "");
  const [ticketId, setTicketId] = useState(params.get("ticket") ?? "");
  const [quantity, setQuantity] = useState(2);
  const [paymentCode, setPaymentCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!getAttendee()) {
        setState({ kind: "signin" });
        return;
      }
      const slug = params.get("event") ?? "";
      setState({ kind: "loading" });
      try {
        const res = await api<{ data: Detail }>(`/api/events/${encodeURIComponent(slug)}`);
        if (cancelled) return;
        setState({ kind: "form", event: res.data });
      } catch (e) {
        if (cancelled) return;
        const code = e instanceof ApiError ? e.code : "UNEXPECTED_ERROR";
        setState({ kind: "error", code, retry: load });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [params]);

  if (state.kind === "loading") {
    return (
      <>
        <h1>Checkout</h1>
        <div className="skeleton" aria-busy="true">
          <div aria-hidden="true">Loading checkout…</div>
        </div>
      </>
    );
  }
  if (state.kind === "signin") {
    const next = encodeURIComponent(`/checkout?${params.toString()}`);
    return (
      <>
        <h1>Checkout</h1>
        <div className="empty">
          <p>Sign in to complete your booking.</p>
          <Link to={`/sign-in?next=${next}`}>Sign in</Link>
        </div>
      </>
    );
  }
  if (state.kind === "error" && !state.event) {
    return (
      <>
        <h1>Checkout</h1>
        <div className="error" role="alert">
          <p>Could not load checkout ({state.code}).</p>
          <button type="button" onClick={state.retry}>
            Retry
          </button>
        </div>
      </>
    );
  }

  const event = (state.kind === "form" || state.kind === "confirmed" ? state.event : state.event)!;
  const sessions = event.sessions.filter((s) => s.bookable);
  const activeSession = event.sessions.find((s) => s.id === sessionId) ?? sessions[0];
  const sessionTickets = event.ticketTypes.filter((t) => t.eventSessionId === activeSession?.id);
  const activeTicket = sessionTickets.find((t) => t.id === ticketId) ?? sessionTickets[0];
  const total = (activeTicket?.priceIdr ?? 0) * quantity;

  const submit = async () => {
    if (submitting || !activeSession || !activeTicket) return;
    setSubmitting(true);
    try {
      const res = await api<{ booking: Booking }>("/api/checkout", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          eventSlug: event.slug,
          eventSessionId: activeSession.id,
          ticketTypeId: activeTicket.id,
          quantity,
          paymentCode,
        }),
      });
      setState({ kind: "confirmed", event, booking: res.booking });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "UNEXPECTED_ERROR";
      if (code === "AUTH_REQUIRED") {
        setState({ kind: "signin" });
      } else if (
        code === "CAPACITY_INSUFFICIENT" ||
        code === "SESSION_NOT_BOOKABLE" ||
        code === "IDEMPOTENCY_CONFLICT"
      ) {
        // Refresh availability so the panel shows current remaining capacity.
        try {
          const res = await api<{ data: Detail }>(`/api/events/${encodeURIComponent(event.slug)}`);
          setState({ kind: "error", code, event: res.data, retry: () => setState({ kind: "form", event: res.data }) });
        } catch {
          setState({ kind: "error", code, event, retry: () => setState({ kind: "form", event }) });
        }
      } else {
        // Decline and validation keep the selection for a new attempt.
        setState({ kind: "error", code, event, retry: () => setState({ kind: "form", event }) });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (state.kind === "confirmed") {
    const b = state.booking;
    return (
      <>
        <h1>Booking confirmed</h1>
        <div className="empty" role="status">
          <p>
            Booking <strong>{b.reference}</strong> is confirmed for {b.quantity} × {event.name}.
          </p>
        </div>
        <dl className="detail">
          <div>
            <dt>Reference</dt>
            <dd>{b.reference}</dd>
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

  const errState = state.kind === "error" ? state : null;
  return (
    <>
      <h1>Checkout</h1>
      <p className="muted">{event.name}</p>
      {errState && (
        <div className="error" role="alert" tabIndex={-1} ref={(el) => el?.focus()}>
          <p>
            {errState.code === "PAYMENT_DECLINED" &&
              "Payment declined (PAYMENT_DECLINED). Your selection is preserved — try again with a new attempt."}
            {errState.code === "CAPACITY_INSUFFICIENT" &&
              "Not enough places remain (CAPACITY_INSUFFICIENT). Availability below is refreshed."}
            {errState.code === "IDEMPOTENCY_CONFLICT" &&
              "This attempt was already used with different input (IDEMPOTENCY_CONFLICT). Start a new attempt."}
            {!["PAYMENT_DECLINED", "CAPACITY_INSUFFICIENT", "IDEMPOTENCY_CONFLICT"].includes(errState.code) &&
              `Could not complete checkout (${errState.code}).`}
          </p>
          <button type="button" onClick={errState.retry}>
            {errState.code === "PAYMENT_DECLINED" ? "Try again" : "Back to selection"}
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="field">
          <label htmlFor="checkout-session">Session</label>
          <select
            id="checkout-session"
            value={activeSession?.id ?? ""}
            onChange={(e) => {
              setSessionId(e.target.value);
              setTicketId("");
            }}
          >
            {event.sessions.map((s) => (
              <option key={s.id} value={s.id} disabled={!s.bookable}>
                {formatWibRange(s.startAt, s.endAt)} · {s.remainingCapacity} left
                {s.bookable ? "" : ` (${s.reason})`}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="checkout-ticket">Ticket</label>
          <select
            id="checkout-ticket"
            value={activeTicket?.id ?? ""}
            onChange={(e) => setTicketId(e.target.value)}
          >
            {sessionTickets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {formatIdr(t.priceIdr)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="checkout-quantity">Quantity (1–5)</label>
          <select
            id="checkout-quantity"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </div>
        <p aria-live="polite" className="price">
          Total {formatIdr(total)}
        </p>
        <div className="field">
          <label htmlFor="checkout-code">Simulation code</label>
          <input
            id="checkout-code"
            name="paymentCode"
            type="text"
            autoComplete="off"
            placeholder="SIMULATE-SUCCESS or SIMULATE-DECLINE"
            aria-describedby="checkout-code-help"
            value={paymentCode}
            onChange={(e) => setPaymentCode(e.target.value)}
          />
          <p id="checkout-code-help" className="muted">
            Demo simulation only — no real payment. Server prices rule; client totals are ignored.
          </p>
        </div>
        <button type="submit" disabled={submitting || !activeSession?.bookable}>
          {submitting ? "Processing…" : `Pay ${formatIdr(total)}`}
        </button>
      </form>
      <p className="muted">Signed in as {attendee?.displayName}.</p>
    </>
  );
}
