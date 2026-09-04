# ADR-0006: Use Hono for the Worker API router

**Status:** Accepted  
**Date:** 2026-09-04
**Decision issue:** #36 (framework decisions comment)

## Context

S3 grows the Worker from one health endpoint to provision/status/catalog/detail
plus workspace-cookie handling. The slice plan defaults to a hand-rolled
`fetch` switch until a slice proves otherwise. Candidates: hand-rolled, Hono,
itty-router.

## Decision

Adopt **Hono** at S3 start for API routing, plus its middleware for cookies,
validation, and stable error shapes. itty-router is smaller but its
ecosystem (validated schemas, RPC conventions S5/S6 can reuse) is thinner;
hand-rolled was sufficient for one endpoint but route + middleware count in S3
justifies the dependency.

## Consequences

- One small dependency (~tens of KB, well inside the 3 MB gzip worker cap);
  CPU impact re-verified against the 10 ms cap in S3 review.
- Stable error-shape handling and per-route middleware live in one place;
  row-budget discipline (direct SQL, counted queries) is unchanged — Hono
  routes; it does not query.
- Revisit only if S3 review shows budget pressure attributable to the router.
