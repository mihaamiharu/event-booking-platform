// Turnstile arming flow (NFR-001; AUTH-SECURITY §5, usage-model §6).
// Repeated sign-in throttles arm the collapsed-local IP; the next
// provision/reset then requires a challenge token. Dummy-secret local
// behavior honors only DUMMY-PASS-LOCAL. Cleans its counters afterwards:
// armed state must not leak into other suites.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { baseUrl, headers, provision, resetRateCounters, startWorker } from "./support/harness.ts";

const PORT = Number(process.env.EBP_API_PORT ?? 8790);
const BASE = baseUrl(PORT);
const ID = "s8-turnstile-nfr001";

let stop: () => void;
before(async () => {
  stop = await startWorker(PORT);
  resetRateCounters(BASE);
});
after(() => {
  resetRateCounters(BASE);
  stop();
});

async function failSignIn(ws: string, identity: string): Promise<number> {
  const res = await fetch(`${BASE}/api/session`, {
    method: "POST",
    headers: headers(identity, ws),
    body: JSON.stringify({ email: "alex.attendee@example.test", password: "Wrong123!" }),
  });
  return res.status;
}

describe("nfr-001 turnstile arms after repeated throttles", () => {
  it("three throttle hits arm provision and reset until a pass", async () => {
    // Three consecutive throttle denials = three hits (denials record hits;
    // scope counters only gate allowance, so no wipes are needed mid-flow).
    const ws = await provision(BASE, `${ID}-arm`);
    for (let i = 0; i < 10; i++) {
      assert.equal(await failSignIn(ws, `${ID}-arm`), 401, `failure ${i}`);
    }
    for (let round = 0; round < 3; round++) {
      assert.equal(await failSignIn(ws, `${ID}-arm`), 429, `throttle hit ${round}`);
    }

    // Armed: provision without a token is challenged, not rate-limited.
    const challenged = await fetch(`${BASE}/api/workspaces/provision`, {
      method: "POST",
      headers: headers(`${ID}-arm`),
      body: "{}",
    });
    assert.equal(challenged.status, 403);
    assert.equal(
      ((await challenged.json()) as { error: { code: string } }).error.code,
      "TURNSTILE_REQUIRED",
    );

    // Reset on the same armed IP is challenged too (session optional).
    const resetDenied = await fetch(`${BASE}/api/workspaces/reset`, {
      method: "POST",
      headers: headers(`${ID}-arm`, ws),
      body: JSON.stringify({ confirm: true }),
    });
    assert.equal(resetDenied.status, 403);
    assert.equal(
      ((await resetDenied.json()) as { error: { code: string } }).error.code,
      "TURNSTILE_REQUIRED",
    );

    // Wrong token stays challenged; dummy token provisions and caches a pass.
    const wrong = await fetch(`${BASE}/api/workspaces/provision`, {
      method: "POST",
      headers: headers(`${ID}-arm`),
      body: JSON.stringify({ turnstileToken: "nope" }),
    });
    assert.equal(wrong.status, 403);

    const passed = await fetch(`${BASE}/api/workspaces/provision`, {
      method: "POST",
      headers: headers(`${ID}-arm`),
      body: JSON.stringify({ turnstileToken: "DUMMY-PASS-LOCAL" }),
    });
    assert.equal(passed.status, 200);

    // Cached pass covers both provision and reset without further tokens.
    const free = await fetch(`${BASE}/api/workspaces/provision`, {
      method: "POST",
      headers: headers(`${ID}-arm`),
      body: "{}",
    });
    assert.equal(free.status, 200);
    const resetFree = await fetch(`${BASE}/api/workspaces/reset`, {
      method: "POST",
      headers: headers(`${ID}-arm`, ws),
      body: JSON.stringify({ confirm: true }),
    });
    assert.equal(resetFree.status, 200);
  });
});
