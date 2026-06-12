import { Injectable } from "@nestjs/common";
import { bullMqJobId } from "../queues/bullmq-job-id";
import { QUEUE_JOB_NAMES, QUEUE_NAMES } from "../queues/queue.constants";
import { QueueService } from "../queues/queue.service";
import { TriggerScanDto } from "./dto/trigger-scan.dto";
import { ScanJobPayload } from "./scan-job.types";

@Injectable()
export class ScansService {
  constructor(private readonly queueService: QueueService) {}

  async trigger(input: TriggerScanDto) {
    const now = new Date();
    const windowStart = input.windowStart ?? new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const windowEnd = input.windowEnd ?? now.toISOString();
    const queue = this.queueService.getQueue(QUEUE_NAMES.DRIFT_SCAN);
    const payload: ScanJobPayload = {
      tenantId: input.tenantId,
      channel: "SHOPIFY",
      trigger: "manual",
      sku: input.sku,
      locationId: input.locationId,
      reason: input.reason,
      windowStart,
      windowEnd,
    };
    const jobId = bullMqJobId(
      "manual-scan",
      input.tenantId,
      input.sku ?? "all-skus",
      input.locationId ?? "all-locations",
      windowStart,
      windowEnd,
    );

    const job = await queue.add(
      QUEUE_JOB_NAMES.SCAN_TENANT,
      payload,
      { jobId },
    );

    return {
      queued: true,
      queue: QUEUE_NAMES.DRIFT_SCAN,
      jobId: job.id,
      tenantId: input.tenantId,
      windowStart,
      windowEnd,
    };
  }
}
