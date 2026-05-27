import { Injectable, Logger } from "@nestjs/common";
import { AlertDeliveryStatus, DriftEvent } from "@prisma/client";
import { LiveEventsService } from "../live-events/live-events.service";
import { PrismaService } from "../prisma/prisma.service";
import { ListAlertsQueryDto } from "./dto/list-alerts.query";

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly liveEventsService: LiveEventsService,
  ) {}

  list(query: ListAlertsQueryDto) {
    return this.prisma.alertDeliveryLog.findMany({
      where: {
        tenantId: query.tenantId,
        status: query.status,
      },
      orderBy: { createdAt: "desc" },
      take: query.limit,
    });
  }

  notifyDriftDetected(event: DriftEvent) {
    return this.sendSlack({
      tenantId: event.tenantId,
      driftEventId: event.id,
      message: `Drift detected for SKU ${event.sku}: OMS=${event.omsAvailable}, Shopify=${event.channelAvailable}, location=${event.locationId}`,
    });
  }

  notifyFixFailed(input: {
    tenantId: string;
    driftEventId?: string;
    sku: string;
    locationId: string;
    targetQty?: number;
    reason: string;
  }) {
    const target = input.targetQty === undefined ? "" : `, target=${input.targetQty}`;
    return this.sendSlack({
      tenantId: input.tenantId,
      driftEventId: input.driftEventId,
      message: `StockShield needs manual attention for SKU ${input.sku}: location=${input.locationId}${target}, reason=${input.reason}`,
    });
  }

  notifyHighRiskSku(input: {
    tenantId: string;
    sku: string;
    locationId: string;
    driftCount24h: number;
  }) {
    return this.sendSlack({
      tenantId: input.tenantId,
      message: `High-risk SKU detected: ${input.sku} at ${input.locationId} drifted ${input.driftCount24h} times in the last 24h`,
    });
  }

  async sendSlack(input: {
    tenantId: string;
    driftEventId?: string | null;
    message: string;
  }) {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      return this.record({
        ...input,
        status: AlertDeliveryStatus.SKIPPED,
        errorMessage: "SLACK_WEBHOOK_URL is not configured",
      });
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: input.message,
        }),
      });

      if (!response.ok) {
        return this.record({
          ...input,
          status: AlertDeliveryStatus.FAILED,
          errorMessage: `Slack webhook returned HTTP ${response.status}`,
        });
      }

      return this.record({
        ...input,
        status: AlertDeliveryStatus.SENT,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Slack alert failed: ${errorMessage}`);
      return this.record({
        ...input,
        status: AlertDeliveryStatus.FAILED,
        errorMessage,
      });
    }
  }

  private async record(input: {
    tenantId: string;
    driftEventId?: string | null;
    message: string;
    status: AlertDeliveryStatus;
    errorMessage?: string;
  }) {
    const log = await this.prisma.alertDeliveryLog.create({
      data: {
        tenantId: input.tenantId,
        driftEventId: input.driftEventId ?? null,
        status: input.status,
        message: input.message,
        errorMessage: input.errorMessage,
      },
    });

    this.liveEventsService.publish({
      type: input.status === AlertDeliveryStatus.SENT ? "alert.sent" : input.status === AlertDeliveryStatus.FAILED ? "alert.failed" : "alert.skipped",
      tenantId: input.tenantId,
      id: log.id,
      driftEventId: input.driftEventId ?? null,
      status: input.status,
      message: input.message,
    });

    return log;
  }
}
