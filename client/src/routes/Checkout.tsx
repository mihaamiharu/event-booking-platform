import { useEffect, useState } from "react";
import { Link, navigate } from "../router.tsx";
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
}

type State =
  | { kind: "loading" }
  | { kind: "signin" }
  | { kind: "form"; event: Detail }
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
        <div className="page-heading compact-heading">
          <p className="eyebrow">Reservation</p>
          <h1>Loading checkout</h1>
        </div>
        <div className="skeleton-card skeleton-detail" aria-busy="true" aria-label="Loading checkout" />
      </>
    );
  }
  if (state.kind === "signin") {
    const next = encodeURIComponent(`/checkout?${params.toString()}`);
    return (
      <>
        <div className="page-heading compact-heading">
          <p className="eyebrow">Reservation</p>
          <h1>Sign in to complete your booking</h1>
          <p className="lede">Your event selection is saved while you sign in.</p>
        </div>
        <div className="state-card empty">
          <p>Sign in to continue to the simulated payment step.</p>
          <Link className="button button-primary" to={`/sign-in?next=${next}`}>
            Sign in
          </Link>
        </div>
      </>
    );
  }
  if (state.kind === "error" && !state.event) {
    return (
      <>
        <div className="page-heading compact-heading">
          <p className="eyebrow">Reservation</p>
          <h1>Could not load checkout</h1>
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

  const event = (state.kind === "form" ? state.event : state.event)!;
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
      navigate(`/bookings/${encodeURIComponent(res.booking.reference)}?fresh=1`);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "UNEXPECTED_ERROR";
      if (code === "AUTH_REQUIRED") {
        setState({ kind: "signin" });
      } else if (
        code === "CAPACITY_INSUFFICIENT" ||
        code === "SESSION_NOT_BOOKABLE" ||
        code === "IDEMPOTENCY_CONFLICT"
      ) {
        try {
          const res = await api<{ data: Detail }>(`/api/events/${encodeURIComponent(event.slug)}`);
          setState({ kind: "error", code, event: res.data, retry: () => setState({ kind: "form", event: res.data }) });
        } catch {
          setState({ kind: "error", code, event, retry: () => setState({ kind: "form", event }) });
        }
      } else {
        setState({ kind: "error", code, event, retry: () => setState({ kind: "form", event }) });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const errState = state.kind === "error" ? state : null;
  return (
    <>
      <div className="page-heading compact-heading">
        <p className="eyebrow">Reservation</p>
        <h1>Checkout</h1>
        <p className="lede">Review your place before completing the simulated payment.</p>
      </div>
      <div className="checkout-layout">
        <section className="surface checkout-form-card" aria-labelledby="checkout-form-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Your selection</p>
              <h2 id="checkout-form-heading">{event.name}</h2>
            </div>
            <span className="muted">Signed in as {attendee?.displayName}</span>
          </div>
          {errState && (
            <div className="error form-error" role="alert" tabIndex={-1} ref={(el) => el?.focus()}>
              <p>
                {errState.code === "PAYMENT_DECLINED" &&
                  "Payment declined (PAYMENT_DECLINED). Your selection is preserved — try again with a new attempt."}
                {errState.code === "CAPACITY_INSUFFICIENT" &&
                  "Not enough places remain (CAPACITY_INSUFFICIENT). Availability below is refreshed."}
                {errState.code === "IDEMPOTENCY_CONFLICT" &&
                  "This attempt was already used with different input (IDEMPOTENCY_CONFLICT). Start a new attempt."}
                {!['PAYMENT_DECLINED', 'CAPACITY_INSUFFICIENT', 'IDEMPOTENCY_CONFLICT'].includes(errState.code) &&
                  `Could not complete checkout (${errState.code}).`}
              </p>
              <button className="button button-secondary button-small" type="button" onClick={errState.retry}>
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
                {event.sessions.map((session) => (
                  <option key={session.id} value={session.id} disabled={!session.bookable}>
                    {formatWibRange(session.startAt, session.endAt)} · {session.remainingCapacity} left
                    {session.bookable ? "" : ` (${session.reason})`}
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
                {sessionTickets.map((ticket) => (
                  <option key={ticket.id} value={ticket.id}>
                    {ticket.name} — {formatIdr(ticket.priceIdr)}
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
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
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
              <p id="checkout-code-help" className="form-note">
                Demo simulation only — no real payment. Server prices rule; client totals are ignored.
              </p>
            </div>
            <button className="button button-primary button-wide checkout-submit" type="submit" disabled={submitting || !activeSession?.bookable}>
              {submitting ? "Processing…" : `Pay ${formatIdr(total)}`}
            </button>
          </form>
        </section>
        <aside className="surface order-summary" aria-label="Order summary">
          <p className="eyebrow">Order summary</p>
          <h2>{event.name}</h2>
          <dl className="summary-list">
            <div>
              <dt>Session</dt>
              <dd>{activeSession ? formatWibRange(activeSession.startAt, activeSession.endAt) : "Unavailable"}</dd>
            </div>
            <div>
              <dt>Ticket</dt>
              <dd>{activeTicket?.name ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Quantity</dt>
              <dd>{quantity}</dd>
            </div>
          </dl>
          <div className="summary-total">
            <strong aria-live="polite" className="price">Total {formatIdr(total)}</strong>
          </div>
        </aside>
      </div>
    </>
  );
}
