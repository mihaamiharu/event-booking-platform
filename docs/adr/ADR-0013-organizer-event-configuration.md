# ADR-0013 — Workspace-scoped organizer event configuration

**Status:** Proposed
**Date:** 2026-09-10
**Decision issue:** #69

## Context

The attendee journey already reads venues, sessions, shared session capacity, and ticket types, but those values are seeded and read-only. Organizers need a safe first workflow for selecting a room, setting how many attendees it can hold, configuring tickets, and publishing an event without introducing paid infrastructure or per-ticket inventory complexity.

## Decision

Add a workspace-scoped `ORGANIZER` role and a nested organizer event API. An organizer saves the event, sessions, and ticket types in one bounded D1 batch. Session capacity remains the shared inventory boundary across ticket types. Publication validates workspace venue membership, future non-overlapping scheduled sessions, positive capacity, sales window, and at least one non-negative-price ticket before any write. Existing booking history prevents destructive child removal or capacity reduction below confirmed quantity.

The client exposes `/organizer` only to the seeded organizer role. Drafts remain private; successful publication makes the same event visible through the existing attendee catalog/detail reads.

## Alternatives considered

- Per-ticket-type quotas: deferred because the R1 checkout and cancellation invariants already use session-level shared capacity.
- Separate CRUD endpoints for every child row: deferred for this slice because a nested write keeps the editor save atomic and fits the free-plan request budget.
- Organizer identity from an external account provider: rejected for this standalone learner workspace; seeded role metadata is deterministic and self-contained.

## Consequences

- `users.role` requires forward-only migration `0004_organizer_management.sql` and a seeded organizer credential.
- R1 attendee APIs remain compatible; session sign-in adds a top-level role field.
- Event updates must preserve booking history, so later rescheduling/deletion workflows need their own requirements and ADR.
- The role and nested write are intentionally narrow; check-in/admin permissions, moderation, and per-tier quotas remain deferred.
