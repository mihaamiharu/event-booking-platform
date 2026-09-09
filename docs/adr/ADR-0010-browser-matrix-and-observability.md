# ADR-0010: Restore the R1 browser matrix and keep observability provider-neutral

**Status:** Accepted
**Date:** 2026-09-10
**Requirements:** NFR-001, NFR-004, NFR-006, NFR-008

## Context

The PRD promises current Chrome, Firefox, and Safari support, while the executable suite had been reduced to Chromium. The product also needs traceable failures for API/UI/DB practice, but a Grafana service must not become a paid or production dependency for a Cloudflare free-plan product.

## Decision

- Playwright runs Chromium, Firefox, and WebKit sequentially, with an isolated seeded workspace per project.
- Failure artifacts are retained locally and uploaded by CI after redaction checks.
- The application owns a provider-neutral JSON log schema and correlation propagation.
- Cloudflare Workers Logs is the R1 observability baseline. Optional Grafana integration is external configuration using a supported export path and is documented without embedding provider credentials or assumptions in the app.
- A production deployment ignores all controlled teaching-defect profiles; local/disposable preview requires explicit opt-in.

## Consequences

The browser matrix takes longer and requires three Playwright engines in CI, but the release claim now matches executable evidence. Learners can debug failed journeys from a correlation ID without requiring Grafana. Grafana can be added later without changing handlers or log fields; current plan limits and account capabilities must be checked before enabling export.
