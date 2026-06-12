import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Job, Worker } from "bullmq";
import { QUEUE_JOB_NAMES, QUEUE_NAMES } from "../queues/queue.constants";
import { QueueService } from "../queues/queue.service";
import { DriftFixPayload, HybridDriftService } from "./hybrid-drift-core.service";

type DriftFixResult = {
  driftId: string;
  status: "resolved" | "skipped";
};

@Injectable()
export class HybridDriftFixWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HybridDriftFixWorkerService.name);
  private worker: Worker<DriftFixPayload, DriftFixResult> | null = null;

  constructor(
    private readonly queues: QueueService,
    private readonly drift: HybridDriftService,
  ) {}

  onModuleInit() {
    if (process.env.WORKER_ENABLED === "false") {
      this.logger.warn("Hybrid drift fix worker disabled by WORKER_ENABLED=false");
      return;
    }

    this.worker = new Worker<DriftFixPayload, DriftFixResult>(
      QUEUE_NAMES.HYBRID_DRIFT_FIX,
      (job) => this.process(job),
      {
        connection: this.queues.getConnection(),
        concurrency: this.positiveNumber(process.env.HYBRID_DRIFT_FIX_CONCURRENCY, 5),
      },
    );

    this.worker.on("completed", (job, result) => {
      this.logger.log(`hybrid drift fix job ${String(job.id)} completed for ${result.driftId}`);
    });
    this.worker.on("failed", (job, error) => {
      this.logger.error(`hybrid drift fix job ${String(job?.id)} failed`, error?.stack ?? String(error));
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<DriftFixPayload, DriftFixResult>) {
    if (job.name !== QUEUE_JOB_NAMES.FIX_HYBRID_DRIFT) {
      return {
        driftId: job.data.driftId,
        status: "skipped" as const,
      };
    }

    await this.drift.fix(job.data.driftId, job.data.strategy);
    return {
      driftId: job.data.driftId,
      status: "resolved" as const,
    };
  }

  private positiveNumber(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
