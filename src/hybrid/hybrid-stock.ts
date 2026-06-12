export const DEFAULT_HYBRID_TENANT_ID = "demo";

export function tenantIdOrDefault(tenantId?: string) {
  return tenantId?.trim() || DEFAULT_HYBRID_TENANT_ID;
}

export function sellableQuantity(input: {
  physicalQuantity: number;
  reservedQuantity: number;
}) {
  return input.physicalQuantity - input.reservedQuantity;
}

export function inventoryView<T extends {
  physicalQuantity: number;
  reservedQuantity: number;
}>(row: T) {
  return {
    ...row,
    sellableQuantity: sellableQuantity(row),
  };
}
