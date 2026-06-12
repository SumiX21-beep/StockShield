import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ChannelType, RecheckStatus, TenantChannelStatus } from "@prisma/client";
import { HybridOrdersService } from "../hybrid/hybrid-orders.service";
import { PrismaService } from "../prisma/prisma.service";
import { QUEUE_JOB_NAMES, QUEUE_NAMES } from "../queues/queue.constants";
import { QueueService } from "../queues/queue.service";
import { RecheckJobPayload } from "../rechecks/recheck-job.types";
import { ShopifyWebhookVerifierService } from "./shopify-webhook-verifier.service";

export type ShopifyInventoryLevelsUpdatePayload = {
  inventory_item_id?: number | string;
  location_id?: number | string;
  available?: number;
};

export type ShopifyOrdersCreatePayload = {
  id?: number | string;
  order_number?: number;
  line_items?: Array<{
    id?: number | string;
    sku?: string;
    quantity?: number;
    title?: string;
  }>;
};

type ShopifyWebhookHeaders = {
  hmac?: string | string[];
  shopDomain?: string | string[];
  topic?: string | string[];
  webhookId?: string | string[];
  eventId?: string | string[];
};

@Injectable()
export class ShopifyWebhooksService {
  private readonly logger = new Logger(ShopifyWebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly verifier: ShopifyWebhookVerifierService,
    private readonly hybridOrders: HybridOrdersService,
  ) {}

  async handleInventoryLevelsUpdate(input: {
    rawBody?: Buffer;
    body: ShopifyInventoryLevelsUpdatePayload;
    headers: ShopifyWebhookHeaders;
  }) {
    if (!this.verifier.verify(input.rawBody, input.headers.hmac)) {
      throw new UnauthorizedException("Invalid Shopify webhook HMAC");
    }

    const shopDomain = this.normalizeShopDomain(this.firstHeader(input.headers.shopDomain));
    const inventoryItemId = input.body.inventory_item_id;
    const locationId = input.body.location_id;
    if (!shopDomain || !this.isShopifyId(inventoryItemId) || !this.isShopifyId(locationId)) {
      throw new BadRequestException("Shopify webhook payload is missing shop or inventory identifiers");
    }

    const config = await this.prisma.tenantChannelConfig.findFirst({
      where: {
        channel: ChannelType.SHOPIFY,
        shopDomain,
        status: TenantChannelStatus.ACTIVE,
      },
    });

    if (!config) {
      throw new NotFoundException(`No active tenant channel config found for ${shopDomain}`);
    }

    const mapping = await this.prisma.tenantSkuLocationMap.findFirst({
      where: {
        tenantId: config.tenantId,
        channel: ChannelType.SHOPIFY,
        shopifyInventoryItemId: String(inventoryItemId),
        shopifyLocationId: String(locationId),
        isActive: true,
      },
    });

    const sourceEventId = this.firstHeader(input.headers.webhookId) ?? this.firstHeader(input.headers.eventId);
    if (!mapping) {
      const failedEvent = await this.prisma.webhookRecheckEvent.create({
        data: {
          tenantId: config.tenantId,
          channel: ChannelType.SHOPIFY,
          status: RecheckStatus.FAILED,
          sourceEventId,
          payload: this.payload(input.body, input.headers, "MAPPING_MISSING"),
        },
      });

      return {
        accepted: true,
        queued: false,
        reason: "MAPPING_MISSING",
        webhookRecheckEventId: failedEvent.id,
      };
    }

    const recheckEvent = await this.prisma.webhookRecheckEvent.create({
      data: {
        tenantId: config.tenantId,
        channel: ChannelType.SHOPIFY,
        sku: mapping.sku,
        locationId: mapping.omsLocationId,
        sourceEventId,
        status: RecheckStatus.QUEUED,
        payload: this.payload(input.body, input.headers),
      },
    });

    const payload: RecheckJobPayload = {
      webhookRecheckEventId: recheckEvent.id,
      tenantId: config.tenantId,
      channel: "SHOPIFY",
      sku: mapping.sku,
      locationId: mapping.omsLocationId,
      sourceEventId,
    };
    const queue = this.queueService.getQueue(QUEUE_NAMES.DRIFT_RECHECK);
    const job = await queue.add(QUEUE_JOB_NAMES.RECHECK_INVENTORY, payload, {
      jobId: recheckEvent.id,
    });

    return {
      accepted: true,
      queued: true,
      queue: QUEUE_NAMES.DRIFT_RECHECK,
      jobId: job.id,
      webhookRecheckEventId: recheckEvent.id,
      tenantId: config.tenantId,
      sku: mapping.sku,
      locationId: mapping.omsLocationId,
    };
  }

