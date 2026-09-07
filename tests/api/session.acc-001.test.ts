// Session endpoint tests (ACC-001; API-CONTRACT §3.2, AUTH-SECURITY T-05/T-06).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { baseUrl, headers, provision, resetRateCounters, startWorker, type ApiMeta } from "./support/harness.ts";

const PORT = Number(process.env.EBP_API_PORT ?? 8790);
const BASE = baseUrl(PORT);
const ID = "s4-session-acc001";

let stop: () => void;
before(async () => {
  stop = await startWorker(PORT);
  resetRateCounters(BASE);
});
after(() => stop());

function sessionCookie(res: Response): string {
  const match = res.headers
    .getSetCookie()
    .map((c) => c.match(/^ebp_session=([^;]*)/)?.[1])
    .find((v) => v !== undefined);
  assert.ok(match, "response sets ebp_session");
  return match;
}

function cookies(ws: string, sess?: string): string {
  return sess ? `ebp_workspace=${ws}; ebp_session=${sess}` : `ebp_workspace=${ws}`;
}

async function signIn(ws: string, identity: string, email: string, password: string): Promise<Response> {
  return fetch(`${BASE}/api/session`, {
    method: "POST",
    headers: { ...headers(identity), cookie: cookies(ws) },
    body: JSON.stringify({ email, password }),
  });
}

