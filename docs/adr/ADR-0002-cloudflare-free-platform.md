# ADR-0002: Use Cloudflare free-plan services without a VPS

**Status:** Accepted  
**Date:** 2026-09-02

## Context

The project is nonprofit and must not create a recurring VPS or Workers Paid cost during its initial phase.

## Decision

The hosted R1 product will use Cloudflare Workers Static Assets for the client, a narrowly routed Cloudflare Worker for the HTTP API, and D1 for relational state. The design must remain functional on Cloudflare's free plans.

R2, Queues, Durable Objects, and external paid services are excluded unless a later accepted ADR demonstrates a necessary use case and a zero-cost operating plan.

## Consequences

- The client is rendered statically and does not require SSR.
- API request count, CPU time, and D1 row usage are design constraints.
- Static assets, compact APIs, bounded seed data, and cleanup are preferred.
- Exceeding a free-plan hard limit may temporarily degrade dynamic behavior.
- Usage monitoring and abuse controls are product requirements.

