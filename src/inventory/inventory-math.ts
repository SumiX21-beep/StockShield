export function calculateSellableQuantity(input: {
  physicalQuantity: number;
  reservedQuantity: number;
  safetyBuffer: number;
}) {
  return Math.max(0, input.physicalQuantity - input.reservedQuantity - input.safetyBuffer);
}

export function assertWholeQuantity(value: number, label: string) {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
}
