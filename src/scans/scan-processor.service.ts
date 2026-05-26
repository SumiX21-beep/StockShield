import { Injectable, Logger } from "@nestjs/common";
import { ChannelType, DriftEvent, DriftStatus, TenantChannelConfig, TenantChannelStatus } from "@prisma/client";
import { buildFixIdempotencyKey } from "../fixes/fix-job.helpers";
import { FixJobPayload } from "../fixes/fix-job.types";
import { OmsReaderService } from "../oms/oms-reader.service";
import { OmsChangedInventoryRow } from "../oms/oms-reader.types";
import { PrismaService } from "../prisma/prisma.service";
import { QUEUE_JOB_NAMES, QUEUE_NAMES } from "../queues/queue.constants";
import { QueueService } from "../queues/queue.service";
import { ShopifyInventoryService } from "../shopify/shopify-inventory.service";
import { ScanJobPayload, ScanJobResult } from "./scan-job.types";

const OPEN_DRIFT_STATUSES = [
  DriftStatus.DETECTED,
  DriftStatus.FIX_QUEUED,
  DriftStatus.FIXING,
  DriftStatus.RETRYING,
];
const REUSABLE_DRIFT_STATUSES = [...OPEN_DRIFT_STATUSES, DriftStatus.FAILED_MANUAL];

@Injectable()
export class ScanProcessorService {
  private readonly logger = new Logger(ScanProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly omsReader: OmsReaderService,
    private readonly shopifyInventory: ShopifyInventoryService,
    private readonly queueService: QueueService,
  ) {}

  async process(payload: ScanJobPayload): Promise<ScanJobResult> {
    const tenantConfig = await this.prisma.tenantChannelConfig.findUnique({
      where: {
        tenantId_channel: {
          tenantId: payload.tenantId,
          channel: ChannelType.SHOPIFY,
        },
      },
    });

    if (!tenantConfig || tenantConfig.status !== TenantChannelStatus.ACTIVE) {
      return {
        tenantId: payload.tenantId,
        comparedRows: 0,
        detectedDrifts: 0,
        resolvedDuringScan: 0,
        failedManual: 0,
        cursorAdvanced: false,
      };
    }

    const windowStart = new Date(payload.windowStart);
    const windowEnd = new Date(payload.windowEnd);
    if (Number.isNaN(windowStart.getTime()) || Number.isNaN(windowEnd.getTime())) {
      throw new Error(`Invalid scan window for tenant ${payload.tenantId}`);
    }
    const storedCursor = await this.prisma.driftScanCursor.upsert({
      where: {
        tenantId_channel: {
          tenantId: payload.tenantId,
          channel: ChannelType.SHOPIFY,
        },
      },
      create: {
        tenantId: payload.tenantId,
        channel: ChannelType.SHOPIFY,
        lastSeenAt: null,
        lastSeenId: null,
      },
      update: {},
    });

    const rows = await this.omsReader.readChangedInventory({
      tenantId: payload.tenantId,
      fromCursor: payload.trigger === "scheduled"
        ? {
            lastSeenAt: storedCursor.lastSeenAt,
            lastSeenId: storedCursor.lastSeenId,
          }
        : {
            lastSeenAt: windowStart,
            lastSeenId: "",
          },
      windowStart,
      windowEnd,
      sku: payload.sku,
      locationId: payload.locationId,
      limit: this.scanLimit(),
    });

    let detectedDrifts = 0;
    let resolvedDuringScan = 0;
    let failedManual = 0;

    for (const row of rows) {
      const outcome = await this.processRow(
        payload.tenantId,
        tenantConfig,
        row,
        `${payload.windowStart}:${payload.windowEnd}`,
      );
      detectedDrifts += outcome.detectedDrifts;
      resolvedDuringScan += outcome.resolvedDuringScan;
      failedManual += outcome.failedManual;
    }

    if (payload.trigger === "scheduled" && rows.length > 0) {
      const last = rows[rows.length - 1];
      await this.prisma.driftScanCursor.update({
        where: {
          tenantId_channel: {
            tenantId: payload.tenantId,
            channel: ChannelType.SHOPIFY,
          },
        },
        data: {
          lastSeenAt: last.updatedAt,
          lastSeenId: last.rowId,
        },
      });
    }

    return {
      tenantId: payload.tenantId,
      comparedRows: rows.length,
      detectedDrifts,
      resolvedDuringScan,
      failedManual,
      cursorAdvanced: payload.trigger === "scheduled" && rows.length > 0,
    };
  }

