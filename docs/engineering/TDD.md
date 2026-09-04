# Technical Design Document

**Release:** R1 — Attendee Booking
**Status:** Ready for review
**Version:** 0.4

## 1. Design goals

- Operate as a real dynamic application without a VPS.
- Remain within Cloudflare free-plan limits during the nonprofit phase.
- Expose stable HTTP APIs suitable for manual and automated testing.
- Persist relational state suitable for controlled database verification.
- Keep learner workspaces isolated and resettable.
- Remain independent from TestingWithEkki.

## 2. Proposed architecture

```text
Browser
  │
  ├── static application assets
  │     Cloudflare Workers Static Assets
  │
  └── /api/*
        Cloudflare Worker
          ├── request validation
          ├── authentication and authorization
          ├── application services
          └── D1 binding
                SQLite-compatible relational data
```

## 3. Runtime boundaries

### Web application

A client-rendered TypeScript application is built to static assets. Public page requests do not require server-side rendering. The client calls the API only when it needs dynamic state.

### API Worker

The Worker owns authentication, authorization, validation, business rules, and database access. Only `/api/*` and explicitly documented operational routes invoke dynamic code.

### D1

D1 stores accounts, sessions, workspace-scoped mutable data, event reference data, inventory, payments, and bookings. Queries must use appropriate indexes because free-plan usage is measured partly by rows read and written.

## 4. Data isolation

Every mutable business entity includes a trusted `workspace_id` derived from the authenticated session or signed workspace token. Request payloads do not determine workspace ownership.

Shared reference content may be global. Inventory, accounts, sessions, bookings, and scenario state are workspace-scoped in R1 to keep exercises deterministic.

An R1 workspace expires after seven days without a successful API request associated with its valid signed workspace context. An attendee session is not required. A bounded scheduled cleanup marks or removes expired workspace data. Static asset requests and rejected API requests do not extend the lifetime.

## 5. Booking consistency

Checkout uses an idempotency key and a logical transaction or D1 batch so that booking creation, payment recording, and capacity reservation succeed or fail together. The final design must document D1's exact transactional guarantees before implementation.

## 6. Free-plan controls

Binding budgets, exhaustion behavior, and monitoring are specified in [Cloudflare free-plan usage model](CLOUDFLARE-USAGE-MODEL.md) (reviewed 2026-09-04 against current published limits). This section states the controls; the usage model is authoritative for numbers.

- Static assets bypass Worker execution.
- No SSR.
- No background polling.
- Catalog responses are compact and paginated when needed.
- Workspace creation and reset are rate-limited.
- Seed data is small and deterministic.
- Expired workspace cleanup runs on a bounded schedule after seven days of inactivity.
- R2, Queues, Durable Objects, and external paid services are not required for R1.

## 7. R1 identity and payment boundaries

R1 provisions deterministic attendee accounts with each workspace. It does not support public registration, email verification, or password recovery.

Payment is an internal deterministic simulator. It accepts only documented scenario codes and never requests card-shaped financial data. Payment success and decline are ordinary application outcomes persisted with the booking attempt where required by the final data design.

R1 monetary values are integer IDR amounts. R1 domain instants are persisted in UTC and displayed using the IANA time zone `Asia/Jakarta` with a WIB label. These contracts must be preserved through the database and API designs.

## 8. Environments

| Environment | Purpose | Data |
| --- | --- | --- |
| Local | Development and automated verification | Local Wrangler/D1 state |
| Preview | Pull-request and acceptance review | Disposable or dedicated preview data |
| Production | Public `workers.dev` target website | Isolated learner workspaces |

## 9. Security baseline

- Validate external input with explicit schemas.
- Store secrets only in Cloudflare secret bindings.
- Use HTTP-only session cookies.
- Enforce authorization on every protected resource.
- Do not accept workspace ownership from request payloads.
- Do not collect real financial credentials.
- Rate-limit workspace creation, reset, and authentication failures.
- Return stable errors without leaking cross-workspace resource existence.

## 10. Observability

Worker logs include request correlation ID, route, status, duration, workspace pseudonym, and stable error code. Logs must not contain passwords, session tokens, simulated payment inputs, or unnecessary personal data.

## 11. Deferred decisions

- Client framework and router
- API routing library
- Authentication implementation
- ORM versus direct D1 statements
- Preview-environment database strategy
- Branded custom hostname
