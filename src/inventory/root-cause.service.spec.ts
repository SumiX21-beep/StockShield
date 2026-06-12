import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DriftRootCause, InventoryLedgerMovementType, InventorySyncStatus } from "@prisma/client";
import { RootCauseService } from "./root-cause.service";

describe("RootCauseService", () => {
  it("classifies missing mappings first", async () => {
    const service = new RootCauseService(prismaMock({
      mapping: null,
    }) as never);

    assert.equal(
      await service.classify({
        tenantId: "tenant_1",
        sku: "SKU-1",
        locationId: "loc_1",
        reason: "MAPPING_MISSING",
      }),
      DriftRootCause.MAPPING_MISSING,
    );
  });

  it("classifies failed sync jobs as failed sync", async () => {
    const service = new RootCauseService(prismaMock({
      mapping: { id: "map_1" },
      failedSync: { id: "sync_1", status: InventorySyncStatus.FAILED },
    }) as never);

    assert.equal(
      await service.classify({
        tenantId: "tenant_1",
        sku: "SKU-1",
        locationId: "loc_1",
      }),
      DriftRootCause.FAILED_SYNC,
    );
  });

  it("classifies recent return/cancel movements", async () => {
    const service = new RootCauseService(prismaMock({
      mapping: { id: "map_1" },
      balance: { physicalQuantity: 10, reservedQuantity: 0 },
      recentReturnOrCancel: { movementType: InventoryLedgerMovementType.ORDER_CANCELLED },
    }) as never);

    assert.equal(
      await service.classify({
        tenantId: "tenant_1",
        sku: "SKU-1",
        locationId: "loc_1",
      }),
      DriftRootCause.RETURN_CANCEL_MISMATCH,
    );
  });
});

function prismaMock(input: {
  mapping?: unknown;
  failedSync?: unknown;
  balance?: unknown;
  recentReturnOrCancel?: unknown;
}) {
  return {
    tenantSkuLocationMap: {
      findFirst: async () => input.mapping ?? null,
    },
    inventorySyncOutbox: {
      findFirst: async () => input.failedSync ?? null,
    },
    inventoryBalance: {
      findUnique: async () => input.balance ?? null,
    },
    inventoryLedgerEntry: {
      findFirst: async () => input.recentReturnOrCancel ?? null,
    },
  };
}
