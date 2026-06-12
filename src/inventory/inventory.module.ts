import { Module } from "@nestjs/common";
import { ShopifyModule } from "../shopify/shopify.module";
import { AvailableToPromiseService } from "./available-to-promise.service";
import { InventoryCatalogService } from "./inventory-catalog.service";
import { InventoryController, InventoryTruthController } from "./inventory.controller";
import { InventoryLedgerService } from "./inventory-ledger.service";
import { InventorySyncOutboxService } from "./inventory-sync-outbox.service";
import { LocationsController } from "./locations.controller";
import { OrdersController, ReturnsController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { ProductsController } from "./products.controller";
import { RootCauseService } from "./root-cause.service";
import { ShopifySyncProcessorService } from "./shopify-sync-processor.service";
import { SyncJobsController } from "./sync-jobs.controller";

@Module({
  imports: [ShopifyModule],
  controllers: [
    ProductsController,
    LocationsController,
    InventoryController,
    InventoryTruthController,
    OrdersController,
    ReturnsController,
    SyncJobsController,
  ],
  providers: [
    AvailableToPromiseService,
    InventoryCatalogService,
    InventoryLedgerService,
    InventorySyncOutboxService,
    OrdersService,
    RootCauseService,
    ShopifySyncProcessorService,
  ],
  exports: [
    AvailableToPromiseService,
    InventoryCatalogService,
    InventoryLedgerService,
    InventorySyncOutboxService,
    OrdersService,
    RootCauseService,
    ShopifySyncProcessorService,
  ],
})
export class InventoryModule {}
