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

Then verify:

```bash
$env:STOCKSHIELD_BASE_URL = "http://localhost:3000"
$env:STOCKSHIELD_INTERNAL_API_TOKEN = "compose-local-admin-token"
npm run smoke
```

The Compose Postgres init script creates a sample `inventory_snapshot` table and a
read-only `readonly` user for OMS reads.

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
- Read-only OMS PostgreSQL connection.
- Shopify Admin API credentials per tenant.

## Release Checklist

- `npm run verify` passes.
- `npm run build` passes.
- Image builds successfully.
- `npm run validate:env -- all` passes in the target environment.
- Migrations have run successfully.
- API readiness is green at `/health/ready`.
- `npm run smoke` passes against the target API.
- Queue lag in `/v1/admin/metrics` is within SLA.
