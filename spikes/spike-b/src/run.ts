// SPIKE-B bench driver (BKG-002, BKG-003) — Closes #22.
// 25 parallel qty-1 checkouts vs capacity 5 per mode, then replay + conflict.
// Usage:
//   npm run dev              # terminal 1 (wrangler dev :8788)
//   npm run bench            # terminal 2 (runs batch, then gated)
// Env/flags: SPIKE_BASE / --base, SPIKE_N / --contenders (default 25).

export {};

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i];
  const v = process.argv[i + 1];
  if (k?.startsWith("--") && v !== undefined) args.set(k.slice(2), v);
}

const BASE = args.get("base") ?? process.env.SPIKE_BASE ?? "http://127.0.0.1:8788";
const N = Number(args.get("contenders") ?? process.env.SPIKE_N ?? 25);
const CAPACITY = 5;

type Mode = "batch" | "gated";

async function reset(capacity: number): Promise<void> {
  const res = await fetch(`${BASE}/__spike/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ capacity }),
  });
  if (!res.ok) throw new Error(`reset HTTP ${res.status}`);
}

async function state(): Promise<{
  capacity: number;
  confirmed: number;
  bookingRows: number;
  bookedQty: number;
  idempotencyRows: number;
}> {
  const res = await fetch(`${BASE}/__spike/state`);
  if (!res.ok) throw new Error(`state HTTP ${res.status}`);
  return (await res.json()) as never;
}

async function checkout(
  key: string,
  qty: number,
  mode: Mode,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE}/__spike/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, qty, mode }),
  });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = { raw: (await res.text()).slice(0, 120) };
  }
  return { status: res.status, body };
}

async function runMode(mode: Mode): Promise<string> {
  await reset(CAPACITY);
  const keys = Array.from({ length: N }, (_, i) => `${mode}-k${i}-${Date.now()}`);
  const settled = await Promise.all(keys.map((k) => checkout(k, 1, mode)));
  const tally = new Map<number, number>();
  for (const r of settled) tally.set(r.status, (tally.get(r.status) ?? 0) + 1);
  const s0 = await state();

  // replay: same key twice → 200 identical, state unchanged
  const replayKey = `${mode}-replay-${Date.now()}`;
  const r1 = await checkout(replayKey, 1, mode);
  const s1 = await state();
  const r2 = await checkout(replayKey, 1, mode);
  const s2 = await state();
  const replayOk =
    (r1.status === 201 || r1.status === 409) &&
    r2.status === (r1.status === 201 ? 200 : 409) &&
    JSON.stringify(s1) === JSON.stringify(s2);

  // conflict: same key, different qty → 409, state unchanged
  const conflictKey = `${mode}-conflict-${Date.now()}`;
  await checkout(conflictKey, 1, mode);
  const s3 = await state();
  const rc = await checkout(conflictKey, 2, mode);
  const s4 = await state();
  const conflictOk =
    rc.status === 409 && JSON.stringify(s3) === JSON.stringify(s4);

  const noOverbook = s0.confirmed <= CAPACITY;
  const noOrphans = s0.bookedQty === s0.confirmed;
  const winnersOk = (tally.get(201) ?? 0) === Math.min(CAPACITY, N);
  const verdict =
    noOverbook && noOrphans && winnersOk && replayOk && conflictOk ? "PASS" : "FAIL";

  const line =
    `mode=${mode} contenders=${N} cap=${CAPACITY} ` +
    `statuses=${[...tally.entries()].map(([k, v]) => `${k}x${v}`).join(",")} ` +
    `confirmed=${s0.confirmed} bookedQty=${s0.bookedQty} rows=${s0.bookingRows} ` +
    `replay=${replayOk ? "ok" : "BROKEN"} conflict=${conflictOk ? "ok" : "BROKEN"} ` +
    `orphans=${noOrphans ? "none" : "PRESENT"} → ${verdict}`;
  console.log(line);
  return `| ${mode} | ${N} | ${CAPACITY} | ${[...tally.entries()].map(([k, v]) => `${k}×${v}`).join(", ")} | ${s0.confirmed} | ${s0.bookedQty}/${s0.bookingRows} | ${replayOk ? "ok" : "BROKEN"} | ${conflictOk ? "ok" : "BROKEN"} | ${noOrphans ? "none" : "PRESENT"} | ${verdict} |`;
}

console.log(`SPIKE-B local bench base=${BASE}`);
const rows: string[] = [];
for (const mode of ["batch", "gated"] as Mode[]) rows.push(await runMode(mode));
console.log("\n--- markdown ---\n");
console.log(`| mode | contenders | capacity | statuses | confirmed | bookedQty/rows | replay | conflict | orphans | verdict |`);
console.log(`| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
for (const r of rows) console.log(r);
