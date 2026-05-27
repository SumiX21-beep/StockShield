import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RiskLevel } from "@prisma/client";
import { RiskService } from "./risk.service";

describe("RiskService", () => {
  it("classifies repeated drifts as high risk at the configured threshold", () => {
    withRiskEnv("3", () => {
      const service = new RiskService({} as never, {} as never, {} as never);

      assert.equal(service.levelForCount(1), RiskLevel.LOW);
      assert.equal(service.levelForCount(2), RiskLevel.MEDIUM);
      assert.equal(service.levelForCount(3), RiskLevel.HIGH);
    });
  });
});

function withRiskEnv(value: string, callback: () => void) {
  const previous = process.env.DRIFT_RISK_HIGH_THRESHOLD;
  try {
    process.env.DRIFT_RISK_HIGH_THRESHOLD = value;
    callback();
  } finally {
    if (previous === undefined) {
      delete process.env.DRIFT_RISK_HIGH_THRESHOLD;
    } else {
      process.env.DRIFT_RISK_HIGH_THRESHOLD = previous;
    }
  }
}
