# StockShield

StockShield is a NestJS service to detect and auto-fix inventory drift between OMS and sales channels.

## Hybrid Distributed Order & Inventory System

This repo now includes the complete backend track from the master build plan:

- Inventory core: `products` and `inventory` tables, with `sellable = physical_quantity - reserved_quantity`
- Order engine: `orders` table with `CREATED`, `RESERVED`, `CONFIRMED`, and `FAILED`
- Redis locking: reservation lock key is `lock:{tenant}:{sku}:{location}`
- Queue + worker: BullMQ queues `order.process`, `order.retry`, and `dlq`
- External sync: mock Shopify-style APIs and inventory webhook
- Drift system: scheduled compare, drift events, and auto-fix worker
- Monitoring/load: `GET /metrics` and `npm run load:hybrid`

Core public APIs:

```text
POST /products
GET  /products
POST /inventory/adjust
GET  /inventory?sku=SKU
POST /orders
GET  /orders
POST /orders/:id/retry
POST /external/orders
GET  /external/inventory
POST /webhooks/inventory-update
POST /drift/run
GET  /drift
POST /drift/:id/fix
GET  /metrics
```

Run the three processes locally:

```powershell
npm run prisma:deploy
npm run start:api
npm run start:worker
npm run start:scheduler
```

Minimal demo:

```powershell
Invoke-RestMethod http://localhost:3000/products -Method Post -ContentType "application/json" -Body '{"sku":"TSHIRT-1","name":"T Shirt","price":499}'
Invoke-RestMethod http://localhost:3000/inventory/adjust -Method Post -ContentType "application/json" -Body '{"sku":"TSHIRT-1","locationId":"main","physicalDelta":10}'
Invoke-RestMethod http://localhost:3000/orders -Method Post -ContentType "application/json" -Body '{"sku":"TSHIRT-1","locationId":"main","quantity":1}'
Invoke-RestMethod "http://localhost:3000/inventory?sku=TSHIRT-1"
Invoke-RestMethod "http://localhost:3000/metrics"
```

Load test:

```powershell
npm run smoke:hybrid
npm run load:hybrid
```

`smoke:hybrid` expects the API and worker to be running. It proves the complete path:
product -> inventory -> order reservation -> worker confirmation -> external sync -> drift detect -> drift fix -> metrics invariant.

## Start Here

If you only want to run and understand the project, open `START-HERE.md` first.

Quick local start:

```powershell
npm run local:start
```

Then open:

```text
http://127.0.0.1:5173
```

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
  "status": "ok",
  "service": "StockShield",
  "version": "1.0.0",
  "timestamp": "2026-05-23T00:00:00.000Z"
}
```

Additional health endpoints:

```bash
GET /health/live
GET /health/ready
```

`/health/ready` reports whether required runtime settings like `DATABASE_URL`,
`REDIS_URL`, `STOCKSHIELD_ENCRYPTION_KEY`, and the internal API token are present.

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

For non-interactive environments, apply checked-in migrations with:

```bash
npm run prisma:deploy
```

## Week 5 Operations

Production build and verification:

```bash
npm run verify
npm run build
```

Deployment and validation helpers:

```bash
npm run validate:env -- all
npm run smoke
npm run load:check
npm run demo:api
npm run seed:demo
```

Deployment assets:

- Docker image: `Dockerfile`
- Local stack: `deploy/docker-compose.yml`
- Kubernetes starter manifest: `deploy/k8s/stockshield.yaml`
- Deployment guide: `docs/DEPLOYMENT.md`
- Runbook: `docs/RUNBOOK.md`
- Load validation guide: `docs/LOAD-VALIDATION.md`

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

The planned v1 admin API is served under `/v1/admin`. The older unversioned
local routes are still available as compatibility aliases during development.

Optional tenant-scope protection:

```bash
curl "http://localhost:3000/v1/admin/drift-events?tenantId=store_1" \
  -H "$STOCKSHIELD_ADMIN_AUTH" \
  -H "X-StockShield-Tenant-Id: store_1"
```

If `X-StockShield-Tenant-Id` is supplied, it must match any `tenantId` in the
query string or request body. Set `STOCKSHIELD_ALLOWED_TENANT_IDS` to a
comma-separated allow-list to restrict which tenants the service token can touch.
Set `STOCKSHIELD_TENANT_SCOPE_REQUIRED=true` when every admin request must carry
an explicit tenant scope.

Dashboard users authenticate with JWT:

```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"demo@stockshield.local\",\"password\":\"StockShield@123\"}"
```

With Docker Compose running, seed demo data inside the API container so it uses
the Docker PostgreSQL service directly:

```bash
docker compose -f deploy/docker-compose.yml exec api npm run seed:demo
```

This creates the demo user, tenant, drift events, attempt logs, Slack alert
history, and high-risk SKU snapshots used by the React dashboard.

Create drift event:

```bash
curl -X POST http://localhost:3000/v1/admin/drift-events \
  -H "Content-Type: application/json" \
  -H "$STOCKSHIELD_ADMIN_AUTH" \
  -d "{\"tenantId\":\"store_1\",\"sku\":\"TSHIRT-BLK-M\",\"locationId\":\"loc_ny\",\"omsAvailable\":100,\"channelAvailable\":95}"
