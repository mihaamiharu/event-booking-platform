# ADR-0004: Use deterministic, expiring learner workspaces

**Status:** Accepted
**Date:** 2026-09-02

## Context

Many learners may use the same public target website. Their actions must remain reproducible without one learner's bookings, accounts, or capacity changes interfering with another's work. Persistent abandoned data must also remain bounded on D1's free plan.

## Decision

The public environment isolates mutable target-product data by a trusted learner-workspace identifier. A new workspace receives deterministic seed data, including attendee credentials and mutable capacity. The workspace expires after seven consecutive days without successful authenticated API activity. An authorized reset replaces only that workspace's mutable data with documented seed state.

Workspace ownership is derived from signed or authenticated server context, never an ordinary request field.

## Consequences

- The same learning scenario can run independently in many workspaces.
- Every mutable query requires explicit workspace scoping.
- Unique constraints may need to include `workspace_id`.
- Scheduled cleanup and reset operations must be bounded and idempotent.
- Static asset access does not preserve abandoned workspaces.
- Expired workspace state is not recoverable through the product.
