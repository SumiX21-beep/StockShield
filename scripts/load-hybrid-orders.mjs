const baseUrl = process.env.HYBRID_API_URL ?? "http://localhost:3000";
const tenantId = process.env.HYBRID_TENANT_ID ?? "demo";
const totalOrders = Number(process.env.HYBRID_LOAD_ORDERS ?? 1000);
const stockQuantity = Number(process.env.HYBRID_LOAD_STOCK ?? 100);
const locationId = process.env.HYBRID_LOAD_LOCATION ?? "main";
const sku = process.env.HYBRID_LOAD_SKU ?? `LOAD-${Date.now()}`;

async function main() {
  await post("/products", {
    tenantId,
    sku,
    name: `Load Test ${sku}`,
    price: 99,
  });
  await post("/inventory/adjust", {
    tenantId,
    sku,
    locationId,
    physicalDelta: stockQuantity,
  });

  const startedAt = Date.now();
  const results = await Promise.allSettled(
    Array.from({ length: totalOrders }, () =>
      post("/orders", {
        tenantId,
        sku,
        locationId,
        quantity: 1,
      }),
    ),
  );
  const elapsedMs = Date.now() - startedAt;
  const accepted = results.filter((result) => result.status === "fulfilled").length;
  const rejected = results.length - accepted;

  console.log(JSON.stringify({
    sku,
    totalOrders,
    stockQuantity,
    accepted,
    rejected,
    apiOrdersPerSecond: Number((totalOrders / (elapsedMs / 1000)).toFixed(2)),
  }, null, 2));

  const metrics = await waitForWorkerProgress();
  const inventory = await get(`/inventory?tenantId=${tenantId}&sku=${sku}&locationId=${locationId}`);
  console.log(JSON.stringify({ metrics, inventory }, null, 2));

  if (!metrics.inventory.noOverselling) {
    process.exitCode = 1;
  }
}

async function waitForWorkerProgress() {
  const deadline = Date.now() + Number(process.env.HYBRID_LOAD_WAIT_MS ?? 60_000);
  let latest = await get(`/metrics?tenantId=${tenantId}&windowSeconds=3600`);

  while (Date.now() < deadline) {
    if (latest.orders.byStatus.RESERVED === 0) {
      return latest;
    }
    await sleep(2_000);
    latest = await get(`/metrics?tenantId=${tenantId}&windowSeconds=3600`);
  }

  return latest;
}

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`);
  return parseResponse(response);
}

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
