import { Injectable } from "@nestjs/common";
import { DriftEvent, Prisma, RiskLevel } from "@prisma/client";
import { AlertsService } from "../alerts/alerts.service";
import { LiveEventsService } from "../live-events/live-events.service";
import { PrismaService } from "../prisma/prisma.service";
import { ListRiskSkusQueryDto } from "./dto/list-risk-skus.query";

@Injectable()
export class RiskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alertsService: AlertsService,
    private readonly liveEventsService: LiveEventsService,
  ) {}

  async refreshForEvent(event: Pick<DriftEvent, "tenantId" | "sku" | "locationId">) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [existing, driftCount24h, lastDrift] = await Promise.all([
      this.prisma.skuRiskSnapshot.findUnique({
        where: {
          tenantId_sku_locationId: {
            tenantId: event.tenantId,
            sku: event.sku,
            locationId: event.locationId,
          },
        },
      }),
      this.prisma.driftEvent.count({
        where: {
          tenantId: event.tenantId,
          sku: event.sku,
          locationId: event.locationId,
          createdAt: { gte: since },
        },
      }),
      this.prisma.driftEvent.findFirst({
        where: {
          tenantId: event.tenantId,
          sku: event.sku,
          locationId: event.locationId,
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

    const riskLevel = this.levelForCount(driftCount24h);
    const snapshot = await this.prisma.skuRiskSnapshot.upsert({
      where: {
        tenantId_sku_locationId: {
          tenantId: event.tenantId,
          sku: event.sku,
          locationId: event.locationId,
        },
      },
      create: {
        tenantId: event.tenantId,
        sku: event.sku,
        locationId: event.locationId,
        driftCount24h,
        lastDriftAt: lastDrift?.createdAt ?? null,
        riskLevel,
      },
      update: {
        driftCount24h,
        lastDriftAt: lastDrift?.createdAt ?? null,
        riskLevel,
      },
    });

    this.liveEventsService.publish({
      type: "risk.updated",
      tenantId: event.tenantId,
      id: snapshot.id,
      sku: event.sku,
      locationId: event.locationId,
      status: riskLevel,
    });

    if (existing?.riskLevel !== RiskLevel.HIGH && riskLevel === RiskLevel.HIGH) {
      await this.alertsService.notifyHighRiskSku({
        tenantId: event.tenantId,
        sku: event.sku,
        locationId: event.locationId,
        driftCount24h,
      });
    }

    return snapshot;
  }

  async refreshByDriftEventId(id: string) {
    const event = await this.prisma.driftEvent.findUnique({
      where: { id },
      select: {
        tenantId: true,
        sku: true,
        locationId: true,
      },
    });

    return event ? this.refreshForEvent(event) : null;
  }

  list(query: ListRiskSkusQueryDto) {
    const where: Prisma.SkuRiskSnapshotWhereInput = {
      tenantId: query.tenantId,
      riskLevel: query.riskLevel,
      OR: query.search
        ? [
            { sku: { contains: query.search, mode: "insensitive" } },
            { locationId: { contains: query.search, mode: "insensitive" } },
          ]
        : undefined,
    };

    return this.prisma.skuRiskSnapshot.findMany({
      where,
      orderBy: [
        { riskLevel: "desc" },
        { driftCount24h: "desc" },
        { updatedAt: "desc" },
      ],
      take: query.limit,
    });
  }

  async counts(tenantId?: string) {
    const rows = await this.prisma.skuRiskSnapshot.groupBy({
      by: ["riskLevel"],
      where: { tenantId },
      _count: { riskLevel: true },
    });
    const counts = {
      [RiskLevel.LOW]: 0,
      [RiskLevel.MEDIUM]: 0,
      [RiskLevel.HIGH]: 0,
    };

    for (const row of rows) {
      counts[row.riskLevel] = row._count.riskLevel;
    }

    return counts;
  }

  levelForCount(count: number) {
    const highThreshold = Number(process.env.DRIFT_RISK_HIGH_THRESHOLD ?? 3);
    const threshold = Number.isFinite(highThreshold) && highThreshold > 0 ? highThreshold : 3;
    if (count >= threshold) {
      return RiskLevel.HIGH;
    }

    return count >= 2 ? RiskLevel.MEDIUM : RiskLevel.LOW;
  }
}
