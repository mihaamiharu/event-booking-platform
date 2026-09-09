# Daily API, UI, and DB automation lab

This is the learner-facing path for exercising the real product locally. It uses the same public Worker routes as the UI and the same local D1 state used by the contract tests.

## Start clean

```text
npm ci
npm run setup:local
npm run dev
```

Use `http://127.0.0.1:5173` for API and UI work. For Playwright, use `npm run test:e2e --workspace=tests`; the runner builds and serves the production-shaped client on port 8780.

For a compact API smoke journey, run `npm run lab:api` while the dev server is running. It provisions a workspace, signs in Alex, reads the catalog, performs one simulated decline and prints only safe status summaries. It never prints passwords, cookies, payment codes, or raw workspace IDs.

## API practice with a cookie jar

The API requires a workspace cookie and protected operations require a session cookie. Any HTTP client that preserves `Set-Cookie` can exercise the flow:

1. `POST /api/workspaces/provision` with `{}`.
2. `GET /api/events` and `GET /api/events/:slug`.
3. `POST /api/session` with the documented Alex fixture.
4. `POST /api/checkout` with a fresh UUID-v4 `Idempotency-Key` and `SIMULATE-DECLINE`.
5. Repeat with the same key to observe the stored decline, then use a new key for success.
6. `GET /api/bookings` and `GET /api/bookings/:reference`.
7. `POST /api/workspaces/reset` with `{ "confirm": true }` before the next stateful scenario.

Capture status, stable error code, `x-correlation-id`, response `meta.rows_read/rows_written`, and the request shape. Do not record the seeded password or cookie values.

## DB practice

The local database lives under the ignored `worker/.wrangler/local` directory. Read-only inspection is safe while the local server is stopped or when using a separate copy:

```text
npm run setup:local
npx wrangler d1 execute DB --local --config worker/wrangler.jsonc --command "SELECT id, status, seed_version, last_active_at FROM workspaces;"
npx wrangler d1 execute DB --local --config worker/wrangler.jsonc --command "SELECT reference, user_id, quantity, total_idr, status FROM bookings ORDER BY created_at DESC;"
npx wrangler d1 execute DB --local --config worker/wrangler.jsonc --command "SELECT id, capacity, confirmed_quantity, capacity-confirmed_quantity AS remaining FROM event_sessions;"
npx wrangler d1 execute DB --local --config worker/wrangler.jsonc --command "EXPLAIN QUERY PLAN SELECT * FROM bookings WHERE workspace_id='replace-with-local-id' AND user_id='replace-with-user-id' ORDER BY created_at DESC;"
```

The examples are intentionally read-only. Use the product reset flow or `npm run setup:local` after stopping local servers; never manually delete production/preview data. Compare before/after state for decline, invalid-code, conflict, idempotent replay, reset, and over-capacity scenarios.

## UI automation

```text
npm run test:e2e:headed --workspace=tests
npm run test:e2e:ui --workspace=tests
npm run test:e2e --workspace=tests -- --project=chromium --grep "bkg-001"
```

Use semantic locators (`getByRole`, `getByLabel`, and visible text) and reset between mutating scenarios. Each browser project has its own workspace state. Failed tests retain a Playwright trace, screenshot, video, and HTML report locally under `tests/test-results` and `tests/playwright-report`.

## Boundaries

- Local D1 is the only environment where direct time manipulation and DB writes are allowed.
- Preview is disposable and must use isolated resources; production is smoke-only and rate-limit-respecting.
- No test-only HTTP endpoint, seed-injection parameter, real email, card data, or committed secret is allowed.
- See [TEST-DATA.md](TEST-DATA.md), [TEST-STRATEGY.md](TEST-STRATEGY.md), and [manual scenarios](manual/README.md) for expected outcomes and evidence.
