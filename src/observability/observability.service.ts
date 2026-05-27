import { Injectable } from "@nestjs/common";
import {
  DriftAttemptStatus,
  DriftStatus,
  RecheckStatus,
} from "@prisma/client";
import { Job, JobType } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { QUEUE_NAMES } from "../queues/queue.constants";
import { QueueService } from "../queues/queue.service";
import { DlqQueryDto } from "./dto/dlq-query.dto";
import { MetricsQueryDto } from "./dto/metrics-query.dto";

const QUEUE_COUNT_STATES: JobType[] = [
  "waiting",
  "active",
  "delayed",
  "completed",
  "failed",
  "paused",
];
const QUEUE_LAG_STATES: JobType[] = ["waiting", "delayed"];

type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

@Injectable()
export class ObservabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async metrics(query: MetricsQueryDto) {
    const [driftByStatus, attemptByStatus, recheckByStatus, queues] = await Promise.all([
      this.driftByStatus(query),
      this.attemptByStatus(query),
      this.recheckByStatus(query),
      this.queueMetrics(),
    ]);

    const attemptsTotal = Object.values(attemptByStatus).reduce((sum, count) => sum + count, 0);
    const fixTerminalAttempts =
      attemptByStatus[DriftAttemptStatus.SUCCESS] + attemptByStatus[DriftAttemptStatus.FAILED];

    return {
      generatedAt: new Date().toISOString(),
      tenantId: query.tenantId ?? null,
      driftEvents: {
        byStatus: driftByStatus,
        open:
          driftByStatus[DriftStatus.DETECTED] +
          driftByStatus[DriftStatus.FIX_QUEUED] +
          driftByStatus[DriftStatus.FIXING] +
          driftByStatus[DriftStatus.RETRYING],
        failedManual: driftByStatus[DriftStatus.FAILED_MANUAL],
      },
      fixAttempts: {
        byStatus: attemptByStatus,
        total: attemptsTotal,
        successRate:
          fixTerminalAttempts === 0
            ? null
            : attemptByStatus[DriftAttemptStatus.SUCCESS] / fixTerminalAttempts,
      },
      webhookRechecks: {
        byStatus: recheckByStatus,
        failed: recheckByStatus[RecheckStatus.FAILED],
      },
      queues,
    };
  }

  async dlq(query: DlqQueryDto) {
    const queue = this.queueService.getQueue(QUEUE_NAMES.DRIFT_DLQ);
    const jobs = await queue.getJobs(["waiting", "delayed", "failed"], 0, query.limit * 3 - 1, false);
    const items = jobs
      .map((job) => this.dlqJob(job))
      .filter((item) => !query.tenantId || item.tenantId === query.tenantId)
      .slice(0, query.limit);

    return {
      queue: QUEUE_NAMES.DRIFT_DLQ,
      tenantId: query.tenantId ?? null,
      limit: query.limit,
      items,
    };
  }

  private async driftByStatus(query: MetricsQueryDto) {
    const rows = await this.prisma.driftEvent.groupBy({
      by: ["status"],
      where: {
        tenantId: query.tenantId,
      },
      _count: { status: true },
    });
    const counts = this.zeroCounts(DriftStatus);
    for (const row of rows) {
      counts[row.status] = row._count.status;
    }

    return counts;
  }

  private async attemptByStatus(query: MetricsQueryDto) {
    const rows = await this.prisma.driftAttemptLog.groupBy({
      by: ["status"],
      where: {
        driftEvent: query.tenantId
          ? {
              tenantId: query.tenantId,
            }
          : undefined,
      },
      _count: { status: true },
    });
    const counts = this.zeroCounts(DriftAttemptStatus);
    for (const row of rows) {
      counts[row.status] = row._count.status;
    }

    return counts;
  }

  private async recheckByStatus(query: MetricsQueryDto) {
    const rows = await this.prisma.webhookRecheckEvent.groupBy({
      by: ["status"],
      where: {
        tenantId: query.tenantId,
      },
      _count: { status: true },
    });
    const counts = this.zeroCounts(RecheckStatus);
    for (const row of rows) {
      counts[row.status] = row._count.status;
    }

    return counts;
  }

  private async queueMetrics() {
    const entries = await Promise.all(
      Object.values(QUEUE_NAMES).map(async (name) => [name, await this.queueMetric(name)] as const),
    );

    return Object.fromEntries(entries) as Record<QueueName, Awaited<ReturnType<typeof this.queueMetric>>>;
  }

  private async queueMetric(name: QueueName) {
    const queue = this.queueService.getQueue(name);

    try {
      const [counts, lagMs] = await Promise.all([
        queue.getJobCounts(...QUEUE_COUNT_STATES),
        this.queueLagMs(queue),
      ]);

      return {
        available: true,
        counts,
        lagMs,
      };
    } catch (error) {
      return {
        available: false,
        error: this.errorMessage(error),
        counts: {},
        lagMs: null,
      };
    }
  }

  private async queueLagMs(queue: ReturnType<QueueService["getQueue"]>) {
    const jobs = await queue.getJobs(QUEUE_LAG_STATES, 0, 0, true);
    const oldest = jobs[0];
    if (!oldest?.timestamp) {
      return 0;
    }

    return Math.max(0, Date.now() - oldest.timestamp);
  }

  private dlqJob(job: Job) {
    const data = job.data as {
      payload?: {
        tenantId?: string;
        driftEventId?: string;
        sku?: string;
        locationId?: string;
      };
      error?: string;
      failedAt?: string;
      sourceQueue?: string;
      sourceJobId?: string;
      attemptsMade?: number;
      maxAttempts?: number;
    };

    return {
      id: job.id,
      name: job.name,
      tenantId: data.payload?.tenantId ?? null,
      driftEventId: data.payload?.driftEventId ?? null,
      sku: data.payload?.sku ?? null,
      locationId: data.payload?.locationId ?? null,
      sourceQueue: data.sourceQueue ?? null,
      sourceJobId: data.sourceJobId ?? null,
      attemptsMade: data.attemptsMade ?? null,
      maxAttempts: data.maxAttempts ?? null,
      error: data.error ?? null,
      failedAt: data.failedAt ?? null,
      enqueuedAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
    };
  }

  private zeroCounts<T extends string>(source: Record<string, T>) {
    return Object.fromEntries(Object.values(source).map((status) => [status, 0])) as Record<T, number>;
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
