// SPIKE-A bench driver (ACC-001, NFR-001) — Closes #21.
// Harness: sequential POSTs to local/preview /__spike/pbkdf2; server-side
// `ms` is the isolate CPU signal, client wall time is recorded alongside.
// Usage:
//   npm run dev            # terminal 1 (wrangler dev :8787, restart before cold reads)
//   npm run bench -- [--base http://127.0.0.1:8787 --runs 200]
// Env overrides: SPIKE_BASE, SPIKE_RUNS, SPIKE_ITERS, SPIKE_PASSWORD.

import { summarize } from "./stats.ts";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i];
  const v = process.argv[i + 1];
  if (k?.startsWith("--") && v !== undefined) args.set(k.slice(2), v);
}

const BASE = args.get("base") ?? process.env.SPIKE_BASE ?? "http://127.0.0.1:8787";
const RUNS = Number(args.get("runs") ?? process.env.SPIKE_RUNS ?? 200);
const ITERS = (args.get("iters") ?? process.env.SPIKE_ITERS ?? "10000,50000,100000,150000")
  .split(",")
  .map(Number);
const PASSWORD = process.env.SPIKE_PASSWORD ?? "Attend123!"; // TEST-DATA attendee_alex

interface BenchResp {
  iterations: number;
  ms: number;
  saltB64: string;
  digestPrefix: string;
}

async function postBench(iterations: number, saltB64: string): Promise<{ serverMs: number; wallMs: number }> {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/__spike/pbkdf2`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: PASSWORD, saltB64, iterations }),
  });
  const wallMs = performance.now() - t0;
  if (!res.ok) throw new Error(`HTTP ${res.status} at iterations=${iterations}`);
  const data = (await res.json()) as BenchResp;
  return { serverMs: data.ms, wallMs };
}

function fixedSalt(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
}

function fmt(n: number): string {
  return n.toFixed(2);
}

const budgetMs = 5;
let out = `# SPIKE-A local bench — ${new Date().toISOString()}\n\n`;
out += `base=${BASE} runs=${RUNS} password=<redacted fixture>\n\n`;
out += `| iterations | cold server ms | warm p50 | warm p99 | warm mean | warm max | client wall p99 | p99 ≤ 5ms |\n`;
out += `| --- | --- | --- | --- | --- | --- | --- | --- |\n`;

for (const iterations of ITERS) {
  const salt = fixedSalt();
  const cold = await postBench(iterations, salt); // first request after dev restart ≈ cold
  const serverSamples: number[] = [];
  const wallSamples: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const r = await postBench(iterations, salt);
    serverSamples.push(r.serverMs);
    wallSamples.push(r.wallMs);
  }
  const s = summarize(serverSamples);
  const w = summarize(wallSamples);
  const pass = s.p99 <= budgetMs ? "PASS" : "FAIL";
  console.log(
    `iterations=${iterations} cold=${fmt(cold.serverMs)}ms ` +
      `p50=${fmt(s.p50)} p99=${fmt(s.p99)} mean=${fmt(s.mean)} max=${fmt(s.max)} ` +
      `wall_p99=${fmt(w.p99)} → ${pass}`,
  );
  out += `| ${iterations} | ${fmt(cold.serverMs)} | ${fmt(s.p50)} | ${fmt(s.p99)} | ${fmt(s.mean)} | ${fmt(s.max)} | ${fmt(w.p99)} | ${pass} |\n`;
}

console.log("\n--- markdown ---\n" + out);
