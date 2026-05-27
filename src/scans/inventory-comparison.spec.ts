import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateOmsAvailable,
  compareInventory,
  normalizeDriftThreshold,
} from "./inventory-comparison";

describe("inventory comparison", () => {
  it("calculates OMS available quantity and clamps negatives to zero", () => {
    assert.equal(calculateOmsAvailable(10, 4), 6);
    assert.equal(calculateOmsAvailable(4, 10), 0);
  });

  it("detects exact drift by default", () => {
    const comparison = compareInventory({
      omsAvailable: 10,
      channelAvailable: 9,
    });

    assert.equal(comparison.drift, 1);
    assert.equal(comparison.threshold, 0);
    assert.equal(comparison.hasDrift, true);
  });

  it("suppresses drift inside the configured threshold", () => {
    assert.equal(
      compareInventory({
        omsAvailable: 10,
        channelAvailable: 9,
        threshold: 1,
      }).hasDrift,
      false,
    );
    assert.equal(
      compareInventory({
        omsAvailable: 10,
        channelAvailable: 8,
        threshold: 1,
      }).hasDrift,
      true,
    );
  });

  it("normalizes invalid thresholds back to exact-match mode", () => {
    assert.equal(normalizeDriftThreshold("not-a-number"), 0);
    assert.equal(normalizeDriftThreshold(-1), 0);
    assert.equal(normalizeDriftThreshold(1.9), 1);
  });

  it("rejects invalid inventory quantities instead of storing NaN drift", () => {
    assert.throws(() => calculateOmsAvailable(Number.NaN, 0), /Invalid inventory quantity/);
    assert.throws(
      () => compareInventory({ omsAvailable: 1, channelAvailable: Number.POSITIVE_INFINITY }),
      /Invalid inventory quantity/,
    );
  });
});
