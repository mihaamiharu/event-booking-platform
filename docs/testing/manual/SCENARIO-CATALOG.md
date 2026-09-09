# R1 manual scenario catalog

Use a fresh workspace for scenarios marked **reset**. Expected dates are relative to the workspace `seedReferenceAt` (T0), never hardcoded calendar dates.

| Scenario | Requirement | Layer | Priority | Fixture/precondition | Core expected result |
| --- | --- | --- | --- | --- | --- |
| MAN-ACC-001 | ACC-001 | UI/API | P0 | Alex credentials | Valid sign-in creates a session; invalid credentials show one non-enumerating error; sign-out invalidates it. |
| MAN-EVT-001 | EVT-001 | UI/API/DB | P0 | Fresh workspace | Only future published events appear; draft, cancelled, and past fixtures are excluded; empty state is explicit. |
| MAN-EVT-002 | EVT-002 | UI/API/a11y | P0 | Available and sold-out events | Details show schedule, tickets, IDR, WIB, and capacity; unavailable choices cannot continue. |
| MAN-BKG-001 | BKG-001 | UI/API | P0 | Available session | Quantities 1–5 work; 0, 6, non-integer, and over-capacity values are rejected; total is visible. |
| MAN-BKG-002 | BKG-002 | API/DB | P0 | Stale/foreign selection | Server revalidates event/session/ticket, price, window, and capacity; rejected attempts create no booking or capacity change. |
| MAN-BKG-003 | BKG-003 | UI/API/DB | P0 | Alex, fresh workspace | Success creates one confirmed booking; replay is idempotent; changed-key input conflicts; capacity changes once. |
| MAN-BKG-004 | BKG-004 | UI/API/DB | P0 | Maya booking and foreign reference | Owner can view detail; another attendee/workspace receives the same safe not-found outcome. |
| MAN-BKG-005 | BKG-005 | UI/API/DB | P0 | Alex empty, Maya populated | List is newest-first, paginated, owner-scoped, and links to detail; empty state is explicit. |
| MAN-PAY-001 | PAY-001 | UI/API/DB | P0 | Checkout selection | Success, decline, invalid code, retry, and no-card-data behavior match the contract. |
| MAN-WSP-001 | WSP-001 | API/DB/security | P0 | Two workspaces and attendees | Workspace/user/body/path tampering cannot read or mutate another workspace. |
| MAN-WSP-002 | WSP-002 | UI/API/DB | P0 | Mutated workspace | Confirmed reset restores seed accounts/content/capacity, kills sessions, and leaves other workspaces unchanged. |
| MAN-WSP-003 | WSP-003 | API/DB/lifecycle | P1 | Local time manipulation | Valid dynamic activity slides expiry; an idle workspace returns 410 and is eligible for cleanup; static assets do not renew it. |
| MAN-WSP-004 | WSP-004 | UI/API/DB | P0 | Fresh and existing contexts | Provision is deterministic, atomic, rate-limited, and reuses a valid active context. |
| MAN-NFR-001 | NFR-001 | operational | P1 | Local/preview runbook | Product stays within documented free-plan resource and row budgets; exhaustion maps to safe retryable errors. |
| MAN-NFR-002 | NFR-002 | UI/a11y | P0 | Keyboard and assistive-tech pass | Core journey has visible focus, names/roles, associated errors, and usable keyboard paths. |
| MAN-NFR-003 | NFR-003 | UI/responsive | P0 | 320/360px and desktop | Core pages have no horizontal overflow and remain usable at supported viewports. |
| MAN-NFR-004 | NFR-004 | API/UI | P0 | Success and failure matrix | Error shape/codes are stable, messages are safe, and correlation references are traceable. |
| MAN-NFR-005 | NFR-005 | process | P1 | Scenario + defect templates | Requirement IDs, scenario IDs, evidence, and defect links remain traceable through closure. |
| MAN-NFR-006 | NFR-006 | security/logs | P0 | Full journey and exported logs | No password, cookie, token, simulation code, raw IP, or unnecessary personal data appears in responses/logs. |
| MAN-NFR-007 | NFR-007 | DB/reset | P0 | Reset twice | Same seed version/reset yields the same logical state modulo T0 and salted hashes. |
| MAN-NFR-008 | NFR-008 | browser | P0 | Chromium, Firefox, WebKit | Core journey passes in every promised engine, or the documented release decision explicitly defers one. |
| MAN-NFR-009 | NFR-009 | UI/API | P1 | Catalog, detail, booking | English copy, integer IDR formatting, and Asia/Jakarta/WIB display are consistent. |

## Exploratory charters

Run at least one charter per release in addition to scripted scenarios:

- stale availability and double-submit;
- browser back after decline and checkout;
- expired session/workspace during checkout;
- rate-limit recovery and Turnstile challenge;
- keyboard-only and 320px responsive pass;
- correlation-ID trace from browser → API → logs.

Record each charter with [CHARTER-TEMPLATE.md](CHARTER-TEMPLATE.md), then convert any repeatable defect into an automated regression.
