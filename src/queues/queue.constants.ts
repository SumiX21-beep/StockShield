export const QUEUE_NAMES = {
  DRIFT_SCAN: "drift.scan",
  DRIFT_FIX: "drift.fix",
  DRIFT_RECHECK: "drift.recheck",
  DRIFT_DLQ: "drift.dlq",
} as const;

export const QUEUE_JOB_NAMES = {
  SCAN_TENANT: "scan-tenant",
  FIX_DRIFT: "fix-drift",
  RECHECK_INVENTORY: "recheck-inventory",
  DLQ_FIX: "dlq-fix",
} as const;
