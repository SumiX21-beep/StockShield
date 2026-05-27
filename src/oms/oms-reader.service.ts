import { Injectable, Logger } from "@nestjs/common";
import { Client } from "pg";
import { OmsChangedInventoryQuery, OmsChangedInventoryRow, OmsCurrentInventoryQuery } from "./oms-reader.types";

type OmsQueryRow = {
  row_id: string;
  sku: string;
  location_id: string;
  stocked_quantity: number | string;
  reserved_quantity: number | string;
  updated_at: Date | string;
};

@Injectable()
export class OmsReaderService {
  private readonly logger = new Logger(OmsReaderService.name);
  private warnedMissingUrl = false;

  async readChangedInventory(input: OmsChangedInventoryQuery): Promise<OmsChangedInventoryRow[]> {
    const connectionString = process.env.OMS_DATABASE_URL;
    if (!connectionString) {
      if (!this.warnedMissingUrl) {
        this.warnedMissingUrl = true;
        this.logger.warn("OMS_DATABASE_URL is not set; scan worker will skip OMS reads.");
      }
      return [];
    }

    const table = this.tableName(process.env.OMS_INVENTORY_TABLE ?? "inventory_snapshot");
    const tenantColumn = this.identifier(process.env.OMS_TENANT_COLUMN ?? "tenant_id");
    const skuColumn = this.identifier(process.env.OMS_SKU_COLUMN ?? "sku");
    const locationColumn = this.identifier(process.env.OMS_LOCATION_COLUMN ?? "location_id");
    const stockedColumn = this.identifier(process.env.OMS_STOCKED_COLUMN ?? "stocked_quantity");
    const reservedColumn = this.identifier(process.env.OMS_RESERVED_COLUMN ?? "reserved_quantity");
    const updatedAtColumn = this.identifier(process.env.OMS_UPDATED_AT_COLUMN ?? "updated_at");
    const rowIdColumn = this.identifier(process.env.OMS_ROW_ID_COLUMN ?? "id");

    const effectiveStart = input.fromCursor.lastSeenAt ?? input.windowStart;
    const effectiveSeenId = input.fromCursor.lastSeenId ?? "";
    const client = new Client({ connectionString });

    const query = `
      SELECT
        ${rowIdColumn}::text AS row_id,
        ${skuColumn}::text AS sku,
        ${locationColumn}::text AS location_id,
        ${stockedColumn} AS stocked_quantity,
        ${reservedColumn} AS reserved_quantity,
        ${updatedAtColumn} AS updated_at
      FROM ${table}
      WHERE ${tenantColumn} = $1
        AND (
          ${updatedAtColumn} > $2::timestamptz
          OR (${updatedAtColumn} = $2::timestamptz AND ${rowIdColumn}::text > $3)
        )
        AND ${updatedAtColumn} <= $4::timestamptz
        AND ($5::text IS NULL OR ${skuColumn}::text = $5)
        AND ($6::text IS NULL OR ${locationColumn}::text = $6)
      ORDER BY ${updatedAtColumn} ASC, ${rowIdColumn} ASC
      LIMIT $7
    `;

    try {
      await client.connect();
      const result = await client.query<OmsQueryRow>(query, [
        input.tenantId,
        effectiveStart.toISOString(),
        effectiveSeenId,
        input.windowEnd.toISOString(),
        input.sku ?? null,
        input.locationId ?? null,
        input.limit,
      ]);

      return result.rows.map((row) => ({
        rowId: row.row_id,
        sku: row.sku,
        locationId: row.location_id,
        stockedQuantity: Number(row.stocked_quantity),
        reservedQuantity: Number(row.reserved_quantity),
        updatedAt: new Date(row.updated_at),
      }));
    } finally {
      await client.end();
    }
  }

  async readCurrentInventory(input: OmsCurrentInventoryQuery): Promise<OmsChangedInventoryRow | null> {
    const connectionString = process.env.OMS_DATABASE_URL;
    if (!connectionString) {
      if (!this.warnedMissingUrl) {
        this.warnedMissingUrl = true;
        this.logger.warn("OMS_DATABASE_URL is not set; targeted rechecks will skip OMS reads.");
      }
      return null;
    }

    const table = this.tableName(process.env.OMS_INVENTORY_TABLE ?? "inventory_snapshot");
    const tenantColumn = this.identifier(process.env.OMS_TENANT_COLUMN ?? "tenant_id");
    const skuColumn = this.identifier(process.env.OMS_SKU_COLUMN ?? "sku");
    const locationColumn = this.identifier(process.env.OMS_LOCATION_COLUMN ?? "location_id");
    const stockedColumn = this.identifier(process.env.OMS_STOCKED_COLUMN ?? "stocked_quantity");
    const reservedColumn = this.identifier(process.env.OMS_RESERVED_COLUMN ?? "reserved_quantity");
    const updatedAtColumn = this.identifier(process.env.OMS_UPDATED_AT_COLUMN ?? "updated_at");
    const rowIdColumn = this.identifier(process.env.OMS_ROW_ID_COLUMN ?? "id");
    const client = new Client({ connectionString });

    const query = `
      SELECT
        ${rowIdColumn}::text AS row_id,
        ${skuColumn}::text AS sku,
        ${locationColumn}::text AS location_id,
        ${stockedColumn} AS stocked_quantity,
        ${reservedColumn} AS reserved_quantity,
        ${updatedAtColumn} AS updated_at
      FROM ${table}
      WHERE ${tenantColumn} = $1
        AND ${skuColumn}::text = $2
        AND ${locationColumn}::text = $3
      ORDER BY ${updatedAtColumn} DESC, ${rowIdColumn} DESC
      LIMIT 1
    `;

    try {
      await client.connect();
      const result = await client.query<OmsQueryRow>(query, [
        input.tenantId,
        input.sku,
        input.locationId,
      ]);
      const row = result.rows[0];
      if (!row) {
        return null;
      }

      return {
        rowId: row.row_id,
        sku: row.sku,
        locationId: row.location_id,
        stockedQuantity: Number(row.stocked_quantity),
        reservedQuantity: Number(row.reserved_quantity),
        updatedAt: new Date(row.updated_at),
      };
    } finally {
      await client.end();
    }
  }

  private identifier(value: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
      throw new Error(`Invalid SQL identifier "${value}"`);
    }
    return `"${value}"`;
  }

  private tableName(value: string): string {
    const parts = value.split(".");
    if (!parts.length) {
      throw new Error(`Invalid OMS table name "${value}"`);
    }
    return parts.map((part) => this.identifier(part)).join(".");
  }
}
