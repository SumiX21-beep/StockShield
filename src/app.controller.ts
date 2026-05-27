import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get("health")
  health() {
    return this.baseHealthPayload("ok");
  }

  @Get("health/live")
  live() {
    return this.baseHealthPayload("live");
  }

  @Get("health/ready")
  ready() {
    const checks = {
      databaseUrl: Boolean(process.env.DATABASE_URL),
      redisUrl: Boolean(process.env.REDIS_URL),
      encryptionKey: Boolean(process.env.STOCKSHIELD_ENCRYPTION_KEY),
      internalApiToken:
        process.env.STOCKSHIELD_AUTH_DISABLED === "true" ||
        Boolean(process.env.STOCKSHIELD_INTERNAL_API_TOKEN),
    };

    return {
      ...this.baseHealthPayload(Object.values(checks).every(Boolean) ? "ready" : "not_ready"),
      checks,
    };
  }

  private baseHealthPayload(status: string) {
    return {
      ok: status !== "not_ready",
      status,
      service: "StockShield",
      version: process.env.npm_package_version ?? "1.0.0",
      timestamp: new Date().toISOString(),
    };
  }
}
