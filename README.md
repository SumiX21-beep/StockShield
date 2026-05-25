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

Create drift event:

```bash
curl -X POST http://localhost:3000/drift-events \
  -H "Content-Type: application/json" \
  -d "{\"tenantId\":\"store_1\",\"sku\":\"TSHIRT-BLK-M\",\"locationId\":\"loc_ny\",\"omsAvailable\":100,\"channelAvailable\":95}"
```

List drift events:

```bash
curl "http://localhost:3000/drift-events?page=1&limit=20&tenantId=store_1"
```

Get one drift event:

```bash
curl "http://localhost:3000/drift-events/<event_id>"
```

Mark a drift event for retry:

```bash
curl -X POST "http://localhost:3000/drift-events/<event_id>/retry"
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
