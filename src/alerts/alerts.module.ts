import { Global, Module } from "@nestjs/common";
import { LiveEventsModule } from "../live-events/live-events.module";
import { AlertsController } from "./alerts.controller";
import { AlertsService } from "./alerts.service";

@Global()
@Module({
  imports: [LiveEventsModule],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
