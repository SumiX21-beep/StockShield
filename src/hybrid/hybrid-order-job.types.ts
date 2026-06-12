export type HybridOrderJobPayload = {
  orderId: string;
  source: "create" | "retry";
};

export type HybridOrderJobResult = {
  orderId: string;
  status: "confirmed" | "synced" | "skipped";
  message?: string;
};
