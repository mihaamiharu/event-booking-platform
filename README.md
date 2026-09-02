# Event Booking Platform

An open-source event-management and booking application built as a realistic system for learning software development and software testing workflows.

> Status: R1 product discovery is complete and ready for owner review. Implementation has not started.

## Purpose

The application is a standalone product that attendees, organizers, check-in staff, and administrators can use through normal product workflows. Its documented lifecycle also provides material for requirement review, test planning, manual testing, API testing, database testing, UI automation, end-to-end testing, and failure investigation.

The application does not depend on TestingWithEkki. Courses, videos, and learning platforms may use it as an external system under test.

## First release

Release 1 delivers one complete attendee journey:

```text
Browse published events
→ View an event and session
→ Select a ticket quantity
→ Complete simulated payment
→ Receive a booking confirmation
→ View the booking
```

See:

- [Product brief](docs/product/PRODUCT-BRIEF.md)
- [Product requirements](docs/product/PRD.md)
- [Product decisions](docs/product/DECISIONS.md)
- [Business rules](docs/product/BUSINESS-RULES.md)
- [User flows](docs/product/USER-FLOWS.md)
- [Personas](docs/product/PERSONAS.md)
- [Roles and permissions](docs/product/ROLES-AND-PERMISSIONS.md)
- [Information architecture](docs/product/INFORMATION-ARCHITECTURE.md)
- [Product error catalog](docs/product/ERROR-CATALOG.md)
- [Domain glossary](docs/product/GLOSSARY.md)
- [Traceability](docs/product/TRACEABILITY.md)
- [Risks and assumptions](docs/product/RISKS-AND-ASSUMPTIONS.md)
- [Product roadmap](docs/product/ROADMAP.md)
- [Discovery review checklist](docs/product/DISCOVERY-CHECKLIST.md)
- [Release 1 exclusions](docs/product/OUT-OF-SCOPE.md)
- [Release 1 definition](docs/releases/RELEASE-001.md)
- [R1 seed data](docs/testing/TEST-DATA.md)
- [Technical design](docs/engineering/TDD.md)
- [Decision records](docs/adr/README.md)

## Working principles

- Documentation and code evolve together.
- Requirements have stable identifiers and testable acceptance criteria.
- GitHub issues record proposals and work; versioned documents record accepted truth.
- Important choices include their context, alternatives, and consequences.
- Hosting must remain Cloudflare-only and free for the initial nonprofit phase.

## Repository status

No application code exists yet. R1 product discovery is ready for review. The next milestone after approval is the API, data, and engineering design package.
