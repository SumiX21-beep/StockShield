import { Global, Module } from "@nestjs/common";
import { AlertsModule } from "../alerts/alerts.module";
import { LiveEventsModule } from "../live-events/live-events.module";
import { RiskController } from "./risk.controller";
import { RiskService } from "./risk.service";

@Global()
@Module({
  imports: [AlertsModule, LiveEventsModule],
  controllers: [RiskController],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