```

List drift events:

```bash
curl "http://localhost:3000/v1/admin/drift-events?page=1&limit=20&tenantId=store_1" \
  -H "$STOCKSHIELD_ADMIN_AUTH"
```

Get one drift event:

```bash
curl "http://localhost:3000/v1/admin/drift-events/<event_id>" \
  -H "$STOCKSHIELD_ADMIN_AUTH"
```

Mark a drift event for retry:

```bash
curl -X POST "http://localhost:3000/v1/admin/drift-events/<event_id>/retry" \
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
curl -X POST http://localhost:3000/v1/admin/tenant-channel-configs \
  -H "Content-Type: application/json" \
  -H "$STOCKSHIELD_ADMIN_AUTH" \
  -d "{\"tenantId\":\"store_1\",\"shopDomain\":\"demo.myshopify.com\",\"accessToken\":\"shpat_example\",\"apiVersion\":\"2025-10\"}"
```

List tenant Shopify configs:

```bash
curl "http://localhost:3000/v1/admin/tenant-channel-configs?tenantId=store_1" \
  -H "$STOCKSHIELD_ADMIN_AUTH"
```

Create or update an OMS-to-Shopify SKU/location mapping:

```bash
curl -X POST http://localhost:3000/v1/admin/sku-location-maps \
  -H "Content-Type: application/json" \
  -H "$STOCKSHIELD_ADMIN_AUTH" \
  -d "{\"tenantId\":\"store_1\",\"sku\":\"TSHIRT-BLK-M\",\"omsLocationId\":\"loc_ny\",\"shopifyInventoryItemId\":\"123456789\",\"shopifyLocationId\":\"987654321\"}"
```

List SKU/location mappings:

```bash
curl "http://localhost:3000/v1/admin/sku-location-maps?tenantId=store_1&isActive=true" \
  -H "$STOCKSHIELD_ADMIN_AUTH"
```

Trigger a manual drift scan job:

```bash
curl -X POST http://localhost:3000/v1/admin/scans/trigger \
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

Week 2 scan behavior:

- OMS available quantity is `max(0, stocked_quantity - reserved_quantity)`.
- `DRIFT_THRESHOLD=0` means exact match is required; set a positive integer to ignore small differences.
- Scheduled cursors use `(updated_at, row_id)` tie-breaking so rows with the same timestamp are not skipped.
- The cursor advances only after all rows returned for the scan window are processed.
- Duplicate open drift creation is guarded by a Postgres partial unique index plus retry-on-conflict logic.

The fix worker:

- Uses Redis locks per `tenant + sku + location`.
- Uses `IdempotencyRecord` to prevent duplicate corrections.
- Writes `DriftAttemptLog` rows for every fix attempt.
- Applies absolute Shopify inventory updates with the configured Shopify token.
- Marks successful events `RESOLVED` and terminal failures `FAILED_MANUAL`.
- Sends `FAILED_MANUAL` fix results and terminal thrown failures to the `drift.dlq` queue.

Manual retry now queues a fresh fix job:

```bash
curl -X POST "http://localhost:3000/v1/admin/drift-events/<event_id>/retry" \
  -H "$STOCKSHIELD_ADMIN_AUTH"
```

Ignore a drift event:

```bash
curl -X POST "http://localhost:3000/v1/admin/drift-events/<event_id>/ignore" \
  -H "Content-Type: application/json" \
  -H "$STOCKSHIELD_ADMIN_AUTH" \
  -d "{\"reason\":\"known warehouse adjustment\",\"actor\":\"ops@example.com\"}"
```

Get drift summary counters:

```bash
curl "http://localhost:3000/v1/admin/summary?tenantId=store_1" \
  -H "$STOCKSHIELD_ADMIN_AUTH"
```

Get operational metrics:

```bash
curl "http://localhost:3000/v1/admin/metrics?tenantId=store_1" \
  -H "$STOCKSHIELD_ADMIN_AUTH"
```

The metrics response includes drift status counts, fix attempt success rate,
webhook recheck status counts, and BullMQ queue counts/lag for `drift.scan`,
`drift.fix`, `drift.recheck`, and `drift.dlq`.

Inspect DLQ records:

```bash
curl "http://localhost:3000/v1/admin/dlq?tenantId=store_1&limit=20" \
  -H "$STOCKSHIELD_ADMIN_AUTH"
```

