import { Module } from "@nestjs/common";
import { OmsModule } from "../oms/oms.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QueuesModule } from "../queues/queues.module";
import { ShopifyModule } from "../shopify/shopify.module";
import { ScansModule } from "../scans/scans.module";
import { ScanSchedulerService } from "./scan-scheduler.service";

@Module({
  imports: [PrismaModule, QueuesModule, OmsModule, ShopifyModule, ScansModule],
  providers: [ScanSchedulerService],
})
export class SchedulerModule {}
