import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FixesModule } from "../fixes/fixes.module";
import { HybridDriftFixWorkerService } from "../hybrid/hybrid-drift-fix-worker.service";
import { HybridModule } from "../hybrid/hybrid.module";
import { HybridOrderWorkerService } from "../hybrid/hybrid-order-worker.service";
import { InventoryModule } from "../inventory/inventory.module";
import { ShopifySyncWorkerService } from "../inventory/shopify-sync-worker.service";
import { OmsModule } from "../oms/oms.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QueuesModule } from "../queues/queues.module";
import { RechecksModule } from "../rechecks/rechecks.module";
import { ShopifyModule } from "../shopify/shopify.module";
import { ScansModule } from "../scans/scans.module";
import { ScanWorkerService } from "../scans/scan-worker.service";

@Module({
  imports: [PrismaModule, AuthModule, QueuesModule, OmsModule, ShopifyModule, InventoryModule, HybridModule, ScansModule, FixesModule, RechecksModule],
  providers: [ScanWorkerService, ShopifySyncWorkerService, HybridOrderWorkerService, HybridDriftFixWorkerService],
})
export class WorkerModule {}
