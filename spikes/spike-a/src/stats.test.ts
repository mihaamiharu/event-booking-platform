// Unit coverage for bench percentile math (NFR-005: requirement ID in name).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { summarize } from "./stats.ts";

describe("acc-001 spike-a percentile summary", () => {
  it("computes p50/p99/mean/max on a known sample", () => {
    const s = summarize([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
    assert.equal(s.n, 10);
    assert.equal(s.p50, 5);
    assert.equal(s.p99, 100);
    assert.equal(s.max, 100);
    assert.ok(Math.abs(s.mean - 14.5) < 1e-9);
  });

  it("rejects empty samples", () => {
    assert.throws(() => summarize([]), /no samples/);
  });
});
