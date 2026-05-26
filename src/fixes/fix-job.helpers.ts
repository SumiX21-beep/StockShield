export function buildFixIdempotencyKey(input: {
  tenantId: string;
  channel: "SHOPIFY";
  sku: string;
  locationId: string;
  targetQty: number;
  scanWindow: string;
}) {
  return [
    "fix",
    input.tenantId,
    input.channel,
    input.sku,
    input.locationId,
    input.targetQty,
    input.scanWindow,
  ].join(":");
}

export function buildDriftLockKey(input: {
  tenantId: string;
  sku: string;
  locationId: string;
}) {
  return `lock:drift:${input.tenantId}:shopify:${input.sku}:${input.locationId}`;
}
