import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateLocationDto } from "./dto/create-location.dto";
import { CreateProductDto } from "./dto/create-product.dto";

@Injectable()
export class InventoryCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async createProduct(input: CreateProductDto) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          tenantId: input.tenantId,
          title: input.title,
          description: input.description,
        },
      });

      if (!input.sku) {
        return {
          ...product,
          skus: [],
        };
      }

      const sku = await tx.sku.upsert({
        where: {
          tenantId_sku: {
            tenantId: input.tenantId,
            sku: input.sku,
          },
        },
        create: {
          tenantId: input.tenantId,
          productId: product.id,
          sku: input.sku,
          title: input.skuTitle ?? input.title,
          safetyBuffer: input.safetyBuffer ?? 0,
          unitPriceCents: input.unitPriceCents ?? 0,
        },
        update: {
          productId: product.id,
          title: input.skuTitle ?? input.title,
          safetyBuffer: input.safetyBuffer,
          unitPriceCents: input.unitPriceCents,
          isActive: true,
        },
      });

      return {
        ...product,
        skus: [sku],
      };
    });
  }

  listProducts(tenantId?: string) {
    const where: Prisma.ProductWhereInput = { tenantId };
    return this.prisma.product.findMany({
      where,
      include: { skus: true },
      orderBy: { createdAt: "desc" },
    });
  }

  createLocation(input: CreateLocationDto) {
    return this.prisma.warehouseLocation.upsert({
      where: {
        tenantId_locationId: {
          tenantId: input.tenantId,
          locationId: input.locationId,
        },
      },
      create: {
        tenantId: input.tenantId,
        locationId: input.locationId,
        name: input.name,
      },
      update: {
        name: input.name,
        isActive: true,
      },
    });
  }

  listLocations(tenantId?: string) {
    return this.prisma.warehouseLocation.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
  }

  async ensureProductAndLocation(input: {
    tenantId: string;
    sku: string;
    locationId: string;
  }) {
    const [sku, location] = await Promise.all([
      this.prisma.sku.findUnique({
        where: {
          tenantId_sku: {
            tenantId: input.tenantId,
            sku: input.sku,
          },
        },
      }),
      this.prisma.warehouseLocation.findUnique({
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
