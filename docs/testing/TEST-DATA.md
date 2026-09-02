# R1 Seed and Test Data Specification

**Status:** Ready for review
**Seed version:** `r1-v1`

All identities and content are fictional. Reserved `.test` email addresses must never send or receive real email.

## Seed reference time

Each provision or reset stores one `seed_reference_at` instant called `T0`.

- `T0` is persisted as UTC.
- Calendar-relative event dates are calculated in `Asia/Jakarta`.
- A reset creates a new `T0` and reconstructs the same logical states at the same documented offsets.
- Tests obtain or derive `T0`; they do not hardcode calendar dates that will become stale.

## Interactive attendee accounts

| Seed key | Email | Password | Initial booking state |
| --- | --- | --- | --- |
| `attendee_alex` | `alex.attendee@example.test` | `Attend123!` | No confirmed bookings |
| `attendee_maya` | `maya.attendee@example.test` | `Booked123!` | One confirmed booking for two General tickets |

Credentials are intentionally public demo data and valid only inside the active learner workspace. Passwords must still be hashed at rest.

## Non-interactive fixture identity

`fixture.soldout@example.test` owns the booking that consumes the sold-out session. It has no documented sign-in credential and is not an interactive product persona.

## Venues

| Seed key | Name | City | Time zone |
| --- | --- | --- | --- |
| `venue_merdeka` | Merdeka Community Hall | Jakarta | `Asia/Jakarta` |
| `venue_cendana` | Cendana Creative Studio | Jakarta | `Asia/Jakarta` |

Street addresses remain fictional and will be finalized with UI content. No map or geocoding integration exists in R1.

## Event catalog

### Available published event

| Field | Seed value |
| --- | --- |
| Seed key | `event_design_workshop` |
| Slug | `jakarta-design-systems-workshop` |
| Name | Jakarta Design Systems Workshop |
| Status | `PUBLISHED` |
| Venue | `venue_merdeka` |
| Session | Local date of `T0` + 14 days, 09:00–12:00 WIB |
| Sales open | `T0` - 1 day |
| Sales close | Local date of `T0` + 13 days, 23:59 WIB |
| Session capacity | 20 |
| Existing confirmed quantity | 2 |
| Expected remaining capacity | 18 |

Ticket types:

| Seed key | Name | Unit price |
| --- | --- | ---: |
| `ticket_design_general` | General | IDR 150.000 |
| `ticket_design_premium` | Premium | IDR 250.000 |

Maya's seeded booking owns two General tickets. Its stored unit-price snapshot is `150000`, quantity is `2`, and total is `300000`.

### Sold-out published event

| Field | Seed value |
| --- | --- |
| Seed key | `event_product_meetup` |
| Slug | `community-product-meetup` |
| Name | Community Product Meetup |
| Status | `PUBLISHED` |
| Venue | `venue_cendana` |
| Session | Local date of `T0` + 21 days, 18:30–21:00 WIB |
| Sales open | `T0` - 1 day |
| Sales close | Local date of `T0` + 20 days, 23:59 WIB |
| Session capacity | 5 |
| Existing confirmed quantity | 5 |
| Expected remaining capacity | 0 |
| Ticket | General, IDR 50.000 |

One non-interactive fixture booking owns all five tickets so database state and displayed capacity remain reconcilable.

### Excluded catalog fixtures

| Seed key | Name | State | Relative session | Expected public behavior |
| --- | --- | --- | --- | --- |
| `event_draft_conference` | Modern Web Conference | `DRAFT` | `T0` + 28 days | Not listed; public detail unavailable |
| `event_cancelled_evening` | Creative Tech Evening | `CANCELLED` | `T0` + 10 days | Not listed; public detail unavailable |
| `event_past_forum` | Product Leadership Forum | `PUBLISHED` with completed session | `T0` - 7 days | Not listed because no future session |

## Seeded booking references

| Seed key | Owner | Reference | State |
| --- | --- | --- | --- |
| `booking_maya_design` | `attendee_maya` | `BKG-SEED-MAYA-001` | Confirmed, paid, two General tickets |
| `booking_fixture_soldout` | Non-interactive fixture | `BKG-SEED-SOLDOUT-001` | Confirmed, paid, five General tickets |

References are deterministic only for seeded records. User-created booking references must be unique but need not be predictable.

## Payment simulator inputs

| Input | Expected result | Booking effect |
| --- | --- | --- |
| `SIMULATE-SUCCESS` | Payment succeeds | Confirm booking and consume capacity once |
| `SIMULATE-DECLINE` | Payment is declined | No confirmed booking and no capacity consumption |
| Any other value | Input validation fails | No payment outcome, booking, or capacity consumption |

The simulator stores an outcome, not the submitted simulation code, unless a later accepted security review explicitly requires otherwise.

## Reset invariants

After reset:

- both interactive accounts can authenticate with their documented credentials;
- Alex has no confirmed bookings;
- Maya has exactly one documented confirmed booking;
- the available session has 18 remaining places;
- the sold-out session has zero remaining places;
- draft, cancelled, and past fixtures remain excluded from the public catalog;
- no user-created booking, session mutation, or prior scenario flag remains; and
- no other workspace changes.

## Data safety

- Do not enter real names, email addresses, passwords, or payment credentials.
- Application and observability logs redact passwords, cookies, tokens, and payment simulation input.
- Uploaded files do not exist in R1.
- Workspace data is eligible for deletion after seven inactive days.
