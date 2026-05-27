import { Module } from "@nestjs/common";
import { FixesModule } from "../fixes/fixes.module";
import { OmsModule } from "../oms/oms.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QueuesModule } from "../queues/queues.module";
import { RechecksModule } from "../rechecks/rechecks.module";
import { ShopifyModule } from "../shopify/shopify.module";
import { ScansModule } from "../scans/scans.module";
import { ScanWorkerService } from "../scans/scan-worker.service";

@Module({
  imports: [PrismaModule, QueuesModule, OmsModule, ShopifyModule, ScansModule, FixesModule, RechecksModule],
  providers: [ScanWorkerService],
})
export class WorkerModule {}
