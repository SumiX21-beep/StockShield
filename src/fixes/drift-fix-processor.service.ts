import { Injectable, Logger } from "@nestjs/common";
import {
  ChannelType,
  DriftAttemptStatus,
  DriftStatus,
  IdempotencyRecord,
  IdempotencyStatus,
  Prisma,
  TenantChannelStatus,
} from "@prisma/client";
import { AlertsService } from "../alerts/alerts.service";
import { LiveEventsService } from "../live-events/live-events.service";
import { RedisLockService } from "../locks/redis-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { ShopifyInventoryService } from "../shopify/shopify-inventory.service";
import { buildDriftLockKey } from "./fix-job.helpers";
import { FixJobPayload, FixJobResult } from "./fix-job.types";

type FixContext = {
  attemptsMade: number;
  maxAttempts: number;
};

@Injectable()
export class DriftFixProcessorService {
  private readonly logger = new Logger(DriftFixProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyInventory: ShopifyInventoryService,
    private readonly redisLock: RedisLockService,
    private readonly alertsService: AlertsService,
    private readonly liveEventsService: LiveEventsService,
  ) {}

  async process(payload: FixJobPayload, context: FixContext): Promise<FixJobResult> {
    const lock = await this.redisLock.acquire(
      buildDriftLockKey(payload),
      Number(process.env.DRIFT_FIX_LOCK_TTL_MS ?? 60_000),
    );

    if (!lock) {
      throw new Error(`Fix already locked for ${payload.tenantId}:${payload.sku}:${payload.locationId}`);
    }

    let attemptLogId: string | null = null;

    try {
      const idempotency = await this.reserveIdempotency(payload);
      if (idempotency.status === IdempotencyStatus.COMPLETED) {
        return {
          driftEventId: payload.driftEventId,
          status: "skipped",
          targetQty: payload.targetQty,
          message: "Idempotent fix already completed",
        };
      }

      const driftEvent = await this.prisma.driftEvent.findUnique({
        where: { id: payload.driftEventId },
      });

      if (!driftEvent) {
        await this.markIdempotencyFailed(payload.idempotencyKey, "Drift event not found");
        return {
          driftEventId: payload.driftEventId,
          status: "failed-manual",
          targetQty: payload.targetQty,
          message: "Drift event not found",
        };
      }

      if (driftEvent.status === DriftStatus.RESOLVED || driftEvent.status === DriftStatus.IGNORED) {
        await this.markIdempotencyCompleted(payload.idempotencyKey, {
          skipped: true,
          reason: `Event already ${driftEvent.status}`,
        });
        return {
          driftEventId: payload.driftEventId,
          status: "skipped",
          targetQty: payload.targetQty,
          message: `Event already ${driftEvent.status}`,
        };
      }

      attemptLogId = await this.createAttemptLog(payload);

      const config = await this.prisma.tenantChannelConfig.findUnique({
        where: {
          tenantId_channel: {
            tenantId: payload.tenantId,
            channel: ChannelType.SHOPIFY,
          },
        },
      });

      if (!config || config.status !== TenantChannelStatus.ACTIVE) {
        return this.failManual(payload, attemptLogId, "TENANT_CHANNEL_INACTIVE");
      }

      const mapping = await this.prisma.tenantSkuLocationMap.findFirst({
        where: {
          tenantId: payload.tenantId,
          channel: ChannelType.SHOPIFY,
          sku: payload.sku,
          omsLocationId: payload.locationId,
          isActive: true,
        },
      });

      if (!mapping) {
        return this.failManual(payload, attemptLogId, "MAPPING_MISSING");
      }

      await this.prisma.driftEvent.update({
        where: { id: payload.driftEventId },
        data: {
          status: DriftStatus.FIXING,
          reason: payload.cause,
        },
      });

      const currentAvailable = await this.shopifyInventory.getAvailableQuantity(config, mapping);
      if (currentAvailable === payload.targetQty) {
        const responsePayload = {
          skipped: true,
          reason: "CHANNEL_ALREADY_MATCHED",
          currentAvailable,
        };
        await this.markAttemptSkipped(attemptLogId, responsePayload);
        await this.markResolved(payload, responsePayload);
        return {
          driftEventId: payload.driftEventId,
          status: "resolved",
          targetQty: payload.targetQty,
          message: "Channel already matched target quantity",
        };
      }

      const responsePayload = await this.shopifyInventory.setAvailableQuantity(config, mapping, payload.targetQty);
      const appliedAvailable = responsePayload.inventory_level?.available ?? payload.targetQty;
      if (appliedAvailable !== payload.targetQty) {
        throw new Error(`Shopify returned available=${appliedAvailable}, expected=${payload.targetQty}`);
      }

      await this.prisma.driftAttemptLog.update({
        where: { id: attemptLogId },
        data: {
          status: DriftAttemptStatus.SUCCESS,
          responsePayload: responsePayload as Prisma.InputJsonValue,
        },
      });
      await this.markResolved(payload, responsePayload);

      return {
        driftEventId: payload.driftEventId,
        status: "resolved",
        targetQty: payload.targetQty,
      };
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.warn(`Fix failed for drift ${payload.driftEventId}: ${message}`);
      await this.markRetryableFailure(payload, attemptLogId, message, context);
      if (context.attemptsMade + 1 >= context.maxAttempts) {
        return {
          driftEventId: payload.driftEventId,
          status: "failed-manual",
          targetQty: payload.targetQty,
          message,
        };
      }

      throw error;
    } finally {
      await this.redisLock.release(lock);
    }
  }

