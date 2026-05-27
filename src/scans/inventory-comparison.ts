export type InventoryComparison = {
  omsAvailable: number;
  channelAvailable: number;
  drift: number;
  threshold: number;
  hasDrift: boolean;
};

export function calculateOmsAvailable(stockedQuantity: number, reservedQuantity: number) {
  const stocked = normalizeIntegerQuantity(stockedQuantity, "stockedQuantity");
  const reserved = normalizeIntegerQuantity(reservedQuantity, "reservedQuantity");

  return Math.max(0, stocked - reserved);
}

export function compareInventory(input: {
  omsAvailable: number;
  channelAvailable: number;
  threshold?: number;
}): InventoryComparison {
  const omsAvailable = normalizeIntegerQuantity(input.omsAvailable, "omsAvailable");
  const channelAvailable = normalizeIntegerQuantity(input.channelAvailable, "channelAvailable");
  const threshold = normalizeDriftThreshold(input.threshold);
  const drift = omsAvailable - channelAvailable;

  return {
    omsAvailable,
    channelAvailable,
    drift,
    threshold,
    hasDrift: Math.abs(drift) > threshold,
  };
}

export function driftThresholdFromEnv() {
  return normalizeDriftThreshold(process.env.DRIFT_THRESHOLD);
}

export function normalizeDriftThreshold(value: unknown) {
  const threshold = Number(value ?? 0);
  if (!Number.isFinite(threshold) || threshold < 0) {
    return 0;
  }

  return Math.floor(threshold);
}

function normalizeIntegerQuantity(value: number, fieldName: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid inventory quantity for ${fieldName}`);
  }

  return Math.trunc(value);
}
