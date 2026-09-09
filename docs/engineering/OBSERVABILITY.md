# R1 observability contract

## Baseline

The Worker emits one JSON `api.request` record per dynamic request and JSON `worker.cleanup` records for scheduled expiry work. Each record has a correlation ID. Error responses also return the same value in `error.correlationId` and the `x-correlation-id` response header.

The allowlisted request fields are:

```json
{
  "event": "api.request",
  "timestamp": "2026-09-10T00:00:00.000Z",
  "correlationId": "uuid",
  "method": "POST",
  "route": "/api/checkout",
  "status": 422,
  "durationMs": 4.2,
  "workspace": "8-character-sha-prefix",
  "errorCode": "PAYMENT_DECLINED"
}
```

The workspace value is a short SHA-256 pseudonym. Logs must not contain passwords, cookies, raw or hashed session tokens, workspace HMAC material, Turnstile tokens, payment simulation codes, raw IP addresses, or unnecessary email/PII. Log failures must never change the product outcome.

## Tester workflow

1. Record the response status, stable code, and `x-correlation-id` in the manual execution record.
2. Search the Cloudflare Workers Logs view for `correlationId` and confirm the route/status/error code.
3. Compare the API `meta.rows_read/rows_written` with the database evidence where relevant.
4. If an optional Grafana export is configured, use the same correlation query in Grafana Explore; do not index the correlation ID as a high-cardinality label.

## Provider decision

Cloudflare Workers Logs is the required baseline because the repository already enables Worker observability. The optional third-party path is OpenTelemetry/OTLP or another supported export configured outside the application; no paid Logpush or Grafana integration is required for the R1 release. Grafana dashboards are an optional disposable/preview aid, not a production dependency.

Official references:

- [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/)
- [Cloudflare Workers Logpush and OpenTelemetry guidance](https://developers.cloudflare.com/workers/observability/logs/logpush/)
- [Grafana Cloud log ingestion](https://grafana.com/docs/grafana-cloud/observe-and-act/send-data/logs/)

## Dashboard/query checklist

- request count, error count, status by route, and p95 duration;
- checkout conflicts/declines and rate-limit responses;
- cleanup expired count and D1 row budgets;
- Worker exceptions and invocation failures;
- correlation lookup from a failed learner scenario.

Any export must use low-cardinality labels such as environment, service, route, and status. Keep correlation IDs and workspace pseudonyms in the log body for investigation.

## QA observability cockpit (NFR-004/NFR-005/NFR-006)

Local and disposable preview runs expose `/qa/observability`. The page is a
safe request-and-trace surface, not a log viewer. It can run health, event
discovery/detail, sign-in, and payment-decline exercises, then records only
the browser-observed method/path, status, duration, correlation ID, and stable
error reference in the current browser session. It does not record response
bodies, passwords, cookies, workspace IDs, workspace secrets, payment
simulation inputs, or raw server log payloads.

The page obtains its gate and optional provider links from
`GET /api/qa/config`. Local and preview are enabled by default; set
`QA_OBSERVABILITY_ENABLED=false` to turn the page off. Production is disabled
unless `QA_OBSERVABILITY_ENABLED=true` is explicitly configured. Optional
`QA_CLOUDFLARE_LOGS_URL` and `QA_GRAFANA_URL` values are exposed only as
credential-free HTTP(S) links when the cockpit is enabled; URLs with embedded
user information or sensitive query keys are omitted. The UI clearly separates client
evidence from provider-held log evidence and never fetches log contents.

### Tester workflow

1. Start local development or a disposable preview and open
   `/qa/observability`.
2. Enter the seeded QA password only in the masked sign-in field when running
   that exercise; the field is cleared after the request and is not stored.
3. Run all, or run individual exercises. Record the safe timeline evidence,
   especially the correlation ID for failed requests.
4. Use the configured Cloudflare Workers Logs or Grafana link to search the
   correlation ID in the provider console. The cockpit does not display the
   returned log record.
5. Clear the browser timeline after attaching the evidence to a manual QA
   execution record.
