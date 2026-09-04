# SPIKE-A — PBKDF2 CPU benchmark (Closes #21)

Throwaway harness. Requirements `ACC-001`, `NFR-001`. Gates S4.

## Run (local)

```sh
cd spikes/spike-a
npm install
npm test          # percentile unit (node:test)
npm run dev       # terminal 1 — restart before cold reads
npm run bench     # terminal 2 — 200 warm runs × 4 iteration cells
```

Bench options: `npm run bench -- --base http://127.0.0.1:8787 --runs 200`.
`SPIKE_PASSWORD` overrides the fixture password (default `Attend123!`, never logged).

## Run (preview, one bounded deploy)

```sh
npx wrangler deploy --config wrangler.jsonc
SPIKE_BASE=https://<preview-subdomain>.workers.dev npm run bench -- --runs 100
npx wrangler delete --config wrangler.jsonc   # dispose immediately
```

Record preview URL, workerd/wrangler versions, and machine in `RESULTS.md`.

## Layout

- `src/worker.ts` — `POST /__spike/pbkdf2` benchmark route (server-side `performance.now()`).
- `src/run.ts` — sequential driver, cold + warm, markdown table output.
- `src/stats.ts` + `src/stats.test.ts` — percentile math.
- `RESULTS.md` — evidence for the spike PR (S4 consumes the locked value).
