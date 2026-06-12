# StockShield Deployment Guide

This guide covers the Week 5 deployment-ready path for StockShield.

## Build And Verify

Run the local verification gate:

```bash
npm run verify
npm run build
```

Validate environment variables before starting a process:

```bash
npm run validate:env -- api
npm run validate:env -- worker
npm run validate:env -- scheduler
```

## Docker

Build the image:

```bash
docker build -t stockshield:local .
```

Run the API:

```bash
docker run --rm -p 3000:3000 --env-file .env stockshield:local
```

Run individual production processes:

```bash
npm run start:prod:api
npm run start:prod:worker
npm run start:prod:scheduler
```

## Local Compose Stack

The Compose stack starts Postgres, Redis, a migration job, API, worker, and scheduler.

```bash
docker compose -f deploy/docker-compose.yml up --build
```

For local Docker, the API is exposed on `http://localhost:3001` and Redis is
exposed on host port `6380` to avoid common local port conflicts. Inside Docker,
services still talk to `api:3000` and `redis:6379`.

Then verify:

```bash
$env:STOCKSHIELD_BASE_URL = "http://localhost:3001"
$env:STOCKSHIELD_INTERNAL_API_TOKEN = "compose-local-admin-token"
npm run smoke
```

The Compose Postgres init script creates a sample `oms.inventory_snapshot` table
and a read-only `readonly` user for OMS reads.

## Kubernetes

Start from:

```bash
kubectl apply -f deploy/k8s/stockshield.yaml
```

Before production use:

- Replace all placeholder secret values in `stockshield-secrets`.
- Replace `ghcr.io/sumix21-beep/stockshield:0.0.2` with the image tag you built and pushed.
- Run the `stockshield-migrate` Job before rolling out API/worker/scheduler updates.
- Use one scheduler replica unless you add leader election or external schedule de-duplication.

## Required Runtime Services

- PostgreSQL for StockShield service tables.
- Redis for BullMQ queues and drift locks.
- Read-only OMS PostgreSQL connection, unless `STOCKSHIELD_OMS_SOURCE=internal`.
- Shopify Admin API credentials per tenant.
- `STOCKSHIELD_JWT_SECRET` for dashboard JWT sessions.
- Optional `SLACK_WEBHOOK_URL` for ops alerts.

## Dashboard Deployment

Deploy `s:\Zentory\StockShield-Dashboard` as a static Vite app on Render,
Railway, or any static host. Set `VITE_STOCKSHIELD_API_URL` to the public API URL
and set `STOCKSHIELD_DASHBOARD_ORIGIN` on the API to the dashboard origin.

Seed interview/demo data after migrations:

```bash
docker compose -f deploy/docker-compose.yml exec api npm run seed:demo
```

## Release Checklist

- `npm run verify` passes.
- `npm run build` passes.
- Dashboard `npm run build` passes.
- Image builds successfully.
- `npm run validate:env -- all` passes in the target environment.
- Migrations have run successfully.
- API readiness is green at `/health/ready`.
- `npm run smoke` passes against the target API.
- Create one product, location, stock adjustment, and order reservation; confirm
  `/v1/admin/inventory-truth` shows physical, reserved, sellable, sync status,
  and root cause fields.
- Queue lag in `/v1/admin/metrics` is within SLA.
