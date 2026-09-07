// Worker entry (S3): /api/* runs the Hono app; pages defer to Static Assets
// (SPA fallback via the ASSETS binding — required when Worker code exists).
// S7: scheduled Cron tick drains expired workspaces in bounded batches.
import app from "./app.ts";
import { CLEANUP_BATCH_LIMIT, d1CleanupStore, expiryCutoffIso, runCleanup } from "./cleanup.ts";
import type { WorkerEnv } from "./config.ts";
import { newMeta } from "./db.ts";

// Minimal Cron event shape (no @cloudflare/workers-types in R1).
interface CronEvent {
  cron: string;
  scheduledTime: number;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      return app.fetch(request, env);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: CronEvent, env: WorkerEnv): Promise<void> {
    const meta = newMeta();
    const summary = await runCleanup(d1CleanupStore(env.DB, meta), {
      cutoffIso: expiryCutoffIso(Date.now()),
      batchLimit: CLEANUP_BATCH_LIMIT,
    });
    // Count-only summary: safe to always log (AUTH-SECURITY §7).
    console.log(
      `cleanup tick: expired=${summary.expired} rows_read=${meta.rows_read} rows_written=${meta.rows_written}`,
    );
  },
};
