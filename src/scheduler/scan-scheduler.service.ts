import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ChannelType, TenantChannelStatus } from "@prisma/client";
import { QUEUE_JOB_NAMES, QUEUE_NAMES } from "../queues/queue.constants";
import { QueueService } from "../queues/queue.service";
import { PrismaService } from "../prisma/prisma.service";
import { ScanJobPayload } from "../scans/scan-job.types";

@Injectable()
export class ScanSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScanSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async onModuleInit() {
    if (process.env.SCHEDULER_ENABLED === "false") {
      this.logger.warn("Scheduler disabled by SCHEDULER_ENABLED=false");
      return;
    }

    await this.enqueueCycle();
    const intervalMs = this.intervalMs();
    this.timer = setInterval(() => {
      void this.enqueueCycle();
    }, intervalMs);

    this.logger.log(`Scheduler started with interval ${intervalMs}ms`);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async enqueueCycle() {
    const configs = await this.prisma.tenantChannelConfig.findMany({
      where: {
        channel: ChannelType.SHOPIFY,
        status: TenantChannelStatus.ACTIVE,
      },
      select: {
        tenantId: true,
      },
    });

    if (!configs.length) {
      return;
    }

    const intervalMs = this.intervalMs();
    const now = new Date();
    const slot = Math.floor(now.getTime() / intervalMs);
    const windowEnd = now.toISOString();
    const windowStart = new Date(now.getTime() - intervalMs).toISOString();
    const queue = this.queueService.getQueue(QUEUE_NAMES.DRIFT_SCAN);

    const jobs = configs.map((config) => {
      const payload: ScanJobPayload = {
        tenantId: config.tenantId,
        channel: "SHOPIFY",
        trigger: "scheduled",
        reason: "periodic-scan",
        windowStart,
        windowEnd,
      };

      return queue.add(QUEUE_JOB_NAMES.SCAN_TENANT, payload, {
        jobId: `scheduled-scan:${config.tenantId}:${slot}`,
      });
    });

    const settled = await Promise.allSettled(jobs);
    const queued = settled.filter((result) => result.status === "fulfilled").length;
    const failed = settled.length - queued;
    this.logger.log(`Scheduler cycle queued ${queued}/${settled.length} scan jobs${failed ? ` (${failed} failed)` : ""}`);
  }

  private intervalMs() {
    const minutes = Number(process.env.DRIFT_SCAN_INTERVAL_MINUTES ?? 5);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return 5 * 60 * 1000;
    }
    return Math.round(minutes * 60 * 1000);
  }
}
