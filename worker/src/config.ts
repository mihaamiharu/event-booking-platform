// Shared worker config (NFR-001, NFR-009). S5 chooses prod D1 typing;
// until then this minimal structural interface keeps S1 dependency-free.

// Minimal structural D1 typing (spike-B pattern; S5 revisits).
export interface D1Database {
  prepare(query: string): unknown;
  batch(statements: unknown[]): Promise<unknown[]>;
}

export interface WorkerEnv {
  DB: D1Database;
  SEED_VERSION?: string;
}

export const SEED_VERSION_FALLBACK = "r1-v1";

// SPIKE-A lock (ACC-001, NFR-001): PBKDF2-SHA256 verify p99 ≤ 5 ms.
// Preview verdict: 50k succeeds with margin; 150k hard-fails (error 1101).
export const PASSWORD_PBKDF2_ITERATIONS = 50_000;

export function seedVersion(env: Partial<WorkerEnv>): string {
  return env.SEED_VERSION ?? SEED_VERSION_FALLBACK;
}
