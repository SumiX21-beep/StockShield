import { Injectable, NotFoundException } from "@nestjs/common";
import { ChannelType, Prisma, TenantChannelConfig, TenantChannelStatus } from "@prisma/client";
import { TokenCryptoService } from "../crypto/token-crypto.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTenantChannelConfigDto } from "./dto/create-tenant-channel-config.dto";
import { ListTenantChannelConfigsQueryDto } from "./dto/list-tenant-channel-configs.query";
import { UpdateTenantChannelConfigDto } from "./dto/update-tenant-channel-config.dto";

@Injectable()
export class TenantChannelConfigsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenCrypto: TokenCryptoService,
  ) {}

  async create(input: CreateTenantChannelConfigDto) {
    const config = await this.prisma.tenantChannelConfig.upsert({
      where: {
        tenantId_channel: {
          tenantId: input.tenantId,
          channel: ChannelType.SHOPIFY,
        },
      },
      create: {
        tenantId: input.tenantId,
        channel: ChannelType.SHOPIFY,
        status: input.status ?? TenantChannelStatus.ACTIVE,
        shopDomain: input.shopDomain,
        encryptedAccessToken: this.tokenCrypto.encrypt(input.accessToken),
        apiVersion: input.apiVersion,
      },
      update: {
        status: input.status ?? TenantChannelStatus.ACTIVE,
        shopDomain: input.shopDomain,
        encryptedAccessToken: this.tokenCrypto.encrypt(input.accessToken),
        apiVersion: input.apiVersion,
      },
    });

    return this.toSafeConfig(config);
  }

  async list(query: ListTenantChannelConfigsQueryDto) {
    const configs = await this.prisma.tenantChannelConfig.findMany({
      where: {
        tenantId: query.tenantId,
        status: query.status,
      },
      orderBy: { createdAt: "desc" },
    });

    return configs.map((config) => this.toSafeConfig(config));
  }

  async findById(id: string, tenantId?: string) {
    const config = await this.findEntityById(id, tenantId);
    return this.toSafeConfig(config);
  }

  async update(id: string, input: UpdateTenantChannelConfigDto, tenantId?: string) {
    await this.findEntityById(id, tenantId);

    const data: Prisma.TenantChannelConfigUpdateInput = {};

    if (input.shopDomain !== undefined) data.shopDomain = input.shopDomain;
    if (input.accessToken !== undefined) data.encryptedAccessToken = this.tokenCrypto.encrypt(input.accessToken);
    if (input.apiVersion !== undefined) data.apiVersion = input.apiVersion;
    if (input.status !== undefined) data.status = input.status;

    const config = await this.prisma.tenantChannelConfig.update({
      where: { id },
      data,
    });

    return this.toSafeConfig(config);
  }

  private async findEntityById(id: string, tenantId?: string) {
    const config = await this.prisma.tenantChannelConfig.findUnique({
      where: { id },
    });

    if (!config || (tenantId && config.tenantId !== tenantId)) {
      throw new NotFoundException(`Tenant channel config ${id} was not found`);
    }

    return config;
  }

  private toSafeConfig(config: TenantChannelConfig) {
    const { encryptedAccessToken, ...safeConfig } = config;

    return {
      ...safeConfig,
      hasAccessToken: Boolean(encryptedAccessToken),
    };
  }
}
