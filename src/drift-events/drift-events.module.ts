import { Module } from "@nestjs/common";
import { DriftEventsController } from "./drift-events.controller";
import { DriftEventsService } from "./drift-events.service";
import { DriftSummaryController } from "./drift-summary.controller";

@Module({
  controllers: [DriftEventsController, DriftSummaryController],
  providers: [DriftEventsService],
})
export class DriftEventsModule {}
