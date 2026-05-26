export type ScanTrigger = "manual" | "scheduled" | "webhook";

export type ScanJobPayload = {
  tenantId: string;
  channel: "SHOPIFY";
  trigger: ScanTrigger;
  sku?: string;
  locationId?: string;
  reason?: string;
  windowStart: string;
  windowEnd: string;
};

export type ScanJobResult = {
  tenantId: string;
  comparedRows: number;
  detectedDrifts: number;
  resolvedDuringScan: number;
  failedManual: number;
  cursorAdvanced: boolean;
};
