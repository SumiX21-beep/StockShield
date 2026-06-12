import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AdjustHybridInventoryDto } from "./dto/adjust-hybrid-inventory.dto";
import { HybridInventoryQueryDto } from "./dto/hybrid-inventory-query.dto";
import { HybridExternalService } from "./hybrid-external.service";
import { HybridInventoryRow, HybridProductRow, INVENTORY_SELECT, PRODUCT_SELECT } from "./hybrid-db.types";
import { HybridInventoryLockService } from "./hybrid-inventory-lock.service";
import { inventoryView, sellableQuantity, tenantIdOrDefault } from "./hybrid-stock";

@Injectable()
export class HybridInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly external: HybridExternalService,
    private readonly inventoryLock: HybridInventoryLockService,
  ) {}

  async adjust(input: AdjustHybridInventoryDto) {
    const tenantId = tenantIdOrDefault(input.tenantId);
    const balance = await this.inventoryLock.withLock(
      {
        tenantId,
        sku: input.sku,
        locationId: input.locationId,
      },
      () => this.adjustUnderLock({ ...input, tenantId }),
    );
    const response = {
      inventory: inventoryView(balance),
      externalSync: null as Awaited<ReturnType<HybridExternalService["setAvailable"]>> | null,
    };

    if (input.syncExternal !== false) {
      response.externalSync = await this.external.setAvailable({
        tenantId,
        sku: input.sku,
        locationId: input.locationId,
        availableQuantity: sellableQuantity(balance),
      });
    }

    return response;
  }

  async list(query: HybridInventoryQueryDto) {
    const tenantId = tenantIdOrDefault(query.tenantId);
    const rows = await this.prisma.$queryRawUnsafe<HybridInventoryRow[]>(
      `
        SELECT ${INVENTORY_SELECT}
        FROM inventory
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

    return rows.map((row) => inventoryView(row));
  }

  private async adjustUnderLock(input: AdjustHybridInventoryDto & { tenantId: string }) {
    return this.prisma.$transaction(async (tx) => {
      const [product] = await tx.$queryRawUnsafe<HybridProductRow[]>(
        `
          SELECT ${PRODUCT_SELECT}
          FROM products
          WHERE tenant_id = $1 AND sku = $2
          LIMIT 1
        `,
        input.tenantId,
        input.sku,
      );

      if (!product) {
        throw new NotFoundException(`Product ${input.sku} was not found`);
      }

      const [existing] = await tx.$queryRawUnsafe<HybridInventoryRow[]>(
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

      const physicalQuantity = (existing?.physicalQuantity ?? 0) + input.physicalDelta;
      const reservedQuantity = existing?.reservedQuantity ?? 0;

      if (physicalQuantity < 0) {
        throw new BadRequestException("Inventory adjustment would make physical stock negative");
      }
      if (reservedQuantity > physicalQuantity) {
        throw new BadRequestException("Inventory adjustment would make reserved stock exceed physical stock");
      }

      const [row] = await tx.$queryRawUnsafe<HybridInventoryRow[]>(
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
        input.tenantId,
        input.sku,
        input.locationId,
        physicalQuantity,
        reservedQuantity,
      );

      return row;
    });
  }
}
