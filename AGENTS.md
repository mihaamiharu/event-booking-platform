# Agent Instructions

## Repository purpose

This repository contains a standalone event-management and booking product. It is a real system under test for software-development and software-testing education, but it must not depend on TestingWithEkki at runtime.

## Git and GitHub access

- Never use the GitHub CLI (`gh`) in this repository.
- Use the personal SSH remote: `git@github.com-personal:mihaamiharu/event-booking-platform.git`.
- Use the personal SSH identity at `/Users/ekkisyam/.ssh/id_ed25519_personal` with `IdentitiesOnly=yes`.
- Do not push, create remote issues, or otherwise change GitHub state unless the user explicitly requests it.

## Product constraints

- Cloudflare-only hosting; no VPS.
- The initial deployment must remain within Cloudflare's free plans.
- Prefer a static client and narrowly scoped Worker API calls.
- Product documentation and implementation must be updated together.
- Record material product and architecture decisions as ADRs.
- Use GitHub issues for proposed work and discussion, not as the only source of current requirements.

## Documentation rules

- Requirements use stable identifiers such as `EVT-001` and `BKG-001`.
- An accepted requirement change must update the PRD and affected API, data, and testing documents.
- ADRs are immutable after acceptance except for status or supersession metadata. Create a new ADR to replace an earlier decision.

## Working conventions (SDLC simulation)

- Issue first: every unit of work has a GitHub issue (requirement IDs, acceptance criteria) before code is written.
- Proposal before code: approach and file tree are agreed with the owner before implementation starts.
- Requirement IDs appear in branch names, commit messages, and test/file names (NFR-005).
- Slices merge in order (S0→S8); SPIKE-A gates S4, SPIKE-B gates S5; docs-only and code PRs stay separate per slice.
- PRs are small and focused, use the PR template, link `Closes #`, and merge with merge commits.
- GitHub access: never use `gh`; use the web UI or MCP on the personal account. Push via the personal SSH key only on explicit owner request.
- Cloudflare: free plan only, personal account. Preview resources are disposable (deploy → verify → delete); never commit secrets, database IDs, or preview URLs that outlive their run.
- Verification: full local matrix before push; CI proves PRs; evidence recorded in the PR and, for spikes, in `RESULTS.md`.

