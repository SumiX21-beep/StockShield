import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { bullMqJobId } from "../queues/bullmq-job-id";
import { QUEUE_JOB_NAMES, QUEUE_NAMES } from "../queues/queue.constants";
import { QueueService } from "../queues/queue.service";
import { FixHybridDriftDto, HybridDriftFixStrategy } from "./dto/fix-hybrid-drift.dto";
import { HybridInventoryQueryDto } from "./dto/hybrid-inventory-query.dto";
import { HybridExternalService } from "./hybrid-external.service";
import {
  DRIFT_SELECT,
  EXTERNAL_INVENTORY_SELECT,
  HybridDriftRow,
  HybridExternalInventoryRow,
  HybridInventoryRow,
  INVENTORY_SELECT,
} from "./hybrid-db.types";
import { HybridInventoryLockService } from "./hybrid-inventory-lock.service";

const DEFAULT_TENANT_ID = "demo";
const OPEN_DRIFT_STATUSES = ["DETECTED", "FIX_QUEUED", "FIXING"] as const;

export type DriftFixPayload = {
  driftId: string;
  strategy: HybridDriftFixStrategy;
};

@Injectable()
export class HybridDriftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly external: HybridExternalService,
    private readonly inventoryLock: HybridInventoryLockService,
  ) {}

  async list(query: HybridInventoryQueryDto) {
    const tenantId = this.tenantId(query.tenantId);
    return this.prisma.$queryRawUnsafe<HybridDriftRow[]>(
      `
        SELECT ${DRIFT_SELECT}
        FROM inventory_drift
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR sku = $2)
          AND ($3::text IS NULL OR location_id = $3)
        ORDER BY updated_at DESC
        LIMIT $4
      `,
      tenantId,
      query.sku ?? null,
      query.locationId ?? null,
      query.limit ?? 100,
    );
  }

  async detectAll(input?: { tenantId?: string; autoFix?: boolean }) {
    const tenantId = this.tenantId(input?.tenantId);
    const [internalRows, externalRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<HybridInventoryRow[]>(
        `
          SELECT ${INVENTORY_SELECT}
          FROM inventory
          WHERE tenant_id = $1
        `,
        tenantId,
      ),
      this.prisma.$queryRawUnsafe<HybridExternalInventoryRow[]>(
        `
          SELECT ${EXTERNAL_INVENTORY_SELECT}
          FROM external_inventory
          WHERE tenant_id = $1
        `,
        tenantId,
      ),
    ]);
    const internalByKey = new Map(internalRows.map((row) => [this.key(row.sku, row.locationId), row]));
    const externalByKey = new Map(externalRows.map((row) => [this.key(row.sku, row.locationId), row]));
    const keys = new Set([...internalByKey.keys(), ...externalByKey.keys()]);
    const detected = [];
    let resolved = 0;

    for (const inventoryKey of keys) {
      const [sku, locationId] = inventoryKey.split("::");
      const internal = internalByKey.get(inventoryKey);
      const external = externalByKey.get(inventoryKey);
      const expectedQty = internal ? this.sellable(internal) : 0;
      const actualQty = external?.availableQuantity ?? 0;

      if (expectedQty === actualQty) {
        const rows = await this.prisma.$queryRawUnsafe<Array<{ count: number }>>(
          `
            WITH updated AS (
              UPDATE inventory_drift
              SET status = 'RESOLVED',
                  resolution = 'Quantities matched during drift scan',
                  updated_at = NOW()
              WHERE tenant_id = $1
                AND sku = $2
                AND location_id = $3
                AND status IN ('DETECTED', 'FIX_QUEUED', 'FIXING')
              RETURNING id
            )
            SELECT COUNT(*)::int AS count FROM updated
          `,
          tenantId,
          sku,
          locationId,
        );
        resolved += rows[0]?.count ?? 0;
        continue;
      }

      const drift = await this.upsertOpenDrift({ tenantId, sku, locationId, expectedQty, actualQty });
      detected.push(drift);
      if (input?.autoFix) {
        await this.queueFix(drift.id, {});
      }
    }

    return { tenantId, scanned: keys.size, detected, resolved };
  }

  async queueFix(id: string, input: FixHybridDriftDto) {
    const strategy = input.strategy ?? this.defaultStrategy();
    const [drift] = await this.prisma.$queryRawUnsafe<HybridDriftRow[]>(
      `
        SELECT ${DRIFT_SELECT}
        FROM inventory_drift
        WHERE id = $1
        LIMIT 1
      `,
      id,
    );
    if (!drift) throw new NotFoundException(`Drift event ${id} was not found`);

    const [updated] = await this.prisma.$queryRawUnsafe<HybridDriftRow[]>(
      `
        UPDATE inventory_drift
        SET status = 'FIX_QUEUED', resolution = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING ${DRIFT_SELECT}
      `,
      id,
      `Queued ${strategy} fix`,
    );
    const payload: DriftFixPayload = { driftId: id, strategy };
    const job = await this.queues.getQueue(QUEUE_NAMES.HYBRID_DRIFT_FIX).add(
      QUEUE_JOB_NAMES.FIX_HYBRID_DRIFT,
      payload,
      { jobId: bullMqJobId("hybrid-drift-fix", id, Date.now()) },
    );

    return { drift: updated, queue: { name: QUEUE_NAMES.HYBRID_DRIFT_FIX, jobId: job.id } };
  }

  async fix(id: string, strategy: HybridDriftFixStrategy) {
    const [drift] = await this.prisma.$queryRawUnsafe<HybridDriftRow[]>(
      `
        SELECT ${DRIFT_SELECT}
        FROM inventory_drift
        WHERE id = $1
        LIMIT 1
      `,
      id,
    );
    if (!drift) throw new NotFoundException(`Drift event ${id} was not found`);
    if (drift.status === "RESOLVED") return drift;

    await this.prisma.$executeRawUnsafe(
      `
        UPDATE inventory_drift
        SET status = 'FIXING', resolution = $2, updated_at = NOW()
        WHERE id = $1
      `,
      id,
      `Applying ${strategy}`,
    );

    if (strategy === "EXTERNAL_TO_INTERNAL") {
      await this.fixInternalFromExternal(drift);
    } else {
      await this.external.setAvailable({
        tenantId: drift.tenantId,
        sku: drift.sku,
        locationId: drift.locationId,
        availableQuantity: drift.expectedQty,
      });
    }

    const [resolved] = await this.prisma.$queryRawUnsafe<HybridDriftRow[]>(
      `
        UPDATE inventory_drift
        SET status = 'RESOLVED', resolution = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING ${DRIFT_SELECT}
      `,
      id,
      `Resolved using ${strategy}`,
    );

    return resolved;
  }

  defaultStrategy(): HybridDriftFixStrategy {
    return process.env.HYBRID_DRIFT_FIX_STRATEGY === "EXTERNAL_TO_INTERNAL"
      ? "EXTERNAL_TO_INTERNAL"
      : "INTERNAL_TO_EXTERNAL";
  }

  private async upsertOpenDrift(input: {
    tenantId: string;
    sku: string;
    locationId: string;
    expectedQty: number;
    actualQty: number;
  }) {
    const [existing] = await this.prisma.$queryRawUnsafe<HybridDriftRow[]>(
      `
        SELECT ${DRIFT_SELECT}
        FROM inventory_drift
        WHERE tenant_id = $1
          AND sku = $2
          AND location_id = $3
          AND status IN ('DETECTED', 'FIX_QUEUED', 'FIXING')
        ORDER BY created_at DESC
        LIMIT 1
      `,
      input.tenantId,
      input.sku,
      input.locationId,
    );

    if (existing) {
      const [updated] = await this.prisma.$queryRawUnsafe<HybridDriftRow[]>(
        `
          UPDATE inventory_drift
          SET expected_qty = $2,
              actual_qty = $3,
              status = $4::"HybridDriftStatus",
              resolution = NULL,
              updated_at = NOW()
          WHERE id = $1
          RETURNING ${DRIFT_SELECT}
        `,
        existing.id,
        input.expectedQty,
        input.actualQty,
        existing.status === "FIXING" ? existing.status : "DETECTED",
      );

      return updated;
    }

    const [created] = await this.prisma.$queryRawUnsafe<HybridDriftRow[]>(
      `
        INSERT INTO inventory_drift (
          id, tenant_id, sku, location_id, expected_qty, actual_qty, status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'DETECTED', NOW(), NOW())
        RETURNING ${DRIFT_SELECT}
      `,
      randomUUID(),
      input.tenantId,
      input.sku,
      input.locationId,
      input.expectedQty,
      input.actualQty,
    );

    return created;
  }

  private async fixInternalFromExternal(drift: {
    tenantId: string;
    sku: string;
    locationId: string;
    actualQty: number;
  }) {
    await this.inventoryLock.withLock(
      { tenantId: drift.tenantId, sku: drift.sku, locationId: drift.locationId },
      async () => {
        const [existing] = await this.prisma.$queryRawUnsafe<HybridInventoryRow[]>(
          `
            SELECT ${INVENTORY_SELECT}
            FROM inventory
            WHERE tenant_id = $1 AND sku = $2 AND location_id = $3
            LIMIT 1
          `,
          drift.tenantId,
          drift.sku,
          drift.locationId,
        );
        const reservedQuantity = existing?.reservedQuantity ?? 0;
        await this.prisma.$executeRawUnsafe(
          `
            INSERT INTO inventory (
              id, tenant_id, sku, location_id, physical_quantity, reserved_quantity, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
            ON CONFLICT (tenant_id, sku, location_id)
            DO UPDATE SET physical_quantity = EXCLUDED.physical_quantity, updated_at = NOW()
          `,
          randomUUID(),
          drift.tenantId,
          drift.sku,
          drift.locationId,
          drift.actualQty + reservedQuantity,
          reservedQuantity,
        );
      },
    );
  }

  private sellable(input: { physicalQuantity: number; reservedQuantity: number }) {
    return input.physicalQuantity - input.reservedQuantity;
  }

  private tenantId(tenantId?: string) {
    return tenantId?.trim() || DEFAULT_TENANT_ID;
  }

  private key(sku: string, locationId: string) {
    return `${sku}::${locationId}`;
  }
}
