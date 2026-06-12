import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChannelType, DriftRootCause, DriftStatus, TenantChannelStatus } from "@prisma/client";
import { QUEUE_JOB_NAMES } from "../queues/queue.constants";
import { ScanProcessorService } from "./scan-processor.service";

describe("ScanProcessorService", () => {
  it("detects drift, records it, queues a fix, and advances the scheduled cursor", async () => {
    const calls: {
      cursorUpdate?: unknown;
      driftCreate?: { data: Record<string, unknown> };
      queuedFix?: {
        name: string;
        payload: Record<string, unknown>;
        options: Record<string, unknown>;
      };
    } = {};

    const prisma = {
      tenantChannelConfig: {
        findUnique: async () => tenantConfig(),
      },
      driftScanCursor: {
        upsert: async () => ({
          tenantId: "tenant_1",
          channel: ChannelType.SHOPIFY,
          lastSeenAt: null,
          lastSeenId: null,
        }),
        update: async (args: unknown) => {
          calls.cursorUpdate = args;
          return args;
        },
      },
      tenantSkuLocationMap: {
        findFirst: async () => skuLocationMap(),
      },
      inventorySyncOutbox: {
        findFirst: async () => null,
      },
      driftEvent: {
        findFirst: async () => null,
        create: async (args: { data: Record<string, unknown> }) => {
          calls.driftCreate = args;
          return {
            id: "drift_1",
            ...args.data,
          };
        },
        updateMany: async () => ({ count: 0 }),
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
          id: args.where.id,
          ...args.data,
        }),
      },
    };
    const omsReader = {
      readChangedInventory: async () => [
        {
          rowId: "row_2",
          sku: "SKU-1",
          locationId: "loc_1",
          stockedQuantity: 12,
          reservedQuantity: 2,
          updatedAt: new Date("2026-05-27T00:04:00Z"),
        },
      ],
    };
    const shopifyInventory = {
      getAvailableQuantity: async () => 7,
    };
    const queueService = {
      getQueue: () => ({
        add: async (name: string, payload: Record<string, unknown>, options: Record<string, unknown>) => {
          calls.queuedFix = { name, payload, options };
          return { id: options.jobId };
        },
      }),
    };

    const service = new ScanProcessorService(
      prisma as never,
      omsReader as never,
      shopifyInventory as never,
      queueService as never,
      sideEffects().alerts as never,
      sideEffects().live as never,
      sideEffects().risk as never,
      sideEffects().rootCause as never,
    );

    const result = await service.process({
      tenantId: "tenant_1",
      channel: "SHOPIFY",
      trigger: "scheduled",
      reason: "periodic-scan",
      windowStart: "2026-05-27T00:00:00.000Z",
      windowEnd: "2026-05-27T00:05:00.000Z",
    });

    assert.deepEqual(result, {
      tenantId: "tenant_1",
      comparedRows: 1,
      detectedDrifts: 1,
      resolvedDuringScan: 0,
      failedManual: 0,
      cursorAdvanced: true,
    });
    assert.deepEqual(calls.driftCreate?.data, {
      tenantId: "tenant_1",
      channel: ChannelType.SHOPIFY,
      sku: "SKU-1",
      locationId: "loc_1",
      omsAvailable: 10,
      channelAvailable: 7,
      drift: 3,
      status: DriftStatus.FIX_QUEUED,
      reason: "AUTO_FIX_QUEUED",
      rootCause: DriftRootCause.MANUAL_SHOPIFY_EDIT,
      expectedSellable: 10,
      shopifyAvailable: 7,
      lastSyncJobId: undefined,
      lostRevenueRisk: 3,
    });
    assert.equal(calls.queuedFix?.name, QUEUE_JOB_NAMES.FIX_DRIFT);
    assert.match(String(calls.queuedFix?.options.jobId), /^fix_tenant_1_SHOPIFY_SKU-1_loc_1_10_/);
    assert.deepEqual(calls.queuedFix?.payload, {
      driftEventId: "drift_1",
      tenantId: "tenant_1",
      channel: "SHOPIFY",
      sku: "SKU-1",
      locationId: "loc_1",
      targetQty: 10,
      cause: "scan-detected",
      idempotencyKey: "fix:tenant_1:SHOPIFY:SKU-1:loc_1:10:2026-05-27T00:00:00.000Z:2026-05-27T00:05:00.000Z",
    });
    assert.deepEqual(calls.cursorUpdate, {
      where: {
        tenantId_channel: {
          tenantId: "tenant_1",
          channel: ChannelType.SHOPIFY,
        },
      },
      data: {
        lastSeenAt: new Date("2026-05-27T00:04:00Z"),
        lastSeenId: "row_2",
      },
    });
  });

  it("marks missing SKU/location mappings as manual failures without queueing a fix", async () => {
    let queued = false;
    const driftEvents: Record<string, unknown>[] = [];
    const prisma = {
      tenantChannelConfig: {
        findUnique: async () => tenantConfig(),
      },
      driftScanCursor: {
        upsert: async () => ({
          tenantId: "tenant_1",
          channel: ChannelType.SHOPIFY,
          lastSeenAt: null,
          lastSeenId: null,
        }),
        update: async (args: unknown) => args,
      },
      tenantSkuLocationMap: {
        findFirst: async () => null,
      },
      inventorySyncOutbox: {
        findFirst: async () => null,
      },
      driftEvent: {
        findFirst: async () => null,
        create: async (args: { data: Record<string, unknown> }) => {
          driftEvents.push(args.data);
          return {
            id: "drift_1",
            ...args.data,
          };
        },
      },
    };
    const omsReader = {
      readChangedInventory: async () => [
        {
          rowId: "row_1",
          sku: "SKU-1",
          locationId: "loc_1",
          stockedQuantity: 1,
          reservedQuantity: 5,
          updatedAt: new Date("2026-05-27T00:04:00Z"),
        },
      ],
    };
    const queueService = {
      getQueue: () => ({
        add: async () => {
          queued = true;
        },
      }),
    };

    const service = new ScanProcessorService(
      prisma as never,
      omsReader as never,
      {} as never,
      queueService as never,
      sideEffects().alerts as never,
      sideEffects().live as never,
      sideEffects().risk as never,
      sideEffects().rootCause as never,
    );

    const result = await service.process({
      tenantId: "tenant_1",
      channel: "SHOPIFY",
      trigger: "scheduled",
      windowStart: "2026-05-27T00:00:00.000Z",
      windowEnd: "2026-05-27T00:05:00.000Z",
    });

    assert.equal(result.failedManual, 1);
    assert.equal(result.detectedDrifts, 0);
    assert.equal(queued, false);
    assert.deepEqual(driftEvents[0], {
      tenantId: "tenant_1",
      channel: ChannelType.SHOPIFY,
      sku: "SKU-1",
      locationId: "loc_1",
      omsAvailable: 0,
      channelAvailable: 0,
      drift: 0,
      status: DriftStatus.FAILED_MANUAL,
      reason: "MAPPING_MISSING",
      rootCause: DriftRootCause.MAPPING_MISSING,
      expectedSellable: 0,
      shopifyAvailable: 0,
      lastSyncJobId: undefined,
      lostRevenueRisk: 0,
    });
  });
});

