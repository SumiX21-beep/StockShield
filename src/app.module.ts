import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { DriftEventsModule } from "./drift-events/drift-events.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [PrismaModule, DriftEventsModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
