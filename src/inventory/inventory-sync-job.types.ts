export type InventorySyncJobPayload = {
  syncJobId: string;
  tenantId: string;
  sku: string;
  locationId: string;
  targetSellableQuantity: number;
};

export type InventorySyncJobResult = {
  syncJobId: string;
  status: "succeeded" | "failed-manual" | "skipped";
  targetSellableQuantity: number;
  message?: string;
};
