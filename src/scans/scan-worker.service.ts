import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Job, Worker } from "bullmq";
import { QUEUE_JOB_NAMES, QUEUE_NAMES } from "../queues/queue.constants";
import { QueueService } from "../queues/queue.service";
import { ScanJobPayload, ScanJobResult } from "./scan-job.types";
import { ScanProcessorService } from "./scan-processor.service";

@Injectable()
export class ScanWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScanWorkerService.name);
  private worker: Worker<ScanJobPayload, ScanJobResult> | null = null;

  constructor(
    private readonly queueService: QueueService,
    private readonly scanProcessor: ScanProcessorService,
  ) {}

  onModuleInit() {
    if (process.env.WORKER_ENABLED === "false") {
      this.logger.warn("Scan worker disabled by WORKER_ENABLED=false");
      return;
    }

    const concurrency = Number(process.env.DRIFT_SCAN_CONCURRENCY ?? 2);
    this.worker = new Worker<ScanJobPayload, ScanJobResult>(
      QUEUE_NAMES.DRIFT_SCAN,
      (job) => this.process(job),
      {
        connection: this.queueService.getConnection(),
        concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 2,
      },
    );

    this.worker.on("completed", (job, result) => {
      this.logger.log(
        `scan job ${String(job.id)} completed for tenant ${result.tenantId} (rows=${result.comparedRows}, drifts=${result.detectedDrifts})`,
      );
    });

    this.worker.on("failed", (job, error) => {
      this.logger.error(`scan job ${String(job?.id)} failed`, error?.stack ?? String(error));
    });

    this.logger.log(`Scan worker listening on queue ${QUEUE_NAMES.DRIFT_SCAN}`);
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  private process(job: Job<ScanJobPayload, ScanJobResult>) {
    if (job.name !== QUEUE_JOB_NAMES.SCAN_TENANT) {
      this.logger.warn(`Skipping unexpected job "${job.name}" on ${QUEUE_NAMES.DRIFT_SCAN}`);
      return Promise.resolve({
        tenantId: job.data.tenantId,
        comparedRows: 0,
        detectedDrifts: 0,
        resolvedDuringScan: 0,
        failedManual: 0,
        cursorAdvanced: false,
      });
    }

    return this.scanProcessor.process(job.data);
  }
}
