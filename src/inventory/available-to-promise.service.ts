import { Injectable } from "@nestjs/common";
import { ChannelType, TenantChannelStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ShopifyInventoryService } from "../shopify/shopify-inventory.service";
import { ListInventoryQueryDto } from "./dto/list-inventory.query";
import { RootCauseService } from "./root-cause.service";

@Injectable()
export class AvailableToPromiseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyInventory: ShopifyInventoryService,
    private readonly rootCause: RootCauseService,
  ) {}

  listInventory(query: ListInventoryQueryDto) {
    return this.prisma.inventoryBalance.findMany({
      where: {
        tenantId: query.tenantId,
        sku: query.sku,
        locationId: query.locationId,
      },
      take: query.limit,
      orderBy: { updatedAt: "desc" },
    });
  }

  async inventoryTruth(query: ListInventoryQueryDto) {
    const balances = await this.listInventory(query);
    const rows = [];

    for (const balance of balances) {
      const [shopifyAvailable, lastSyncJob, latestDrift] = await Promise.all([
        this.readShopifyAvailable(balance).catch(() => null),
        this.prisma.inventorySyncOutbox.findFirst({
          where: {
            tenantId: balance.tenantId,
            sku: balance.sku,
            locationId: balance.locationId,
          },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.driftEvent.findFirst({
          where: {
            tenantId: balance.tenantId,
            sku: balance.sku,
            locationId: balance.locationId,
          },
          orderBy: { updatedAt: "desc" },
        }),
      ]);
      const drift = shopifyAvailable == null ? null : balance.sellableQuantity - shopifyAvailable;
      const rootCause = drift && drift !== 0
        ? await this.rootCause.classify({
            tenantId: balance.tenantId,
            sku: balance.sku,
            locationId: balance.locationId,
            reason: latestDrift?.reason,
          })
        : latestDrift?.rootCause ?? null;

      rows.push({
        ...balance,
        shopifyAvailable,
        drift,
        rootCause,
        syncStatus: lastSyncJob?.status ?? null,
        lastSyncJobId: lastSyncJob?.id ?? null,
        promiseStatus: this.promiseStatus(balance.sellableQuantity, drift),
        lostRevenueRisk: drift == null ? 0 : Math.max(0, Math.abs(drift)),
      });
    }

    return rows;
  }

  private async readShopifyAvailable(input: {
    tenantId: string;
    sku: string;
    locationId: string;
  }) {
    const [config, mapping] = await Promise.all([
      this.prisma.tenantChannelConfig.findUnique({
        where: {
          tenantId_channel: {
            tenantId: input.tenantId,
            channel: ChannelType.SHOPIFY,
          },
        },
      }),
      this.prisma.tenantSkuLocationMap.findFirst({
        where: {
          tenantId: input.tenantId,
          channel: ChannelType.SHOPIFY,
          sku: input.sku,
          omsLocationId: input.locationId,
          isActive: true,
        },
      }),
    ]);

    if (!config || config.status !== TenantChannelStatus.ACTIVE || !mapping) {
      return null;
    }

    return this.shopifyInventory.getAvailableQuantity(config, mapping);
  }

  private promiseStatus(sellable: number, drift: number | null) {
    if (sellable <= 0) {
      return "OUT_OF_STOCK";
    }
    if (drift != null && drift < 0) {
      return "OVERSELL_RISK";
    }
    if (drift != null && drift > 0) {
      return "UNDERSELL_RISK";
    }
    return "SAFE_TO_PROMISE";
  }
}
