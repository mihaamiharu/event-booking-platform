# R1 Product Error Catalog

**Status:** Ready for review

Stable codes express product meaning across the UI, API, tests, logs, and defects. Human-readable messages are English R1 copy and may improve without changing the code.

The HTTP category is a discovery expectation; the API design must either adopt it or document an approved change.

| Code | HTTP category | Product meaning | User-facing handling |
| --- | ---: | --- | --- |
| `VALIDATION_FAILED` | 400 | One or more request fields are structurally invalid | Identify affected fields without exposing internals |
| `WORKSPACE_REQUIRED` | 401 | No valid signed workspace context exists | Start or restore workspace provisioning |
| `WORKSPACE_EXPIRED` | 410 | The workspace exceeded seven inactive days | Explain expiration and start a new workspace |
| `WORKSPACE_RATE_LIMITED` | 429 | Provision or reset abuse control was reached | Show retry-later guidance |
| `WORKSPACE_RESET_FAILED` | 500 | Reset did not restore a complete seed state | Preserve explicit failure; never imply reset succeeded |
| `AUTH_REQUIRED` | 401 | A protected operation has no valid attendee session | Sign in and preserve a safe intended destination |
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
| `UNEXPECTED_ERROR` | 500 | The platform cannot provide a more specific safe outcome | Show a correlation reference and retry guidance |

## Error rules

1. Validation errors do not create confirmed bookings or consume capacity.
2. An error response includes a stable code and correlation identifier where operational investigation is useful.
3. Public errors do not include stack traces, SQL, secrets, tokens, or cross-workspace existence clues.
4. A payment decline is a handled business outcome, not an unexpected system error.
5. UI copy does not infer success when the API outcome is unknown.
