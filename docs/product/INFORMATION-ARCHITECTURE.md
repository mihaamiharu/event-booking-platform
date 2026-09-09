# R1 Information Architecture

**Status:** Ready for review

## Navigation model

```text
Events
├── Event detail
│   └── Checkout
│       └── Booking confirmation/detail
├── Sign in
└── My bookings
    └── Booking detail

Demo controls
└── Reset workspace

QA / local-preview
└── Observability cockpit
```

## Route inventory

Route paths are product-level proposals. The router implementation may refine parameter syntax without changing the page contract.

| Route | Screen | Access | Primary requirements |
| --- | --- | --- | --- |
| `/` | Redirect or entry to event catalog | Visitor | `EVT-001`, `WSP-004` |
| `/events` | Published event catalog | Visitor | `EVT-001` |
| `/events/:eventSlug` | Event and session detail | Visitor | `EVT-002` |
| `/sign-in` | Seeded attendee sign-in | Visitor | `ACC-001` |
| `/checkout` | Ticket review and payment simulation | Attendee | `BKG-001` through `BKG-003`, `PAY-001` |
| `/bookings` | Attendee booking list | Attendee | `BKG-005`, `BKG-007` |
| `/bookings/:bookingReference` | Booking confirmation and detail | Attendee | `BKG-004`, `BKG-006`, `BKG-007` |
| `/demo` | Workspace status and reset | Workspace holder | `WSP-002` through `WSP-004` |
| `/qa/observability` | Safe request exercises and browser-session trace | Local/preview QA only; visibly disabled in production by default | `NFR-004`, `NFR-005`, `NFR-006` |

## Global navigation

- Product name links to the event catalog.
- Events is available to every visitor with a workspace.
- My bookings is visible to an authenticated attendee.
- Sign in is visible when signed out; the attendee menu and sign out are visible when signed in.
- Demo controls are visually separate from the product's business navigation.

## Screen contracts

### Event catalog

Shows event cards with name, date, venue, starting IDR price, and availability. It defines loading, empty, error, and populated states.

### Event detail

Shows event description, WIB schedule, venue, ticket options, IDR prices, remaining capacity, and unavailable explanations. It does not collect attendee or payment input.

### Sign in

Collects seeded email and password, preserves a safe intended destination, and presents authentication failure without clearing the email unnecessarily.

### Checkout

Shows the selected event, session, ticket type, unit price, quantity, and total. It labels the payment field as a simulation code and prevents accidental repeat submission while preserving idempotent retry.

### Booking detail

Serves as both immediate confirmation and later durable detail. Refreshing it does not repeat checkout. Confirmed bookings expose the cancellation flow; cancelled bookings retain their history and cannot be cancelled again.

### My bookings

Lists the active attendee's bookings newest first, including cancelled history, and provides an explicit empty state.

### Demo controls

Explains that data is isolated and temporary, shows the workspace expiry policy, and requires explicit confirmation before reset. It never exposes another workspace identifier or data.

### QA observability cockpit

Provides health, event discovery/detail, sign-in, and payment-decline request
exercises. The browser-session timeline shows client-observed status,
duration, response code, correlation ID, and safe error references. External
Cloudflare/Grafana links are configured per environment and remain separate
from client evidence; raw logs and provider credentials are never rendered.

## Responsive priorities

- Event discovery and checkout remain complete at a 320 CSS-pixel viewport width.
- Primary actions remain reachable without horizontal page scrolling.
- Tables, if introduced after R1, must have a mobile alternative rather than clipping critical content.
