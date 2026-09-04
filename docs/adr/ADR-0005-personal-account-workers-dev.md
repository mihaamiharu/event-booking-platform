# ADR-0005: Host preview and production in the personal Cloudflare account on workers.dev

**Status:** Accepted  
**Date:** 2026-09-04
**Decision issue:** #31

## Context

S1 needs a Cloudflare account for preview/production and a hostname target.
Constraints: Cloudflare-only free plans (ADR-0002); standalone product usable
as an external lab system (ADR-0001); product branding deferred (#5).
`wrangler` is authenticated to the owner's personal account
(`ekkisyam2310.workers.dev` namespace, verified by SPIKE-A/B preview runs).

## Decision

R1 preview and production live in the personal Cloudflare account, served on
`workers.dev` (e.g. `ebp-r1.<namespace>.workers.dev` or per-env worker names).
No custom hostname in R1; hostname choice belongs to #5/S8. The product makes
no calls to TestingWithEkki infrastructure, so hosting account never creates a
runtime dependency (ADR-0001).

## Consequences

- Free-plan budgets (100k req/day, D1 rows) are isolated from any other
  property's traffic, as the usage model assumes.
- Repository, deployment account, and namespace share one owner — no stranded
  resources on access change.
- Moving hosting to another account or adding a custom hostname later requires
  a new ADR with quota-isolation proof and the #5 name.
- Preview D1 databases are disposable (created per need, deleted after); the
  `workers.dev` namespace itself is permanent account plumbing.
