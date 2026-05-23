import { Module } from "@nestjs/common";
import { DriftEventsController } from "./drift-events.controller";
import { DriftEventsService } from "./drift-events.service";

@Module({
  controllers: [DriftEventsController],
  providers: [DriftEventsService],
})
export class DriftEventsModule {}
