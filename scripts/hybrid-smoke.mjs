import "dotenv/config";

const baseUrl = stripTrailingSlash(process.env.HYBRID_API_URL ?? process.env.STOCKSHIELD_BASE_URL ?? "http://localhost:3000");
const tenantId = process.env.HYBRID_SMOKE_TENANT_ID ?? process.env.HYBRID_TENANT_ID ?? "demo";
const locationId = process.env.HYBRID_SMOKE_LOCATION_ID ?? "main";
const sku = process.env.HYBRID_SMOKE_SKU ?? `SMOKE-${Date.now()}`;
const workerTimeoutMs = Number(process.env.HYBRID_SMOKE_WORKER_TIMEOUT_MS ?? 60_000);

async function main() {
  console.log(`Hybrid smoke running against ${baseUrl}`);
  console.log(`tenant=${tenantId} sku=${sku} location=${locationId}`);

  await post("/products", {
    tenantId,
    sku,
    name: `Smoke Test ${sku}`,
    price: 99,
  });

  await post("/inventory/adjust", {
    tenantId,
    sku,
    locationId,
    physicalDelta: 5,
  });

  const beforeOrder = await inventory();
  assertEqual(beforeOrder.sellableQuantity, 5, "initial sellable stock");

  const orderResponse = await post("/orders", {
    tenantId,
    sku,
    locationId,
    quantity: 2,
  });
  const orderId = orderResponse.order.id;

  const confirmedOrder = await poll(
    async () => get(`/orders/${orderId}`),
    (order) => order.status === "CONFIRMED",
    workerTimeoutMs,
    `order ${orderId} to become CONFIRMED`,
  );
  assertEqual(confirmedOrder.externalSyncedAt != null, true, "order external sync timestamp");

  const afterOrder = await inventory();
  assertEqual(afterOrder.physicalQuantity, 3, "physical after confirmation");
  assertEqual(afterOrder.reservedQuantity, 0, "reserved after confirmation");
  assertEqual(afterOrder.sellableQuantity, 3, "sellable after confirmation");

  const externalAfterOrder = await externalInventory();
  assertEqual(externalAfterOrder.availableQuantity, 3, "external available after order sync");

  await post("/external/orders", {
    tenantId,
    sku,
    locationId,
    quantity: 1,
  });

  const driftRun = await post(`/drift/run?tenantId=${encodeURIComponent(tenantId)}`);
  const drift = driftRun.detected.find((item) => item.sku === sku && item.locationId === locationId);
  if (!drift) {
    throw new Error("Expected drift event was not detected");
  }

  await post(`/drift/${drift.id}/fix`, {
    strategy: "INTERNAL_TO_EXTERNAL",
  });

  await poll(
    async () => {
      const events = await get(`/drift?tenantId=${encodeURIComponent(tenantId)}&sku=${encodeURIComponent(sku)}&locationId=${encodeURIComponent(locationId)}`);
      return events.find((item) => item.id === drift.id);
    },
    (event) => event?.status === "RESOLVED",
    workerTimeoutMs,
    `drift ${drift.id} to become RESOLVED`,
  );

  const externalAfterFix = await externalInventory();
  assertEqual(externalAfterFix.availableQuantity, 3, "external available after drift fix");

  const metrics = await get(`/metrics?tenantId=${encodeURIComponent(tenantId)}&windowSeconds=3600`);
  assertEqual(metrics.inventory.noOverselling, true, "no overselling invariant");

  console.log("OK hybrid smoke passed.");
}

async function inventory() {
  const rows = await get(`/inventory?tenantId=${encodeURIComponent(tenantId)}&sku=${encodeURIComponent(sku)}&locationId=${encodeURIComponent(locationId)}`);
  if (!rows[0]) {
    throw new Error("Inventory row was not found");
  }

  return rows[0];
}

async function externalInventory() {
  const rows = await get(`/external/inventory?tenantId=${encodeURIComponent(tenantId)}&sku=${encodeURIComponent(sku)}&locationId=${encodeURIComponent(locationId)}`);
  if (!rows[0]) {
    throw new Error("External inventory row was not found");
  }

  return rows[0];
}

async function poll(fetcher, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let latest;

  while (Date.now() <= deadline) {
    latest = await fetcher();
    if (predicate(latest)) {
      return latest;
    }
    await sleep(1_000);
  }

  throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(latest)}`);
}

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`);
  return parseResponse(response);
}

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return parseResponse(response);
}

async function parseResponse(response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(data)}`);
  }

  return data;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }

  console.log(`OK ${label}`);
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
