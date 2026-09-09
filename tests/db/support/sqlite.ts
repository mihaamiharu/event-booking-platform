// node:sqlite BatchDB adapter for DB-state tests (WSP-004, NFR-007).
// Real BEGIN/COMMIT transactions; no D1 involved. Test-only.
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { BatchDB, BatchResult, Statement } from "../../../worker/src/seed.ts";

function isTxnMarker(sql: string): boolean {
  const keyword = sql.trim().toUpperCase();
  return keyword === "BEGIN" || keyword === "COMMIT";
}

/**
 * D1 accepts numbered positional placeholders such as ?1 and ?2. Node's
 * sqlite binding expects anonymous positional placeholders when values are
 * passed as arguments, so expand the numbered references while preserving
 * repeated references to the same input value.
 */
function sqliteParams(sql: string, params: SQLInputValue[]): { sql: string; params: SQLInputValue[] } {
  if (!/\?\d+/.test(sql)) return { sql, params };
  const bound: SQLInputValue[] = [];
  const normalized = sql.replace(/\?(\d+)/g, (_match, number: string) => {
    const index = Number(number) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= params.length) {
      throw new Error(`invalid numbered SQLite placeholder: ?${number}`);
    }
    bound.push(params[index]!);
    return "?";
  });
  return { sql: normalized, params: bound };
}

export class SqliteBatchDB implements BatchDB {
  protected db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    // Match D1: FOREIGN KEYs enforced (proven on local D1 2026-09-07 —
    // node:sqlite leaves them off by default, which once hid an illegal
    // delete order in RESET_TABLES).
    this.db.exec("PRAGMA foreign_keys = ON");
  }

  /** Hook before each data statement (fault injection overrides it). */
  protected onStatement(_index: number): void {}

  async batch(statements: Statement[]): Promise<BatchResult[]> {
    const results: BatchResult[] = [];
    this.db.exec("BEGIN");
    try {
      let index = 0;
      for (const s of statements) {
        if (isTxnMarker(s.sql)) continue;
        this.onStatement(index++);
        const prepared = sqliteParams(s.sql, s.params as SQLInputValue[]);
        const stmt = this.db.prepare(prepared.sql);
        const info = stmt.run(...prepared.params);
        results.push({ changes: Number(info.changes) });
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return results;
  }
}

/** Apply a forward-only migration file (strips `--` comments first). */
export function applyMigration(db: DatabaseSync, sql: string): void {
  const stripped = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  for (const stmt of stripped.split(";")) {
    if (stmt.trim().length > 0) db.exec(stmt);
  }
}

/** Adapter that throws mid-batch (atomic-failure test → must roll back). */
export class FaultyBatchDB extends SqliteBatchDB {
  private failAfter: number;

  constructor(db: DatabaseSync, failAfter: number) {
    super(db);
    this.failAfter = failAfter;
  }

  override onStatement(index: number): void {
    if (index >= this.failAfter) throw new Error("injected fault");
  }
}
