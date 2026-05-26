import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DriftStatus, Prisma } from "@prisma/client";
import { buildFixIdempotencyKey } from "../fixes/fix-job.helpers";
import { FixJobPayload } from "../fixes/fix-job.types";
import { PrismaService } from "../prisma/prisma.service";
import { QUEUE_JOB_NAMES, QUEUE_NAMES } from "../queues/queue.constants";
import { QueueService } from "../queues/queue.service";
import { CreateDriftEventDto } from "./dto/create-drift-event.dto";
import { ListDriftEventsQueryDto } from "./dto/list-drift-events.query";

@Injectable()
export class DriftEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  create(input: CreateDriftEventDto) {
    return this.prisma.driftEvent.create({
      data: {
        tenantId: input.tenantId,
        sku: input.sku,
        locationId: input.locationId,
        omsAvailable: input.omsAvailable,
        channelAvailable: input.channelAvailable,
        drift: input.omsAvailable - input.channelAvailable,
        status: input.status ?? DriftStatus.DETECTED,
        reason: input.reason,
      },
    });
  }

  async list(query: ListDriftEventsQueryDto) {
    const where: Prisma.DriftEventWhereInput = {
      tenantId: query.tenantId,
      sku: query.sku,
      status: query.status,
    };
    const skip = (query.page - 1) * query.limit;
    const take = query.limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.driftEvent.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.driftEvent.count({ where }),
    ]);

    return {
      page: query.page,
      limit: query.limit,
      total,
      items,
    };
  }

  async findById(id: string) {
    const driftEvent = await this.prisma.driftEvent.findUnique({
      where: { id },
      include: {
        attemptLogs: {
          orderBy: { attemptNumber: "asc" },
        },
      },
    });

    if (!driftEvent) {
      throw new NotFoundException(`Drift event ${id} was not found`);
    }

    return driftEvent;
  }

  async retry(id: string) {
    const driftEvent = await this.findById(id);

    if (driftEvent.status === DriftStatus.RESOLVED || driftEvent.status === DriftStatus.IGNORED) {
      throw new BadRequestException(`Drift event ${id} is already ${driftEvent.status}`);
    }

    const scanWindow = `manual:${new Date().toISOString()}`;
    const idempotencyKey = buildFixIdempotencyKey({
      tenantId: driftEvent.tenantId,
      channel: "SHOPIFY",
      sku: driftEvent.sku,
      locationId: driftEvent.locationId,
      targetQty: driftEvent.omsAvailable,
      scanWindow,
    });
    const payload: FixJobPayload = {
      driftEventId: driftEvent.id,
      tenantId: driftEvent.tenantId,
      channel: "SHOPIFY",
      sku: driftEvent.sku,
      locationId: driftEvent.locationId,
      targetQty: driftEvent.omsAvailable,
      cause: "manual-retry",
      idempotencyKey,
    };

    const queue = this.queueService.getQueue(QUEUE_NAMES.DRIFT_FIX);
    const job = await queue.add(QUEUE_JOB_NAMES.FIX_DRIFT, payload, {
      jobId: idempotencyKey,
    });

    const updated = await this.prisma.driftEvent.update({
      where: { id },
      data: {
        status: DriftStatus.FIX_QUEUED,
        reason: "Manual retry requested",
      },
    });

    return {
      queued: true,
      queue: QUEUE_NAMES.DRIFT_FIX,
      jobId: job.id,
      driftEvent: updated,
    };
  }
}
