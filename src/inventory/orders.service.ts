import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  InventoryLedgerMovementType,
  InventorySyncOutbox,
  OmsOrderStatus,
  Prisma,
  StockReservationStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import { CreateReturnDto } from "./dto/create-return.dto";
import { InventoryLedgerService } from "./inventory-ledger.service";
import { InventorySyncOutboxService } from "./inventory-sync-outbox.service";

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
    private readonly syncOutbox: InventorySyncOutboxService,
  ) {}

  async create(input: CreateOrderDto) {
    if (input.externalOrderId) {
      const existing = await this.prisma.omsOrder.findUnique({
        where: {
          tenantId_externalOrderId: {
            tenantId: input.tenantId,
            externalOrderId: input.externalOrderId,
          },
        },
        include: { lines: { include: { reservations: true } } },
      });
      if (existing) {
        return existing;
      }
    }

    const syncJobs: InventorySyncOutbox[] = [];
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.omsOrder.create({
        data: {
          tenantId: input.tenantId,
          externalOrderId: input.externalOrderId,
          status: OmsOrderStatus.RESERVED,
        },
      });

      for (const line of input.lines) {
        await this.assertSellable(tx, input.tenantId, line.sku, line.locationId, line.quantity);
        const createdLine = await tx.omsOrderLine.create({
          data: {
            orderId: created.id,
            tenantId: input.tenantId,
            sku: line.sku,
            locationId: line.locationId,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents ?? 0,
          },
        });
        await tx.stockReservation.create({
          data: {
            tenantId: input.tenantId,
            orderId: created.id,
            orderLineId: createdLine.id,
            sku: line.sku,
            locationId: line.locationId,
            quantity: line.quantity,
            status: StockReservationStatus.ACTIVE,
          },
        });
        const movement = await this.ledger.applyMovementTx(tx, {
          tenantId: input.tenantId,
          sku: line.sku,
          locationId: line.locationId,
          movementType: InventoryLedgerMovementType.ORDER_RESERVED,
          reservedDelta: line.quantity,
          sourceType: "ORDER",
          sourceId: created.id,
          reason: "Order reserved stock",
          metadata: {
            orderLineId: createdLine.id,
            externalOrderId: input.externalOrderId ?? null,
          },
        });
        if (movement.syncJob) {
          syncJobs.push(movement.syncJob);
        }
      }

      return tx.omsOrder.findUniqueOrThrow({
        where: { id: created.id },
        include: { lines: { include: { reservations: true } } },
      });
    });

    await this.enqueueAll(syncJobs);
    return order;
  }

  list(tenantId?: string) {
    return this.prisma.omsOrder.findMany({
      where: { tenantId },
      include: { lines: { include: { reservations: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async cancel(id: string, tenantId?: string) {
    const order = await this.findOrder(id, tenantId);
    if (order.status === OmsOrderStatus.CANCELLED) {
      return order;
    }
    if (order.status === OmsOrderStatus.FULFILLED) {
      throw new BadRequestException("Fulfilled orders cannot be cancelled");
    }

    const syncJobs: InventorySyncOutbox[] = [];
    const updated = await this.prisma.$transaction(async (tx) => {
      for (const line of order.lines) {
        const reservation = line.reservations.find((item) => item.status === StockReservationStatus.ACTIVE);
        if (!reservation) {
          continue;
        }
        const movement = await this.ledger.applyMovementTx(tx, {
          tenantId: order.tenantId,
          sku: line.sku,
          locationId: line.locationId,
          movementType: InventoryLedgerMovementType.ORDER_CANCELLED,
          reservedDelta: -reservation.quantity,
          sourceType: "ORDER",
          sourceId: order.id,
          reason: "Order cancelled",
          metadata: { orderLineId: line.id },
        });
        if (movement.syncJob) {
          syncJobs.push(movement.syncJob);
        }
        await tx.stockReservation.update({
          where: { id: reservation.id },
          data: { status: StockReservationStatus.RELEASED },
        });
      }

      await tx.omsOrder.update({
        where: { id },
        data: { status: OmsOrderStatus.CANCELLED },
      });

      return tx.omsOrder.findUniqueOrThrow({
        where: { id },
        include: { lines: { include: { reservations: true } } },
      });
    });

    await this.enqueueAll(syncJobs);
    return updated;
  }

  async fulfill(id: string, tenantId?: string) {
    const order = await this.findOrder(id, tenantId);
    if (order.status === OmsOrderStatus.FULFILLED) {
      return order;
    }
    if (order.status === OmsOrderStatus.CANCELLED) {
      throw new BadRequestException("Cancelled orders cannot be fulfilled");
    }

    const syncJobs: InventorySyncOutbox[] = [];
    const updated = await this.prisma.$transaction(async (tx) => {
      for (const line of order.lines) {
        const reservation = line.reservations.find((item) => item.status === StockReservationStatus.ACTIVE);
        if (!reservation) {
          throw new BadRequestException(`Order line ${line.id} does not have an active reservation`);
        }
        const movement = await this.ledger.applyMovementTx(tx, {
          tenantId: order.tenantId,
          sku: line.sku,
          locationId: line.locationId,
          movementType: InventoryLedgerMovementType.ORDER_FULFILLED,
          physicalDelta: -reservation.quantity,
          reservedDelta: -reservation.quantity,
          sourceType: "ORDER",
          sourceId: order.id,
          reason: "Order fulfilled",
          metadata: { orderLineId: line.id },
        });
        if (movement.syncJob) {
          syncJobs.push(movement.syncJob);
        }
        await tx.stockReservation.update({
          where: { id: reservation.id },
          data: { status: StockReservationStatus.FULFILLED },
        });
      }

      await tx.omsOrder.update({
        where: { id },
        data: { status: OmsOrderStatus.FULFILLED },
      });

      return tx.omsOrder.findUniqueOrThrow({
        where: { id },
        include: { lines: { include: { reservations: true } } },
      });
    });

    await this.enqueueAll(syncJobs);
    return updated;
  }

  async createReturn(input: CreateReturnDto) {
    const order = await this.findOrder(input.orderId, input.tenantId);
    if (order.status !== OmsOrderStatus.FULFILLED) {
      throw new BadRequestException("Returns can only be created for fulfilled orders");
    }

    const matchingLine = order.lines.find(
      (line) => line.sku === input.sku && line.locationId === input.locationId,
    );
    if (!matchingLine) {
      throw new BadRequestException("Return SKU/location does not exist on the order");
    }

    const alreadyReturned = await this.prisma.inventoryLedgerEntry.aggregate({
      where: {
        tenantId: input.tenantId,
        sku: input.sku,
        locationId: input.locationId,
        movementType: InventoryLedgerMovementType.RETURN_RESTOCKED,
        sourceType: "RETURN",
        sourceId: input.orderId,
      },
      _sum: { physicalDelta: true },
    });
    const returnedQuantity = alreadyReturned._sum.physicalDelta ?? 0;
    if (returnedQuantity + input.quantity > matchingLine.quantity) {
      throw new BadRequestException("Return quantity exceeds fulfilled order quantity");
    }

    const result = await this.ledger.applyMovement({
      tenantId: input.tenantId,
      sku: input.sku,
      locationId: input.locationId,
      movementType: InventoryLedgerMovementType.RETURN_RESTOCKED,
      physicalDelta: input.quantity,
      sourceType: "RETURN",
      sourceId: input.orderId,
      reason: input.reason ?? "Return restocked",
      metadata: {
        orderLineId: matchingLine.id,
      },
    });

    return {
      orderId: input.orderId,
      ledgerEntry: result.ledgerEntry,
      balance: result.balance,
      syncJob: result.syncJob,
    };
  }

  private async assertSellable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    sku: string,
    locationId: string,
    quantity: number,
  ) {
    const balance = await tx.inventoryBalance.findUnique({
      where: {
        tenantId_sku_locationId: {
          tenantId,
          sku,
          locationId,
        },
      },
    });

    if (!balance) {
      throw new NotFoundException(`No inventory balance for ${sku} at ${locationId}`);
    }
    if (balance.sellableQuantity < quantity) {
      throw new BadRequestException(
        `Insufficient sellable stock for ${sku} at ${locationId}: requested ${quantity}, available ${balance.sellableQuantity}`,
      );
    }
  }

  private async findOrder(id: string, tenantId?: string) {
    const order = await this.prisma.omsOrder.findUnique({
      where: { id },
      include: { lines: { include: { reservations: true } } },
    });

    if (!order || (tenantId && order.tenantId !== tenantId)) {
      throw new NotFoundException(`Order ${id} was not found`);
    }

    return order;
  }

  private async enqueueAll(syncJobs: InventorySyncOutbox[]) {
    await Promise.all(syncJobs.map((job) => this.syncOutbox.enqueueJob(job)));
  }
}
