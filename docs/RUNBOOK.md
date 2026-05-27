# StockShield Runbook

This runbook is for operating StockShield after deployment.

## Processes

- `api`: admin APIs, health endpoints, Shopify webhook intake.
- `worker`: scan, fix, and webhook recheck workers.
- `scheduler`: periodic scan job creation.

## Health Checks

```bash
GET /health
GET /health/live
GET /health/ready
```

Use `/health/ready` for deployment readiness. It checks required runtime configuration.

## Key Admin Endpoints

```bash
GET /v1/admin/summary?tenantId=store_1
GET /v1/admin/metrics?tenantId=store_1
GET /v1/admin/dlq?tenantId=store_1&limit=20
POST /v1/admin/scans/trigger
POST /v1/admin/drift-events/:id/retry
POST /v1/admin/drift-events/:id/ignore
```

All admin endpoints require:

```bash
Authorization: Bearer <STOCKSHIELD_INTERNAL_API_TOKEN>
```

When using tenant scoping, also send:

```bash
X-StockShield-Tenant-Id: <tenantId>
```

## Alerts

Recommended initial alerts:

- Open drift count is above normal for 10 minutes.
- `FAILED_MANUAL` drift count increases.
- `drift.fix` queue lag exceeds SLA.
- `drift.dlq` has waiting jobs.
- Webhook recheck failures increase.
- API `/health/ready` is not ready.

## Incident: Drift Backlog Growing

1. Check queue lag:

```bash
curl "$BASE_URL/v1/admin/metrics?tenantId=$TENANT_ID" \
  -H "Authorization: Bearer $STOCKSHIELD_INTERNAL_API_TOKEN"
```

2. Confirm worker is running.
3. Increase `DRIFT_FIX_CONCURRENCY` if Shopify rate limits are healthy.
4. Check `FAILED_MANUAL` reasons for missing mappings or inactive tenant configs.
5. Trigger a targeted manual scan after fixing mappings:

```bash
curl -X POST "$BASE_URL/v1/admin/scans/trigger" \
  -H "Authorization: Bearer $STOCKSHIELD_INTERNAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"tenantId\":\"$TENANT_ID\",\"sku\":\"$SKU\",\"locationId\":\"$LOCATION_ID\",\"reason\":\"incident recheck\"}"
```

## Incident: Fixes Are Failing

1. Inspect DLQ:

```bash
curl "$BASE_URL/v1/admin/dlq?tenantId=$TENANT_ID&limit=20" \
  -H "Authorization: Bearer $STOCKSHIELD_INTERNAL_API_TOKEN"
```

2. Check Shopify credentials and tenant channel status.
3. Check SKU/location mapping.
4. Retry after correcting the cause:

```bash
curl -X POST "$BASE_URL/v1/admin/drift-events/$DRIFT_EVENT_ID/retry" \
  -H "Authorization: Bearer $STOCKSHIELD_INTERNAL_API_TOKEN"
```

## Incident: Webhooks Rejected

1. Confirm `SHOPIFY_WEBHOOK_SECRET` matches the Shopify app client secret.
2. Confirm the webhook target is:

```bash
POST /v1/webhooks/shopify/inventory-levels-update
```

3. Confirm Shopify sends `X-Shopify-Hmac-SHA256` and raw body verification is enabled.

## Rollback

1. Scale scheduler to zero to stop new scan creation.
2. Scale worker to zero if fixes are unsafe.
3. Roll API/worker/scheduler back to the previous image.
4. Keep the database forward-compatible; do not manually revert migrations unless a tested down-plan exists.
5. Re-enable scheduler and worker after smoke checks pass.
