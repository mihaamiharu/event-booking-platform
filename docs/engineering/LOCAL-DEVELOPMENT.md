# Local development

The application uses the Cloudflare Vite plugin for local development and
client/Worker builds. Vite serves the React SPA and runs the Worker in the
Cloudflare Workers runtime; Wrangler remains the CLI for D1 migrations,
local-data operations, deployment, and remote resources.

## Prerequisites

- Node.js 22 or newer
- npm (the repository uses the committed `package-lock.json`)
- Chromium only when running the Playwright suite

Cloudflare login is not required for local development. It is required only
for commands that access or deploy remote Cloudflare resources.

## Quick start

From the repository root:

```text
npm ci
npm run setup:local
npm run dev
```

Open <http://127.0.0.1:5173>. The setup command creates the ignored
`worker/.dev.vars` file from its example, applies pending local D1 migrations,
and clears local rate-limit counters. It is safe to run again.

The local D1 state is stored in the ignored `worker/.wrangler/local` directory.
To reset the entire local database, stop local servers and remove that
directory, then run `npm run setup:local` again.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite HMR plus the Worker runtime on port 5173 |
| `npm run preview` | Build and preview the production-shaped app on port 4173 |
| `npm run setup:local` | Create local vars, apply D1 migrations, clear rate counters |
| `npm run test:unit` | Node unit tests |
| `npm run test:db` | SQLite-backed database-state tests |
| `npm run test:api` | API tests against one Vite/Worker runtime |
| `npm run test:e2e --workspace=tests` | Playwright browser tests using the preview runtime |
| `npm run test:local` | Full local verification sequence |
| `npm run typecheck` | TypeScript checks for all workspaces |

The Playwright configuration starts `npm run serve:e2e` automatically. That
script builds the client, applies local migrations, clears rate counters, and
serves the Vite preview on port 8780.

## Cross-platform rules

- Do not rely on `worker/migrations` being a filesystem symlink.
- Do not invoke `npx`, `.cmd`, or shell-specific commands from Node tooling;
  the shared local runtime helper invokes the checked-in JavaScript CLIs via
  `process.execPath`.
- Use `fileURLToPath()` when converting module URLs to filesystem paths.
- Keep local state and vars ignored; never commit `.dev.vars` or
  `worker/.wrangler/local`.
