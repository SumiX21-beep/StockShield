import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BadRequestException, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { TenantScopeGuard } from "./tenant-scope.guard";

type TestRequest = Record<string, unknown> & {
  tenantScope?: {
    tenantId?: string;
  };
};

describe("TenantScopeGuard", () => {
  test("allows requests without tenant scope by default", () => {
    withTenantEnv({}, () => {
      const request: TestRequest = { headers: {}, query: {}, body: {} };
      const guard = new TenantScopeGuard();

      assert.equal(guard.canActivate(contextFor(request)), true);
      assert.deepEqual(request.tenantScope, { tenantId: undefined });
    });
  });

  test("allows matching tenant scope across header and query", () => {
    withTenantEnv({}, () => {
      const request: TestRequest = {
        headers: { "x-stockshield-tenant-id": "store_1" },
        query: { tenantId: "store_1" },
        body: {},
      };
      const guard = new TenantScopeGuard();

      assert.equal(guard.canActivate(contextFor(request)), true);
      assert.deepEqual(request.tenantScope, { tenantId: "store_1" });
    });
  });

  test("rejects mismatched tenant scope", () => {
    withTenantEnv({}, () => {
      const guard = new TenantScopeGuard();

      assert.throws(
        () =>
          guard.canActivate(
            contextFor({
              headers: { "x-stockshield-tenant-id": "store_1" },
              query: { tenantId: "store_2" },
              body: {},
            }),
          ),
        ForbiddenException,
      );
    });
  });

  test("rejects tenants outside the configured allow-list", () => {
    withTenantEnv({ STOCKSHIELD_ALLOWED_TENANT_IDS: "store_1,store_2" }, () => {
      const guard = new TenantScopeGuard();

      assert.throws(
        () =>
          guard.canActivate(
            contextFor({
              headers: {},
              query: { tenantId: "store_3" },
              body: {},
            }),
          ),
        ForbiddenException,
      );
    });
  });

  test("can require explicit tenant scope", () => {
    withTenantEnv({ STOCKSHIELD_TENANT_SCOPE_REQUIRED: "true" }, () => {
      const guard = new TenantScopeGuard();

      assert.throws(
        () => guard.canActivate(contextFor({ headers: {}, query: {}, body: {} })),
        BadRequestException,
      );
    });
  });

  test("injects JWT tenant scope into requests without an explicit tenant query", () => {
    withTenantEnv({}, () => {
      const request: TestRequest = {
        headers: {},
        query: {},
        body: {},
        auth: { type: "jwt", tenantId: "store_1" },
      };
      const guard = new TenantScopeGuard();

      assert.equal(guard.canActivate(contextFor(request)), true);
      assert.equal((request.query as { tenantId?: string }).tenantId, "store_1");
      assert.deepEqual(request.tenantScope, { tenantId: "store_1" });
    });
  });
});

function contextFor(request: TestRequest) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

function withTenantEnv(env: Record<string, string>, callback: () => void) {
  const keys = [
    "STOCKSHIELD_ALLOWED_TENANT_IDS",
    "STOCKSHIELD_TENANT_SCOPE_DISABLED",
    "STOCKSHIELD_TENANT_SCOPE_REQUIRED",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  try {
    for (const key of keys) {
      delete process.env[key];
    }
    Object.assign(process.env, env);
    callback();
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
