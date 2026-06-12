import { Module } from "@nestjs/common";
import { LocksModule } from "../locks/locks.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QueuesModule } from "../queues/queues.module";
import { HybridDriftController } from "./hybrid-drift.controller";
import { HybridDriftService } from "./hybrid-drift-core.service";
import { HybridExternalController, HybridWebhooksController } from "./hybrid-external.controller";
import { HybridExternalService } from "./hybrid-external.service";
import { HybridInventoryController } from "./hybrid-inventory.controller";
import { HybridInventoryLockService } from "./hybrid-inventory-lock.service";
import { HybridInventoryService } from "./hybrid-inventory.service";
import { HybridMetricsController } from "./hybrid-metrics.controller";
import { HybridMetricsService } from "./hybrid-metrics.service";
import { HybridOrdersController } from "./hybrid-orders.controller";
import { HybridOrdersService } from "./hybrid-orders.service";
import { HybridProductsController } from "./hybrid-products.controller";
import { HybridProductsService } from "./hybrid-products.service";

@Module({
  imports: [PrismaModule, QueuesModule, LocksModule],
  controllers: [
    HybridProductsController,
    HybridInventoryController,
    HybridOrdersController,
    HybridExternalController,
    HybridWebhooksController,
    HybridDriftController,
    HybridMetricsController,
  ],
  providers: [
    HybridInventoryLockService,
    HybridProductsService,
    HybridExternalService,
    HybridInventoryService,
    HybridOrdersService,
    HybridDriftService,
    HybridMetricsService,
  ],
  exports: [
    HybridInventoryLockService,
    HybridExternalService,
    HybridInventoryService,
    HybridOrdersService,
    HybridDriftService,
    HybridMetricsService,
  ],
})
export class HybridModule {}
