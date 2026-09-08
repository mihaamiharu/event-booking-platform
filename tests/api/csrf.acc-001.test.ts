// CSRF posture harness (T-11; session integrity, ACC-001).
// Same-origin + Lax + JSON-only mutations: cross-site simple-form posts
// carry no cookies (fail-closed without context), and even WITH cookies a
// form-encoded mutation is rejected before any state change.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { baseUrl, headers, provision, resetRateCounters, startWorker } from "./support/harness.ts";

const PORT = Number(process.env.EBP_API_PORT ?? 8790);
const BASE = baseUrl(PORT);
const ID = "s8-csrf-acc001";

let stop: () => void;
before(async () => {
  stop = await startWorker(PORT);
  resetRateCounters(BASE);
});
after(() => stop());

function form(headersInit: Record<string, string>, body: string): Record<string, string> {
  return { ...headersInit, "content-type": "application/x-www-form-urlencoded", cookie: headersInit.cookie ?? "" };
}

describe("acc-001 cross-site form posts fail closed (T-11)", () => {
  it("checkout without cookies is rejected before any processing", async () => {
    const res = await fetch(`${BASE}/api/checkout`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": `${ID}-anon` },
      body: "eventSlug=x&quantity=5&paymentCode=SIMULATE-SUCCESS",
    });
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, "WORKSPACE_REQUIRED");
  });

  it("form-encoded mutations with cookies are rejected as non-JSON", async () => {
    const ws = await provision(BASE, `${ID}-form`);
    for (const path of ["/api/session", "/api/checkout", "/api/workspaces/reset"]) {
      const res = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: form(headers(`${ID}-form`, ws), "email=a&password=b"),
        body: "email=a&password=b",
      });
      assert.equal(res.status, 400, path);
      assert.equal(((await res.json()) as { error: { code: string } }).error.code, "VALIDATION_FAILED", path);
      assert.ok(
        !res.headers.getSetCookie().join(";").includes("ebp_session="),
        `no session issued by ${path}`,
      );
    }
  });

  it("form-encoded provision is rejected without seeding", async () => {
    resetRateCounters(BASE);
    const res = await fetch(`${BASE}/api/workspaces/provision`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": `${ID}-prov` },
      body: "{}",
    });
    assert.equal(res.status, 400);
    assert.ok(!res.headers.getSetCookie().join(";").includes("ebp_workspace="), "no workspace issued");
  });
});
