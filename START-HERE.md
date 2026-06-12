# StockShield Start Here

StockShield has two jobs:

1. Keep the local inventory truth correct.
2. Push the correct sellable quantity to Shopify when stock changes.

It does not currently import your whole Shopify product catalog. Products/SKUs are created inside StockShield, mapped to Shopify inventory item/location IDs, then StockShield syncs inventory quantities.

## Run Locally

From PowerShell:

```powershell
cd S:\Zentory\StockShield
npm run local:start
```

Open:

```text
http://127.0.0.1:5173
```

Demo login:

```text
demo@stockshield.local
StockShield@123
```

Stop the app:

```powershell
npm run local:stop
```

## What Starts

`npm run local:start` starts:

- PostgreSQL on `localhost:5433`
- Redis on `localhost:6379`
- API on `http://127.0.0.1:3001`
- Worker for sync/fix jobs
- Scheduler for drift scans
- React dashboard on `http://127.0.0.1:5173`

Logs go here because the `S:` drive may be full:

```text
C:\Users\sumit\AppData\Local\Temp\stockshield-logs
```

## What Works Today

- Store connection can be saved.
- Products and locations can be created in StockShield.
- SKU/location mappings can be saved.
- Inventory adjustments create sync jobs.
- Orders reserve stock.
- Cancel/fulfill/return flows update stock.
- The worker processes inventory sync jobs.
- The dashboard shows drift, risk, alerts, inventory, orders, and sync jobs.

## What Is Demo-Only Right Now

- Seeded products are fake demo data.
- Seeded sync results are fake demo records.
- Full Shopify product import is not implemented.
- Real Shopify sync requires valid Shopify inventory item IDs, location IDs, and an Admin API token with inventory permissions.

## Simple Mental Model

Product:

```text
Black T-Shirt
```

SKU:

```text
TSHIRT-BLK-M
```

Location:

```text
loc_mumbai
```

Inventory truth:

```text
sellable = physical - reserved - safetyBuffer
```

Shopify mapping:

```text
TSHIRT-BLK-M + loc_mumbai -> Shopify inventory_item_id + location_id
```

Sync job:

```text
Tell Shopify the sellable quantity.
```
