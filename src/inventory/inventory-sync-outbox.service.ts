import { Injectable, NotFoundException } from "@nestjs/common";
import { InventorySyncOutbox, InventorySyncStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { bullMqJobId } from "../queues/bullmq-job-id";
import { QUEUE_JOB_NAMES, QUEUE_NAMES } from "../queues/queue.constants";
import { QueueService } from "../queues/queue.service";
import { ListSyncJobsQueryDto } from "./dto/list-sync-jobs.query";
import { InventorySyncJobPayload } from "./inventory-sync-job.types";

@Injectable()
export class InventorySyncOutboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async enqueueJob(job: InventorySyncOutbox | null | undefined) {
    if (!job) {
      return null;
    }

    const queue = this.queueService.getQueue(QUEUE_NAMES.INVENTORY_SYNC);
    const payload: InventorySyncJobPayload = {
      syncJobId: job.id,
      tenantId: job.tenantId,
      sku: job.sku,
      locationId: job.locationId,
      targetSellableQuantity: job.targetSellableQuantity,
    };

    return queue.add(QUEUE_JOB_NAMES.SYNC_INVENTORY, payload, {
      jobId: bullMqJobId("inventory-sync", job.id),
    });
  }

  list(query: ListSyncJobsQueryDto) {
    const where: Prisma.InventorySyncOutboxWhereInput = {
      tenantId: query.tenantId,
      sku: query.sku,
      locationId: query.locationId,
      status: query.status,
    };

    return this.prisma.inventorySyncOutbox.findMany({
      where,
      take: query.limit,
      orderBy: { createdAt: "desc" },
      include: {
        attemptsLog: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });
  }

  async retry(id: string, tenantId?: string) {
    const existing = await this.prisma.inventorySyncOutbox.findUnique({
      where: { id },
    });

    if (!existing || (tenantId && existing.tenantId !== tenantId)) {
      throw new NotFoundException(`Inventory sync job ${id} was not found`);
    }

    const updated = await this.prisma.inventorySyncOutbox.update({
      where: { id },
      data: {
        status: InventorySyncStatus.QUEUED,
        lastError: null,
        nextRunAt: null,
      },
    });

    const job = await this.enqueueJob(updated);
    return {
      queued: true,
      queue: QUEUE_NAMES.INVENTORY_SYNC,
      jobId: job?.id ?? null,
      syncJob: updated,
    };
  }
}
