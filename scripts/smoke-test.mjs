import "dotenv/config";

const baseUrl = stripTrailingSlash(process.env.STOCKSHIELD_BASE_URL ?? "http://localhost:3000");
const tenantId = process.env.STOCKSHIELD_SMOKE_TENANT_ID ?? "store_1";
const token = process.env.STOCKSHIELD_INTERNAL_API_TOKEN;
const authDisabled = process.env.STOCKSHIELD_AUTH_DISABLED === "true";

const checks = [
  {
    name: "health",
    path: "/health",
    auth: false,
    expectOkBody: true,
  },
  {
    name: "readiness",
    path: "/health/ready",
    auth: false,
    expectOkBody: true,
  },
  {
    name: "summary",
    path: `/v1/admin/summary?tenantId=${encodeURIComponent(tenantId)}`,
    auth: true,
  },
  {
    name: "metrics",
    path: `/v1/admin/metrics?tenantId=${encodeURIComponent(tenantId)}`,
    auth: true,
  },
];

if (!authDisabled && !token) {
  console.error("ERROR STOCKSHIELD_INTERNAL_API_TOKEN is required for admin smoke checks.");
  process.exit(1);
}

const failures = [];

for (const check of checks) {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${baseUrl}${check.path}`, {
      headers: check.auth ? authHeaders() : undefined,
    });
    const elapsedMs = Math.round(performance.now() - startedAt);
    const body = await safeJson(response);

    if (!response.ok) {
      failures.push(`${check.name} returned HTTP ${response.status}`);
      console.error(`FAIL ${check.name} ${response.status} ${elapsedMs}ms`);
      continue;
    }

    if (check.expectOkBody && body?.ok !== true) {
      failures.push(`${check.name} returned ok=${String(body?.ok)}`);
      console.error(`FAIL ${check.name} ok=${String(body?.ok)} ${elapsedMs}ms`);
      continue;
    }

    console.log(`OK ${check.name} ${response.status} ${elapsedMs}ms`);
  } catch (error) {
    failures.push(`${check.name} failed: ${errorMessage(error)}`);
    console.error(`FAIL ${check.name} ${errorMessage(error)}`);
  }
}

if (failures.length) {
  console.error(`Smoke test failed with ${failures.length} failure(s).`);
  process.exit(1);
}

console.log("OK StockShield smoke test passed.");

function authHeaders() {
  return authDisabled ? undefined : { Authorization: `Bearer ${token}` };
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
