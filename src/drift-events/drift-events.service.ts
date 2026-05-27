import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AlertDeliveryStatus, DriftEvent, DriftStatus, Prisma } from "@prisma/client";
import { AlertsService } from "../alerts/alerts.service";
import { AuthenticatedRequest } from "../auth/auth.types";
import { buildFixIdempotencyKey } from "../fixes/fix-job.helpers";
import { FixJobPayload } from "../fixes/fix-job.types";
import { LiveEventsService } from "../live-events/live-events.service";
import { PrismaService } from "../prisma/prisma.service";
import { QUEUE_JOB_NAMES, QUEUE_NAMES } from "../queues/queue.constants";
import { QueueService } from "../queues/queue.service";
import { RiskService } from "../risk/risk.service";
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
    private readonly alertsService: AlertsService,
    private readonly liveEventsService: LiveEventsService,
    private readonly riskService: RiskService,
  ) {}

  async create(input: CreateDriftEventDto) {
    const driftEvent = await this.prisma.driftEvent.create({
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

    await this.afterDriftCreated(driftEvent);
    return driftEvent;
  }

  async list(query: ListDriftEventsQueryDto) {
    const where: Prisma.DriftEventWhereInput = {
      tenantId: query.tenantId,
      sku: query.sku,
      locationId: query.locationId,
      status: query.status,
      createdAt: this.createdAtFilter(query.from, query.to),
      OR: this.searchFilter(query.search),
    };
    await this.applyRiskFilter(where, query);
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
    const riskByKey = await this.riskByEventKey(items);

    return {
      page: query.page,
      limit: query.limit,
      total,
      items: items.map((item) => ({
        ...item,
        risk: riskByKey.get(this.riskKey(item)) ?? null,
      })),
    };
  }

  async summary(query: SummaryDriftEventsQueryDto) {
    const where: Prisma.DriftEventWhereInput = {
      tenantId: query.tenantId,
    };
    const [byStatus, resolvedEvents, riskCounts, recentAlerts] = await Promise.all([
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
      this.riskService.counts(query.tenantId),
      this.prisma.alertDeliveryLog.groupBy({
        by: ["status"],
        where: {
          tenantId: query.tenantId,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
        _count: { status: true },
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
      risk: riskCounts,
      alerts24h: {
        sent: this.alertCount(recentAlerts, AlertDeliveryStatus.SENT),
        failed: this.alertCount(recentAlerts, AlertDeliveryStatus.FAILED),
        skipped: this.alertCount(recentAlerts, AlertDeliveryStatus.SKIPPED),
      },
    };
  }

  async findById(id: string, tenantId?: string) {
    const driftEvent = await this.prisma.driftEvent.findUnique({
      where: { id },
      include: {
        attemptLogs: {
          orderBy: { attemptNumber: "asc" },
        },
        alertLogs: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!driftEvent || (tenantId && driftEvent.tenantId !== tenantId)) {
      throw new NotFoundException(`Drift event ${id} was not found`);
    }

    const risk = await this.prisma.skuRiskSnapshot.findUnique({
      where: {
        tenantId_sku_locationId: {
          tenantId: driftEvent.tenantId,
          sku: driftEvent.sku,
          locationId: driftEvent.locationId,
        },
      },
    });

    return {
      ...driftEvent,
      risk,
    };
  }

  async retry(id: string, tenantId?: string) {
    const driftEvent = await this.findById(id, tenantId);

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
    this.publishDrift("drift.updated", updated);

    return {
      queued: true,
      queue: QUEUE_NAMES.DRIFT_FIX,
      jobId: job.id,
      driftEvent: updated,
    };
  }

  async ignore(id: string, input: IgnoreDriftEventDto, request?: AuthenticatedRequest) {
    const driftEvent = await this.findById(id, request?.tenantScope?.tenantId);

    if (driftEvent.status === DriftStatus.RESOLVED) {
      throw new BadRequestException(`Drift event ${id} is already RESOLVED`);
    }

    const actor = input.actor ?? request?.auth?.email;
    const updated = await this.prisma.driftEvent.update({
      where: { id },
      data: {
        status: DriftStatus.IGNORED,
        reason: actor ? `${input.reason} (ignored by ${actor})` : input.reason,
      },
    });
    this.publishDrift("drift.updated", updated);
    return updated;
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

  private async afterDriftCreated(driftEvent: DriftEvent) {
    this.publishDrift("drift.created", driftEvent);
    await this.riskService.refreshForEvent(driftEvent);

    if (driftEvent.status === DriftStatus.FIX_QUEUED || driftEvent.status === DriftStatus.DETECTED) {
      await this.alertsService.notifyDriftDetected(driftEvent);
    } else if (driftEvent.status === DriftStatus.FAILED_MANUAL) {
      await this.alertsService.notifyFixFailed({
        tenantId: driftEvent.tenantId,
        driftEventId: driftEvent.id,
        sku: driftEvent.sku,
        locationId: driftEvent.locationId,
        reason: driftEvent.reason ?? "FAILED_MANUAL",
      });
    }
  }

  private publishDrift(type: "drift.created" | "drift.updated", driftEvent: DriftEvent) {
    this.liveEventsService.publish({
      type,
      tenantId: driftEvent.tenantId,
      id: driftEvent.id,
      driftEventId: driftEvent.id,
      sku: driftEvent.sku,
      locationId: driftEvent.locationId,
      status: driftEvent.status,
    });
  }

  private searchFilter(search?: string): Prisma.DriftEventWhereInput[] | undefined {
    if (!search?.trim()) {
      return undefined;
    }

    const contains = search.trim();
    return [
      { sku: { contains, mode: "insensitive" } },
      { locationId: { contains, mode: "insensitive" } },
      { reason: { contains, mode: "insensitive" } },
    ];
  }

  private async applyRiskFilter(where: Prisma.DriftEventWhereInput, query: ListDriftEventsQueryDto) {
    if (!query.riskLevel) {
      return;
    }

    const snapshots = await this.prisma.skuRiskSnapshot.findMany({
      where: {
        tenantId: query.tenantId,
        riskLevel: query.riskLevel,
      },
      select: {
        tenantId: true,
        sku: true,
        locationId: true,
      },
    });

    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      snapshots.length
        ? {
            OR: snapshots.map((snapshot) => ({
              tenantId: snapshot.tenantId,
              sku: snapshot.sku,
              locationId: snapshot.locationId,
            })),
          }
        : { id: "__no_risk_matches__" },
    ];
  }

  private async riskByEventKey(events: DriftEvent[]) {
    if (events.length === 0) {
      return new Map<string, Awaited<ReturnType<typeof this.prisma.skuRiskSnapshot.findFirst>>>();
    }

    const snapshots = await this.prisma.skuRiskSnapshot.findMany({
      where: {
        OR: events.map((event) => ({
          tenantId: event.tenantId,
          sku: event.sku,
          locationId: event.locationId,
        })),
      },
    });

    return new Map(snapshots.map((snapshot) => [this.riskKey(snapshot), snapshot]));
  }

  private riskKey(input: { tenantId: string; sku: string; locationId: string }) {
    return `${input.tenantId}:${input.sku}:${input.locationId}`;
  }

  private alertCount(
    rows: { status: AlertDeliveryStatus; _count: { status: number } }[],
    status: AlertDeliveryStatus,
  ) {
    return rows.find((row) => row.status === status)?._count.status ?? 0;
  }
}
