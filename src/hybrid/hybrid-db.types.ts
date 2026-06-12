export type HybridOrderStatus = "CREATED" | "RESERVED" | "CONFIRMED" | "FAILED";
export type HybridDriftStatus = "DETECTED" | "FIX_QUEUED" | "FIXING" | "RESOLVED" | "FAILED_MANUAL" | "IGNORED";

export type HybridProductRow = {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  price: number | string;
  createdAt: Date;
  updatedAt: Date;
};

export type HybridInventoryRow = {
  id: string;
  tenantId: string;
  sku: string;
  locationId: string;
  physicalQuantity: number;
  reservedQuantity: number;
  createdAt: Date;
  updatedAt: Date;
};

export type HybridOrderRow = {
  id: string;
  tenantId: string;
  sku: string;
  locationId: string;
  quantity: number;
  status: HybridOrderStatus;
  failureReason: string | null;
  queuedAt: Date | null;
  reservedAt: Date | null;
  confirmedAt: Date | null;
  externalSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type HybridExternalInventoryRow = {
  id: string;
  tenantId: string;
  sku: string;
  locationId: string;
  availableQuantity: number;
  createdAt: Date;
  updatedAt: Date;
};

export type HybridExternalOrderRow = {
  id: string;
  tenantId: string;
  coreOrderId: string | null;
  sku: string;
  locationId: string;
  quantity: number;
  status: string;
  requestPayload: unknown;
  responsePayload: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type HybridDriftRow = {
  id: string;
  tenantId: string;
  sku: string;
  locationId: string;
  expectedQty: number;
  actualQty: number;
  status: HybridDriftStatus;
  resolution: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const PRODUCT_SELECT = `
  id,
  tenant_id AS "tenantId",
  sku,
  name,
  price,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export const INVENTORY_SELECT = `
  id,
  tenant_id AS "tenantId",
  sku,
  location_id AS "locationId",
  physical_quantity AS "physicalQuantity",
  reserved_quantity AS "reservedQuantity",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export const ORDER_SELECT = `
  id,
  tenant_id AS "tenantId",
  sku,
  location_id AS "locationId",
  quantity,
  status,
  failure_reason AS "failureReason",
  queued_at AS "queuedAt",
  reserved_at AS "reservedAt",
  confirmed_at AS "confirmedAt",
  external_synced_at AS "externalSyncedAt",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export const EXTERNAL_INVENTORY_SELECT = `
  id,
  tenant_id AS "tenantId",
  sku,
  location_id AS "locationId",
  available_quantity AS "availableQuantity",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export const EXTERNAL_ORDER_SELECT = `
  id,
  tenant_id AS "tenantId",
  core_order_id AS "coreOrderId",
  sku,
  location_id AS "locationId",
  quantity,
  status,
  request_payload AS "requestPayload",
  response_payload AS "responsePayload",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export const DRIFT_SELECT = `
  id,
  tenant_id AS "tenantId",
  sku,
  location_id AS "locationId",
  expected_qty AS "expectedQty",
  actual_qty AS "actualQty",
  status,
  resolution,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;
