import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DriftStatus, Prisma } from "@prisma/client";
import { buildFixIdempotencyKey } from "../fixes/fix-job.helpers";
import { FixJobPayload } from "../fixes/fix-job.types";
import { PrismaService } from "../prisma/prisma.service";
import { QUEUE_JOB_NAMES, QUEUE_NAMES } from "../queues/queue.constants";
import { QueueService } from "../queues/queue.service";
import { CreateDriftEventDto } from "./dto/create-drift-event.dto";
import { IgnoreDriftEventDto } from "./dto/ignore-drift-event.dto";
import { ListDriftEventsQueryDto } from "./dto/list-drift-events.query";
import { SummaryDriftEventsQueryDto } from "./dto/summary-drift-events.query";

const OPEN_DRIFT_STATUSES = [
  DriftStatus.DETECTED,
  DriftStatus.FIX_QUEUED,
  DriftStatus.FIXING,
  DriftStatus.RETRYING,
];

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
      locationId: query.locationId,
      status: query.status,
      createdAt: this.createdAtFilter(query.from, query.to),
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

  async summary(query: SummaryDriftEventsQueryDto) {
    const where: Prisma.DriftEventWhereInput = {
      tenantId: query.tenantId,
    };
    const [byStatus, resolvedEvents] = await this.prisma.$transaction([
      this.prisma.driftEvent.groupBy({
        by: ["status"],
        where,
        _count: { status: true },
      }),
      this.prisma.driftEvent.findMany({
        where: {
          ...where,
          status: DriftStatus.RESOLVED,
        },
        select: {
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const counts = Object.fromEntries(
      Object.values(DriftStatus).map((status) => [status, 0]),
    ) as Record<DriftStatus, number>;

    for (const row of byStatus) {
      counts[row.status] = row._count.status;
    }

    const open = OPEN_DRIFT_STATUSES.reduce((total, status) => total + counts[status], 0);
    const closed = counts[DriftStatus.RESOLVED] + counts[DriftStatus.FAILED_MANUAL];
    const successRate = closed === 0 ? null : counts[DriftStatus.RESOLVED] / closed;
    const avgResolveTimeMs = resolvedEvents.length
      ? Math.round(
          resolvedEvents.reduce(
            (total, event) => total + event.updatedAt.getTime() - event.createdAt.getTime(),
            0,
          ) / resolvedEvents.length,
        )
      : null;

    return {
      tenantId: query.tenantId ?? null,
      open,
      failedManual: counts[DriftStatus.FAILED_MANUAL],
      resolved: counts[DriftStatus.RESOLVED],
      ignored: counts[DriftStatus.IGNORED],
      total: Object.values(counts).reduce((total, count) => total + count, 0),
      successRate,
      avgResolveTimeMs,
      byStatus: counts,
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

  async ignore(id: string, input: IgnoreDriftEventDto) {
    const driftEvent = await this.findById(id);

    if (driftEvent.status === DriftStatus.RESOLVED) {
      throw new BadRequestException(`Drift event ${id} is already RESOLVED`);
    }

    return this.prisma.driftEvent.update({
      where: { id },
      data: {
        status: DriftStatus.IGNORED,
        reason: input.actor ? `${input.reason} (ignored by ${input.actor})` : input.reason,
      },
    });
  }

  private createdAtFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (!from && !to) {
      return undefined;
    }

    const filter: Prisma.DateTimeFilter = {};
    if (from) {
      filter.gte = new Date(from);
    }
    if (to) {
      filter.lte = new Date(to);
    }

    return filter;
  }
}
