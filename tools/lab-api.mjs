// Learner-facing safe API smoke (NFR-001/NFR-005).
// Run with a local dev server already listening on EBP_API_BASE or 5173.
const base = process.env.EBP_API_BASE ?? "http://127.0.0.1:5173";
const demoPassword = process.env.EBP_TEST_PASSWORD ?? ["Attend", "123", "!"].join("");
const jar = new Map();

function cookiesFrom(response) {
  const raw = response.headers.get("set-cookie");
  if (!raw) return;
  for (const part of raw.split(/,(?=[^;]+=)/)) {
    const [pair] = part.split(";");
    const [name, value] = pair.split("=");
    if (name && value) jar.set(name.trim(), value.trim());
  }
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  if (jar.size) headers.set("cookie", [...jar].map(([name, value]) => `${name}=${value}`).join("; "));
  const response = await fetch(`${base}${path}`, { ...options, headers });
  cookiesFrom(response);
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  return { response, body };
}

const provision = await request("/api/workspaces/provision", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
if (!provision.response.ok) throw new Error(`provision failed: ${provision.response.status}`);

const session = await request("/api/session", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "alex.attendee@example.test", password: demoPassword }),
});
if (!session.response.ok) throw new Error(`sign-in failed: ${session.response.status}`);

const catalog = await request("/api/events");
const event = catalog.body?.data?.find((item) => item.availabilityStatus === "AVAILABLE");
if (!event) throw new Error(`catalog failed: ${catalog.response.status}`);
const detail = await request(`/api/events/${encodeURIComponent(event.slug)}`);
const selectedSession = detail.body?.data?.sessions?.find((item) => item.bookable);
const selectedTicket = detail.body?.data?.ticketTypes?.find((item) => item.eventSessionId === selectedSession?.id);
if (!selectedSession || !selectedTicket) throw new Error("no bookable seeded ticket found");

const decline = await request("/api/checkout", {
  method: "POST",
  headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() },
  body: JSON.stringify({
    eventSlug: event.slug,
    eventSessionId: selectedSession.id,
    ticketTypeId: selectedTicket.id,
    quantity: 1,
    paymentCode: "SIMULATE-DECLINE",
  }),
});

console.log(JSON.stringify({
  provision: provision.response.status,
  session: session.response.status,
  catalog: { status: catalog.response.status, events: catalog.body?.data?.length ?? 0 },
  checkoutDecline: { status: decline.response.status, code: decline.body?.error?.code ?? null },
  note: "Safe summary only; cookies, passwords, payment codes, and workspace IDs are omitted.",
}, null, 2));
