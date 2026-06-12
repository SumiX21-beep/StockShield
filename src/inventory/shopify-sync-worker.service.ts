import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Job, Worker } from "bullmq";
import { QUEUE_JOB_NAMES, QUEUE_NAMES } from "../queues/queue.constants";
import { QueueService } from "../queues/queue.service";
import { InventorySyncJobPayload, InventorySyncJobResult } from "./inventory-sync-job.types";
import { ShopifySyncProcessorService } from "./shopify-sync-processor.service";

@Injectable()
export class ShopifySyncWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ShopifySyncWorkerService.name);
  private worker: Worker<InventorySyncJobPayload, InventorySyncJobResult> | null = null;

  constructor(
    private readonly queueService: QueueService,
    private readonly syncProcessor: ShopifySyncProcessorService,
  ) {}

  onModuleInit() {
    if (process.env.WORKER_ENABLED === "false") {
      this.logger.warn("Inventory sync worker disabled by WORKER_ENABLED=false");
      return;
    }

    const concurrency = Number(process.env.INVENTORY_SYNC_CONCURRENCY ?? 5);
    this.worker = new Worker<InventorySyncJobPayload, InventorySyncJobResult>(
      QUEUE_NAMES.INVENTORY_SYNC,
      (job) => this.process(job),
      {
        connection: this.queueService.getConnection(),
        concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 5,
      },
    );

    this.worker.on("completed", (job, result) => {
      this.logger.log(
        `inventory sync job ${String(job.id)} completed for ${result.syncJobId} (${result.status})`,
      );
    });

    this.worker.on("failed", (job, error) => {
      this.logger.error(`inventory sync job ${String(job?.id)} failed`, error?.stack ?? String(error));
    });

    this.logger.log(`Inventory sync worker listening on queue ${QUEUE_NAMES.INVENTORY_SYNC}`);
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  private process(job: Job<InventorySyncJobPayload, InventorySyncJobResult>) {
    if (job.name !== QUEUE_JOB_NAMES.SYNC_INVENTORY) {
      this.logger.warn(`Skipping unexpected job "${job.name}" on ${QUEUE_NAMES.INVENTORY_SYNC}`);
      return Promise.resolve({
        syncJobId: job.data.syncJobId,
        status: "skipped" as const,
        targetSellableQuantity: job.data.targetSellableQuantity,
        message: "Unexpected job name",
      });
    }

    return this.syncProcessor.process(job.data, {
      attemptsMade: job.attemptsMade,
      maxAttempts: Number(job.opts.attempts ?? 1),
    });
  }
}
