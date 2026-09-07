// D1 access layer (NFR-001, DATA-DESIGN §8).
// Structural D1 typing (S5 chooses prod typing). Every helper reports
// billed rows into the caller's meta accumulator for budget assertions
// (TEST-STRATEGY §5, usage-model §3). first() counts 1 row: all S3 uses are
// indexed single-row lookups.
import type { BatchDB, Statement } from "./seed.ts";

export interface D1Meta {
  rows_read: number;
  rows_written: number;
}

export interface D1Bound {
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[]; meta: D1Meta }>;
  run(): Promise<{ meta: D1Meta & { changes: number } }>;
}

export interface D1Database {
  prepare(query: string): { bind(...values: unknown[]): D1Bound };
  batch(statements: D1Bound[]): Promise<{ meta: D1Meta & { changes: number } }[]>;
}

export function newMeta(): D1Meta {
  return { rows_read: 0, rows_written: 0 };
}

export async function first<T>(
  meta: D1Meta,
  db: D1Database,
  sql: string,
  ...params: unknown[]
): Promise<T | null> {
  const row = await db.prepare(sql).bind(...params).first<T>();
  meta.rows_read += 1;
  return row;
}

export async function all<T>(
  meta: D1Meta,
  db: D1Database,
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  const res = await db.prepare(sql).bind(...params).all<T>();
  meta.rows_read += res.meta.rows_read;
  meta.rows_written += res.meta.rows_written;
  return res.results;
}

export async function run(
  meta: D1Meta,
  db: D1Database,
  sql: string,
  ...params: unknown[]
): Promise<number> {
  const res = await db.prepare(sql).bind(...params).run();
  meta.rows_read += res.meta.rows_read;
  meta.rows_written += res.meta.rows_written;
  return res.meta.changes;
}

function isTxnMarker(sql: string): boolean {
  const keyword = sql.trim().toUpperCase();
  return keyword === "BEGIN" || keyword === "COMMIT";
}

/** BatchDB over D1: strips txn markers, one batch() call, tracks meta. */
export function d1BatchDb(db: D1Database, meta: D1Meta): BatchDB {
  return {
    batch: async (statements: Statement[]) => {
      const prepared = statements
        .filter((s) => !isTxnMarker(s.sql))
        .map((s) => db.prepare(s.sql).bind(...s.params));
      const results = await db.batch(prepared);
      return results.map((r) => {
        meta.rows_read += r.meta.rows_read;
        meta.rows_written += r.meta.rows_written;
        return { changes: r.meta.changes };
      });
    },
  };
}
