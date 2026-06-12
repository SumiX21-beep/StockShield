import { Injectable, Logger } from "@nestjs/common";
import {
  ChannelType,
  InventorySyncAttemptStatus,
  InventorySyncStatus,
  Prisma,
  TenantChannelStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ShopifyInventoryService } from "../shopify/shopify-inventory.service";
import { InventorySyncJobPayload, InventorySyncJobResult } from "./inventory-sync-job.types";

type SyncContext = {
  attemptsMade: number;
  maxAttempts: number;
};

@Injectable()
export class ShopifySyncProcessorService {
  private readonly logger = new Logger(ShopifySyncProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyInventory: ShopifyInventoryService,
  ) {}

  async process(payload: InventorySyncJobPayload, context: SyncContext): Promise<InventorySyncJobResult> {
    const syncJob = await this.prisma.inventorySyncOutbox.findUnique({
      where: { id: payload.syncJobId },
    });

    if (!syncJob) {
      return {
        syncJobId: payload.syncJobId,
        status: "skipped",
        targetSellableQuantity: payload.targetSellableQuantity,
        message: "Sync job not found",
      };
    }
    if (syncJob.status === InventorySyncStatus.SUCCEEDED) {
      return {
        syncJobId: syncJob.id,
        status: "skipped",
        targetSellableQuantity: syncJob.targetSellableQuantity,
        message: "Sync job already succeeded",
      };
    }

    const attempt = await this.prisma.inventorySyncAttempt.create({
      data: {
        syncJobId: syncJob.id,
        tenantId: syncJob.tenantId,
        status: InventorySyncAttemptStatus.STARTED,
        targetSellableQuantity: syncJob.targetSellableQuantity,
        requestPayload: {
          tenantId: syncJob.tenantId,
          sku: syncJob.sku,
          locationId: syncJob.locationId,
          targetSellableQuantity: syncJob.targetSellableQuantity,
        },
      },
    });

    await this.prisma.inventorySyncOutbox.update({
      where: { id: syncJob.id },
      data: {
        status: InventorySyncStatus.SYNCING,
        attempts: { increment: 1 },
        lastError: null,
      },
    });

    try {
      const [config, mapping] = await Promise.all([
        this.prisma.tenantChannelConfig.findUnique({
          where: {
            tenantId_channel: {
              tenantId: syncJob.tenantId,
              channel: ChannelType.SHOPIFY,
            },
          },
        }),
        this.prisma.tenantSkuLocationMap.findFirst({
          where: {
            tenantId: syncJob.tenantId,
            channel: ChannelType.SHOPIFY,
            sku: syncJob.sku,
            omsLocationId: syncJob.locationId,
            isActive: true,
          },
        }),
      ]);

      if (!config || config.status !== TenantChannelStatus.ACTIVE) {
        return this.fail(syncJob.id, attempt.id, syncJob.targetSellableQuantity, "TENANT_CHANNEL_INACTIVE", true);
      }
      if (!mapping) {
        return this.fail(syncJob.id, attempt.id, syncJob.targetSellableQuantity, "MAPPING_MISSING", true);
      }

      const response = await this.shopifyInventory.setAvailableQuantity(
        config,
        mapping,
        syncJob.targetSellableQuantity,
      );
      await this.prisma.$transaction([
        this.prisma.inventorySyncAttempt.update({
          where: { id: attempt.id },
          data: {
            status: InventorySyncAttemptStatus.SUCCESS,
            responsePayload: response as Prisma.InputJsonValue,
          },
        }),
        this.prisma.inventorySyncOutbox.update({
          where: { id: syncJob.id },
          data: {
            status: InventorySyncStatus.SUCCEEDED,
            completedAt: new Date(),
            lastError: null,
          },
        }),
      ]);

      return {
        syncJobId: syncJob.id,
        status: "succeeded",
        targetSellableQuantity: syncJob.targetSellableQuantity,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Inventory sync ${syncJob.id} failed: ${message}`);
      const terminal = context.attemptsMade + 1 >= context.maxAttempts;
      await this.fail(syncJob.id, attempt.id, syncJob.targetSellableQuantity, message, terminal);
      if (!terminal) {
        throw error;
      }
      return {
        syncJobId: syncJob.id,
        status: "failed-manual",
        targetSellableQuantity: syncJob.targetSellableQuantity,
        message,
      };
    }
  }

  private async fail(
    syncJobId: string,
    attemptId: string,
    targetSellableQuantity: number,
    message: string,
    terminal: boolean,
  ) {
    await this.prisma.$transaction([
      this.prisma.inventorySyncAttempt.update({
        where: { id: attemptId },
        data: {
          status: InventorySyncAttemptStatus.FAILED,
          errorMessage: message.slice(0, 1_000),
        },
      }),
      this.prisma.inventorySyncOutbox.update({
        where: { id: syncJobId },
        data: {
          status: terminal ? InventorySyncStatus.FAILED : InventorySyncStatus.QUEUED,
          lastError: message.slice(0, 1_000),
        },
      }),
    ]);

    return {
      syncJobId,
      status: "failed-manual" as const,
      targetSellableQuantity,
      message,
    };
  }
}
