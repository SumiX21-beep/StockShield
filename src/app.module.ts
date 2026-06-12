import { Module } from "@nestjs/common";
import { AccountModule } from "./account/account.module";
import { AlertsModule } from "./alerts/alerts.module";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { TokenCryptoModule } from "./crypto/token-crypto.module";
import { DriftEventsModule } from "./drift-events/drift-events.module";
import { HybridModule } from "./hybrid/hybrid.module";
import { InventoryModule } from "./inventory/inventory.module";
import { LiveEventsModule } from "./live-events/live-events.module";
import { ObservabilityModule } from "./observability/observability.module";
import { PrismaModule } from "./prisma/prisma.module";
import { QueuesModule } from "./queues/queues.module";
import { RiskModule } from "./risk/risk.module";
import { ScansModule } from "./scans/scans.module";
import { SkuLocationMapsModule } from "./sku-location-maps/sku-location-maps.module";
import { TenantChannelConfigsModule } from "./tenant-channel-configs/tenant-channel-configs.module";
import { WebhooksModule } from "./webhooks/webhooks.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AccountModule,
    LiveEventsModule,
    AlertsModule,
    RiskModule,
    TokenCryptoModule,
    QueuesModule,
    HybridModule,
    InventoryModule,
    DriftEventsModule,
    TenantChannelConfigsModule,
    SkuLocationMapsModule,
    ScansModule,
    WebhooksModule,
    ObservabilityModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
