# StockShield

StockShield is a NestJS service to detect and auto-fix inventory drift between OMS and sales channels.

## Day 1 Setup (Completed)

- NestJS backend initialized with TypeScript
- Health endpoint added: `GET /health`
- Dev scripts configured

## Run Locally

```bash
npm install
npm run dev
```

Then open:

```bash
http://localhost:3000/health
```

If port `3000` is busy:

```bash
PORT=3001 npm run start
```

Expected response:

```json
{
  "ok": true,
  "service": "StockShield",
  "timestamp": "2026-05-23T00:00:00.000Z"
}
```

## Next Small Step (Day 2)

- Add PostgreSQL + Prisma
- Create first table: `drift_event`
- Build `POST /drift-events` and `GET /drift-events`

## Day 2 Setup (Completed)

- Prisma configured for PostgreSQL
- `DriftEvent` model added in `prisma/schema.prisma`
- Prisma service integrated into NestJS
- Validation enabled globally with `ValidationPipe`
- APIs added:
  - `POST /drift-events`
  - `GET /drift-events`

## Day 2 Run Steps

1. Copy env file:

```bash
cp .env.example .env
```

PowerShell alternative:

```powershell
Copy-Item .env.example .env
```

2. Set your DB URL in `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/stockshield?schema=public"
```

3. Generate Prisma client:

```bash
npm run prisma:generate
```

4. Create/apply migration (requires PostgreSQL running):

```bash
npm run prisma:migrate
```

5. Run API:

```bash
npm run dev
```

## Example API Calls

Admin endpoints require an internal token:

```bash
export STOCKSHIELD_ADMIN_AUTH="Authorization: Bearer change-this-local-admin-token"
```

PowerShell:

```powershell
$env:STOCKSHIELD_ADMIN_AUTH = "Authorization: Bearer change-this-local-admin-token"
```

Create drift event:

```bash
curl -X POST http://localhost:3000/drift-events \
  -H "Content-Type: application/json" \
  -H "$STOCKSHIELD_ADMIN_AUTH" \
  -d "{\"tenantId\":\"store_1\",\"sku\":\"TSHIRT-BLK-M\",\"locationId\":\"loc_ny\",\"omsAvailable\":100,\"channelAvailable\":95}"
```

List drift events:

```bash
curl "http://localhost:3000/drift-events?page=1&limit=20&tenantId=store_1" \
  -H "$STOCKSHIELD_ADMIN_AUTH"
```

Get one drift event:

```bash
curl "http://localhost:3000/drift-events/<event_id>" \
  -H "$STOCKSHIELD_ADMIN_AUTH"
```

Mark a drift event for retry:

```bash
curl -X POST "http://localhost:3000/drift-events/<event_id>/retry" \
  -H "$STOCKSHIELD_ADMIN_AUTH"
```

## Data Foundation (Completed)

The Prisma schema now includes the core tables needed for the full DriftGuard plan:

- `TenantChannelConfig` stores per-tenant Shopify connection settings.
- `TenantSkuLocationMap` maps OMS SKU/location pairs to Shopify inventory/location IDs.
- `DriftScanCursor` stores scan watermarks so workers know where to resume.
- `DriftAttemptLog` records fix attempts and failures for audit history.
- `IdempotencyRecord` prevents duplicate fix operations.
- `WebhookRecheckEvent` stores webhook-triggered recheck work.

Run migrations after schema changes:

```bash
npm run prisma:migrate
```

## Setup APIs

Store a tenant Shopify config:

```bash
curl -X POST http://localhost:3000/tenant-channel-configs \
  -H "Content-Type: application/json" \
  -H "$STOCKSHIELD_ADMIN_AUTH" \
  -d "{\"tenantId\":\"store_1\",\"shopDomain\":\"demo.myshopify.com\",\"accessToken\":\"shpat_example\",\"apiVersion\":\"2025-10\"}"
```

List tenant Shopify configs:

```bash
curl "http://localhost:3000/tenant-channel-configs?tenantId=store_1" \
  -H "$STOCKSHIELD_ADMIN_AUTH"
```

Create or update an OMS-to-Shopify SKU/location mapping:

```bash
curl -X POST http://localhost:3000/sku-location-maps \
  -H "Content-Type: application/json" \
  -H "$STOCKSHIELD_ADMIN_AUTH" \
  -d "{\"tenantId\":\"store_1\",\"sku\":\"TSHIRT-BLK-M\",\"omsLocationId\":\"loc_ny\",\"shopifyInventoryItemId\":\"123456789\",\"shopifyLocationId\":\"987654321\"}"
```

List SKU/location mappings:

```bash
curl "http://localhost:3000/sku-location-maps?tenantId=store_1&isActive=true" \
  -H "$STOCKSHIELD_ADMIN_AUTH"
```

Trigger a manual drift scan job:

```bash
curl -X POST http://localhost:3000/scans/trigger \
  -H "Content-Type: application/json" \
  -H "$STOCKSHIELD_ADMIN_AUTH" \
  -d "{\"tenantId\":\"store_1\",\"reason\":\"manual test scan\"}"
```

## Worker Flow

Run the API, worker, and scheduler in separate terminals:

```bash
npm run dev:api
npm run dev:worker
npm run dev:scheduler
```

The scheduler enqueues one `drift.scan` job per active Shopify tenant every `DRIFT_SCAN_INTERVAL_MINUTES`.
The worker consumes scan jobs, reads changed OMS inventory rows, compares Shopify inventory, then enqueues `drift.fix` jobs for mismatches.

The fix worker:

- Uses Redis locks per `tenant + sku + location`.
- Uses `IdempotencyRecord` to prevent duplicate corrections.
- Writes `DriftAttemptLog` rows for every fix attempt.
- Applies absolute Shopify inventory updates with the configured Shopify token.
- Marks successful events `RESOLVED` and terminal failures `FAILED_MANUAL`.

Manual retry now queues a fresh fix job:

```bash
curl -X POST "http://localhost:3000/drift-events/<event_id>/retry"
```

Ignore a drift event:

```bash
curl -X POST "http://localhost:3000/drift-events/<event_id>/ignore" \
  -H "Content-Type: application/json" \
  -H "$STOCKSHIELD_ADMIN_AUTH" \
  -d "{\"reason\":\"known warehouse adjustment\",\"actor\":\"ops@example.com\"}"
```

Get drift summary counters:

```bash
curl "http://localhost:3000/drift-events/summary?tenantId=store_1" \
  -H "$STOCKSHIELD_ADMIN_AUTH"
```

## Shopify Webhook Rechecks

Configure `SHOPIFY_WEBHOOK_SECRET` with the Shopify app client secret. The API verifies `X-Shopify-Hmac-SHA256` against the raw request body before it trusts webhook data.

Inventory webhooks should target:

```bash
POST /webhooks/shopify/inventory-levels-update
```

When a valid webhook arrives, StockShield maps Shopify `inventory_item_id + location_id` back to an OMS SKU/location and enqueues a `drift.recheck` job. The worker then compares the current OMS quantity with Shopify and queues a fix if drift exists.
