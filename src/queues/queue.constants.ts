export const QUEUE_NAMES = {
  ORDER_PROCESS: "order.process",
  ORDER_RETRY: "order.retry",
  ORDER_DLQ: "dlq",
  DRIFT_SCAN: "drift.scan",
  DRIFT_FIX: "drift.fix",
  DRIFT_RECHECK: "drift.recheck",
  DRIFT_DLQ: "drift.dlq",
  HYBRID_DRIFT_FIX: "hybrid.drift.fix",
  INVENTORY_SYNC: "inventory.sync",
} as const;

export const QUEUE_JOB_NAMES = {
  PROCESS_ORDER: "process-order",
  RETRY_ORDER: "retry-order",
  DLQ_ORDER: "dlq-order",
  SCAN_TENANT: "scan-tenant",
  FIX_DRIFT: "fix-drift",
  FIX_HYBRID_DRIFT: "fix-hybrid-drift",
  RECHECK_INVENTORY: "recheck-inventory",
  DLQ_FIX: "dlq-fix",
  SYNC_INVENTORY: "sync-inventory",
} as const;
