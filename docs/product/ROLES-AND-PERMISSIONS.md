# Roles and Permissions

**Status:** Ready for review

R1 distinguishes product authentication from possession of a signed learner-workspace context.

| Capability | Visitor with workspace | Authenticated attendee | Different attendee in same workspace | Other workspace |
| --- | --- | --- | --- | --- |
| Browse published events | Allowed | Allowed | Allowed | Own workspace only |
| View public event detail | Allowed | Allowed | Allowed | Own workspace only |
| Sign in with seeded credentials | Allowed | Not applicable | Allowed | Own workspace credentials only |
| Create a booking | Authentication required | Allowed | Allowed for own identity | Denied |
| List bookings | Authentication required | Own bookings only | Own bookings only | Denied |
| View booking detail | Authentication required | Own booking only | Own booking only | Denied |
| Sign out | Not applicable | Own session | Own session | Denied |
| Reset learner workspace | Valid signed workspace context required | Allowed with valid context | Allowed with valid context | Denied |
| Read organizer dashboard | Denied in R1 | Denied in R1 | Denied in R1 | Denied |
| Create/edit/publish events | Denied in R1 | Denied in R1 | Denied in R1 | Denied |

R1 has no organizer account or management operation. The R2 Issue #69 extension adds the following seeded role boundary:

| Capability | Authenticated organizer | Authenticated attendee | Other workspace |
| --- | --- | --- | --- |
| Read organizer dashboard | Own active workspace only | Denied (`ORGANIZER_FORBIDDEN`) | Denied |
| Create/edit event, room, session, capacity, ticket | Own active workspace only | Denied (`ORGANIZER_FORBIDDEN`) | Denied |
| Publish event | Own active workspace only after validation | Denied | Denied |

## Authorization rules

1. Workspace scope is derived from trusted signed or authenticated context.
2. Attendee identity is derived from the active session.
3. A booking reference is an identifier, not authorization.
4. A missing booking and a booking owned by another attendee or workspace produce the same public not-found meaning.
5. Event discovery may differ between workspaces because capacity and scenario state are isolated.
6. No R1 endpoint grants check-in or administrator behavior; Issue #69 adds only the scoped organizer operations documented in the R2 extension.

## Deferred roles

Check-in staff and administrator permissions require separate release requirements and threat review before implementation.
