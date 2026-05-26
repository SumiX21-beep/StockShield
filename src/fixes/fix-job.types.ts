export type FixCause = "scan-detected" | "manual-retry" | "webhook-recheck";

export type FixJobPayload = {
  driftEventId: string;
  tenantId: string;
  channel: "SHOPIFY";
  sku: string;
  locationId: string;
  targetQty: number;
  cause: FixCause;
  idempotencyKey: string;
};

export type FixJobResult = {
  driftEventId: string;
  status: "resolved" | "skipped" | "failed-manual";
  targetQty: number;
  message?: string;
};
