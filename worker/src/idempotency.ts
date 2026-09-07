// Checkout idempotency + reference helpers (BKG-003, PAY-001, NFR-006).
// Canonical fingerprint covers {eventSlug, eventSessionId, ticketTypeId,
// quantity, paymentCode} as SHA-256 — the hash is stored, the raw simulation
// code never is. Pure functions: unit-tested without I/O.
import { sha256Hex } from "./session.ts";

export interface CheckoutInput {
  eventSlug: string;
  eventSessionId: string;
  ticketTypeId: string;
  quantity: number;
  paymentCode: string;
}

export async function checkoutFingerprint(input: CheckoutInput): Promise<string> {
  return sha256Hex(
    JSON.stringify({
      eventSlug: input.eventSlug,
      eventSessionId: input.eventSessionId,
      ticketTypeId: input.ticketTypeId,
      quantity: input.quantity,
      paymentCode: input.paymentCode,
    }),
  );
}

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_RE.test(value);
}

// Human-readable unique reference (BKG-003): BKG- + 6 unambiguous chars.
// UNIQUE(workspace_id, reference) backs it; callers pre-check then rely on
// the constraint as the final arbiter.
const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newBookingReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let ref = "BKG-";
  for (const b of bytes) ref += REF_ALPHABET[b % REF_ALPHABET.length];
  return ref;
}
