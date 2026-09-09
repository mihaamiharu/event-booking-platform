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
