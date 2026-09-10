# R1 Product Error Catalog

**Status:** Ready for review

Stable codes express product meaning across the UI, API, tests, logs, and defects. Human-readable messages are English R1 copy and may improve without changing the code.

The HTTP category is a discovery expectation; the API design must either adopt it or document an approved change.

| Code | HTTP category | Product meaning | User-facing handling |
| --- | ---: | --- | --- |
| `VALIDATION_FAILED` | 400 | One or more request fields are structurally invalid | Identify affected fields without exposing internals |
| `WORKSPACE_REQUIRED` | 401 | No valid signed workspace context exists | Start or restore workspace provisioning |
| `WORKSPACE_PROVISION_FAILED` | 503 | Provisioning could not complete a full seed state | Show retry-later guidance; never imply a workspace is ready |
| `WORKSPACE_EXPIRED` | 410 | The workspace exceeded seven inactive days | Explain expiration and start a new workspace |
| `WORKSPACE_RATE_LIMITED` | 429 | Provision or reset abuse control was reached | Show retry-later guidance |
| `WORKSPACE_RESET_FAILED` | 500 | Reset did not restore a complete seed state | Preserve explicit failure; never imply reset succeeded |
| `TURNSTILE_REQUIRED` | 403 | An armed IP must complete a challenge before provision/reset writes | Show the challenge and resubmit with its token |
| `AUTH_REQUIRED` | 401 | A protected operation has no valid attendee session | Sign in and preserve a safe intended destination |
| `AUTH_RATE_LIMITED` | 429 | Sign-in throttling tripped | Retry with backoff after the indicated delay |
| `AUTH_INVALID_CREDENTIALS` | 401 | Seeded email/password did not authenticate | Show one non-enumerating credential error |
| `EVENT_NOT_FOUND` | 404 | Event is missing or not publicly accessible | Show the public not-found state |
| `SESSION_NOT_BOOKABLE` | 409 | Session status, time, sales window, or capacity prevents booking | Refresh current session availability |
| `TICKET_TYPE_INVALID` | 400 | Ticket type does not belong to the selected session or is unavailable | Return to valid ticket selection |
| `QUANTITY_INVALID` | 400 | Quantity is not an integer from 1 through 5 | Explain the accepted boundary |
| `CAPACITY_INSUFFICIENT` | 409 | Current remaining capacity is below requested quantity | Show current remaining capacity and allow reselection |
| `PAYMENT_CODE_INVALID` | 400 | Payment input is not a supported simulation code | Explain where documented demo codes are available |
| `PAYMENT_DECLINED` | 422 | The deterministic simulator selected a decline | Preserve selection and allow a new attempt |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Checkout omitted its retry identity | Retry through a valid checkout submission |
| `IDEMPOTENCY_CONFLICT` | 409 | The key was reused with different checkout input | Start a new checkout attempt |
| `BOOKING_NOT_FOUND` | 404 | Booking is missing or not owned by the active attendee/workspace | Show one non-enumerating not-found state |
| `BOOKING_ALREADY_CANCELLED` | 409 | The attendee's booking was already cancelled | Explain that capacity was not released again and refresh the record |
| `BOOKING_CANCELLATION_CLOSED` | 409 | The booking cannot be cancelled after the session starts or from a closed state | Keep the booking visible and explain the lifecycle boundary |
| `BOOKING_CANCELLATION_CONFLICT` | 409 | Booking state changed while cancellation was being attempted | Refresh the booking and allow a safe retry |
| `SERVICE_UNAVAILABLE` | 503 | Quota, CPU, overload, or downstream retry-later condition | Show retry guidance with `Retry-After` where provided |
| `STORAGE_FULL` | 503 | Database storage cap reached; reads are unaffected | Explain temporary write pause and retry later |
| `UNEXPECTED_ERROR` | 500 | The platform cannot provide a more specific safe outcome | Show a correlation reference and retry guidance |
| `ORGANIZER_FORBIDDEN` | 403 | The signed-in user is not an organizer | Explain that organizer access is required |
| `EVENT_NAME_INVALID` | 400 | Event name is missing or too long | Enter a concise event name |
| `EVENT_DESCRIPTION_INVALID` | 400 | Event description is too long | Shorten the description |
| `VENUE_REQUIRED` | 400 | Event configuration omitted a room/venue | Ask the organizer to choose a workspace venue |
| `VENUE_INVALID` | 400 | Venue is missing or belongs to another workspace | Keep the form editable and choose a valid venue |
| `SESSION_REQUIRED` | 400 | Event configuration has no session | Add a session before saving |
| `SESSION_INVALID` | 400 | Session time or positive room capacity is invalid | Identify the session fields |
| `SESSION_OVERLAP` | 409 | Sessions overlap | Adjust the session schedule |
| `TICKET_REQUIRED` | 400 | Publication has no ticket types | Add at least one ticket before publishing |
| `TICKET_LIST_INVALID` | 400 | Ticket list structure is invalid | Repair the ticket configuration |
| `TICKET_INVALID` | 400 | Ticket name, price, session, or ownership is invalid | Correct the ticket fields |
| `SALES_WINDOW_INVALID` | 400 | Sales opening/closing times are invalid | Enter an ordered sales window |
| `PUBLICATION_INVALID` | 409 | Publication gate failed for a future session or sales window | Keep the draft and retry after correction |
| `CAPACITY_INVALID` | 400 | Room capacity is below confirmed bookings or outside the allowed range | Increase the session capacity |
| `CAPACITY_IN_USE` | 409 | A session with confirmed bookings cannot be removed or reduced | Preserve booked capacity |
| `SESSION_IN_USE` | 409 | A session with booking history cannot be removed | Preserve booking history |
| `TICKET_IN_USE` | 409 | A ticket with booking history cannot be removed | Preserve booking history |

## Error rules

1. Validation errors do not create confirmed bookings or consume capacity.
2. An error response includes a stable code and correlation identifier where operational investigation is useful.
3. Public errors do not include stack traces, SQL, secrets, tokens, or cross-workspace existence clues.
4. A payment decline is a handled business outcome, not an unexpected system error.
5. UI copy does not infer success when the API outcome is unknown.
