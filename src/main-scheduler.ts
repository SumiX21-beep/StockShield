import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { SchedulerModule } from "./scheduler/scheduler.module";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(SchedulerModule, {
    logger: ["log", "warn", "error"],
  });

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start StockShield scheduler:", error);
  process.exit(1);
});
