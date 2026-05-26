import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { randomUUID } from "crypto";
import Redis from "ioredis";

export type HeldRedisLock = {
  key: string;
  token: string;
};

@Injectable()
export class RedisLockService implements OnModuleDestroy {
  private readonly redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });

  async acquire(key: string, ttlMs: number): Promise<HeldRedisLock | null> {
    const token = randomUUID();
    const result = await this.redis.set(key, token, "PX", ttlMs, "NX");
    if (result !== "OK") {
      return null;
    }

    return { key, token };
  }

  async release(lock: HeldRedisLock) {
    await this.redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      lock.key,
      lock.token,
    );
  }

  async onModuleDestroy() {
    this.redis.disconnect();
  }
}