function tenantConfig() {
  return {
    id: "config_1",
    tenantId: "tenant_1",
    channel: ChannelType.SHOPIFY,
    status: TenantChannelStatus.ACTIVE,
    shopDomain: "demo.myshopify.com",
    encryptedAccessToken: "plain-token",
    apiVersion: "2025-10",
    createdAt: new Date("2026-05-27T00:00:00Z"),
    updatedAt: new Date("2026-05-27T00:00:00Z"),
  };
}

function skuLocationMap() {
  return {
    id: "map_1",
    tenantId: "tenant_1",
    channel: ChannelType.SHOPIFY,
    sku: "SKU-1",
    omsLocationId: "loc_1",
    shopifyInventoryItemId: "123",
    shopifyLocationId: "456",
    isActive: true,
    createdAt: new Date("2026-05-27T00:00:00Z"),
    updatedAt: new Date("2026-05-27T00:00:00Z"),
  };
}

function sideEffects() {
  return {
    alerts: {
      notifyDriftDetected: async () => undefined,
      notifyFixFailed: async () => undefined,
    },
    live: {
      publish: () => undefined,
    },
    risk: {
      refreshForEvent: async () => undefined,
    },
    rootCause: {
      classify: async (input: { reason?: string }) =>
        input.reason === "MAPPING_MISSING"
          ? DriftRootCause.MAPPING_MISSING
          : DriftRootCause.MANUAL_SHOPIFY_EDIT,
    },
  };
}
