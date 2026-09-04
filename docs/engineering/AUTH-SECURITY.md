# R1 Authentication and Workspace Security Design

**Status:** Ready for review
**Version:** 0.1
**Scope:** Issue #8 — security design for identity, isolation, and abuse controls
**Sources:** ROLES-AND-PERMISSIONS, PRD (ACC-001, WSP-001…004), RISKS-AND-ASSUMPTIONS (R-001, R-004, R-006), TDD §9, API-CONTRACT, DATA-DESIGN, CLOUDFLARE-USAGE-MODEL

## 1. Trust boundaries

| Boundary | Trusted | Untrusted |
| --- | --- | --- |
| Signed workspace cookie + server secrets | `workspace_id` after HMAC verification | Any `workspaceId`, `workspace_id`, email, or slug field in body/query/path |
| Session cookie + `sessions` table | `user_id` after hash lookup + expiry/revocation checks | Any `userId`, `attendee`, or `owner` input |
| Server clock | Sales windows, expiry, rate-limit windows | `Date` headers, client timestamps |
| Seed constants in code | Prices, credentials' hashes, event content | Any client-provided total, price, or role |

Rules 1–2 of ROLES-AND-PERMISSIONS are structural: no endpoint reads identity or scope from ordinary request input (R-004). Every protected query binds `workspace_id` (and `user_id` where applicable) from server-side context.

## 2. Signed workspace context

- Format: `ebp_workspace = base64url(workspaceId) + "." + base64url(random24B) + "." + base64url(HMAC-SHA256(WORKSPACE_SECRET, workspaceId + "." + random))`. Random part makes each issuance unique and unguessable; the HMAC makes it unforgable.
- Cookie: `HttpOnly; Secure (production); SameSite=Lax; Path=/; Max-Age=604800` (7 days, sliding — reissued on successful API activity per BR-WSP-001).
- Verification per request: split into three parts, recompute HMAC, compare with timing-safe equality, then load the workspace row and require `status = ACTIVE` and `last_active_at` within 7 days. Any failure → `WORKSPACE_REQUIRED` (401) for missing/invalid, `WORKSPACE_EXPIRED` (410) for lapsed — with no indication of whether the workspace ever existed.
- `WORKSPACE_SECRET` lives in Cloudflare secret bindings, distinct per environment. Rotation: accept N and N+1 during a 24h window (try newest first), then retire N; rotation procedure and dual-acceptance are implementation requirements, not optional.

## 3. Seeded attendee authentication and sessions

- Credentials are public demo data valid only inside their workspace (PD-002); identical emails across workspaces are distinct users via `(workspace_id, email)`.
- Sign-in: look up `(workspace_id, email)`, verify with WebCrypto PBKDF2-SHA256 (salt per user, random per workspace at provision; identical passwords hash differently — allowed, since NFR-007 requires identical logical state, not identical hash bytes), then insert a `sessions` row and set `ebp_session`. Wrong email and wrong password return the identical `AUTH_INVALID_CREDENTIALS` (401) after identical work (no enumeration oracle, no timing shortcut).
- Session token: 256-bit `crypto.getRandomValues`, stored as SHA-256 hash (`token_hash` PK) — a database read never yields a usable token. Cookie: `HttpOnly; Secure (production); SameSite=Lax; Path=/api; Max-Age=604800`. Lifetime 7 days absolute, sliding on use, capped by workspace expiry; sign-out sets `revoked_at` and clears the cookie (repeat sign-out still 204).
- No registration, recovery, or role elevation exists in R1; any such parameter is ignored, never an error that reveals internals.

### 3.1 Password-hashing budget (10 ms CPU cap)

Provisioning inserts **precomputed** hash constants from code config — zero hashing CPU on the provision path. Only sign-in verification hashes, once per attempt, and failed-attempt throttling (§5) bounds attacker-driven CPU. The pre-implementation spike must benchmark PBKDF2-SHA256 in a real Worker isolate (cold and warm) and select an iteration count with p99 verify ≤ 5 ms, leaving headroom for the remaining 2-query budget; starting proposal 100,000 iterations, adjustable down by config. If 100k exceeds budget, reduce iterations (seeded demo credentials do not need production KDF strength) rather than adding infrastructure. Results are recorded in the implementation PR.

## 4. Authorization and non-enumeration

- Matrix: ROLES-AND-PERMISSIONS table is adopted unchanged; booking reference is an identifier, never authorization (rule 3).
- Every booking read binds `(workspace_id, user_id)`; event reads bind `workspace_id`; checkout binds all three plus validated event/session/ticket membership. Missing vs. foreign resources return identical `EVENT_NOT_FOUND` / `BOOKING_NOT_FOUND` (404) with identical timing shape (rule 4).
- Reset requires a valid workspace context; an attendee session is not required but, when present, must belong to the same workspace or the request is rejected as `WORKSPACE_REQUIRED` (never processed cross-workspace).

