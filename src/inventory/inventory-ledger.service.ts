import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  InventoryBalance,
  InventoryLedgerMovementType,
  InventorySyncOutbox,
  InventorySyncStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AdjustInventoryDto } from "./dto/adjust-inventory.dto";
import { ListInventoryQueryDto } from "./dto/list-inventory.query";
import { calculateSellableQuantity } from "./inventory-math";
import { InventorySyncOutboxService } from "./inventory-sync-outbox.service";

type MovementInput = {
  tenantId: string;
  sku: string;
  locationId: string;
  movementType: InventoryLedgerMovementType;
  physicalDelta?: number;
  reservedDelta?: number;
  safetyBuffer?: number;
  sourceType?: string;
  sourceId?: string;
  reason?: string;
  metadata?: Prisma.InputJsonValue;
};

type MovementResult = {
  balance: InventoryBalance;
  ledgerEntry: Awaited<ReturnType<Prisma.TransactionClient["inventoryLedgerEntry"]["create"]>>;
  syncJob: InventorySyncOutbox | null;
};

@Injectable()
export class InventoryLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncOutbox: InventorySyncOutboxService,
  ) {}

  async adjust(input: AdjustInventoryDto) {
    const movementType = input.movementType ?? (input.physicalDelta >= 0
      ? InventoryLedgerMovementType.STOCK_ADDED
      : InventoryLedgerMovementType.MANUAL_ADJUSTMENT);
    const result = await this.applyMovement({
      tenantId: input.tenantId,
      sku: input.sku,
      locationId: input.locationId,
      movementType,
      physicalDelta: input.physicalDelta,
      safetyBuffer: input.safetyBuffer,
      sourceType: "MANUAL_ADJUSTMENT",
      reason: input.reason,
    });

    return result;
  }

  listLedger(query: ListInventoryQueryDto) {
    return this.prisma.inventoryLedgerEntry.findMany({
      where: {
        tenantId: query.tenantId,
        sku: query.sku,
        locationId: query.locationId,
      },
      take: query.limit,
      orderBy: { createdAt: "desc" },
    });
  }

  async applyMovement(input: MovementInput) {
    const result = await this.prisma.$transaction((tx) => this.applyMovementTx(tx, input));
    await this.syncOutbox.enqueueJob(result.syncJob);
    return result;
  }

  async applyMovementTx(tx: Prisma.TransactionClient, input: MovementInput): Promise<MovementResult> {
    this.assertMovement(input);
    await this.assertKnownSkuAndLocation(tx, input);

    const existing = await tx.inventoryBalance.findUnique({
      where: {
        tenantId_sku_locationId: {
          tenantId: input.tenantId,
          sku: input.sku,
          locationId: input.locationId,
        },
      },
    });
    const sku = await tx.sku.findUnique({
      where: {
        tenantId_sku: {
          tenantId: input.tenantId,
          sku: input.sku,
        },
      },
    });
    const previousSellable = existing?.sellableQuantity ?? 0;
    const physicalDelta = input.physicalDelta ?? 0;
    const reservedDelta = input.reservedDelta ?? 0;
    const safetyBuffer = input.safetyBuffer ?? existing?.safetyBuffer ?? sku?.safetyBuffer ?? 0;
    const physicalQuantity = (existing?.physicalQuantity ?? 0) + physicalDelta;
    const reservedQuantity = (existing?.reservedQuantity ?? 0) + reservedDelta;

    if (physicalQuantity < 0) {
      throw new BadRequestException("Inventory movement would make physical stock negative");
    }
    if (reservedQuantity < 0) {
      throw new BadRequestException("Inventory movement would make reserved stock negative");
    }
    if (reservedQuantity > physicalQuantity) {
      throw new BadRequestException("Reserved stock cannot exceed physical stock");
    }

    const sellableQuantity = calculateSellableQuantity({
      physicalQuantity,
      reservedQuantity,
      safetyBuffer,
    });

    const balance = existing
      ? await tx.inventoryBalance.update({
          where: { id: existing.id },
          data: {
            physicalQuantity,
            reservedQuantity,
            safetyBuffer,
            sellableQuantity,
          },
        })
      : await tx.inventoryBalance.create({
          data: {
            tenantId: input.tenantId,
            sku: input.sku,
            locationId: input.locationId,
            physicalQuantity,
            reservedQuantity,
            safetyBuffer,
            sellableQuantity,
          },
        });

    const ledgerEntry = await tx.inventoryLedgerEntry.create({
      data: {
        tenantId: input.tenantId,
        sku: input.sku,
        locationId: input.locationId,
        movementType: input.movementType,
        physicalDelta,
        reservedDelta,
        physicalQuantityAfter: physicalQuantity,
        reservedQuantityAfter: reservedQuantity,
        sellableQuantityAfter: sellableQuantity,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        reason: input.reason,
        metadata: input.metadata,
      },
    });

    const syncJob = sellableQuantity === previousSellable
      ? null
      : await this.createSyncJob(tx, {
          tenantId: input.tenantId,
          sku: input.sku,
          locationId: input.locationId,
          targetSellableQuantity: sellableQuantity,
          sourceType: input.sourceType ?? input.movementType,
          sourceId: input.sourceId ?? ledgerEntry.id,
        });

    return {
      balance,
      ledgerEntry,
      syncJob,
    };
  }

  private async createSyncJob(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      sku: string;
      locationId: string;
      targetSellableQuantity: number;
      sourceType: string;
      sourceId: string;
    },
  ) {
    const idempotencyKey = [
      "inventory-sync",
      input.tenantId,
      input.sku,
      input.locationId,
      input.targetSellableQuantity,
      input.sourceType,
      input.sourceId,
    ].join(":");

    try {
      return await tx.inventorySyncOutbox.create({
        data: {
          tenantId: input.tenantId,
          sku: input.sku,
          locationId: input.locationId,
          targetSellableQuantity: input.targetSellableQuantity,
          status: InventorySyncStatus.QUEUED,
          idempotencyKey,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return tx.inventorySyncOutbox.findUniqueOrThrow({
          where: { idempotencyKey },
        });
      }
      throw error;
    }
  }

  private assertMovement(input: MovementInput) {
    const physicalDelta = input.physicalDelta ?? 0;
    const reservedDelta = input.reservedDelta ?? 0;
    if (!Number.isInteger(physicalDelta) || !Number.isInteger(reservedDelta)) {
      throw new BadRequestException("Inventory movement quantities must be integers");
    }
    if (physicalDelta === 0 && reservedDelta === 0 && input.safetyBuffer == null) {
      throw new BadRequestException("Inventory movement must change stock, reservation, or safety buffer");
    }
    if (input.safetyBuffer != null && (!Number.isInteger(input.safetyBuffer) || input.safetyBuffer < 0)) {
      throw new BadRequestException("Safety buffer must be a non-negative integer");
    }
  }

  private async assertKnownSkuAndLocation(tx: Prisma.TransactionClient, input: MovementInput) {
    const [sku, location] = await Promise.all([
      tx.sku.findUnique({
        where: {
          tenantId_sku: {
            tenantId: input.tenantId,
            sku: input.sku,
          },
        },
      }),
      tx.warehouseLocation.findUnique({
        where: {
          tenantId_locationId: {
            tenantId: input.tenantId,
            locationId: input.locationId,
          },
        },
      }),
    ]);

    if (!sku) {
      throw new NotFoundException(`SKU ${input.sku} was not found`);
    }
    if (!location) {
      throw new NotFoundException(`Location ${input.locationId} was not found`);
    }
  }
}
