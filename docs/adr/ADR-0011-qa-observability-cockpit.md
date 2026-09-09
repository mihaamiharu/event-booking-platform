# ADR-0011: Use a safe QA request-and-trace observability cockpit

**Status:** Accepted
**Date:** 2026-09-10
**Requirements:** NFR-004, NFR-005, NFR-006

## Context

Issue #62 needs a learner-facing way to exercise representative requests and
connect browser evidence to the provider-neutral Worker logs from ADR-0010.
An in-app log viewer would require a new log store, an access-control model,
and a second place where credentials or raw log payloads could leak. The
product remains a Cloudflare free-plan system and must keep production
operator data outside the attendee client.

## Decision

- Add `/qa/observability` as a static client route whose availability is
  resolved by `GET /api/qa/config`.
- Enable the cockpit by default for local and preview environments; an
  explicit `QA_OBSERVABILITY_ENABLED=true` is required for production.
- Run health, event discovery/detail, sign-in, and deterministic payment
  decline requests from the browser. The browser manages cookies; the page
  never reads or displays them.
- Keep only status, duration, response code, correlation ID, and stable error
  references in a browser-session trace timeline. Password input is transient
  and payment-decline input is an internal exercise detail.
- Expose only allowlisted HTTP(S) Cloudflare Workers Logs and Grafana URLs.
  The page links to those provider-held views but never proxies, stores, or
  renders raw server logs.

## Consequences

The cockpit gives testers a repeatable evidence path without adding a log
database or paid observability dependency. The page can still be reached by a
known URL in production, but it is visibly disabled by the default production
configuration. Operators must configure external viewer URLs per environment;
correlation IDs remain the bridge from browser evidence to provider logs.
