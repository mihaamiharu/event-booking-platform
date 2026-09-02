# Product Decision Log

**Status:** Active
**Last updated:** 2026-09-02

This log records accepted product-discovery decisions. Requirements and business rules remain authoritative for observable product behavior; this document preserves why the team selected those behaviors.

## PD-001 — Defer public branding

**Status:** Accepted
**Decision:** Use “Event Booking Platform” as the working name. Select a public brand before a custom hostname or general-availability release.

**Rationale:** Branding does not change the R1 attendee-booking contract and should not delay product discovery.

**Consequences:** Documentation and repository paths use the working name. User-facing copy must remain easy to rename.

## PD-002 — Use seeded attendee accounts in R1

**Status:** Accepted
**Decision:** Provision deterministic attendee accounts with each learner workspace. Do not implement self-registration, email verification, password recovery, or social login in R1.

**Rationale:** Seeded accounts make the first booking journey reproducible and keep identity infrastructure from dominating the first release.

**Consequences:** Credentials belong in the seed-data specification. Authentication behavior can still be tested, but account-creation behavior is deferred.

## PD-003 — Expire workspaces after seven inactive days

**Status:** Accepted
**Decision:** Expire a learner workspace after seven consecutive days without successful authenticated API activity.

**Rationale:** Seven days supports multi-session learning while bounding D1 storage and abandoned mutable data.

**Consequences:** The system needs trusted last-activity tracking, scheduled cleanup, explicit expiration behavior, and deterministic replacement workspaces.

## PD-004 — Use explicit payment simulation codes

**Status:** Accepted
**Decision:** R1 accepts `SIMULATE-SUCCESS` and `SIMULATE-DECLINE` through a clearly labelled simulation-code field. It does not render or collect card-number, security-code, or expiry fields.

**Rationale:** The codes provide deterministic success and decline branches without suggesting that the project processes financial credentials.

**Consequences:** R1 does not teach card-form validation. A later release may introduce a richer sandbox contract through a separate decision.

## PD-005 — Launch on `workers.dev`

**Status:** Accepted
**Decision:** The first public deployment uses a free Cloudflare `workers.dev` hostname.

**Rationale:** Deployment can proceed before branding without domain cost or DNS coupling.

**Consequences:** Documentation must not promise a permanent public URL until the Worker name is chosen. A branded hostname is deferred.

## Decisions still required

| Question | Why it matters | Blocking point |
| --- | --- | --- |
| R1 currency | Determines price representation, formatting, seed data, and assertions | ERD and API approval |
| Time-zone policy | Determines event/session storage, display, and boundary behavior | Event requirements approval |
| Public product name | Determines final user-facing identity and custom hostname | General availability |
