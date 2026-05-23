import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);

  await app.listen(port);
  console.log(`StockShield API running on http://localhost:${port}`);
}

bootstrap().catch((error) => {
  console.error("Failed to start StockShield:", error);
  process.exit(1);
});
