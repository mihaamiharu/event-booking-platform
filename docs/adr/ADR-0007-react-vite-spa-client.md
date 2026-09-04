# ADR-0007: Use React + Vite (SPA) for the R1 client

**Status:** Accepted  
**Date:** 2026-09-04
**Decision issue:** #36 (framework decisions comment)

## Context

S3 builds the first UI routes (`/events`, `/events/:slug` with
loading/empty/error states). The slice plan defaults to dependency-free
TypeScript to Static Assets until a slice proves otherwise. Candidates:
vanilla TS, React + Vite (SPA), Svelte SPA. SSR frameworks (Next.js, TanStack
Start, SvelteKit server mode) are excluded up front: the architecture is a
static shell + narrow `/api/*` with no SSR (TDD §6, usage model §2).

## Decision

Adopt **React + Vite in SPA mode**: static build output served as Static
Assets; all dynamic state via `fetch` to `/api/*`. Svelte SPA was a strong
technical fit (smaller bundles) but React matches what QA-learner audiences
meet in the wild; vanilla TS was set aside once two stateful routes plus the
§4 state matrix made component structure the clearer vehicle.

## Consequences

- Client gains a build step (`vite build` → Static Assets); S3 wires it plus
  the `/api/*`-only Worker routing and no-`run_worker_first` guard.
- No SSR, no server functions, no per-page Worker invocation — free-plan
  posture unchanged.
- R1 stays a single-page app with client routing; S3 proves loading/empty/
  error states and the a11y annotations through it.
- Revisit only with bundle/CPU evidence against the choice.
