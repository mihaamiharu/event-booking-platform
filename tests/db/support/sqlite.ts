// node:sqlite BatchDB adapter for DB-state tests (WSP-004, NFR-007).
// Real BEGIN/COMMIT transactions; no D1 involved. Test-only.
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { BatchDB, BatchResult, Statement } from "../../../worker/src/seed.ts";

function isTxnMarker(sql: string): boolean {
  const keyword = sql.trim().toUpperCase();
  return keyword === "BEGIN" || keyword === "COMMIT";
}

export class SqliteBatchDB implements BatchDB {
  protected db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
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
        const stmt = this.db.prepare(s.sql);
        const info = stmt.run(...(s.params as SQLInputValue[]));
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
