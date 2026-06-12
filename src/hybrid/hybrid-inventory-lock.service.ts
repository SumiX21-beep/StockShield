import { ConflictException, Injectable } from "@nestjs/common";
import { RedisLockService } from "../locks/redis-lock.service";

@Injectable()
export class HybridInventoryLockService {
  constructor(private readonly locks: RedisLockService) {}

  async withLock<T>(
    input: {
      tenantId: string;
      sku: string;
      locationId: string;
    },
    work: () => Promise<T>,
  ): Promise<T> {
    const key = `lock:${input.tenantId}:${input.sku}:${input.locationId}`;
    const ttlMs = this.positiveNumber(process.env.ORDER_LOCK_TTL_MS, 5_000);
    const retries = this.positiveNumber(process.env.ORDER_LOCK_RETRIES, 10);
    const retryDelayMs = this.positiveNumber(process.env.ORDER_LOCK_RETRY_DELAY_MS, 50);

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const lock = await this.locks.acquire(key, ttlMs);
      if (!lock) {
        await this.sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      try {
        return await work();
      } finally {
        await this.locks.release(lock);
      }
    }

    throw new ConflictException(`Inventory lock busy for ${input.sku} at ${input.locationId}`);
  }

  private positiveNumber(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
