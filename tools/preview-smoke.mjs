// Disposable preview smoke (NFR-001/NFR-005/NFR-008).
// Requires EBP_PREVIEW_BASE and a deployed disposable Worker. It never writes
// directly to D1 and prints only safe status/code summaries.
const base = (process.env.EBP_PREVIEW_BASE ?? "").replace(/\/$/, "");
if (!base) throw new Error("EBP_PREVIEW_BASE is required");
const jar = new Map();

function captureCookies(response) {
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
  captureCookies(response);
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  return { status: response.status, body, correlationId: response.headers.get("x-correlation-id") };
}

function expect(result, status, label) {
  if (result.status !== status) throw new Error(`${label}: expected ${status}, got ${result.status} (${result.body?.error?.code ?? "no-code"})`);
  return result;
}

const health = expect(await request("/api/health"), 200, "health");
expect(await request("/api/workspaces/provision", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), 200, "provision");
const catalog = expect(await request("/api/events"), 200, "catalog");
const event = catalog.body?.data?.find((item) => item.availabilityStatus === "AVAILABLE");
if (!event) throw new Error("catalog has no available event");
const detail = expect(await request(`/api/events/${encodeURIComponent(event.slug)}`), 200, "detail");
const session = detail.body?.data?.sessions?.find((item) => item.bookable);
const ticket = detail.body?.data?.ticketTypes?.find((item) => item.eventSessionId === session?.id);
if (!session || !ticket) throw new Error("detail has no bookable seeded selection");
expect(await request("/api/session", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "alex.attendee@example.test", password: "Attend123!" }),
}), 200, "sign-in");
const decline = expect(await request("/api/checkout", {
  method: "POST",
  headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() },
  body: JSON.stringify({ eventSlug: event.slug, eventSessionId: session.id, ticketTypeId: ticket.id, quantity: 1, paymentCode: "SIMULATE-DECLINE" }),
}), 422, "decline");
if (decline.body?.error?.code !== "PAYMENT_DECLINED") throw new Error("decline code mismatch");
const reset = expect(await request("/api/workspaces/reset", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ confirm: true }),
}), 200, "reset");
console.log(JSON.stringify({ health: health.status, catalog: catalog.status, decline: decline.body.error.code, reset: reset.status, note: "Disposable preview smoke passed; secrets and cookies omitted." }, null, 2));
