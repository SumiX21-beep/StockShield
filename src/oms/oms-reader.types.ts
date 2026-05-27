export type OmsCursor = {
  lastSeenAt: Date | null;
  lastSeenId: string | null;
};

export type OmsChangedInventoryQuery = {
  tenantId: string;
  fromCursor: OmsCursor;
  windowStart: Date;
  windowEnd: Date;
  sku?: string;
  locationId?: string;
  limit: number;
};

export type OmsCurrentInventoryQuery = {
  tenantId: string;
  sku: string;
  locationId: string;
};

export type OmsChangedInventoryRow = {
  rowId: string;
  sku: string;
  locationId: string;
  stockedQuantity: number;
  reservedQuantity: number;
  updatedAt: Date;
};
