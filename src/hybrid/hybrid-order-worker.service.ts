import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Job, Worker } from "bullmq";
import { QUEUE_JOB_NAMES, QUEUE_NAMES } from "../queues/queue.constants";
import { QueueService } from "../queues/queue.service";
import { HybridOrderJobPayload, HybridOrderJobResult } from "./hybrid-order-job.types";
import { HybridOrdersService } from "./hybrid-orders.service";

@Injectable()
export class HybridOrderWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HybridOrderWorkerService.name);
  private processWorker: Worker<HybridOrderJobPayload, HybridOrderJobResult> | null = null;
  private retryWorker: Worker<HybridOrderJobPayload, HybridOrderJobResult> | null = null;

  constructor(
    private readonly queues: QueueService,
    private readonly orders: HybridOrdersService,
  ) {}

  onModuleInit() {
    if (process.env.WORKER_ENABLED === "false") {
      this.logger.warn("Hybrid order worker disabled by WORKER_ENABLED=false");
      return;
    }

    const concurrency = this.positiveNumber(process.env.ORDER_WORKER_CONCURRENCY, 10);
    this.processWorker = this.createWorker(QUEUE_NAMES.ORDER_PROCESS, concurrency);
    this.retryWorker = this.createWorker(QUEUE_NAMES.ORDER_RETRY, concurrency);
    this.logger.log(`Hybrid order worker listening on ${QUEUE_NAMES.ORDER_PROCESS} and ${QUEUE_NAMES.ORDER_RETRY}`);
  }

  async onModuleDestroy() {
    await Promise.all([
      this.processWorker?.close(),
      this.retryWorker?.close(),
    ]);
  }

  private createWorker(queueName: typeof QUEUE_NAMES.ORDER_PROCESS | typeof QUEUE_NAMES.ORDER_RETRY, concurrency: number) {
    const worker = new Worker<HybridOrderJobPayload, HybridOrderJobResult>(
      queueName,
      (job) => this.process(job),
      {
        connection: this.queues.getConnection(),
        concurrency,
      },
    );

    worker.on("completed", (job, result) => {
      this.logger.log(`${queueName} job ${String(job.id)} completed for order ${result.orderId}`);
    });
    worker.on("failed", (job, error) => {
      this.logger.error(`${queueName} job ${String(job?.id)} failed`, error?.stack ?? String(error));
    });

    return worker;
  }

  private async process(job: Job<HybridOrderJobPayload, HybridOrderJobResult>) {
    if (job.name !== QUEUE_JOB_NAMES.PROCESS_ORDER && job.name !== QUEUE_JOB_NAMES.RETRY_ORDER) {
      return {
        orderId: job.data.orderId,
        status: "skipped" as const,
        message: `Unexpected job ${job.name}`,
      };
    }

    try {
      return await this.orders.confirm(job.data.orderId);
    } catch (error) {
      if (this.isTerminalAttempt(job)) {
        await this.orders.handleTerminalFailure(job.data.orderId, error);
        await this.moveToDlq(job, error);
      }
      throw error;
    }
  }

  private async moveToDlq(job: Job<HybridOrderJobPayload, HybridOrderJobResult>, error: unknown) {
    const dlq = this.queues.getQueue(QUEUE_NAMES.ORDER_DLQ);
    await dlq.add(QUEUE_JOB_NAMES.DLQ_ORDER, {
      sourceQueue: job.queueName,
      sourceJobId: job.id,
      attemptsMade: job.attemptsMade + 1,
      maxAttempts: Number(job.opts.attempts ?? 1),
      failedAt: new Date().toISOString(),
      error: this.errorMessage(error),
      payload: job.data,
    });
  }

  private isTerminalAttempt(job: Job<HybridOrderJobPayload, HybridOrderJobResult>) {
    return job.attemptsMade + 1 >= Number(job.opts.attempts ?? 1);
  }

  private positiveNumber(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
