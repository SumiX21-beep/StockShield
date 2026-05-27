import "dotenv/config";

const baseUrl = stripTrailingSlash(process.env.STOCKSHIELD_BASE_URL ?? "http://localhost:3000");
const tenantId = process.env.STOCKSHIELD_LOAD_TENANT_ID ?? "store_1";
const token = process.env.STOCKSHIELD_INTERNAL_API_TOKEN;
const authDisabled = process.env.STOCKSHIELD_AUTH_DISABLED === "true";
const totalRequests = positiveInt(process.env.LOAD_REQUESTS, 100);
const concurrency = positiveInt(process.env.LOAD_CONCURRENCY, 10);
const p95BudgetMs = positiveInt(process.env.LOAD_P95_MS, 1_000);
const paths = (process.env.LOAD_PATHS ?? `/health/live,/v1/admin/summary?tenantId=${tenantId}`)
  .split(",")
  .map((path) => path.trim())
  .filter(Boolean);

if (!paths.length) {
  console.error("ERROR LOAD_PATHS did not contain any paths.");
  process.exit(1);
}

if (!authDisabled && paths.some((path) => path.startsWith("/v1/admin")) && !token) {
  console.error("ERROR STOCKSHIELD_INTERNAL_API_TOKEN is required for admin load paths.");
  process.exit(1);
}

const latencies = [];
let failures = 0;
let nextIndex = 0;

await Promise.all(
  Array.from({ length: Math.min(concurrency, totalRequests) }, async () => {
    while (nextIndex < totalRequests) {
      const requestIndex = nextIndex++;
      const path = paths[requestIndex % paths.length];
      const startedAt = performance.now();

      try {
        const response = await fetch(`${baseUrl}${path}`, {
          headers: path.startsWith("/v1/admin") ? authHeaders() : undefined,
        });
        const elapsedMs = performance.now() - startedAt;
        latencies.push(elapsedMs);
        if (!response.ok) {
          failures += 1;
        }
        await response.arrayBuffer();
      } catch {
        failures += 1;
        latencies.push(performance.now() - startedAt);
      }
    }
  }),
);

latencies.sort((a, b) => a - b);
const p50 = percentile(latencies, 0.5);
const p95 = percentile(latencies, 0.95);
const max = latencies.at(-1) ?? 0;

console.log(JSON.stringify({
  baseUrl,
  totalRequests,
  concurrency,
  paths,
  failures,
  p50Ms: Math.round(p50),
  p95Ms: Math.round(p95),
  maxMs: Math.round(max),
  p95BudgetMs,
}, null, 2));

if (failures > 0 || p95 > p95BudgetMs) {
  console.error("Load check failed.");
  process.exit(1);
}

console.log("OK StockShield load check passed.");

function authHeaders() {
  return authDisabled ? undefined : { Authorization: `Bearer ${token}` };
}

function percentile(values, ratio) {
  if (!values.length) {
    return 0;
  }
  const index = Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1);
  return values[index];
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}
