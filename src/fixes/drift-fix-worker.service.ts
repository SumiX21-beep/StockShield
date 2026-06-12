import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Job, Worker } from "bullmq";
import { bullMqJobId } from "../queues/bullmq-job-id";
import { QUEUE_JOB_NAMES, QUEUE_NAMES } from "../queues/queue.constants";
import { QueueService } from "../queues/queue.service";
import { DriftFixProcessorService } from "./drift-fix-processor.service";
import { FixJobPayload, FixJobResult } from "./fix-job.types";

@Injectable()
export class DriftFixWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DriftFixWorkerService.name);
  private worker: Worker<FixJobPayload, FixJobResult> | null = null;

  constructor(
    private readonly queueService: QueueService,
    private readonly fixProcessor: DriftFixProcessorService,
  ) {}

  onModuleInit() {
    if (process.env.WORKER_ENABLED === "false") {
      this.logger.warn("Fix worker disabled by WORKER_ENABLED=false");
      return;
    }

    const concurrency = Number(process.env.DRIFT_FIX_CONCURRENCY ?? 8);
    this.worker = new Worker<FixJobPayload, FixJobResult>(
      QUEUE_NAMES.DRIFT_FIX,
      (job) => this.process(job),
      {
        connection: this.queueService.getConnection(),
        concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 8,
      },
    );

    this.worker.on("completed", (job, result) => {
      this.logger.log(
        `fix job ${String(job.id)} completed for drift ${result.driftEventId} (${result.status})`,
      );
    });

    this.worker.on("failed", (job, error) => {
      this.logger.error(`fix job ${String(job?.id)} failed`, error?.stack ?? String(error));
      if (job && this.isTerminalFailure(job)) {
        void this.enqueueDlq(job, error);
      }
    });

    this.logger.log(`Fix worker listening on queue ${QUEUE_NAMES.DRIFT_FIX}`);
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  private process(job: Job<FixJobPayload, FixJobResult>) {
    if (job.name !== QUEUE_JOB_NAMES.FIX_DRIFT) {
      this.logger.warn(`Skipping unexpected job "${job.name}" on ${QUEUE_NAMES.DRIFT_FIX}`);
      return Promise.resolve({
        driftEventId: job.data.driftEventId,
        status: "skipped" as const,
        targetQty: job.data.targetQty,
        message: "Unexpected job name",
      });
    }

    return this.fixProcessor.process(job.data, {
      attemptsMade: job.attemptsMade,
      maxAttempts: Number(job.opts.attempts ?? 1),
    }).then(async (result) => {
      if (result.status === "failed-manual") {
        await this.enqueueDlq(job, result.message ?? "FAILED_MANUAL", result);
      }

      return result;
    });
  }

  private isTerminalFailure(job: Job<FixJobPayload, FixJobResult>) {
    return job.attemptsMade >= Number(job.opts.attempts ?? 1);
  }

  private async enqueueDlq(job: Job<FixJobPayload, FixJobResult>, error: Error | string, result?: FixJobResult) {
    const message = error instanceof Error ? error.message : error;
    const queue = this.queueService.getQueue(QUEUE_NAMES.DRIFT_DLQ);
    await queue.add(QUEUE_JOB_NAMES.DLQ_FIX, {
      sourceQueue: QUEUE_NAMES.DRIFT_FIX,
      sourceJobId: job.id,
      sourceJobName: job.name,
      payload: job.data,
      result: result ?? null,
      error: message,
      attemptsMade: job.attemptsMade,
      maxAttempts: Number(job.opts.attempts ?? 1),
      failedAt: new Date().toISOString(),
    }, {
      jobId: bullMqJobId("dlq", QUEUE_NAMES.DRIFT_FIX, String(job.id)),
    });
  }
}
