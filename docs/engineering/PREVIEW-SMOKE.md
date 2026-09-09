# Disposable preview smoke

Preview verification is intentionally manual/workflow-dispatched so the repository never commits account IDs, secrets, or long-lived preview URLs.

## Deploy → migrate → exercise → reset → delete

1. Create a disposable D1 database and replace only local operator configuration with its ID.
2. Set Worker secrets through Wrangler/Cloudflare secret bindings; never put them in a file tracked by Git.
3. Deploy the `preview` environment and run the workflow-dispatched `preview-smoke` job with its temporary URL.
4. The smoke checks health, provision, catalog, detail, sign-in, simulated decline, and reset. It records safe status/error summaries and correlation IDs only.
5. Review Workers Logs and D1 row-budget evidence for the run.
6. Delete the disposable Worker/D1 resources and remove temporary credentials after verification.

The workflow is intentionally not a production deploy workflow. Production is smoke-only, rate-limit-respecting, and must use the release gates in `docs/releases/RELEASE-001.md`.
