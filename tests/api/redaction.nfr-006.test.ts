// Live redaction proofs (NFR-006, T-10): error bodies never echo submitted
// secrets — passwords, simulation codes, or session material.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { baseUrl, headers, provision, resetRateCounters, startWorker } from "./support/harness.ts";

const PORT = Number(process.env.EBP_API_PORT ?? 8790);
const BASE = baseUrl(PORT);
const ID = "s8-redaction-nfr006";

let stop: () => void;
before(async () => {
  stop = await startWorker(PORT);
  resetRateCounters(BASE);
});
after(() => stop());

function leaks(body: unknown, ...secrets: string[]): boolean {
  const text = JSON.stringify(body);
  return secrets.some((s) => s.length > 0 && text.includes(s));
}

describe("nfr-006 error bodies never echo secrets (T-10)", () => {
  it("failed sign-in echoes neither password nor distinguishing detail", async () => {
    const ws = await provision(BASE, `${ID}-signin`);
    const marker = `Wrong-${Date.now()}-s3cr3t`;
    const res = await fetch(`${BASE}/api/session`, {
      method: "POST",
      headers: headers(`${ID}-signin`, ws),
      body: JSON.stringify({ email: "alex.attendee@example.test", password: marker }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.ok(!leaks(body, marker, "alex.attendee"), "no credential echo");
  });

  it("rejected payment codes and missing keys leak nothing", async () => {
    const ws = await provision(BASE, `${ID}-pay`);
    const marker = `FAKE-${Date.now()}-CODE`;
    const res = await fetch(`${BASE}/api/checkout`, {
      method: "POST",
      headers: { ...headers(`${ID}-pay`, ws), "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        eventSlug: "x",
        eventSessionId: "y",
        ticketTypeId: "z",
        quantity: 1,
        paymentCode: marker,
      }),
    });
    assert.ok([400, 401].includes(res.status));
    assert.ok(!leaks(await res.json(), marker), "no simulation-code echo");
  });

  it("bogus session tokens are not reflected", async () => {
    const ws = await provision(BASE, `${ID}-sess`);
    const bogus = `bogus-token-${Date.now()}`;
    const res = await fetch(`${BASE}/api/bookings`, {
      headers: { ...headers(`${ID}-sess`), cookie: `ebp_workspace=${ws}; ebp_session=${bogus}` },
    });
    assert.equal(res.status, 401);
    assert.ok(!leaks(await res.json(), bogus), "no token echo");
  });
});