  private async reserveIdempotency(payload: FixJobPayload): Promise<IdempotencyRecord> {
    const lockedUntil = new Date(Date.now() + Number(process.env.DRIFT_FIX_LOCK_TTL_MS ?? 60_000));

    try {
      return await this.prisma.idempotencyRecord.create({
        data: {
          key: payload.idempotencyKey,
          tenantId: payload.tenantId,
          channel: ChannelType.SHOPIFY,
          operation: "drift.fix",
          status: IdempotencyStatus.STARTED,
          lockedUntil,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }
    }

    const existing = await this.prisma.idempotencyRecord.findUniqueOrThrow({
      where: { key: payload.idempotencyKey },
    });

    if (existing.status === IdempotencyStatus.COMPLETED) {
      return existing;
    }

    if (
      existing.status === IdempotencyStatus.STARTED &&
      existing.lockedUntil &&
      existing.lockedUntil.getTime() > Date.now()
    ) {
      throw new Error(`Idempotency key is already in progress: ${payload.idempotencyKey}`);
    }

    return this.prisma.idempotencyRecord.update({
      where: { key: payload.idempotencyKey },
      data: {
        status: IdempotencyStatus.STARTED,
        lockedUntil,
      },
    });
  }

  private async createAttemptLog(payload: FixJobPayload) {
    const current = await this.prisma.driftAttemptLog.aggregate({
      where: { driftEventId: payload.driftEventId },
      _max: { attemptNumber: true },
    });

    const attempt = await this.prisma.driftAttemptLog.create({
      data: {
        driftEventId: payload.driftEventId,
        attemptNumber: (current._max.attemptNumber ?? 0) + 1,
        status: DriftAttemptStatus.STARTED,
        targetQuantity: payload.targetQty,
        requestPayload: {
          tenantId: payload.tenantId,
          sku: payload.sku,
          locationId: payload.locationId,
          targetQty: payload.targetQty,
          cause: payload.cause,
          idempotencyKey: payload.idempotencyKey,
        },
      },
    });

    return attempt.id;
  }

  private async failManual(payload: FixJobPayload, attemptLogId: string, reason: string): Promise<FixJobResult> {
    await this.prisma.$transaction([
      this.prisma.driftAttemptLog.update({
        where: { id: attemptLogId },
        data: {
          status: DriftAttemptStatus.FAILED,
          errorMessage: reason,
        },
      }),
      this.prisma.driftEvent.update({
        where: { id: payload.driftEventId },
        data: {
          status: DriftStatus.FAILED_MANUAL,
          reason,
        },
      }),
      this.prisma.idempotencyRecord.update({
        where: { key: payload.idempotencyKey },
        data: {
          status: IdempotencyStatus.FAILED,
          responsePayload: { reason },
          lockedUntil: null,
        },
      }),
    ]);
    this.publishDriftUpdate(payload, DriftStatus.FAILED_MANUAL);
    await this.alertsService.notifyFixFailed({
      tenantId: payload.tenantId,
      driftEventId: payload.driftEventId,
      sku: payload.sku,
      locationId: payload.locationId,
      targetQty: payload.targetQty,
      reason,
    });

    return {
      driftEventId: payload.driftEventId,
      status: "failed-manual",
      targetQty: payload.targetQty,
      message: reason,
    };
  }

  private async markAttemptSkipped(attemptLogId: string, responsePayload: Prisma.InputJsonValue) {
    await this.prisma.driftAttemptLog.update({
      where: { id: attemptLogId },
      data: {
        status: DriftAttemptStatus.SKIPPED,
        responsePayload,
      },
    });
  }

  private async markResolved(payload: FixJobPayload, responsePayload: Prisma.InputJsonValue) {
    await this.prisma.$transaction([
      this.prisma.driftEvent.update({
        where: { id: payload.driftEventId },
        data: {
          omsAvailable: payload.targetQty,
          channelAvailable: payload.targetQty,
          drift: 0,
          status: DriftStatus.RESOLVED,
          reason: "AUTO_FIX_APPLIED",
        },
      }),
      this.prisma.idempotencyRecord.update({
        where: { key: payload.idempotencyKey },
        data: {
          status: IdempotencyStatus.COMPLETED,
          responsePayload,
          lockedUntil: null,
        },
      }),
    ]);
    this.publishDriftUpdate(payload, DriftStatus.RESOLVED);
  }

  private async markIdempotencyCompleted(key: string, responsePayload: Prisma.InputJsonValue) {
    await this.prisma.idempotencyRecord.update({
      where: { key },
      data: {
        status: IdempotencyStatus.COMPLETED,
        responsePayload,
        lockedUntil: null,
      },
    });
  }

  private async markIdempotencyFailed(key: string, reason: string) {
    await this.prisma.idempotencyRecord.update({
      where: { key },
      data: {
        status: IdempotencyStatus.FAILED,
        responsePayload: { reason },
        lockedUntil: null,
      },
    });
  }

  private async markRetryableFailure(
    payload: FixJobPayload,
    attemptLogId: string | null,
    message: string,
    context: FixContext,
  ) {
    const terminal = context.attemptsMade + 1 >= context.maxAttempts;
    const status = terminal ? DriftStatus.FAILED_MANUAL : DriftStatus.RETRYING;

    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.driftEvent.update({
        where: { id: payload.driftEventId },
        data: {
          status,
          reason: message.slice(0, 300),
        },
      }),
      this.prisma.idempotencyRecord.update({
        where: { key: payload.idempotencyKey },
        data: {
          status: IdempotencyStatus.FAILED,
          responsePayload: { reason: message.slice(0, 500), terminal },
          lockedUntil: null,
        },
      }),
    ];

    if (attemptLogId) {
      operations.push(
        this.prisma.driftAttemptLog.update({
          where: { id: attemptLogId },
          data: {
            status: DriftAttemptStatus.FAILED,
            errorMessage: message.slice(0, 1_000),
          },
        }),
      );
    }

    await this.prisma.$transaction(operations);
    this.publishDriftUpdate(payload, status);

    if (terminal) {
      await this.alertsService.notifyFixFailed({
        tenantId: payload.tenantId,
        driftEventId: payload.driftEventId,
        sku: payload.sku,
        locationId: payload.locationId,
        targetQty: payload.targetQty,
        reason: message.slice(0, 300),
      });
    }
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private publishDriftUpdate(payload: FixJobPayload, status: DriftStatus) {
    this.liveEventsService.publish({
      type: "drift.updated",
      tenantId: payload.tenantId,
      id: payload.driftEventId,
      driftEventId: payload.driftEventId,
      sku: payload.sku,
      locationId: payload.locationId,
      status,
    });
  }
}
