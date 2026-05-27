import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DriftAttemptStatus,
  DriftStatus,
  RecheckStatus,
} from "@prisma/client";
import { QUEUE_NAMES } from "../queues/queue.constants";
import { ObservabilityService } from "./observability.service";

describe("ObservabilityService", () => {
  it("returns zero-filled status metrics and queue lag", async () => {
    const now = Date.now();
    const prisma = {
      driftEvent: {
        groupBy: async () => [
          { status: DriftStatus.FIX_QUEUED, _count: { status: 2 } },
          { status: DriftStatus.FAILED_MANUAL, _count: { status: 1 } },
        ],
      },
      driftAttemptLog: {
        groupBy: async () => [
          { status: DriftAttemptStatus.SUCCESS, _count: { status: 3 } },
          { status: DriftAttemptStatus.FAILED, _count: { status: 1 } },
        ],
      },
      webhookRecheckEvent: {
        groupBy: async () => [
          { status: RecheckStatus.FAILED, _count: { status: 1 } },
        ],
      },
    };
    const queueService = {
      getQueue: () => ({
        getJobCounts: async () => ({
          waiting: 1,
          active: 0,
          delayed: 0,
          completed: 10,
          failed: 1,
          paused: 0,
        }),
        getJobs: async () => [{ timestamp: now - 5_000 }],
      }),
    };
    const service = new ObservabilityService(prisma as never, queueService as never);

    const metrics = await service.metrics({ tenantId: "tenant_1" });

    assert.equal(metrics.tenantId, "tenant_1");
    assert.equal(metrics.driftEvents.byStatus[DriftStatus.DETECTED], 0);
    assert.equal(metrics.driftEvents.byStatus[DriftStatus.FIX_QUEUED], 2);
    assert.equal(metrics.driftEvents.failedManual, 1);
    assert.equal(metrics.fixAttempts.successRate, 0.75);
    assert.equal(metrics.webhookRechecks.failed, 1);
    const fixQueue = metrics.queues[QUEUE_NAMES.DRIFT_FIX];
    assert.equal(fixQueue.available, true);
    if (fixQueue.lagMs === null) {
      assert.fail("expected fix queue lag to be available");
    }
    assert.equal(fixQueue.lagMs >= 0, true);
  });

  it("lists DLQ jobs and filters by tenant", async () => {
    const queueService = {
      getQueue: (name: string) => {
        assert.equal(name, QUEUE_NAMES.DRIFT_DLQ);
        return {
          getJobs: async () => [
            dlqJob("dlq_1", "tenant_1"),
            dlqJob("dlq_2", "tenant_2"),
          ],
        };
      },
    };
    const service = new ObservabilityService({} as never, queueService as never);

    const result = await service.dlq({ tenantId: "tenant_1", limit: 20 });

    assert.equal(result.queue, QUEUE_NAMES.DRIFT_DLQ);
    assert.equal(result.items.length, 1);
    assert.deepEqual(result.items[0], {
      id: "dlq_1",
      name: "dlq-fix",
      tenantId: "tenant_1",
      driftEventId: "drift_tenant_1",
      sku: "SKU-1",
      locationId: "loc_1",
      sourceQueue: QUEUE_NAMES.DRIFT_FIX,
      sourceJobId: "fix_tenant_1",
      attemptsMade: 8,
      maxAttempts: 8,
      error: "MAPPING_MISSING",
      failedAt: "2026-05-27T00:00:00.000Z",
      enqueuedAt: "2026-05-27T00:00:01.000Z",
    });
  });
});

function dlqJob(id: string, tenantId: string) {
  return {
    id,
    name: "dlq-fix",
    timestamp: new Date("2026-05-27T00:00:01.000Z").getTime(),
    data: {
      sourceQueue: QUEUE_NAMES.DRIFT_FIX,
      sourceJobId: `fix_${tenantId}`,
      payload: {
        tenantId,
        driftEventId: `drift_${tenantId}`,
        sku: "SKU-1",
        locationId: "loc_1",
      },
      error: "MAPPING_MISSING",
      attemptsMade: 8,
      maxAttempts: 8,
      failedAt: "2026-05-27T00:00:00.000Z",
    },
  };
}