  async handleOrdersCreate(input: {
    rawBody?: Buffer;
    body: ShopifyOrdersCreatePayload;
    headers: ShopifyWebhookHeaders;
  }) {
    if (!this.verifier.verify(input.rawBody, input.headers.hmac)) {
      throw new UnauthorizedException("Invalid Shopify webhook HMAC");
    }

    const shopDomain = this.normalizeShopDomain(this.firstHeader(input.headers.shopDomain));
    const lineItems = (input.body.line_items ?? []).filter(
      (item) => item.sku && item.quantity && item.quantity > 0,
    );

    if (!lineItems.length) {
      return { accepted: true, orders: [], reason: "NO_SKU_LINE_ITEMS" };
    }

    const tenantId = await this.resolveTenantId(shopDomain);
    const locationId = process.env.SHOPIFY_DEFAULT_LOCATION_ID ?? "warehouse-1";
    const results = [];

    for (const item of lineItems) {
      try {
        const result = await this.hybridOrders.create({
          tenantId,
          sku: item.sku!,
          locationId,
          quantity: item.quantity!,
        });
        results.push({ sku: item.sku, status: "queued", orderId: result.order.id });
        this.logger.log(`Shopify order ${input.body.order_number} → created order ${result.order.id} for SKU ${item.sku}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ sku: item.sku, status: "failed", reason: message });
        this.logger.error(`Shopify order ${input.body.order_number} → failed for SKU ${item.sku}: ${message}`);
      }
    }

    return {
      accepted: true,
      shopifyOrderId: input.body.id,
      orderNumber: input.body.order_number,
      tenantId,
      locationId,
      orders: results,
    };
  }

  private async resolveTenantId(shopDomain: string | undefined): Promise<string> {
    if (shopDomain) {
      const config = await this.prisma.tenantChannelConfig.findFirst({
        where: { channel: ChannelType.SHOPIFY, shopDomain, status: TenantChannelStatus.ACTIVE },
        select: { tenantId: true },
      });
      if (config) return config.tenantId;
    }
    return process.env.SHOPIFY_DEFAULT_TENANT_ID ?? "demo";
  }

  private firstHeader(value: string | string[] | undefined) {
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }

  private normalizeShopDomain(value: string | undefined) {
    if (!value) {
      return undefined;
    }

    return value
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
  }

  private isShopifyId(value: unknown): value is number | string {
    if (typeof value === "number") {
      return Number.isSafeInteger(value) && value >= 0;
    }

    return typeof value === "string" && /^\d+$/.test(value);
  }

  private payload(
    body: ShopifyInventoryLevelsUpdatePayload,
    headers: ShopifyWebhookHeaders,
    reason?: string,
  ) {
    return {
      reason: reason ?? null,
      body,
      headers: {
        topic: this.firstHeader(headers.topic) ?? null,
        shopDomain: this.firstHeader(headers.shopDomain) ?? null,
        webhookId: this.firstHeader(headers.webhookId) ?? null,
        eventId: this.firstHeader(headers.eventId) ?? null,
      },
    };
  }
}