## 5. Rate limits and Turnstile (ratified values)

| Action | Limit | Response |
| --- | --- | --- |
| Provision | 10/hour per IP | `WORKSPACE_RATE_LIMITED` 429 + `Retry-After` |
| Reset | 20/hour per workspace, 30/hour per IP | Same as above |
| Sign-in failures | 10 per 10 min per IP (success resets counter) | `AUTH_RATE_LIMITED` 429 with backoff |
| Turnstile arming | 3 rate-limit hits from one IP in 1 hour | Next provision/reset from that IP requires a valid Turnstile token before any write executes; pass cached 10 min/IP |

Turnstile verification is one server-side subrequest inside the 50-subrequest budget; Turnstile outages fail closed with `SERVICE_UNAVAILABLE`, and unchallenged routes are unaffected. Counters are kept in D1 (no new infrastructure) with one indexed row per IP/window; counter writes are included in the §3 write budgets of the usage model.

## 6. CSRF posture

Same-origin architecture (static assets + `/api/*` on one host, no CORS, no `Access-Control-Allow-Origin`): primary defense is `SameSite=Lax` on both cookies, which blocks cross-site authenticated POSTs. Defense in depth: state-changing endpoints (`POST`/`DELETE`) require `Content-Type: application/json` and reject simple-form-encoded bodies with `VALIDATION_FAILED`; `Origin`/`Referer`, when present, must match the deployment host. No CSRF tokens in R1 — justified by same-origin + Lax + JSON-only mutations; any future cross-origin client requires revisiting this section.

## 7. Logging, redaction, correlation

- Log allowlist per request: correlation ID (UUIDv7 generated per request, returned on 409/422/429/5xx), route, method, status, duration/CPU ms, workspace pseudonym (`sha256(workspaceId)[:8]`, never the raw ID), stable error code.
- Never logged: passwords, raw or hashed session tokens, workspace HMAC material, Turnstile tokens, payment simulation codes, emails beyond the sign-in attempt counter key (counters store hashes, not addresses).
- Production sampling per usage-model §7 with always-log on 4xx/5xx, checkout conflict/decline, provision/reset rejection, D1-limit errors, cleanup summaries. Workers Logs Free (200k events/day, 3-day retention) is sufficient at R1 scale with sampling.

## 8. Threat scenarios → negative tests (#11 derives cases from this table)

| # | Scenario | Expected | Derived test |
| --- | --- | --- | --- |
| T-01 | `GET /api/bookings/<foreign-ref>` with valid session | `BOOKING_NOT_FOUND` 404, no leakage | Cross-attendee + cross-workspace variants |
| T-02 | Checkout with `workspace_id`/`user_id` smuggled in body | Ignored; server context wins | Body-scope injection suite |
| T-03 | Tampered `ebp_workspace` signature | `WORKSPACE_REQUIRED` 401 | Bit-flip + cross-secret replay |
| T-04 | `ebp_session` from workspace A presented with workspace B context | Rejected; no cross data | Mixed-context matrix |
| T-05 | Wrong email vs. wrong password | Identical 401 code/shape | Enumeration differential test |
| T-06 | 11th sign-in failure in 10 min/IP | `AUTH_RATE_LIMITED` 429 | Throttle + reset-on-success |
| T-07 | Provision loop from one IP | 429 after 10/hour; Turnstile armed after 3 hits | Abuse soak (local/preview only) |
| T-08 | Same idempotency key, altered quantity | `IDEMPOTENCY_CONFLICT` 409, capacity unchanged | Fingerprint tamper suite |
| T-09 | Parallel last-seat checkouts | Exactly one 201, rest stable 409, total ≤ capacity | Concurrency spike (DATA-DESIGN §6) |
| T-10 | Log inspection after full journey | No credential/token/sim-code/email plaintext | Redaction grep over exported logs |
| T-11 | Cross-site form POST to `/api/checkout` | Cookie withheld (Lax) → `AUTH_REQUIRED`/`WORKSPACE_REQUIRED` | CSRF harness |
| T-12 | Expired workspace request | `WORKSPACE_EXPIRED` 410 → provision anew | Time-boundary + cleanup tests |

## 9. Secrets inventory

`WORKSPACE_SECRET`, `SESSION_SECRET` (HMAC for any session-binding signatures; session tokens themselves are random), `TURNSTILE_SECRET` — all Cloudflare secret bindings, never in code, logs, or client bundles; per-environment values; rotation per §2 with dual-acceptance. This section ratifies the API-contract cookie names (`ebp_workspace`, `ebp_session`) and the usage-model rate-limit/Turnstile posture.
