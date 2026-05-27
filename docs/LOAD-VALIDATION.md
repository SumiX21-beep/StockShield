# StockShield Load Validation

Week 5 load validation uses the built-in `scripts/load-check.mjs` runner.

## Quick Check

```bash
$env:STOCKSHIELD_BASE_URL = "http://localhost:3000"
$env:STOCKSHIELD_INTERNAL_API_TOKEN = "change-this-local-admin-token"
npm run load:check
```

Defaults:

- `LOAD_REQUESTS=100`
- `LOAD_CONCURRENCY=10`
- `LOAD_P95_MS=1000`
- `LOAD_PATHS=/health/live,/v1/admin/summary?tenantId=store_1`

## Larger Check

```bash
$env:LOAD_REQUESTS = "1000"
$env:LOAD_CONCURRENCY = "50"
$env:LOAD_P95_MS = "750"
$env:LOAD_PATHS = "/health/live,/v1/admin/summary?tenantId=store_1,/v1/admin/metrics?tenantId=store_1"
npm run load:check
```

The command exits non-zero if any request fails or p95 latency exceeds the budget.

## Performance Acceptance Notes

For the v1 plan, use these as initial checks:

- API health and dashboard endpoints remain responsive under worker load.
- `drift.fix` queue lag does not grow unbounded.
- No duplicate open drift rows for the same tenant/channel/SKU/location.
- Manual retry remains safe when repeated.

Full 10 tenant x 5k changed rows testing still requires a seeded OMS database and
Shopify adapter test doubles or a Shopify staging shop.
