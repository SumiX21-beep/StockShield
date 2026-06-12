import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { CreateHybridProductDto } from "./dto/create-hybrid-product.dto";
import { HybridInventoryQueryDto } from "./dto/hybrid-inventory-query.dto";
import { HybridProductRow, PRODUCT_SELECT } from "./hybrid-db.types";
import { tenantIdOrDefault } from "./hybrid-stock";

@Injectable()
export class HybridProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateHybridProductDto) {
    const tenantId = tenantIdOrDefault(input.tenantId);
    const [product] = await this.prisma.$queryRawUnsafe<HybridProductRow[]>(
      `
        INSERT INTO products (id, tenant_id, sku, name, price, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (tenant_id, sku)
        DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, updated_at = NOW()
        RETURNING ${PRODUCT_SELECT}
      `,
      randomUUID(),
      tenantId,
      input.sku,
      input.name,
      input.price,
    );

    return this.view(product);
  }

  async list(query: HybridInventoryQueryDto) {
    const tenantId = tenantIdOrDefault(query.tenantId);
    const products = await this.prisma.$queryRawUnsafe<HybridProductRow[]>(
      `
        SELECT ${PRODUCT_SELECT}
        FROM products
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR sku = $2)
        ORDER BY updated_at DESC
        LIMIT $3
      `,
      tenantId,
      query.sku ?? null,
      query.limit ?? 100,
    );

    return products.map((product) => this.view(product));
  }

  private view(product: HybridProductRow) {
    return {
      ...product,
      price: Number(product.price),
    };
  }
}
