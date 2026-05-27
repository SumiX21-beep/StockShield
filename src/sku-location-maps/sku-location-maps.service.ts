import { Injectable, NotFoundException } from "@nestjs/common";
import { ChannelType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateSkuLocationMapDto } from "./dto/create-sku-location-map.dto";
import { ListSkuLocationMapsQueryDto } from "./dto/list-sku-location-maps.query";
import { UpdateSkuLocationMapDto } from "./dto/update-sku-location-map.dto";

@Injectable()
export class SkuLocationMapsService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateSkuLocationMapDto) {
    return this.prisma.tenantSkuLocationMap.upsert({
      where: {
        tenantId_channel_sku_omsLocationId: {
          tenantId: input.tenantId,
          channel: ChannelType.SHOPIFY,
          sku: input.sku,
          omsLocationId: input.omsLocationId,
        },
      },
      create: {
        tenantId: input.tenantId,
        channel: ChannelType.SHOPIFY,
        sku: input.sku,
        omsLocationId: input.omsLocationId,
        shopifyInventoryItemId: input.shopifyInventoryItemId,
        shopifyLocationId: input.shopifyLocationId,
        isActive: input.isActive ?? true,
      },
      update: {
        shopifyInventoryItemId: input.shopifyInventoryItemId,
        shopifyLocationId: input.shopifyLocationId,
        isActive: input.isActive ?? true,
      },
    });
  }

  list(query: ListSkuLocationMapsQueryDto) {
    const where: Prisma.TenantSkuLocationMapWhereInput = {
      tenantId: query.tenantId,
      sku: query.sku,
      omsLocationId: query.omsLocationId,
      isActive: query.isActive,
    };

    return this.prisma.tenantSkuLocationMap.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string, tenantId?: string) {
    const mapping = await this.prisma.tenantSkuLocationMap.findUnique({
      where: { id },
    });

    if (!mapping || (tenantId && mapping.tenantId !== tenantId)) {
      throw new NotFoundException(`SKU location map ${id} was not found`);
    }

    return mapping;
  }

  async update(id: string, input: UpdateSkuLocationMapDto, tenantId?: string) {
    await this.findById(id, tenantId);

    return this.prisma.tenantSkuLocationMap.update({
      where: { id },
      data: {
        shopifyInventoryItemId: input.shopifyInventoryItemId,
        shopifyLocationId: input.shopifyLocationId,
        isActive: input.isActive,
      },
    });
  }
}
