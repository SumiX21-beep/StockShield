import { Injectable, Logger } from "@nestjs/common";
import { ChannelType, DriftEvent, DriftStatus, Prisma, TenantChannelConfig, TenantChannelStatus } from "@prisma/client";
import { AlertsService } from "../alerts/alerts.service";
import { buildFixIdempotencyKey } from "../fixes/fix-job.helpers";
import { FixJobPayload } from "../fixes/fix-job.types";
import { LiveEventsService } from "../live-events/live-events.service";
import { OmsReaderService } from "../oms/oms-reader.service";
import { OmsChangedInventoryRow } from "../oms/oms-reader.types";
import { PrismaService } from "../prisma/prisma.service";
import { QUEUE_JOB_NAMES, QUEUE_NAMES } from "../queues/queue.constants";
import { QueueService } from "../queues/queue.service";
import { RiskService } from "../risk/risk.service";
import { ShopifyInventoryService } from "../shopify/shopify-inventory.service";
import { calculateOmsAvailable, compareInventory, driftThresholdFromEnv } from "./inventory-comparison";
import { nextCursorFromRows, scanCursorForWindow } from "./scan-cursor";
import { RecheckScanResult, ScanJobPayload, ScanJobResult } from "./scan-job.types";

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
    private readonly alertsService: AlertsService,
    private readonly liveEventsService: LiveEventsService,
    private readonly riskService: RiskService,
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

    const fromCursor = scanCursorForWindow({
      trigger: payload.trigger,
      storedCursor: {
        lastSeenAt: storedCursor.lastSeenAt,
        lastSeenId: storedCursor.lastSeenId,
      },
      windowStart,
    });

    const rows = await this.omsReader.readChangedInventory({
      tenantId: payload.tenantId,
      fromCursor,
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

    const nextCursor = nextCursorFromRows(rows);
    if (payload.trigger === "scheduled" && nextCursor?.lastSeenAt) {
      await this.prisma.driftScanCursor.update({
        where: {
          tenantId_channel: {
            tenantId: payload.tenantId,
            channel: ChannelType.SHOPIFY,
          },
        },
        data: {
          lastSeenAt: nextCursor.lastSeenAt,
          lastSeenId: nextCursor.lastSeenId,
        },
      });
    }

    return {
      tenantId: payload.tenantId,
      comparedRows: rows.length,
      detectedDrifts,
      resolvedDuringScan,
      failedManual,
      cursorAdvanced: payload.trigger === "scheduled" && Boolean(nextCursor),
    };
  }

  async processTargetedRecheck(input: {
    tenantId: string;
    sku: string;
    locationId: string;
    sourceEventId?: string;
  }): Promise<RecheckScanResult> {
    const tenantConfig = await this.prisma.tenantChannelConfig.findUnique({
      where: {
        tenantId_channel: {
          tenantId: input.tenantId,
          channel: ChannelType.SHOPIFY,
        },
      },
    });

    if (!tenantConfig || tenantConfig.status !== TenantChannelStatus.ACTIVE) {
      return {
        tenantId: input.tenantId,
        sku: input.sku,
        locationId: input.locationId,
        detectedDrifts: 0,
        resolvedDuringScan: 0,
        failedManual: 0,
      };
    }

    const row = await this.omsReader.readCurrentInventory({
      tenantId: input.tenantId,
      sku: input.sku,
      locationId: input.locationId,
    });

    if (!row) {
      await this.createOrUpdateDrift({
        tenantId: input.tenantId,
        sku: input.sku,
        locationId: input.locationId,
        omsAvailable: 0,
        channelAvailable: 0,
        status: DriftStatus.FAILED_MANUAL,
        reason: "OMS_ROW_MISSING",
      });

      return {
        tenantId: input.tenantId,
        sku: input.sku,
        locationId: input.locationId,
        detectedDrifts: 0,
        resolvedDuringScan: 0,
        failedManual: 1,
      };
    }

    const result = await this.processRow(
      input.tenantId,
      tenantConfig,
      row,
      `recheck:${input.sourceEventId ?? new Date().toISOString()}`,
    );

    return {
      tenantId: input.tenantId,
      sku: input.sku,
      locationId: input.locationId,
      ...result,
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

    const omsAvailable = calculateOmsAvailable(row.stockedQuantity, row.reservedQuantity);

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
      const comparison = compareInventory({
        omsAvailable,
        channelAvailable,
        threshold: driftThresholdFromEnv(),
      });

      if (comparison.hasDrift) {
        const driftEvent = await this.createOrUpdateDrift({
          tenantId,
          sku: row.sku,
          locationId: row.locationId,
          omsAvailable: comparison.omsAvailable,
          channelAvailable: comparison.channelAvailable,
          status: DriftStatus.FIX_QUEUED,
          reason: "AUTO_FIX_QUEUED",
        });
        await this.enqueueFix(driftEvent, comparison.omsAvailable, scanWindow);
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
          omsAvailable: comparison.omsAvailable,
          channelAvailable: comparison.channelAvailable,
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
    const open = await this.findReusableDrift(input);

    if (open) {
      const updated = await this.updateDrift(open.id, input);
      await this.afterDriftMutation("drift.updated", updated, open.status);
      return updated;
    }

    try {
      const created = await this.prisma.driftEvent.create({
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
      await this.afterDriftMutation("drift.created", created);
      return created;
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      const existing = await this.findReusableDrift(input);
      if (!existing) {
        throw error;
      }

      const updated = await this.updateDrift(existing.id, input);
      await this.afterDriftMutation("drift.updated", updated, existing.status);
      return updated;
    }
  }

  private findReusableDrift(input: {
    tenantId: string;
    sku: string;
    locationId: string;
  }) {
    return this.prisma.driftEvent.findFirst({
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
  }

  private updateDrift(id: string, input: {
    omsAvailable: number;
    channelAvailable: number;
    status: DriftStatus;
    reason: string;
  }) {
    return this.prisma.driftEvent.update({
      where: { id },
      data: {
        omsAvailable: input.omsAvailable,
        channelAvailable: input.channelAvailable,
        drift: input.omsAvailable - input.channelAvailable,
        status: input.status,
        reason: input.reason,
      },
    });
  }

  private isUniqueConstraintError(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
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

  private async afterDriftMutation(
    type: "drift.created" | "drift.updated",
    driftEvent: DriftEvent,
    previousStatus?: DriftStatus,
  ) {
    this.liveEventsService.publish({
      type,
      tenantId: driftEvent.tenantId,
      id: driftEvent.id,
      driftEventId: driftEvent.id,
      sku: driftEvent.sku,
      locationId: driftEvent.locationId,
      status: driftEvent.status,
    });
    await this.riskService.refreshForEvent(driftEvent);

    if (type === "drift.created" && (driftEvent.status === DriftStatus.FIX_QUEUED || driftEvent.status === DriftStatus.DETECTED)) {
      await this.alertsService.notifyDriftDetected(driftEvent);
    }

    if (driftEvent.status === DriftStatus.FAILED_MANUAL && previousStatus !== DriftStatus.FAILED_MANUAL) {
      await this.alertsService.notifyFixFailed({
        tenantId: driftEvent.tenantId,
        driftEventId: driftEvent.id,
        sku: driftEvent.sku,
        locationId: driftEvent.locationId,
        reason: driftEvent.reason ?? "FAILED_MANUAL",
      });
    }
  }
}
