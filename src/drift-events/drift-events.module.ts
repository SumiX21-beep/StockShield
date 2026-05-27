import { Module } from "@nestjs/common";
import { AlertsModule } from "../alerts/alerts.module";
import { LiveEventsModule } from "../live-events/live-events.module";
import { RiskModule } from "../risk/risk.module";
import { DriftEventsController } from "./drift-events.controller";
import { DriftEventsService } from "./drift-events.service";
import { DriftSummaryController } from "./drift-summary.controller";

@Module({
  imports: [AlertsModule, LiveEventsModule, RiskModule],
  controllers: [DriftEventsController, DriftSummaryController],
  providers: [DriftEventsService],
})
export class DriftEventsModule {}
