import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OmsChangedInventoryRow } from "../oms/oms-reader.types";
import { isRowAfterCursor, nextCursorFromRows, scanCursorForWindow } from "./scan-cursor";

describe("scan cursor helpers", () => {
  it("uses the stored cursor for scheduled scans", () => {
    const cursor = scanCursorForWindow({
      trigger: "scheduled",
      storedCursor: {
        lastSeenAt: new Date("2026-05-27T00:02:00Z"),
        lastSeenId: "row_2",
      },
      windowStart: new Date("2026-05-27T00:00:00Z"),
    });

    assert.deepEqual(cursor, {
      lastSeenAt: new Date("2026-05-27T00:02:00Z"),
      lastSeenId: "row_2",
    });
  });

  it("starts from the requested window for manual scans", () => {
    const cursor = scanCursorForWindow({
      trigger: "manual",
      storedCursor: {
        lastSeenAt: new Date("2026-05-27T00:02:00Z"),
        lastSeenId: "row_2",
      },
      windowStart: new Date("2026-05-27T00:00:00Z"),
    });

    assert.deepEqual(cursor, {
      lastSeenAt: new Date("2026-05-27T00:00:00Z"),
      lastSeenId: "",
    });
  });

  it("falls back to the scan window when a scheduled tenant has no cursor yet", () => {
    const cursor = scanCursorForWindow({
      trigger: "scheduled",
      storedCursor: {
        lastSeenAt: null,
        lastSeenId: null,
      },
      windowStart: new Date("2026-05-27T00:00:00Z"),
    });

    assert.deepEqual(cursor, {
      lastSeenAt: new Date("2026-05-27T00:00:00Z"),
      lastSeenId: "",
    });
  });

  it("advances to the last processed row", () => {
    const rows = [
      row("row_1", "2026-05-27T00:01:00Z"),
      row("row_2", "2026-05-27T00:01:00Z"),
    ];

    assert.deepEqual(nextCursorFromRows(rows), {
      lastSeenAt: new Date("2026-05-27T00:01:00Z"),
      lastSeenId: "row_2",
    });
    assert.equal(nextCursorFromRows([]), null);
  });

  it("uses row id as the tie-breaker for equal timestamps", () => {
    const cursor = {
      lastSeenAt: new Date("2026-05-27T00:01:00Z"),
      lastSeenId: "row_2",
    };

    assert.equal(isRowAfterCursor(row("row_1", "2026-05-27T00:01:00Z"), cursor), false);
    assert.equal(isRowAfterCursor(row("row_2", "2026-05-27T00:01:00Z"), cursor), false);
    assert.equal(isRowAfterCursor(row("row_3", "2026-05-27T00:01:00Z"), cursor), true);
    assert.equal(isRowAfterCursor(row("row_1", "2026-05-27T00:02:00Z"), cursor), true);
  });
});

function row(rowId: string, updatedAt: string): OmsChangedInventoryRow {
  return {
    rowId,
    sku: "SKU-1",
    locationId: "loc_1",
    stockedQuantity: 10,
    reservedQuantity: 0,
    updatedAt: new Date(updatedAt),
  };
}
