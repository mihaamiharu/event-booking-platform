# R1 UI Design and Responsive Wireframes

**Status:** Ready for review
**Version:** 0.1
**Scope:** Issue #10 — user experience before application implementation
**Sources:** INFORMATION-ARCHITECTURE, USER-FLOWS (UF-001…006), PERSONAS (Alya), ERROR-CATALOG, API-CONTRACT, NFR-002/003/009
**Non-goals:** Framework/router choice (TDD §11), visual brand (PD-001 deferred), copy finalization beyond contract examples.

## 1. Design tokens (framework-agnostic)

- Spacing scale 4/8/16/24/32; content max-width 960px; touch targets ≥ 44px.
- Type: system stack; base 16px; price figures tabular numerals.
- Color roles (not values): `text`, `text-muted`, `surface`, `border`, `primary` (actions), `danger` (errors/decline), `focus` (3:1+ against adjacent colors, 2px outline minimum). Implementations must verify body-text contrast ≥ 4.5:1 and large-text ≥ 3:1.
- Product name is a single string constant for easy rename (PD-001).

## 2. Global chrome (all routes)

```text
┌────────────────────────────────┐
│ EBP  Events  My bookings   [A] │  header: nav landmarks, skip link first
├────────────────────────────────┤
│ <main> …route content… </main>  │
├────────────────────────────────┤
│ Demo controls (collapsed)  ▸   │  visually separate region, aria-label
└────────────────────────────────┘
```

- Skip link → `<main>`; one `h1` per route; nav uses `<nav aria-label>`; signed-in state shows attendee menu + sign out, never the session token.
- Demo controls live in a bordered `<section aria-label="Demo controls">` pinned after the footer content — never inside business nav (acceptance criterion).
- API states per route: loading skeleton → content | empty | error with retry. Refreshing booking detail never resubmits checkout (GET only).

## 3. Route wireframes (mobile 360px first; desktop §5)

### 3.1 `/events` catalog (EVT-001, UF-003)

```text
┌──────────────────┐
│ h1 Events        │
│ ┌──────────────┐ │
│ │ Workshop     │ │  article, h2 name, time, venue,
│ │ Sat 18 Sep · │ │  starting price, status badge
│ │ Merdeka Hall │ │
│ │ From IDR     │ │
│ │ 150.000 ● Av │ │
│ └──────────────┘ │
│ (cards stack)    │
└──────────────────┘
```

States: loading (2 skeleton cards, `aria-busy`); empty ("No published events right now." + retry); error (`UNEXPECTED_ERROR`/`SERVICE_UNAVAILABLE` + retry button, `role="alert"`); sold-out card shows badge, detail link stays available.

### 3.2 `/events/:slug` detail (EVT-002, UF-003/004)

```text
┌──────────────────┐
│ h1 <Event name>  │
│ Venue · City     │
│ About…           │
│ h2 Schedule (WIB)│
│ ○ Sat 18 Sep     │
│   09:00–12:00 WIB│
│   18 left        │
│ ⊗ session… full  │  disabled radio + reason
│ h2 Tickets       │
│ ○ General — IDR  │
│   150.000        │
│ ○ Premium — …    │
│ [Continue →]     │
└──────────────────┘
```

Session/ticket options are real `<input type="radio">` (keyboard + screen-reader free); unavailable options `disabled` with visible reason. Missing event → `EVENT_NOT_FOUND` not-found state (same for draft/cancelled).

### 3.3 `/sign-in` (ACC-001, UF-002)

```text
┌──────────────────┐
│ h1 Sign in       │
│ Email [______]   │  label+input, autocomplete
│ Password [_____] │
│ [Sign in]        │
│ Demo: alex… /    │  hint listing seeded accounts
│ maya…            │
└──────────────────┘
```

Failure keeps the email, moves focus to the `role="alert"` error summary linked to fields (`aria-describedby`); one non-enumerating message. Preserves safe intended destination (same-origin path only).

### 3.4 `/checkout` (BKG-001…003, PAY-001, UF-004/005)

```text
┌──────────────────┐
│ h1 Checkout      │
│ Event · session  │
│ General × [2 v]  │  quantity select 1–5
│ Unit  IDR 150.000│
│ Total IDR 300.000│  aria-live="polite"
│ Simulation code  │
│ [____________]   │  labelled simulation, help text
│ [Pay IDR 300.000]│  disabled while submitting
└──────────────────┘
```

Total recomputes client-side for display but the server total rules (stale-price note in help text). Submit button disables during flight; idempotency key generated per attempt (UUID, stored in memory, regenerated after decline/conflict so retry = new attempt). Decline → `PAYMENT_DECLINED` panel preserving selection + "Try again" (new key). Conflict → `CAPACITY_INSUFFICIENT`/`IDEMPOTENCY_CONFLICT` with current remaining capacity + reselect action.

