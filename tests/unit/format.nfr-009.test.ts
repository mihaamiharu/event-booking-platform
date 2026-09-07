// Regional presentation unit tests (NFR-009, UI-DESIGN §7).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatIdr, formatWibRange } from "../../client/src/lib/format.ts";

describe("nfr-009 regional presentation", () => {
  it("formats IDR with code prefix and dot grouping, no decimals", () => {
    assert.equal(formatIdr(150000), "IDR 150.000");
    assert.equal(formatIdr(50000), "IDR 50.000");
    assert.equal(formatIdr(0), "IDR 0");
  });

  it("renders UTC instants as WIB day range with label", () => {
    // T0+14d session: 2026-09-18 09:00–12:00 WIB == 02:00–05:00Z.
    assert.equal(
      formatWibRange("2026-09-18T02:00:00.000Z", "2026-09-18T05:00:00.000Z"),
      "Fri, 18 Sep 2026 · 09:00–12:00 WIB",
    );
  });
});