  private async processRow(
    tenantId: string,
    tenantConfig: TenantChannelConfig,
    row: OmsChangedInventoryRow,
    scanWindow: string,
  ) {
    const mapping = await this.prisma.tenantSkuLocationMap.findFirst({
      where: {
        tenantId,
        channel: ChannelType.SHOPIFY,
        sku: row.sku,
        omsLocationId: row.locationId,
        isActive: true,
      },
    });

    const omsAvailable = Math.max(0, row.stockedQuantity - row.reservedQuantity);

    if (!mapping) {
      await this.createOrUpdateDrift({
        tenantId,
        sku: row.sku,
        locationId: row.locationId,
        omsAvailable,
        channelAvailable: 0,
        status: DriftStatus.FAILED_MANUAL,
        reason: "MAPPING_MISSING",
      });
      return {
        detectedDrifts: 0,
        resolvedDuringScan: 0,
        failedManual: 1,
      };
    }

    try {
      const channelAvailable = await this.shopifyInventory.getAvailableQuantity(tenantConfig, mapping);
      const drift = omsAvailable - channelAvailable;

      if (Math.abs(drift) > 0) {
        const driftEvent = await this.createOrUpdateDrift({
          tenantId,
          sku: row.sku,
          locationId: row.locationId,
          omsAvailable,
          channelAvailable,
          status: DriftStatus.FIX_QUEUED,
          reason: "AUTO_FIX_QUEUED",
        });
        await this.enqueueFix(driftEvent, omsAvailable, scanWindow);
        return {
          detectedDrifts: 1,
          resolvedDuringScan: 0,
          failedManual: 0,
        };
      }

      const resolvedCount = await this.prisma.driftEvent.updateMany({
        where: {
          tenantId,
          channel: ChannelType.SHOPIFY,
          sku: row.sku,
          locationId: row.locationId,
          status: { in: OPEN_DRIFT_STATUSES },
        },
        data: {
          omsAvailable,
          channelAvailable,
          drift: 0,
          status: DriftStatus.RESOLVED,
          reason: "IN_SYNC_DURING_SCAN",
        },
      });

      return {
        detectedDrifts: 0,
        resolvedDuringScan: resolvedCount.count,
        failedManual: 0,
      };
    } catch (error) {
      this.logger.warn(`Shopify compare failed for ${tenantId}:${row.sku}:${row.locationId}: ${String(error)}`);
      await this.createOrUpdateDrift({
        tenantId,
        sku: row.sku,
        locationId: row.locationId,
        omsAvailable,
        channelAvailable: 0,
        status: DriftStatus.FAILED_MANUAL,
        reason: "CHANNEL_READ_FAILED",
      });
      return {
        detectedDrifts: 0,
        resolvedDuringScan: 0,
        failedManual: 1,
      };
    }
  }

  private scanLimit() {
    const value = Number(process.env.DRIFT_SCAN_LIMIT ?? 1_000);
    if (!Number.isFinite(value) || value <= 0) {
      return 1_000;
    }
    return Math.floor(value);
  }

  private async createOrUpdateDrift(input: {
    tenantId: string;
    sku: string;
    locationId: string;
    omsAvailable: number;
    channelAvailable: number;
    status: DriftStatus;
    reason: string;
  }): Promise<DriftEvent> {
    const open = await this.prisma.driftEvent.findFirst({
      where: {
        tenantId: input.tenantId,
        channel: ChannelType.SHOPIFY,
        sku: input.sku,
        locationId: input.locationId,
        status: { in: REUSABLE_DRIFT_STATUSES },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (open) {
      return this.prisma.driftEvent.update({
        where: { id: open.id },
        data: {
          omsAvailable: input.omsAvailable,
          channelAvailable: input.channelAvailable,
          drift: input.omsAvailable - input.channelAvailable,
          status: input.status,
          reason: input.reason,
        },
      });
    }

    return this.prisma.driftEvent.create({
      data: {
        tenantId: input.tenantId,
        channel: ChannelType.SHOPIFY,
        sku: input.sku,
        locationId: input.locationId,
        omsAvailable: input.omsAvailable,
        channelAvailable: input.channelAvailable,
        drift: input.omsAvailable - input.channelAvailable,
        status: input.status,
        reason: input.reason,
      },
    });
  }

  private async enqueueFix(driftEvent: DriftEvent, targetQty: number, scanWindow: string) {
    const idempotencyKey = buildFixIdempotencyKey({
      tenantId: driftEvent.tenantId,
      channel: "SHOPIFY",
      sku: driftEvent.sku,
      locationId: driftEvent.locationId,
      targetQty,
      scanWindow,
    });
    const payload: FixJobPayload = {
      driftEventId: driftEvent.id,
      tenantId: driftEvent.tenantId,
      channel: "SHOPIFY",
      sku: driftEvent.sku,
      locationId: driftEvent.locationId,
      targetQty,
      cause: "scan-detected",
      idempotencyKey,
    };

    const queue = this.queueService.getQueue(QUEUE_NAMES.DRIFT_FIX);
    await queue.add(QUEUE_JOB_NAMES.FIX_DRIFT, payload, {
      jobId: idempotencyKey,
    });
  }
}
