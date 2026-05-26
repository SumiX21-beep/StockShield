import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { TokenCryptoModule } from "./crypto/token-crypto.module";
import { DriftEventsModule } from "./drift-events/drift-events.module";
import { PrismaModule } from "./prisma/prisma.module";
import { QueuesModule } from "./queues/queues.module";
import { ScansModule } from "./scans/scans.module";
import { SkuLocationMapsModule } from "./sku-location-maps/sku-location-maps.module";
import { TenantChannelConfigsModule } from "./tenant-channel-configs/tenant-channel-configs.module";

@Module({
  imports: [
    PrismaModule,
    TokenCryptoModule,
    QueuesModule,
    DriftEventsModule,
    TenantChannelConfigsModule,
    SkuLocationMapsModule,
    ScansModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
