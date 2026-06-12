import { Injectable } from "@nestjs/common";
import { DriftRootCause, InventoryLedgerMovementType, InventorySyncStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class RootCauseService {
  constructor(private readonly prisma: PrismaService) {}

  async classify(input: {
    tenantId: string;
    sku: string;
    locationId: string;
    reason?: string | null;
  }): Promise<DriftRootCause> {
    if (input.reason === "MAPPING_MISSING") {
      return DriftRootCause.MAPPING_MISSING;
    }
    if (input.reason === "CHANNEL_READ_FAILED") {
      return DriftRootCause.SHOPIFY_API_FAILURE;
    }

    const [mapping, failedSync, balance, recentReturnOrCancel] = await Promise.all([
      this.prisma.tenantSkuLocationMap.findFirst({
        where: {
          tenantId: input.tenantId,
          sku: input.sku,
          omsLocationId: input.locationId,
          isActive: true,
        },
      }),
      this.prisma.inventorySyncOutbox.findFirst({
        where: {
          tenantId: input.tenantId,
          sku: input.sku,
          locationId: input.locationId,
          status: InventorySyncStatus.FAILED,
        },
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.inventoryBalance.findUnique({
        where: {
          tenantId_sku_locationId: {
            tenantId: input.tenantId,
            sku: input.sku,
            locationId: input.locationId,
          },
        },
      }),
      this.prisma.inventoryLedgerEntry.findFirst({
        where: {
          tenantId: input.tenantId,
          sku: input.sku,
          locationId: input.locationId,
          movementType: {
            in: [
              InventoryLedgerMovementType.ORDER_CANCELLED,
              InventoryLedgerMovementType.RETURN_RESTOCKED,
            ],
          },
          createdAt: {
            gte: new Date(Date.now() - 60 * 60 * 1000),
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    if (!mapping) {
      return DriftRootCause.MAPPING_MISSING;
    }
    if (failedSync) {
      return DriftRootCause.FAILED_SYNC;
    }
    if (balance && balance.reservedQuantity > balance.physicalQuantity) {
      return DriftRootCause.RESERVATION_MISMATCH;
    }
    if (recentReturnOrCancel) {
      return DriftRootCause.RETURN_CANCEL_MISMATCH;
    }
    if (balance) {
      return DriftRootCause.MANUAL_SHOPIFY_EDIT;
    }

    return DriftRootCause.UNKNOWN;
  }
}