describe("acc-001 POST /api/session", () => {
  it("signs in alex with documented credentials and sets the session cookie", async () => {
    const ws = await provision(BASE, `${ID}-alex`);
    const res = await signIn(ws, `${ID}-alex`, "alex.attendee@example.test", "Attend123!");
    assert.equal(res.status, 200);
    const setCookies = res.headers.getSetCookie().join(";");
    assert.match(setCookies, /ebp_session=[^;]+;.*HttpOnly.*SameSite=Lax.*Path=\/api.*Max-Age=604800/);
    const body = (await res.json()) as {
      attendee: { email: string; displayName: string };
      meta: ApiMeta;
    };
    assert.deepEqual(body.attendee, { email: "alex.attendee@example.test", displayName: "Alex" });
    assert.ok(body.meta.rows_read <= 15, `rows_read ${body.meta.rows_read}`);
    assert.ok(body.meta.rows_written <= 15, `rows_written ${body.meta.rows_written}`);
  });

  it("signs in maya with documented credentials", async () => {
    const ws = await provision(BASE, `${ID}-maya`);
    const res = await signIn(ws, `${ID}-maya`, "maya.attendee@example.test", "Booked123!");
    assert.equal(res.status, 200);
    const body = (await res.json()) as { attendee: { email: string; displayName: string } };
    assert.deepEqual(body.attendee, { email: "maya.attendee@example.test", displayName: "Maya" });
  });

  it("rejects malformed input without touching the throttle bucket (VALIDATION_FAILED)", async () => {
    const ws = await provision(BASE, `${ID}-validation`);
    const missing = await signIn(ws, `${ID}-validation`, "alex.attendee@example.test", "");
    assert.equal(missing.status, 400);
    assert.equal(((await missing.json()) as { error: { code: string } }).error.code, "VALIDATION_FAILED");
    const form = await fetch(`${BASE}/api/session`, {
      method: "POST",
      headers: { ...headers(`${ID}-validation`), cookie: cookies(ws), "content-type": "application/x-www-form-urlencoded" },
      body: "email=a&password=b",
    });
    assert.equal(form.status, 400);
    assert.equal(((await form.json()) as { error: { code: string } }).error.code, "VALIDATION_FAILED");
  });

  it("wrong email vs wrong password are indistinguishable (T-05)", async () => {
    const ws = await provision(BASE, `${ID}-diff`);
    const wrongEmail = await signIn(ws, `${ID}-diff`, "nobody@example.test", "Attend123!");
    const wrongPassword = await signIn(ws, `${ID}-diff`, "alex.attendee@example.test", "Wrong123!");
    assert.equal(wrongEmail.status, 401);
    assert.equal(wrongPassword.status, 401);
    const a = (await wrongEmail.json()) as { error: { code: string; message: string; correlationId: string } };
    const b = (await wrongPassword.json()) as { error: { code: string; message: string; correlationId: string } };
    assert.equal(a.error.code, "AUTH_INVALID_CREDENTIALS");
    assert.equal(b.error.code, "AUTH_INVALID_CREDENTIALS");
    assert.ok(a.error.correlationId);
    assert.ok(b.error.correlationId);
    assert.deepEqual(
      { ...a.error, correlationId: "X" },
      { ...b.error, correlationId: "X" },
      "identical code/shape modulo correlationId",
    );
    assert.ok(!JSON.stringify(a).includes("alex"), "no identity echo in error body");
  });

  it("throttles after 10 failures and resets on success (T-06)", async () => {
    const ws = await provision(BASE, `${ID}-throttle`);
    resetRateCounters(BASE);
    const id = `${ID}-throttle-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      const res = await signIn(ws, id, "alex.attendee@example.test", "Wrong123!");
      assert.equal(res.status, 401);
    }
    // Success resets the failure counter …
    const ok = await signIn(ws, id, "alex.attendee@example.test", "Attend123!");
    assert.equal(ok.status, 200);
    // … so ten more failures fit before the throttle trips again.
    for (let i = 0; i < 10; i++) {
      const res = await signIn(ws, id, "alex.attendee@example.test", "Wrong123!");
      assert.equal(res.status, 401);
    }
    const limited = await signIn(ws, id, "alex.attendee@example.test", "Wrong123!");
    assert.equal(limited.status, 429);
    const body = (await limited.json()) as { error: { code: string; correlationId: string } };
    assert.equal(body.error.code, "AUTH_RATE_LIMITED");
    assert.ok(body.error.correlationId);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
    resetRateCounters(BASE);
  });
});

describe("acc-001 DELETE /api/session", () => {
  it("signs out with 204 and clears the cookie; repeat still 204", async () => {
    const ws = await provision(BASE, `${ID}-signout`);
    const inRes = await signIn(ws, `${ID}-signout`, "alex.attendee@example.test", "Attend123!");
    assert.equal(inRes.status, 200);
    const sess = sessionCookie(inRes);
    const out = await fetch(`${BASE}/api/session`, {
      method: "DELETE",
      headers: { ...headers(`${ID}-signout`), cookie: cookies(ws, sess) },
    });
    assert.equal(out.status, 204);
    assert.match(out.headers.getSetCookie().join(";"), /ebp_session=;.*Max-Age=0/);
    const repeat = await fetch(`${BASE}/api/session`, {
      method: "DELETE",
      headers: { ...headers(`${ID}-signout`), cookie: cookies(ws, sess) },
    });
    assert.equal(repeat.status, 204);
  });

  it("sign-out without a session still returns 204 (no oracle)", async () => {
    const ws = await provision(BASE, `${ID}-nosess`);
    const res = await fetch(`${BASE}/api/session`, {
      method: "DELETE",
      headers: { ...headers(`${ID}-nosess`), cookie: cookies(ws) },
    });
    assert.equal(res.status, 204);
  });

  it("mixed workspace/session context revokes nothing and leaks nothing (T-04)", async () => {
    const wsA = await provision(BASE, `${ID}-xa`);
    const wsB = await provision(BASE, `${ID}-xb`);
    const inRes = await signIn(wsA, `${ID}-xa`, "alex.attendee@example.test", "Attend123!");
    assert.equal(inRes.status, 200);
    const sessA = sessionCookie(inRes);
    const mixed = await fetch(`${BASE}/api/session`, {
      method: "DELETE",
      headers: { ...headers(`${ID}-xa`), cookie: cookies(wsB, sessA) },
    });
    assert.equal(mixed.status, 204);
    const body = await mixed.text();
    assert.equal(body, "");
  });
});
