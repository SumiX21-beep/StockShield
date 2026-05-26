import { Injectable } from "@nestjs/common";
import { QUEUE_NAMES } from "../queues/queue.constants";
import { QueueService } from "../queues/queue.service";
import { TriggerScanDto } from "./dto/trigger-scan.dto";

@Injectable()
export class ScansService {
  constructor(private readonly queueService: QueueService) {}

  async trigger(input: TriggerScanDto) {
    const now = new Date();
    const windowStart = input.windowStart ?? new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const windowEnd = input.windowEnd ?? now.toISOString();
    const queue = this.queueService.getQueue(QUEUE_NAMES.DRIFT_SCAN);
    const jobId = [
      "manual-scan",
      input.tenantId,
      input.sku ?? "all-skus",
      input.locationId ?? "all-locations",
      windowStart,
      windowEnd,
    ].join(":");

    const job = await queue.add(
      "scan-tenant",
      {
        tenantId: input.tenantId,
        channel: "SHOPIFY",
        trigger: "manual",
        sku: input.sku,
        locationId: input.locationId,
        reason: input.reason,
        windowStart,
        windowEnd,
      },
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
