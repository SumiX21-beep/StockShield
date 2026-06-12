import { Module } from "@nestjs/common";
import { AlertsModule } from "../alerts/alerts.module";
import { InventoryModule } from "../inventory/inventory.module";
import { LiveEventsModule } from "../live-events/live-events.module";
import { OmsModule } from "../oms/oms.module";
import { RiskModule } from "../risk/risk.module";
import { ShopifyModule } from "../shopify/shopify.module";
import { ScansController } from "./scans.controller";
import { ScanProcessorService } from "./scan-processor.service";
import { ScansService } from "./scans.service";

@Module({
  imports: [AlertsModule, InventoryModule, LiveEventsModule, OmsModule, RiskModule, ShopifyModule],
  controllers: [ScansController],
  providers: [ScansService, ScanProcessorService],
  exports: [ScansService, ScanProcessorService],
})
export class ScansModule {}
