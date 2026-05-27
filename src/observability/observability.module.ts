import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { QueuesModule } from "../queues/queues.module";
import { ObservabilityController } from "./observability.controller";
import { ObservabilityService } from "./observability.service";

@Module({
  imports: [PrismaModule, QueuesModule],
  controllers: [ObservabilityController],
  providers: [ObservabilityService],
})
export class ObservabilityModule {}
