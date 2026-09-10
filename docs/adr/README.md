# Architecture Decision Records

Architecture Decision Records explain material choices that affect product scope, architecture, data, security, testing, cost, or long-term maintainability.

## Statuses

- **Proposed:** under discussion
- **Accepted:** current decision
- **Superseded:** replaced by another ADR
- **Rejected:** considered but not selected

## Process

1. Open a decision issue describing context and alternatives.
2. Add a proposed ADR in the implementation or documentation pull request.
3. Review consequences and unresolved risks.
4. Merge the ADR as accepted with the decision.
5. Create a new ADR to supersede an accepted decision; do not rewrite its history.

## Index

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](ADR-0001-standalone-system-under-test.md) | Maintain a standalone system under test | Accepted |
| [0002](ADR-0002-cloudflare-free-platform.md) | Use Cloudflare free-plan services without a VPS | Accepted |
| [0003](ADR-0003-versioned-documents-and-issues.md) | Use versioned documents as truth and issues as workflow | Accepted |
| [0004](ADR-0004-deterministic-learner-workspaces.md) | Use deterministic, expiring learner workspaces | Accepted |
| [0005](ADR-0005-personal-account-workers-dev.md) | Host preview/production in the personal account on workers.dev | Accepted |
| [0006](ADR-0006-hono-api-router.md) | Use Hono for the Worker API router | Accepted |
| [0007](ADR-0007-react-vite-spa-client.md) | Use React + Vite (SPA) for the R1 client | Accepted |
| [0008](ADR-0008-d1-foreign-key-enforcement.md) | Treat D1 foreign keys as enforced; share one delete order | Accepted |
| [0009](ADR-0009-cloudflare-vite-local-development.md) | Use the Cloudflare Vite plugin for local development | Accepted |
| [0010](ADR-0010-browser-matrix-and-observability.md) | Restore the browser matrix and keep observability provider-neutral | Accepted |
| [0011](ADR-0011-qa-observability-cockpit.md) | Use a safe QA request-and-trace observability cockpit | Accepted |
| [0012](ADR-0012-booking-lifecycle-cancellation.md) | Preserve attendee booking history through cancellation | Proposed |
