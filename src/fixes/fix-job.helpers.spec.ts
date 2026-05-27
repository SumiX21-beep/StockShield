import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDriftLockKey, buildFixIdempotencyKey } from "./fix-job.helpers";

describe("fix job helpers", () => {
  it("builds deterministic fix idempotency keys", () => {
    const key = buildFixIdempotencyKey({
      tenantId: "tenant_1",
      channel: "SHOPIFY",
      sku: "SKU-123",
      locationId: "loc_1",
      targetQty: 42,
      scanWindow: "2026-05-27T00:00:00Z:2026-05-27T00:05:00Z",
    });

    assert.equal(
      key,
      "fix:tenant_1:SHOPIFY:SKU-123:loc_1:42:2026-05-27T00:00:00Z:2026-05-27T00:05:00Z",
    );
  });

  it("builds drift lock keys in the documented Redis format", () => {
    const key = buildDriftLockKey({
      tenantId: "tenant_1",
      sku: "SKU-123",
      locationId: "loc_1",
    });

    assert.equal(key, "lock:drift:tenant_1:shopify:SKU-123:loc_1");
  });
});
