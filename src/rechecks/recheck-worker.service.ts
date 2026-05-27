import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { RecheckStatus } from "@prisma/client";
import { Job, Worker } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { QUEUE_JOB_NAMES, QUEUE_NAMES } from "../queues/queue.constants";
import { QueueService } from "../queues/queue.service";
import { RecheckJobPayload, RecheckJobResult } from "./recheck-job.types";
import { RecheckProcessorService } from "./recheck-processor.service";

@Injectable()
export class RecheckWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecheckWorkerService.name);
  private worker: Worker<RecheckJobPayload, RecheckJobResult> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly recheckProcessor: RecheckProcessorService,
  ) {}

  onModuleInit() {
    if (process.env.WORKER_ENABLED === "false") {
      this.logger.warn("Recheck worker disabled by WORKER_ENABLED=false");
      return;
    }

    const concurrency = Number(process.env.DRIFT_RECHECK_CONCURRENCY ?? 5);
    this.worker = new Worker<RecheckJobPayload, RecheckJobResult>(
      QUEUE_NAMES.DRIFT_RECHECK,
      (job) => this.process(job),
      {
        connection: this.queueService.getConnection(),
        concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 5,
      },
    );

    this.worker.on("completed", (job, result) => {
      this.logger.log(
        `recheck job ${String(job.id)} completed for ${result.tenantId}:${result.sku}:${result.locationId}`,
      );
    });

    this.worker.on("failed", (job, error) => {
      this.logger.error(`recheck job ${String(job?.id)} failed`, error?.stack ?? String(error));
      if (job && this.isTerminalFailure(job)) {
        void this.prisma.webhookRecheckEvent.update({
          where: { id: job.data.webhookRecheckEventId },
          data: { status: RecheckStatus.FAILED },
        });
      }
    });

    this.logger.log(`Recheck worker listening on queue ${QUEUE_NAMES.DRIFT_RECHECK}`);
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  private process(job: Job<RecheckJobPayload, RecheckJobResult>) {
    if (job.name !== QUEUE_JOB_NAMES.RECHECK_INVENTORY) {
      this.logger.warn(`Skipping unexpected job "${job.name}" on ${QUEUE_NAMES.DRIFT_RECHECK}`);
      return Promise.resolve({
        webhookRecheckEventId: job.data.webhookRecheckEventId,
        tenantId: job.data.tenantId,
        sku: job.data.sku,
        locationId: job.data.locationId,
        detectedDrifts: 0,
        resolvedDuringScan: 0,
        failedManual: 0,
      });
    }

    return this.recheckProcessor.process(job.data);
  }

  private isTerminalFailure(job: Job<RecheckJobPayload, RecheckJobResult>) {
    return job.attemptsMade >= Number(job.opts.attempts ?? 1);
  }
}
