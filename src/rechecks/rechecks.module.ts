import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { QueuesModule } from "../queues/queues.module";
import { ScansModule } from "../scans/scans.module";
import { RecheckProcessorService } from "./recheck-processor.service";
import { RecheckWorkerService } from "./recheck-worker.service";

@Module({
  imports: [PrismaModule, QueuesModule, ScansModule],
  providers: [RecheckProcessorService, RecheckWorkerService],
  exports: [RecheckProcessorService, RecheckWorkerService],
})
export class RechecksModule {}