### 3.5 `/bookings/:ref` confirmation/detail (BKG-004, UF-006)

Definition list: reference (copy button), event, session WIB range, ticket, quantity, unit price, total, payment status, booking status. Serves immediate confirmation (success banner on first view after checkout) and durable detail (banner absent on later visits — distinguished by navigation state, not by refetching checkout).

### 3.6 `/bookings` list (BKG-005, UF-006)

Newest-first cards: reference, event name, session start (WIB), quantity, total IDR, status; empty state ("No bookings yet." + browse link); foreign/missing → `BOOKING_NOT_FOUND`.

### 3.7 `/demo` workspace controls (WSP-002…004, UF-001)

Status card (seed version, provisioned date, expiry date, days remaining), isolation explainer, expiry policy, reset flow (explicit confirm checkbox + destructive-styled button), rate-limit (`WORKSPACE_RATE_LIMITED` + retry time), reset-failure (`WORKSPACE_RESET_FAILED`, never imply success), expired-workspace (`WORKSPACE_EXPIRED` + "Start a new workspace" action). Never shows another workspace identifier.

## 4. Required-state matrix

| State | Routes | UI pattern | Code |
| --- | --- | --- | --- |
| Loading | all data routes | skeleton + `aria-busy`, skeletons `aria-hidden` | — |
| Empty | catalog, bookings | explicit message + next action | — |
| Validation | sign-in, checkout, reset confirm | inline field errors + summary, focus to summary | `VALIDATION_FAILED`, `QUANTITY_INVALID`, `PAYMENT_CODE_INVALID`, `TICKET_TYPE_INVALID`, `IDEMPOTENCY_KEY_REQUIRED` |
| Authorization | checkout, bookings, reset | sign-in prompt preserving destination | `AUTH_REQUIRED`, `AUTH_INVALID_CREDENTIALS`, `AUTH_RATE_LIMITED` |
| Not found | event detail, booking detail | identical missing/foreign state | `EVENT_NOT_FOUND`, `BOOKING_NOT_FOUND` |
| Capacity conflict | checkout | remaining-capacity panel + reselect | `SESSION_NOT_BOOKABLE`, `CAPACITY_INSUFFICIENT`, `IDEMPOTENCY_CONFLICT` |
| Payment decline | checkout | decline panel, selection preserved | `PAYMENT_DECLINED` (422) |
| Workspace expiration | all | banner + new-workspace action | `WORKSPACE_EXPIRED` (410) |
| Reset failure | demo | failure panel, state explicitly unknown | `WORKSPACE_RESET_FAILED` |
| Unexpected/quota | all | correlation ID + retry | `UNEXPECTED_ERROR`, `SERVICE_UNAVAILABLE`, `STORAGE_FULL` |

## 5. Desktop adaptations (≥ 1024px)

- Catalog: 2–3 column card grid (same card component, same DOM order).
- Detail: two columns (info | schedule+tickets sticky summary); checkout: form + order-summary rail (total duplicated, one `aria-live` source).
- Bookings list: same cards at wider measure; no data tables in R1 (per IA, tables need a mobile alternative — deferred with the feature).
- Header spreads to full nav row; demo controls remain a separate collapsed section.

## 6. Accessibility annotations (NFR-002; #11 verifies each)

- Keyboard: every action reachable/operable; radio/select/button natives preferred; visible `:focus-visible` outline everywhere; focus moved to error summary (validation), confirmation `h1` (booking success), and restored to trigger (dialog/panel close).
- Names/roles: icon-only buttons labelled (copy reference, quantity stepper if used); status badges are text, not color-only; decline/conflict/success use `role="alert"`/`status` appropriately (one live region per page).
- Forms: `<label for>`, `aria-describedby` to help + error text, `autocomplete="email"`/`current-password`, `inputmode="numeric"` on quantity if text input; errors programmatically associated, never placeholder-only.
- Contrast: text ≥ 4.5:1, large text/UI affordances ≥ 3:1, focus indicator ≥ 3:1; verified in implementation against chosen values.

## 7. Regional presentation (NFR-009)

- Currency: `IDR 150.000` — code prefix, Indonesian thousands grouping (`.`), no decimals, tabular numerals; API integer is the source of truth.
- Time: `Sat, 18 Sep 2026 · 09:00–12:00 WIB` — day/date + range + WIB label; rendered from UTC API instants via `Asia/Jakarta`; never a bare local time.
- Language: English-only strings; no concatenated sentences (use parameterized templates for future localization).

## 8. Handoff to #11/#12

- Contract fixtures for tests: API-CONTRACT §5 examples render through §3–§4 states above; error-code → UI-pattern mapping is §4.
- First-slice build order suggestion: chrome + catalog + detail (read-only) → sign-in → checkout → bookings → demo controls, each with its §4 states and §6 annotations before moving on.
