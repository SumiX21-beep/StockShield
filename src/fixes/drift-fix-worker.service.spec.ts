import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QUEUE_JOB_NAMES, QUEUE_NAMES } from "../queues/queue.constants";
import { DriftFixWorkerService } from "./drift-fix-worker.service";
import { FixJobPayload } from "./fix-job.types";

describe("DriftFixWorkerService", () => {
  it("enqueues failed-manual fix results into the DLQ", async () => {
    const dlqAdds: {
      name: string;
      payload: Record<string, unknown>;
      options: Record<string, unknown>;
    }[] = [];
    const queueService = {
      getQueue: (name: string) => {
        assert.equal(name, QUEUE_NAMES.DRIFT_DLQ);
        return {
          add: async (
            jobName: string,
            payload: Record<string, unknown>,
            options: Record<string, unknown>,
          ) => {
            dlqAdds.push({ name: jobName, payload, options });
            return { id: options.jobId };
          },
        };
      },
    };
    const fixProcessor = {
      process: async () => ({
        driftEventId: "drift_1",
        status: "failed-manual" as const,
        targetQty: 10,
        message: "MAPPING_MISSING",
      }),
    };
    const worker = new DriftFixWorkerService(queueService as never, fixProcessor as never);

    const result = await callProcess(worker, {
      id: "fix_job_1",
      name: QUEUE_JOB_NAMES.FIX_DRIFT,
      data: fixPayload(),
      attemptsMade: 8,
      opts: { attempts: 8 },
    });

    assert.equal(result.status, "failed-manual");
    assert.equal(dlqAdds.length, 1);
    assert.equal(dlqAdds[0].name, QUEUE_JOB_NAMES.DLQ_FIX);
    assert.equal(dlqAdds[0].options.jobId, `dlq__${QUEUE_NAMES.DRIFT_FIX}__fix_job_1`);
    assert.deepEqual(dlqAdds[0].payload, {
      sourceQueue: QUEUE_NAMES.DRIFT_FIX,
      sourceJobId: "fix_job_1",
      sourceJobName: QUEUE_JOB_NAMES.FIX_DRIFT,
      payload: fixPayload(),
      result: {
        driftEventId: "drift_1",
        status: "failed-manual",
        targetQty: 10,
        message: "MAPPING_MISSING",
      },
      error: "MAPPING_MISSING",
      attemptsMade: 8,
      maxAttempts: 8,
      failedAt: dlqAdds[0].payload.failedAt,
    });
    assert.match(String(dlqAdds[0].payload.failedAt), /^\d{4}-\d{2}-\d{2}T/);
  });
});

function callProcess(
  worker: DriftFixWorkerService,
  job: {
    id: string;
    name: string;
    data: FixJobPayload;
    attemptsMade: number;
    opts: { attempts: number };
  },
) {
  return (worker as unknown as {
    process: (input: typeof job) => Promise<{ status: string }>;
  }).process(job);
}

function fixPayload(): FixJobPayload {
  return {
    driftEventId: "drift_1",
    tenantId: "tenant_1",
    channel: "SHOPIFY",
    sku: "SKU-1",
    locationId: "loc_1",
    targetQty: 10,
    cause: "scan-detected",
    idempotencyKey: "fix:tenant_1:SHOPIFY:SKU-1:loc_1:10:window",
  };
}
