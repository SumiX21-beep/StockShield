import { OmsChangedInventoryRow, OmsCursor } from "../oms/oms-reader.types";
import { ScanTrigger } from "./scan-job.types";

export function scanCursorForWindow(input: {
  trigger: ScanTrigger;
  storedCursor: OmsCursor;
  windowStart: Date;
}): OmsCursor {
  if (input.trigger === "scheduled" && input.storedCursor.lastSeenAt) {
    return {
      lastSeenAt: input.storedCursor.lastSeenAt,
      lastSeenId: input.storedCursor.lastSeenId ?? "",
    };
  }

  return {
    lastSeenAt: input.windowStart,
    lastSeenId: "",
  };
}

export function nextCursorFromRows(rows: OmsChangedInventoryRow[]): OmsCursor | null {
  const last = rows.at(-1);
  if (!last) {
    return null;
  }

  return {
    lastSeenAt: last.updatedAt,
    lastSeenId: last.rowId,
  };
}

export function isRowAfterCursor(row: OmsChangedInventoryRow, cursor: OmsCursor) {
  if (!cursor.lastSeenAt) {
    return true;
  }

  const rowTime = row.updatedAt.getTime();
  const cursorTime = cursor.lastSeenAt.getTime();
  if (rowTime !== cursorTime) {
    return rowTime > cursorTime;
  }

  return row.rowId > (cursor.lastSeenId ?? "");
}
