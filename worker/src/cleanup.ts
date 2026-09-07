// Workspace expiration cleanup (WSP-003, DATA-DESIGN §5.3).
// Pure statement builders + a narrow store seam: the scheduled tick runs them
// on D1, db-state tests run the identical statements on node:sqlite. No
// test-only HTTP endpoints exist (API-CONTRACT §1.5), so the seam — not a
// route — is what tests exercise.
import { all, d1BatchDb, type D1Database, type D1Meta } from "./db.ts";
import { RESET_TABLES, type Statement } from "./seed.ts";
import { WORKSPACE_TTL_MS } from "./workspace.ts";

/** Child-to-parent deletes (seed.ts RESET_TABLES order), then EXPIRED mark. */
export function cleanupWorkspaceStatements(workspaceId: string): Statement[] {
  const tables = RESET_TABLES;
  return [
    ...tables.map((t): Statement => ({
      sql: `DELETE FROM ${t} WHERE workspace_id = ?1`,
      params: [workspaceId],
    })),
    { sql: "UPDATE workspaces SET status = 'EXPIRED' WHERE id = ?1", params: [workspaceId] },
  ];
}

/** Resumable per-tick bound: backlog drains over successive ticks. */
export const CLEANUP_BATCH_LIMIT = 5;

export interface CleanupStore {
  /** ACTIVE workspaces idle past cutoff, oldest first, bounded. */
  listExpired(cutoffIso: string, limit: number): Promise<string[]>;
  runBatch(statements: Statement[]): Promise<void>;
}

export function d1CleanupStore(db: D1Database, meta: D1Meta): CleanupStore {
  return {
    listExpired: async (cutoffIso, limit) => {
      const rows = await all<{ id: string }>(
        meta,
        db,
        `SELECT id FROM workspaces
          WHERE status = 'ACTIVE' AND last_active_at < ?1
          ORDER BY last_active_at LIMIT ?2`,
        cutoffIso,
        limit,
      );
      return rows.map((r) => r.id);
    },
    runBatch: async (statements) => {
      await d1BatchDb(db, meta).batch(statements);
    },
  };
}

/** Workspaces idle longer than the TTL are expired at `nowMs`. */
export function expiryCutoffIso(nowMs: number): string {
  return new Date(nowMs - WORKSPACE_TTL_MS).toISOString();
}

/**
 * Drain one bounded batch. Resumable across ticks by design: the scan always
 * takes the oldest idle workspaces, so a large backlog drains over successive
 * ticks within the Cron CPU cap (usage-model §7).
 */
export async function runCleanup(
  store: CleanupStore,
  opts: { cutoffIso: string; batchLimit: number },
): Promise<{ scanned: number; expired: number }> {
  const ids = await store.listExpired(opts.cutoffIso, opts.batchLimit);
  for (const id of ids) {
    await store.runBatch(cleanupWorkspaceStatements(id));
  }
  return { scanned: ids.length, expired: ids.length };
}
