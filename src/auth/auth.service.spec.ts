import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";

describe("AuthService", () => {
  it("logs in a tenant user and returns a verifiable JWT", async () => {
    await withAuthEnv(async () => {
      const passwordService = new PasswordService();
      const passwordHash = await passwordService.hash("StockShield@123");
      const prisma = {
        user: {
          findUnique: async () => ({
            id: "user_1",
            email: "demo@stockshield.local",
            name: "Demo Operator",
            role: "ADMIN",
            passwordHash,
            memberships: [
              {
                tenantId: "store_1",
                role: "ADMIN",
                createdAt: new Date("2026-05-27T00:00:00Z"),
              },
            ],
          }),
        },
      };
      const service = new AuthService(prisma as never, passwordService);

      const result = await service.login({
        email: "DEMO@stockshield.local",
        password: "StockShield@123",
      });
      const payload = service.verifyAccessToken(result.accessToken);

      assert.equal(result.tenantId, "store_1");
      assert.equal(result.role, "ADMIN");
      assert.equal(payload.sub, "user_1");
      assert.equal(payload.tenantId, "store_1");
    });
  });

  it("rejects invalid credentials", async () => {
    await withAuthEnv(async () => {
      const passwordService = new PasswordService();
      const passwordHash = await passwordService.hash("StockShield@123");
      const prisma = {
        user: {
          findUnique: async () => ({
            id: "user_1",
            email: "demo@stockshield.local",
            name: "Demo Operator",
            role: "ADMIN",
            passwordHash,
            memberships: [],
          }),
        },
      };
      const service = new AuthService(prisma as never, passwordService);

      await assert.rejects(
        () =>
          service.login({
            email: "demo@stockshield.local",
            password: "wrong-password",
          }),
        /Invalid email or password/,
      );
    });
  });
});

async function withAuthEnv(callback: () => Promise<void>) {
  const previous = process.env.STOCKSHIELD_JWT_SECRET;
  try {
    process.env.STOCKSHIELD_JWT_SECRET = "test-jwt-secret";
    await callback();
  } finally {
    if (previous === undefined) {
      delete process.env.STOCKSHIELD_JWT_SECRET;
    } else {
      process.env.STOCKSHIELD_JWT_SECRET = previous;
    }
  }
}
