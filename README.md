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