## Shopify Webhook Rechecks

Configure `SHOPIFY_WEBHOOK_SECRET` with the Shopify app client secret. The API verifies `X-Shopify-Hmac-SHA256` against the raw request body before it trusts webhook data.

Inventory webhooks should target:

```bash
POST /v1/webhooks/shopify/inventory-levels-update
```

When a valid webhook arrives, StockShield maps Shopify `inventory_item_id + location_id` back to an OMS SKU/location and enqueues a `drift.recheck` job. The worker then compares the current OMS quantity with Shopify and queues a fix if drift exists.

## Interview Product Layer

StockShield now includes dashboard-facing SaaS features:

- Self-serve workspace signup at `POST /v1/auth/signup`.
- JWT login and tenant-scoped admin access.
- Account overview and simulated SaaS plan management at `GET /v1/admin/account`.
- Slack alert delivery logs for detected drift, terminal fix failure, and high-risk SKUs.
- Server-sent live updates at `GET /v1/admin/live/drift-events`.
- Rule-based SKU risk scoring using drift frequency in the last 24 hours.
- Browser setup forms for Shopify connection, SKU mapping, manual scan, and manual drift tests.
- Alert and risk APIs:
  - `GET /v1/admin/alerts`
  - `GET /v1/admin/risk-skus`

The separate React dashboard lives at:

```bash
s:\Zentory\StockShield-Dashboard
```

Run it locally:

```bash
cd s:\Zentory\StockShield-Dashboard
npm install
$env:VITE_STOCKSHIELD_API_URL="http://localhost:3001"
npm run dev
```

Default demo login after `npm run seed:demo`:

```text
demo@stockshield.local
StockShield@123
```

## Inventory Reliability Core

StockShield now has an internal OMS-style inventory core that answers:

```text
Can this SKU be safely promised to a customer right now?
```

It tracks immutable inventory movements, reservations, order lifecycle changes,
returns, sellable stock, Shopify sync jobs, and drift root cause.

Core formula:

```text
sellable = max(0, physicalQuantity - reservedQuantity - safetyBuffer)
```

Inventory APIs:

```bash
POST /v1/admin/products
GET  /v1/admin/products
POST /v1/admin/locations
GET  /v1/admin/locations
GET  /v1/admin/inventory
GET  /v1/admin/inventory-truth
GET  /v1/admin/inventory/ledger
POST /v1/admin/inventory/adjustments
POST /v1/admin/orders
GET  /v1/admin/orders
POST /v1/admin/orders/<order_id>/cancel
POST /v1/admin/orders/<order_id>/fulfill
POST /v1/admin/returns
GET  /v1/admin/sync-jobs
POST /v1/admin/sync-jobs/<sync_job_id>/retry
```

Example flow:

```bash
curl -X POST http://localhost:3000/v1/admin/products \
  -H "Content-Type: application/json" \
  -H "$STOCKSHIELD_ADMIN_AUTH" \
  -d "{\"tenantId\":\"store_1\",\"title\":\"Black T-Shirt\",\"sku\":\"TSHIRT-BLK-M\",\"safetyBuffer\":2,\"unitPriceCents\":2499}"

curl -X POST http://localhost:3000/v1/admin/locations \
  -H "Content-Type: application/json" \
  -H "$STOCKSHIELD_ADMIN_AUTH" \
  -d "{\"tenantId\":\"store_1\",\"locationId\":\"loc_mumbai\",\"name\":\"Mumbai Warehouse\"}"

curl -X POST http://localhost:3000/v1/admin/inventory/adjustments \
  -H "Content-Type: application/json" \
  -H "$STOCKSHIELD_ADMIN_AUTH" \
  -d "{\"tenantId\":\"store_1\",\"sku\":\"TSHIRT-BLK-M\",\"locationId\":\"loc_mumbai\",\"physicalDelta\":100,\"safetyBuffer\":2,\"reason\":\"initial stock\"}"

curl -X POST http://localhost:3000/v1/admin/orders \
  -H "Content-Type: application/json" \
  -H "$STOCKSHIELD_ADMIN_AUTH" \
  -d "{\"tenantId\":\"store_1\",\"externalOrderId\":\"shopify-1001\",\"lines\":[{\"sku\":\"TSHIRT-BLK-M\",\"locationId\":\"loc_mumbai\",\"quantity\":5}]}"

curl "http://localhost:3000/v1/admin/inventory-truth?tenantId=store_1" \
  -H "$STOCKSHIELD_ADMIN_AUTH"
```

Set `STOCKSHIELD_OMS_SOURCE=internal` to make reconciliation scans compare
Shopify against StockShield's internal sellable quantity. Leave it unset for the
legacy external OMS reader.
