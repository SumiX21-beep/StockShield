import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { bullMqJobId } from "../queues/bullmq-job-id";
import { QUEUE_JOB_NAMES, QUEUE_NAMES } from "../queues/queue.constants";
import { QueueService } from "../queues/queue.service";
import { CreateHybridOrderDto } from "./dto/create-hybrid-order.dto";
import { HybridInventoryQueryDto } from "./dto/hybrid-inventory-query.dto";
import {
  HybridInventoryRow,
  HybridOrderRow,
  HybridOrderStatus,
  HybridProductRow,
  INVENTORY_SELECT,
  ORDER_SELECT,
  PRODUCT_SELECT,
} from "./hybrid-db.types";
import { HybridExternalService } from "./hybrid-external.service";
import { HybridInventoryLockService } from "./hybrid-inventory-lock.service";
import { HybridOrderJobPayload } from "./hybrid-order-job.types";
import { sellableQuantity, tenantIdOrDefault } from "./hybrid-stock";

type SqlClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class HybridOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly external: HybridExternalService,
    private readonly inventoryLock: HybridInventoryLockService,
  ) {}

  async create(input: CreateHybridOrderDto) {
    const tenantId = tenantIdOrDefault(input.tenantId);
    const [order] = await this.prisma.$queryRawUnsafe<HybridOrderRow[]>(
      `
        INSERT INTO orders (id, tenant_id, sku, location_id, quantity, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, 'CREATED', NOW(), NOW())
        RETURNING ${ORDER_SELECT}
      `,
      randomUUID(),
      tenantId,
      input.sku,
      input.locationId,
      input.quantity,
    );

    try {
      const reserved = await this.reserve(order.id);
      const job = await this.enqueue(reserved.id, "create");
      const queued = await this.updateOrderQueuedAt(reserved.id);

      return {
        order: queued,
        queue: {
          name: QUEUE_NAMES.ORDER_PROCESS,
          jobId: job.id,
        },
      };
    } catch (error) {
      await this.handleTerminalFailure(order.id, error);
      throw error;
    }
  }

  async list(query: HybridInventoryQueryDto) {
    const tenantId = tenantIdOrDefault(query.tenantId);
    return this.prisma.$queryRawUnsafe<HybridOrderRow[]>(
      `
        SELECT ${ORDER_SELECT}
        FROM orders
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR sku = $2)
          AND ($3::text IS NULL OR location_id = $3)
        ORDER BY created_at DESC
        LIMIT $4
      `,
      tenantId,
      query.sku ?? null,
      query.locationId ?? null,
      query.limit ?? 100,
    );
  }

  async get(id: string) {
    return this.findOrderOrThrow(this.prisma, id);
  }

  async retry(id: string) {
    const order = await this.get(id);
    if (order.status === "CONFIRMED" && order.externalSyncedAt) {
      return {
        order,
        queue: null,
        message: "Order is already confirmed and externally synced",
      };
    }

    if (order.status === "FAILED") {
      await this.updateOrderStatus(id, "CREATED", null);
      await this.reserve(id);
    }

    const job = await this.enqueue(id, "retry");
    const queued = await this.updateOrderQueuedAt(id);

    return {
      order: queued,
      queue: {
        name: QUEUE_NAMES.ORDER_RETRY,
        jobId: job.id,
      },
    };
  }

  async reserve(id: string) {
    const order = await this.get(id);
    return this.inventoryLock.withLock(
      {
        tenantId: order.tenantId,
        sku: order.sku,
        locationId: order.locationId,
      },
      () => this.reserveUnderLock(order),
    );
  }

  async confirm(id: string) {
    const current = await this.get(id);
    if (current.status === "CONFIRMED") {
      if (!current.externalSyncedAt) {
        await this.external.pushConfirmedOrder({
          orderId: current.id,
          tenantId: current.tenantId,
          sku: current.sku,
          locationId: current.locationId,
          quantity: current.quantity,
        });
        return {
          orderId: current.id,
          status: "synced" as const,
          message: "Confirmed order was missing external sync",
        };
      }

      return {
        orderId: current.id,
        status: "skipped" as const,
        message: "Order was already confirmed",
      };
    }

    const confirmed = await this.inventoryLock.withLock(
      {
        tenantId: current.tenantId,
        sku: current.sku,
        locationId: current.locationId,
      },
      () => this.confirmUnderLock(current.id),
    );

    await this.external.pushConfirmedOrder({
      orderId: confirmed.id,
      tenantId: confirmed.tenantId,
      sku: confirmed.sku,
      locationId: confirmed.locationId,
      quantity: confirmed.quantity,
    });

    return {
      orderId: confirmed.id,
      status: "confirmed" as const,
    };
  }

  async handleTerminalFailure(id: string, error: unknown) {
    const order = await this.findOrder(this.prisma, id);
    if (!order) {
      return null;
    }

    if (order.status === "CONFIRMED") {
      return this.updateOrderFailureReason(
        id,
        `External sync failed after confirmation: ${this.errorMessage(error)}`,
      );
    }
    if (order.status === "CREATED" || order.status === "FAILED") {
      return this.updateOrderStatus(id, "FAILED", this.errorMessage(error));
    }

    return this.releaseAndFail(order, this.errorMessage(error));
  }

  private async reserveUnderLock(order: HybridOrderRow) {
    return this.prisma.$transaction(async (tx) => {
      const freshOrder = await this.findOrderOrThrow(tx, order.id);
      if (freshOrder.status === "RESERVED" || freshOrder.status === "CONFIRMED") {
        return freshOrder;
      }
      if (freshOrder.status === "FAILED") {
        throw new BadRequestException(`Order ${freshOrder.id} is failed and must be retried`);
      }

      const product = await this.findProduct(tx, freshOrder.tenantId, freshOrder.sku);
      if (!product) {
        throw new NotFoundException(`Product ${freshOrder.sku} was not found`);
      }

      const inventory = await this.findInventory(
        tx,
        freshOrder.tenantId,
        freshOrder.sku,
        freshOrder.locationId,
      );
      if (!inventory) {
        throw new NotFoundException(`No inventory for ${freshOrder.sku} at ${freshOrder.locationId}`);
      }

      const available = sellableQuantity(inventory);
      if (available < freshOrder.quantity) {
        throw new BadRequestException(
          `Insufficient sellable stock for ${freshOrder.sku}: requested ${freshOrder.quantity}, available ${available}`,
        );
      }

      await tx.$executeRawUnsafe(
        `
          UPDATE inventory
          SET reserved_quantity = reserved_quantity + $2, updated_at = NOW()
          WHERE id = $1
        `,
        inventory.id,
        freshOrder.quantity,
      );

      return this.updateOrderReserved(tx, freshOrder.id);
    });
  }

  private async confirmUnderLock(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.findOrderOrThrow(tx, id);
      if (order.status !== "RESERVED") {
        throw new BadRequestException(`Order ${id} is ${order.status}, not RESERVED`);
      }

      const inventory = await this.findInventory(tx, order.tenantId, order.sku, order.locationId);
      if (!inventory) {
        throw new NotFoundException(`No inventory for ${order.sku} at ${order.locationId}`);
      }
      if (inventory.reservedQuantity < order.quantity) {
        throw new BadRequestException(`Reserved stock is lower than order quantity for ${order.id}`);
      }
      if (inventory.physicalQuantity < order.quantity) {
        throw new BadRequestException(`Physical stock is lower than order quantity for ${order.id}`);
      }

      await tx.$executeRawUnsafe(
        `
          UPDATE inventory
          SET physical_quantity = physical_quantity - $2,
              reserved_quantity = reserved_quantity - $2,
              updated_at = NOW()
          WHERE id = $1
        `,
        inventory.id,
        order.quantity,
      );

      return this.updateOrderConfirmed(tx, order.id);
    });
  }

  private async releaseAndFail(order: HybridOrderRow, reason: string) {
    return this.inventoryLock.withLock(
      {
        tenantId: order.tenantId,
        sku: order.sku,
        locationId: order.locationId,
      },
      async () => this.prisma.$transaction(async (tx) => {
        const freshOrder = await this.findOrderOrThrow(tx, order.id);

        if (freshOrder.status === "RESERVED") {
          const inventory = await this.findInventory(
            tx,
            freshOrder.tenantId,
            freshOrder.sku,
            freshOrder.locationId,
          );

          if (inventory) {
            await tx.$executeRawUnsafe(
              `
                UPDATE inventory
                SET reserved_quantity = GREATEST(0, reserved_quantity - $2), updated_at = NOW()
                WHERE id = $1
              `,
              inventory.id,
              freshOrder.quantity,
            );
          }
        }

        return this.updateOrderStatus(tx, freshOrder.id, "FAILED", reason);
      }),
    );
  }

  private enqueue(orderId: string, source: HybridOrderJobPayload["source"]) {
    const queueName = source === "retry" ? QUEUE_NAMES.ORDER_RETRY : QUEUE_NAMES.ORDER_PROCESS;
    const jobName = source === "retry" ? QUEUE_JOB_NAMES.RETRY_ORDER : QUEUE_JOB_NAMES.PROCESS_ORDER;
    const queue = this.queues.getQueue(queueName);
    const payload: HybridOrderJobPayload = { orderId, source };

    return queue.add(jobName, payload, {
      jobId: bullMqJobId(jobName, orderId, Date.now()),
    });
  }

  private async findOrder(client: SqlClient, id: string) {
    const [order] = await client.$queryRawUnsafe<HybridOrderRow[]>(
      `
        SELECT ${ORDER_SELECT}
        FROM orders
        WHERE id = $1
        LIMIT 1
      `,
      id,
    );

    return order ?? null;
  }

  private async findOrderOrThrow(client: SqlClient, id: string) {
    const order = await this.findOrder(client, id);
    if (!order) {
      throw new NotFoundException(`Order ${id} was not found`);
    }

    return order;
  }

  private async findProduct(client: SqlClient, tenantId: string, sku: string) {
    const [product] = await client.$queryRawUnsafe<HybridProductRow[]>(
      `
        SELECT ${PRODUCT_SELECT}
        FROM products
        WHERE tenant_id = $1 AND sku = $2
        LIMIT 1
      `,
      tenantId,
      sku,
    );

    return product ?? null;
  }

  private async findInventory(client: SqlClient, tenantId: string, sku: string, locationId: string) {
    const [inventory] = await client.$queryRawUnsafe<HybridInventoryRow[]>(
      `
        SELECT ${INVENTORY_SELECT}
        FROM inventory
        WHERE tenant_id = $1 AND sku = $2 AND location_id = $3
        LIMIT 1
      `,
      tenantId,
      sku,
      locationId,
    );

    return inventory ?? null;
  }

  private async updateOrderQueuedAt(id: string) {
    const [order] = await this.prisma.$queryRawUnsafe<HybridOrderRow[]>(
      `
        UPDATE orders
        SET queued_at = NOW(), updated_at = NOW()
        WHERE id = $1
        RETURNING ${ORDER_SELECT}
      `,
      id,
    );

    return order;
  }

  private async updateOrderReserved(client: SqlClient, id: string) {
    const [order] = await client.$queryRawUnsafe<HybridOrderRow[]>(
      `
        UPDATE orders
        SET status = 'RESERVED',
            reserved_at = NOW(),
            failure_reason = NULL,
            updated_at = NOW()
        WHERE id = $1
        RETURNING ${ORDER_SELECT}
      `,
      id,
    );

    return order;
  }

  private async updateOrderConfirmed(client: SqlClient, id: string) {
    const [order] = await client.$queryRawUnsafe<HybridOrderRow[]>(
      `
        UPDATE orders
        SET status = 'CONFIRMED',
            confirmed_at = NOW(),
            failure_reason = NULL,
            updated_at = NOW()
        WHERE id = $1
        RETURNING ${ORDER_SELECT}
      `,
      id,
    );

    return order;
  }

  private async updateOrderStatus(
    clientOrId: SqlClient | string,
    idOrStatus: string | HybridOrderStatus,
    statusOrReason: HybridOrderStatus | string | null,
    maybeReason?: string | null,
  ) {
    const client = typeof clientOrId === "string" ? this.prisma : clientOrId;
    const id = typeof clientOrId === "string" ? clientOrId : idOrStatus;
    const status = typeof clientOrId === "string" ? idOrStatus : statusOrReason;
    const reason = typeof clientOrId === "string" ? statusOrReason : maybeReason;
    const [order] = await client.$queryRawUnsafe<HybridOrderRow[]>(
      `
        UPDATE orders
        SET status = $2::"HybridOrderStatus",
            failure_reason = $3,
            updated_at = NOW()
        WHERE id = $1
        RETURNING ${ORDER_SELECT}
      `,
      id,
      status,
      typeof reason === "string" ? reason.slice(0, 1_000) : reason,
    );

    return order;
  }

  private async updateOrderFailureReason(id: string, reason: string) {
    const [order] = await this.prisma.$queryRawUnsafe<HybridOrderRow[]>(
      `
        UPDATE orders
        SET failure_reason = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING ${ORDER_SELECT}
      `,
      id,
      reason.slice(0, 1_000),
    );

    return order;
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
