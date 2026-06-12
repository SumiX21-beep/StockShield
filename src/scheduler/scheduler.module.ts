import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HybridDriftSchedulerService } from "../hybrid/hybrid-drift-scheduler.service";
import { HybridModule } from "../hybrid/hybrid.module";
import { OmsModule } from "../oms/oms.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QueuesModule } from "../queues/queues.module";
import { ShopifyModule } from "../shopify/shopify.module";
import { ScansModule } from "../scans/scans.module";
import { ScanSchedulerService } from "./scan-scheduler.service";

@Module({
  imports: [PrismaModule, AuthModule, QueuesModule, OmsModule, ShopifyModule, HybridModule, ScansModule],
  providers: [ScanSchedulerService, HybridDriftSchedulerService],
})
export class SchedulerModule {}
