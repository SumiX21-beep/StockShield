import "dotenv/config";

const baseUrl = stripTrailingSlash(process.env.STOCKSHIELD_BASE_URL ?? "http://localhost:3000");
const token = process.env.STOCKSHIELD_INTERNAL_API_TOKEN;
const authDisabled = process.env.STOCKSHIELD_AUTH_DISABLED === "true";
const tenantId = process.env.STOCKSHIELD_DEMO_TENANT_ID ?? "store_1";
const sku = `DEMO-SKU-${Date.now()}`;
const locationId = process.env.STOCKSHIELD_DEMO_LOCATION_ID ?? "loc_1";

if (!authDisabled && !token) {
  console.error("ERROR STOCKSHIELD_INTERNAL_API_TOKEN is required for the demo flow.");
  process.exit(1);
}

console.log(`Running StockShield demo against ${baseUrl}`);
console.log(`Tenant: ${tenantId}`);

const created = await request("create drift event", "/v1/admin/drift-events", {
  method: "POST",
  body: {
    tenantId,
    sku,
    locationId,
    omsAvailable: 10,
    channelAvailable: 7,
    reason: "demo drift",
  },
});

await request("list drift events", `/v1/admin/drift-events?tenantId=${tenantId}&sku=${encodeURIComponent(sku)}`);
await request("summary", `/v1/admin/summary?tenantId=${tenantId}`);
await request("metrics", `/v1/admin/metrics?tenantId=${tenantId}`);
await request("ignore demo event", `/v1/admin/drift-events/${created.id}/ignore`, {
  method: "POST",
  body: {
    reason: "demo cleanup",
    actor: "demo-flow",
  },
});

console.log(`OK demo flow completed for drift event ${created.id}`);

async function request(label, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...authHeaders(),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const body = await safeJson(response);

  if (!response.ok) {
    console.error(`FAIL ${label} HTTP ${response.status}`);
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }

  console.log(`OK ${label}`);
  return body;
}

function authHeaders() {
  return authDisabled ? {} : { Authorization: `Bearer ${token}` };
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}
