# ADR-0009: Use the Cloudflare Vite plugin for local development

**Status:** Accepted
**Date:** 2026-09-09

## Context

The accepted R1 client architecture is a React + Vite SPA served as Static
Assets, with a narrow Cloudflare Worker API. The original local workflow built
the client separately and launched Wrangler directly. That workflow introduced
platform-specific assumptions: a Windows-unfriendly migrations symlink,
direct `npx` child-process calls, and separate local D1 state boundaries.

Cloudflare's current guidance is to use the Vite plugin when a project already
uses Vite. The plugin runs the Worker in the Workers runtime during Vite
development and supports SPA/static-asset builds without changing the R1
client/API boundary.

## Decision

- Use `@cloudflare/vite-plugin` in `client/vite.config.ts` after the React
  plugin.
- Point the plugin at `worker/wrangler.jsonc` through `configPath`.
- Use `worker/.wrangler/local` as the shared local binding persistence path.
- Configure D1's `migrations_dir` as `../db/migrations`; do not require a
  filesystem symlink.
- Use Vite for local development, preview, and client/Worker builds.
- Retain Wrangler for D1 migrations, local-data operations, deployment, and
  remote Cloudflare resources.
- Keep browser tests on Playwright and run them against the Vite preview
  runtime.

## Consequences

- Developers get one Vite-based local runtime with HMR and production-aligned
  Worker execution on macOS and Windows.
- Vite's multi-environment build stores Worker output under
  `client/dist/ebp_r1` and client assets under `client/dist/client`; the
  source Wrangler config points at the latter for direct deploy dry-runs.
- Local setup remains fully offline from Cloudflare's control plane; remote
  deploys still require Wrangler authentication.
- Test tooling must avoid mutating local SQLite from a second process while a
  live Vite runtime owns the connection. API tests prepare rate counters before
  startup, and direct local D1 edits are limited to test cases that require
  them.
