// Percentile helpers for SPIKE-A bench output (ACC-001, NFR-001).

export interface Summary {
  n: number;
  mean: number;
  p50: number;
  p99: number;
  max: number;
}

export function summarize(samples: number[]): Summary {
  if (samples.length === 0) throw new Error("no samples");
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const pick = (p: number): number => {
    const idx = Math.min(n - 1, Math.ceil((p / 100) * n) - 1);
    return sorted[Math.max(0, idx)];
  };
  return { n, mean, p50: pick(50), p99: pick(99), max: sorted[n - 1]! };
}
