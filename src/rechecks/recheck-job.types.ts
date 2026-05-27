export type RecheckJobPayload = {
  webhookRecheckEventId: string;
  tenantId: string;
  channel: "SHOPIFY";
  sku: string;
  locationId: string;
  sourceEventId?: string;
};

export type RecheckJobResult = {
  webhookRecheckEventId: string;
  tenantId: string;
  sku: string;
  locationId: string;
  detectedDrifts: number;
  resolvedDuringScan: number;
  failedManual: number;
};
