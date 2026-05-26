import { Module } from "@nestjs/common";
import { LocksModule } from "../locks/locks.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QueuesModule } from "../queues/queues.module";
import { ShopifyModule } from "../shopify/shopify.module";
import { DriftFixProcessorService } from "./drift-fix-processor.service";
import { DriftFixWorkerService } from "./drift-fix-worker.service";

@Module({
  imports: [PrismaModule, QueuesModule, LocksModule, ShopifyModule],
  providers: [DriftFixProcessorService, DriftFixWorkerService],
  exports: [DriftFixProcessorService, DriftFixWorkerService],
})
export class FixesModule {}
