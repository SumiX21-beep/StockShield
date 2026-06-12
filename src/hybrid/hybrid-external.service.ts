import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ExternalHybridOrderDto } from "./dto/external-hybrid-order.dto";
import { HybridInventoryQueryDto } from "./dto/hybrid-inventory-query.dto";
import { WebhookInventoryUpdateDto } from "./dto/webhook-inventory-update.dto";
import {
  EXTERNAL_INVENTORY_SELECT,
  EXTERNAL_ORDER_SELECT,
  HybridExternalInventoryRow,
  HybridExternalOrderRow,
  HybridInventoryRow,
  INVENTORY_SELECT,
} from "./hybrid-db.types";
import { HybridInventoryLockService } from "./hybrid-inventory-lock.service";
import { inventoryView, sellableQuantity, tenantIdOrDefault } from "./hybrid-stock";

@Injectable()
export class HybridExternalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryLock: HybridInventoryLockService,
  ) {}

  async createOrder(input: ExternalHybridOrderDto, options?: { decrementInventory?: boolean }) {
    const tenantId = tenantIdOrDefault(input.tenantId);
    if (input.coreOrderId) {
      const [existing] = await this.prisma.$queryRawUnsafe<HybridExternalOrderRow[]>(
        `
          SELECT ${EXTERNAL_ORDER_SELECT}
          FROM external_orders
          WHERE core_order_id = $1
          LIMIT 1
        `,
        input.coreOrderId,
      );
      if (existing) {
        return existing;
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const [externalOrder] = await tx.$queryRawUnsafe<HybridExternalOrderRow[]>(
        `
          INSERT INTO external_orders (
            id, tenant_id, core_order_id, sku, location_id, quantity, status,
            request_payload, response_payload, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'ACCEPTED', $7::jsonb, $8::jsonb, NOW(), NOW())
          RETURNING ${EXTERNAL_ORDER_SELECT}
        `,
        randomUUID(),
        tenantId,
        input.coreOrderId ?? null,
        input.sku,
        input.locationId,
        input.quantity,
        JSON.stringify(input),
        JSON.stringify({ accepted: true, provider: "mock-shopify" }),
      );

      if (options?.decrementInventory !== false) {
        await this.decrementExternalInventoryTx(tx, {
          tenantId,
          sku: input.sku,
          locationId: input.locationId,
          quantity: input.quantity,
        });
      }

      return externalOrder;
    });
  }

  listInventory(query: HybridInventoryQueryDto) {
    const tenantId = tenantIdOrDefault(query.tenantId);
    return this.prisma.$queryRawUnsafe<HybridExternalInventoryRow[]>(
      `
        SELECT ${EXTERNAL_INVENTORY_SELECT}
        FROM external_inventory
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR sku = $2)
          AND ($3::text IS NULL OR location_id = $3)
        ORDER BY updated_at DESC
        LIMIT $4
      `,
      tenantId,
      query.sku ?? null,
      query.locationId ?? null,
      query.limit ?? 100,
    );
  }

  async setAvailable(input: {
    tenantId?: string;
    sku: string;
    locationId: string;
    availableQuantity: number;
  }) {
    const tenantId = tenantIdOrDefault(input.tenantId);
    const [row] = await this.prisma.$queryRawUnsafe<HybridExternalInventoryRow[]>(
      `
        INSERT INTO external_inventory (
          id, tenant_id, sku, location_id, available_quantity, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (tenant_id, sku, location_id)
        DO UPDATE SET available_quantity = EXCLUDED.available_quantity, updated_at = NOW()
        RETURNING ${EXTERNAL_INVENTORY_SELECT}
      `,
      randomUUID(),
      tenantId,
      input.sku,
      input.locationId,
      input.availableQuantity,
    );

    return row;
  }

  async syncInventoryFromInternal(input: {
    tenantId: string;
    sku: string;
    locationId: string;
  }) {
    const [balance] = await this.prisma.$queryRawUnsafe<HybridInventoryRow[]>(
      `
        SELECT ${INVENTORY_SELECT}
        FROM inventory
        WHERE tenant_id = $1 AND sku = $2 AND location_id = $3
        LIMIT 1
      `,
      input.tenantId,
      input.sku,
      input.locationId,
    );
    const availableQuantity = balance ? sellableQuantity(balance) : 0;

    return this.setAvailable({
      ...input,
      availableQuantity,
    });
  }

  async pushConfirmedOrder(input: {
    orderId: string;
    tenantId: string;
    sku: string;
    locationId: string;
    quantity: number;
  }) {
    const externalOrder = await this.createOrder(
      {
        tenantId: input.tenantId,
        coreOrderId: input.orderId,
        sku: input.sku,
        locationId: input.locationId,
        quantity: input.quantity,
      },
      { decrementInventory: false },
    );
    const externalInventory = await this.syncInventoryFromInternal(input);

    await this.prisma.$executeRawUnsafe(
      `
        UPDATE orders
        SET external_synced_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `,
      input.orderId,
    );

    return {
      externalOrder,
      externalInventory,
    };
  }

  async applyWebhookInventoryUpdate(input: WebhookInventoryUpdateDto) {
    const tenantId = tenantIdOrDefault(input.tenantId);
    const external = await this.setAvailable({
      tenantId,
      sku: input.sku,
      locationId: input.locationId,
      availableQuantity: input.availableQuantity,
    });

    const internal = await this.inventoryLock.withLock(
      {
        tenantId,
        sku: input.sku,
        locationId: input.locationId,
      },
      async () => {
        const [existing] = await this.prisma.$queryRawUnsafe<HybridInventoryRow[]>(
          `
            SELECT ${INVENTORY_SELECT}
            FROM inventory
            WHERE tenant_id = $1 AND sku = $2 AND location_id = $3
            LIMIT 1
          `,
          tenantId,
          input.sku,
          input.locationId,
        );
        const reservedQuantity = existing?.reservedQuantity ?? 0;
        const physicalQuantity = input.availableQuantity + reservedQuantity;

        const [row] = await this.prisma.$queryRawUnsafe<HybridInventoryRow[]>(
          `
            INSERT INTO inventory (
              id, tenant_id, sku, location_id, physical_quantity, reserved_quantity, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
            ON CONFLICT (tenant_id, sku, location_id)
            DO UPDATE SET physical_quantity = EXCLUDED.physical_quantity, updated_at = NOW()
            RETURNING ${INVENTORY_SELECT}
          `,
          randomUUID(),
          tenantId,
          input.sku,
          input.locationId,
          physicalQuantity,
          reservedQuantity,
        );

        return row;
      },
    );

    return {
      external,
      internal: inventoryView(internal),
    };
  }

  private async decrementExternalInventoryTx(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      sku: string;
      locationId: string;
      quantity: number;
    },
  ) {
    const [existing] = await tx.$queryRawUnsafe<HybridExternalInventoryRow[]>(
      `
        SELECT ${EXTERNAL_INVENTORY_SELECT}
        FROM external_inventory
        WHERE tenant_id = $1 AND sku = $2 AND location_id = $3
        LIMIT 1
      `,
      input.tenantId,
      input.sku,
      input.locationId,
    );
    const nextAvailable = Math.max(0, (existing?.availableQuantity ?? 0) - input.quantity);

    const [row] = await tx.$queryRawUnsafe<HybridExternalInventoryRow[]>(
      `
        INSERT INTO external_inventory (
          id, tenant_id, sku, location_id, available_quantity, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (tenant_id, sku, location_id)
        DO UPDATE SET available_quantity = EXCLUDED.available_quantity, updated_at = NOW()
        RETURNING ${EXTERNAL_INVENTORY_SELECT}
      `,
      randomUUID(),
      input.tenantId,
      input.sku,
      input.locationId,
      nextAvailable,
    );

    return row;
  }
}
