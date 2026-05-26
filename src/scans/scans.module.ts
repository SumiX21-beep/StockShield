import { Module } from "@nestjs/common";
import { OmsModule } from "../oms/oms.module";
import { ShopifyModule } from "../shopify/shopify.module";
import { ScansController } from "./scans.controller";
import { ScanProcessorService } from "./scan-processor.service";
import { ScansService } from "./scans.service";

@Module({
  imports: [OmsModule, ShopifyModule],
  controllers: [ScansController],
  providers: [ScansService, ScanProcessorService],
  exports: [ScansService, ScanProcessorService],
})
export class ScansModule {}
