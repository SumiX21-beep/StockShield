import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConnectionOptions, JobsOptions, Queue } from "bullmq";
import { QUEUE_NAMES } from "./queue.constants";

type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queues = new Map<QueueName, Queue>();
  private readonly connection: ConnectionOptions = {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  };

  private readonly queueDefaults: Record<QueueName, JobsOptions> = {
    [QUEUE_NAMES.DRIFT_SCAN]: {
      attempts: 8,
      backoff: {
        type: "exponential",
        delay: 30_000,
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
    [QUEUE_NAMES.DRIFT_FIX]: {
      attempts: 8,
      backoff: {
        type: "exponential",
        delay: 30_000,
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
    [QUEUE_NAMES.DRIFT_RECHECK]: {
      attempts: 8,
      backoff: {
        type: "exponential",
        delay: 30_000,
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
    [QUEUE_NAMES.DRIFT_DLQ]: {
      attempts: 1,
      removeOnComplete: 1_000,
      removeOnFail: 1_000,
    },
  };

  getQueue(name: QueueName): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;

    const queue = new Queue(name, {
      connection: this.connection,
      defaultJobOptions: this.queueDefaults[name],
    });

    this.queues.set(name, queue);
    return queue;
  }

  getConnection(): ConnectionOptions {
    return this.connection;
  }

  async onModuleDestroy() {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
  }
}
