import { Injectable, NotFoundException } from "@nestjs/common";
import { DriftStatus, SubscriptionPlan } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const PLAN_LIMITS: Record<SubscriptionPlan, number> = {
  FREE: 100,
  STARTUP: 1_000,
  SCALE: 10_000,
};

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(tenantId: string) {
    const periodStart = new Date();
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);

    const [tenant, billing, eventsThisPeriod, mapsCount, shopifyConfig, openEvents] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      this.billingForTenant(tenantId),
      this.prisma.driftEvent.count({
        where: {
          tenantId,
          createdAt: { gte: periodStart },
        },
      }),
      this.prisma.tenantSkuLocationMap.count({
        where: {
          tenantId,
          isActive: true,
        },
      }),
      this.prisma.tenantChannelConfig.findUnique({
        where: {
          tenantId_channel: {
            tenantId,
            channel: "SHOPIFY",
          },
        },
        select: {
          shopDomain: true,
          status: true,
          apiVersion: true,
          updatedAt: true,
        },
      }),
      this.prisma.driftEvent.count({
        where: {
          tenantId,
          status: {
            in: [DriftStatus.DETECTED, DriftStatus.FIX_QUEUED, DriftStatus.FIXING, DriftStatus.RETRYING],
          },
        },
      }),
    ]);

    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} was not found`);
    }

    return {
      tenant,
      billing,
      usage: {
        periodStart,
        eventsThisPeriod,
        monthlyEventLimit: billing.monthlyEventLimit,
        usagePercent: Math.min(100, Math.round((eventsThisPeriod / billing.monthlyEventLimit) * 100)),
      },
      setup: {
        shopifyConfigured: Boolean(shopifyConfig),
        shopifyConfig,
        activeMappings: mapsCount,
        openEvents,
      },
      plans: [
        { plan: "FREE", monthlyEventLimit: PLAN_LIMITS.FREE, label: "Free" },
        { plan: "STARTUP", monthlyEventLimit: PLAN_LIMITS.STARTUP, label: "Startup" },
        { plan: "SCALE", monthlyEventLimit: PLAN_LIMITS.SCALE, label: "Scale" },
      ],
    };
  }

  async updatePlan(tenantId: string, plan: SubscriptionPlan) {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    return this.prisma.tenantBillingSubscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        plan,
        status: plan === "FREE" ? "TRIALING" : "ACTIVE",
        monthlyEventLimit: PLAN_LIMITS[plan],
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
      update: {
        plan,
        status: plan === "FREE" ? "TRIALING" : "ACTIVE",
        monthlyEventLimit: PLAN_LIMITS[plan],
      },
    });
  }

  private async billingForTenant(tenantId: string) {
    const existing = await this.prisma.tenantBillingSubscription.findUnique({
      where: { tenantId },
    });
    if (existing) {
      return existing;
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    return this.prisma.tenantBillingSubscription.create({
      data: {
        tenantId,
        plan: "FREE",
        status: "TRIALING",
        monthlyEventLimit: PLAN_LIMITS.FREE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });
  }
}
