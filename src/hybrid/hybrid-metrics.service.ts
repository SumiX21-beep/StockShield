import { Injectable } from "@nestjs/common";
import { JobType } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { QUEUE_NAMES } from "../queues/queue.constants";
import { QueueService } from "../queues/queue.service";
import { HybridMetricsQueryDto } from "./dto/hybrid-metrics-query.dto";
import { HybridInventoryRow, HybridOrderStatus } from "./hybrid-db.types";
import { tenantIdOrDefault } from "./hybrid-stock";

const QUEUE_STATES: JobType[] = ["waiting", "active", "delayed", "completed", "failed", "paused"];
const LAG_STATES: JobType[] = ["waiting", "delayed"];
const HYBRID_QUEUE_NAMES = [
  QUEUE_NAMES.ORDER_PROCESS,
  QUEUE_NAMES.ORDER_RETRY,
  QUEUE_NAMES.ORDER_DLQ,
  QUEUE_NAMES.HYBRID_DRIFT_FIX,
] as const;

@Injectable()
export class HybridMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
  ) {}

  async metrics(query: HybridMetricsQueryDto) {
    const tenantId = tenantIdOrDefault(query.tenantId);
    const windowSeconds = query.windowSeconds ?? 60;
    const since = new Date(Date.now() - windowSeconds * 1000);
    const [created, confirmed, failed, byStatus, queueMetrics, invariant] = await Promise.all([
      this.countOrders("created_at", tenantId, since),
      this.countOrders("confirmed_at", tenantId, since, "CONFIRMED"),
      this.countOrders("updated_at", tenantId, since, "FAILED"),
      this.ordersByStatus(tenantId),
      this.queueMetrics(),
      this.inventoryInvariant(tenantId),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      tenantId,
      windowSeconds,
      orders: {
        created,
        confirmed,
        failed,
        ordersPerSecond: Number((created / windowSeconds).toFixed(4)),
        confirmedPerSecond: Number((confirmed / windowSeconds).toFixed(4)),
        byStatus,
      },
      queues: queueMetrics,
      inventory: invariant,
    };
  }

  private async ordersByStatus(tenantId: string) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ status: HybridOrderStatus; count: bigint }>>(
      `
        SELECT status, COUNT(*) AS count
        FROM orders
        WHERE tenant_id = $1
        GROUP BY status
      `,
      tenantId,
    );
    const counts = {
      CREATED: 0,
      RESERVED: 0,
      CONFIRMED: 0,
      FAILED: 0,
    };
    for (const row of rows) {
      counts[row.status] = Number(row.count);
    }

    return counts;
  }

  private async countOrders(
    timeColumn: "created_at" | "confirmed_at" | "updated_at",
    tenantId: string,
    since: Date,
    status?: HybridOrderStatus,
  ) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `
        SELECT COUNT(*) AS count
        FROM orders
        WHERE tenant_id = $1
          AND ${timeColumn} >= $2
          AND ($3::"HybridOrderStatus" IS NULL OR status = $3::"HybridOrderStatus")
      `,
      tenantId,
      since,
      status ?? null,
    );

    return Number(rows[0]?.count ?? 0);
  }

  private async queueMetrics() {
    const entries = await Promise.all(
      HYBRID_QUEUE_NAMES.map(async (name) => [name, await this.queueMetric(name)] as const),
    );

    return Object.fromEntries(entries);
  }

  private async queueMetric(name: (typeof HYBRID_QUEUE_NAMES)[number]) {
    const queue = this.queues.getQueue(name);
    try {
      const [counts, lagMs] = await Promise.all([
        queue.getJobCounts(...QUEUE_STATES),
        this.queueLagMs(queue),
      ]);

      return { available: true, counts, lagMs };
    } catch (error) {
      return {
        available: false,
        counts: {},
        lagMs: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async queueLagMs(queue: ReturnType<QueueService["getQueue"]>) {
    const jobs = await queue.getJobs(LAG_STATES, 0, 0, true);
    const oldest = jobs[0];
    if (!oldest?.timestamp) {
      return 0;
    }

    return Math.max(0, Date.now() - oldest.timestamp);
  }

  private async inventoryInvariant(tenantId: string) {
    const rows = await this.prisma.$queryRawUnsafe<HybridInventoryRow[]>(
      `
        SELECT
          id,
          tenant_id AS "tenantId",
          sku,
          location_id AS "locationId",
          physical_quantity AS "physicalQuantity",
          reserved_quantity AS "reservedQuantity",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM inventory
        WHERE tenant_id = $1
      `,
      tenantId,
    );
    const violations = rows
      .filter((row) => row.reservedQuantity > row.physicalQuantity || row.physicalQuantity < 0)
      .map((row) => ({
        sku: row.sku,
        locationId: row.locationId,
        physicalQuantity: row.physicalQuantity,
        reservedQuantity: row.reservedQuantity,
      }));

    return {
      noOverselling: violations.length === 0,
      checkedRows: rows.length,
      violations,
    };
  }
}
