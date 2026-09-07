// Unit: session cookie posture + sign-in redirect guard (ACC-001, NFR-002/004).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clearSessionCookieHeader,
  newSessionToken,
  SESSION_TTL_MS,
  sessionCookieHeader,
  sha256Hex,
} from "../../worker/src/session.ts";
import { safeNextPath } from "../../client/src/lib/api.ts";

describe("acc-001 session cookie headers", () => {
  it("sets HttpOnly Lax Path=/api Max-Age=604800 with Secure outside localhost", () => {
    const set = sessionCookieHeader("tok", true);
    assert.match(set, /^ebp_session=tok;/);
    assert.match(set, /HttpOnly/);
    assert.match(set, /SameSite=Lax/);
    assert.match(set, /Path=\/api/);
    assert.match(set, /Max-Age=604800/);
    assert.match(set, /Secure/);
    assert.doesNotMatch(sessionCookieHeader("tok", false), /Secure/);
  });

  it("clears with Max-Age=0 and epoch expiry", () => {
    const clear = clearSessionCookieHeader(false);
    assert.match(clear, /^ebp_session=;/);
    assert.match(clear, /Max-Age=0/);
    assert.match(clear, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
  });

  it("issues unique 256-bit tokens stored as 64-hex hashes", async () => {
    const a = await newSessionToken();
    const b = await newSessionToken();
    assert.notEqual(a.token, b.token);
    assert.match(a.tokenHash, /^[0-9a-f]{64}$/);
    assert.equal(a.tokenHash, await sha256Hex(a.token));
    assert.equal(SESSION_TTL_MS, 7 * 86_400_000);
  });
});

describe("acc-001 safeNextPath keeps same-origin destinations only", () => {
  it("accepts plain paths, rejects everything else", () => {
    assert.equal(safeNextPath("/events"), "/events");
    assert.equal(safeNextPath("/events/x?y=1"), "/events/x?y=1");
    assert.equal(safeNextPath(null), "/events");
    assert.equal(safeNextPath(""), "/events");
    assert.equal(safeNextPath("https://evil.test/events"), "/events");
    assert.equal(safeNextPath("//evil.test/events"), "/events");
    assert.equal(safeNextPath("/sign-in"), "/events");
  });
});
