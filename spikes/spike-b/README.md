# SPIKE-B — D1 batch atomicity + concurrency proof (Closes #22)

Throwaway harness. Requirements `BKG-002`, `BKG-003`. Gates S5.
Scratch `spike_*` tables only — never `db/migrations/`, never prod.

## Run (local)

```sh
cd spikes/spike-b
npm install
npm run dev     # terminal 1 (:8788, local D1 via placeholder id)
npm run bench   # terminal 2 — 25 parallel qty-1 vs capacity 5, batch then gated
```

Options: `npm run bench -- --base http://127.0.0.1:8788 --contenders 25`.

## Run (preview, one bounded run)

Needs owner `wrangler login` + a disposable D1:

```sh
npx wrangler d1 create ebp-spike-b-preview   # copy database_id into wrangler.jsonc
npx wrangler deploy --config wrangler.jsonc
SPIKE_BASE=https://<preview-subdomain>.workers.dev npm run bench
npx wrangler delete --config wrangler.jsonc
npx wrangler d1 delete ebp-spike-b-preview
```

## Layout

- `src/worker.ts` — `/__spike/reset`, `/__spike/state`, `/__spike/checkout`
  (`mode: batch|gated`; batch = inserts + conditional UPDATE in one `DB.batch`,
  gated = conditional UPDATE solo first, inserts only on success).
- `src/run.ts` — concurrency + replay + conflict driver, markdown output.
- `RESULTS.md` — evidence for the spike PR (S5 consumes batch-vs-fallback).
