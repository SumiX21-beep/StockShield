import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateSellableQuantity } from "./inventory-math";

describe("inventory math", () => {
  it("calculates available-to-promise sellable stock with a safety buffer", () => {
    assert.equal(
      calculateSellableQuantity({
        physicalQuantity: 100,
        reservedQuantity: 5,
        safetyBuffer: 3,
      }),
      92,
    );
  });

  it("clamps sellable stock at zero", () => {
    assert.equal(
      calculateSellableQuantity({
        physicalQuantity: 2,
        reservedQuantity: 5,
        safetyBuffer: 1,
      }),
      0,
    );
  });
});
