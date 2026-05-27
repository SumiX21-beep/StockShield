import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AlertDeliveryStatus, DriftStatus } from "@prisma/client";
import { AlertsService } from "./alerts.service";

describe("AlertsService", () => {
  it("formats drift alerts and logs skipped delivery when Slack is not configured", async () => {
    const records: Record<string, unknown>[] = [];
    const published: Record<string, unknown>[] = [];
    const prisma = {
      alertDeliveryLog: {
        create: async (args: { data: Record<string, unknown> }) => {
          records.push(args.data);
          return {
            id: "alert_1",
            ...args.data,
          };
        },
      },
    };
    const live = {
      publish: (event: Record<string, unknown>) => published.push(event),
    };

    await withSlackEnv(undefined, async () => {
      const service = new AlertsService(prisma as never, live as never);
      await service.notifyDriftDetected({
        id: "drift_1",
        tenantId: "tenant_1",
        channel: "SHOPIFY",
        sku: "TSHIRT-BLK-M",
        locationId: "loc_1",
        omsAvailable: 100,
        channelAvailable: 95,
        drift: 5,
        status: DriftStatus.FIX_QUEUED,
        reason: "AUTO_FIX_QUEUED",
        createdAt: new Date("2026-05-27T00:00:00Z"),
        updatedAt: new Date("2026-05-27T00:00:00Z"),
      });
    });

    assert.equal(records[0].tenantId, "tenant_1");
    assert.equal(records[0].status, AlertDeliveryStatus.SKIPPED);
    assert.equal(records[0].message, "Drift detected for SKU TSHIRT-BLK-M: OMS=100, Shopify=95, location=loc_1");
    assert.equal(published[0].type, "alert.skipped");
  });
});

async function withSlackEnv(value: string | undefined, callback: () => Promise<void>) {
  const previous = process.env.SLACK_WEBHOOK_URL;
  try {
    if (value === undefined) {
      delete process.env.SLACK_WEBHOOK_URL;
    } else {
      process.env.SLACK_WEBHOOK_URL = value;
    }
    await callback();
  } finally {
    if (previous === undefined) {
      delete process.env.SLACK_WEBHOOK_URL;
    } else {
      process.env.SLACK_WEBHOOK_URL = previous;
    }
  }
}
