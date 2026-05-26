import { Module } from "@nestjs/common";
import { SkuLocationMapsController } from "./sku-location-maps.controller";
import { SkuLocationMapsService } from "./sku-location-maps.service";

@Module({
  controllers: [SkuLocationMapsController],
  providers: [SkuLocationMapsService],
})
export class SkuLocationMapsModule {}
