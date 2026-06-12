import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { HybridDriftService } from "./hybrid-drift-core.service";

@Injectable()
export class HybridDriftSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HybridDriftSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly drift: HybridDriftService) {}

  async onModuleInit() {
    if (process.env.HYBRID_DRIFT_SCHEDULER_ENABLED === "false") {
      this.logger.warn("Hybrid drift scheduler disabled by HYBRID_DRIFT_SCHEDULER_ENABLED=false");
      return;
    }

    await this.runCycle();
    const intervalMs = this.intervalMs();
    this.timer = setInterval(() => {
      void this.runCycle();
    }, intervalMs);
    this.logger.log(`Hybrid drift scheduler started with interval ${intervalMs}ms`);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runCycle() {
    const autoFix = process.env.HYBRID_DRIFT_AUTO_FIX !== "false";
    const tenantId = process.env.HYBRID_TENANT_ID;
    const result = await this.drift.detectAll({ tenantId, autoFix });
    if (result.detected.length || result.resolved) {
      this.logger.log(
        `Hybrid drift scan detected ${result.detected.length}, resolved ${result.resolved}, scanned ${result.scanned}`,
      );
    }
  }

  private intervalMs() {
    const minutes = Number(process.env.HYBRID_DRIFT_SCAN_INTERVAL_MINUTES ?? 5);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return 5 * 60 * 1000;
    }
    return Math.round(minutes * 60 * 1000);
  }
}
