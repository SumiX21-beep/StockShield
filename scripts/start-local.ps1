$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$dashboardRoot = Resolve-Path (Join-Path $root "..\StockShield-Dashboard")
$logDir = Join-Path $env:TEMP "stockshield-logs"
$viteConfig = Join-Path $env:TEMP "stockshield-vite.config.mjs"
$viteCache = Join-Path $env:TEMP "stockshield-vite-cache"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
New-Item -ItemType Directory -Force -Path $viteCache | Out-Null

function Stop-StockShieldNode {
  $patterns = @(
    "dist/main.js",
    "dist/main-worker.js",
    "dist/main-scheduler.js",
    "stockshield-vite.config.mjs"
  )

  Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
    Where-Object {
      $commandLine = $_.CommandLine
      $patterns | Where-Object { $commandLine -like "*$_*" }
    } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Ensure-Container {
  param(
    [string] $Name,
    [string] $RunCommand
  )

  $existing = docker ps -a --filter "name=^/$Name$" --format "{{.Names}}"
  if ($existing -eq $Name) {
    docker start $Name | Out-Null
    return
  }

  Invoke-Expression $RunCommand | Out-Null
}

function Wait-ForPostgres {
  for ($i = 0; $i -lt 30; $i++) {
    docker exec stockshield-postgres-local pg_isready -U postgres -d stockshield | Out-Null
    if ($LASTEXITCODE -eq 0) {
      return
    }
    Start-Sleep -Seconds 1
  }

  throw "Postgres did not become ready."
}

Push-Location $root
try {
  Ensure-Container `
    -Name "stockshield-postgres-local" `
    -RunCommand "docker run -d --name stockshield-postgres-local -e POSTGRES_DB=stockshield -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16-alpine"

  Ensure-Container `
    -Name "stockshield-redis-local" `
    -RunCommand "docker run -d --name stockshield-redis-local -p 6379:6379 redis:7-alpine"

  Wait-ForPostgres

  $env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5433/stockshield?schema=public"
  $env:REDIS_URL = "redis://localhost:6379"
  $env:STOCKSHIELD_ENCRYPTION_KEY = "stockshield-local-encryption-key"
  $env:STOCKSHIELD_INTERNAL_API_TOKEN = "local-admin-token"
  $env:STOCKSHIELD_JWT_SECRET = "stockshield-local-jwt-secret"
  $env:STOCKSHIELD_JWT_EXPIRES_SECONDS = "43200"
  $env:STOCKSHIELD_DASHBOARD_ORIGIN = "http://localhost:5173,http://127.0.0.1:5173"
  $env:STOCKSHIELD_AUTH_DISABLED = "false"
  $env:STOCKSHIELD_TENANT_SCOPE_DISABLED = "false"
  $env:STOCKSHIELD_TENANT_SCOPE_REQUIRED = "false"
  $env:STOCKSHIELD_ALLOWED_TENANT_IDS = ""
  $env:STOCKSHIELD_OMS_SOURCE = "internal"
  $env:SHOPIFY_WEBHOOK_SECRET = "local-webhook-secret"
  $env:SHOPIFY_API_VERSION = "2026-04"
  $env:PORT = "3001"
  $env:DRIFT_SCAN_INTERVAL_MINUTES = "5"
  $env:DRIFT_SCAN_LIMIT = "1000"
  $env:DRIFT_THRESHOLD = "0"
  $env:DRIFT_SCAN_CONCURRENCY = "2"
  $env:DRIFT_FIX_CONCURRENCY = "4"
  $env:DRIFT_RECHECK_CONCURRENCY = "3"
  $env:INVENTORY_SYNC_CONCURRENCY = "3"
  $env:DRIFT_FIX_LOCK_TTL_MS = "60000"

  npm run prisma:deploy
  npm run build

  Stop-StockShieldNode

  $api = Start-Process -FilePath node.exe -ArgumentList @("dist/main.js") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir "api.log") -RedirectStandardError (Join-Path $logDir "api.err.log") -PassThru
  $worker = Start-Process -FilePath node.exe -ArgumentList @("dist/main-worker.js") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir "worker.log") -RedirectStandardError (Join-Path $logDir "worker.err.log") -PassThru
  $scheduler = Start-Process -FilePath node.exe -ArgumentList @("dist/main-scheduler.js") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir "scheduler.log") -RedirectStandardError (Join-Path $logDir "scheduler.err.log") -PassThru

  @"
export default {
  root: "$(($dashboardRoot.Path -replace "\\", "/"))",
  cacheDir: "$(($viteCache -replace "\\", "/"))",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  }
};
"@ | Set-Content -LiteralPath $viteConfig -Encoding UTF8

  $env:VITE_STOCKSHIELD_API_URL = "http://127.0.0.1:3001"
  $env:VITE_FORCE_POLLING = "true"
  $dashboard = Start-Process -FilePath node.exe -ArgumentList @("node_modules/vite/bin/vite.js", "--config", $viteConfig) -WorkingDirectory $dashboardRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir "dashboard.log") -RedirectStandardError (Join-Path $logDir "dashboard.err.log") -PassThru

  Start-Sleep -Seconds 2
  $health = Invoke-RestMethod "http://127.0.0.1:3001/health/ready"
  $dashboardStatus = (Invoke-WebRequest "http://127.0.0.1:5173" -UseBasicParsing).StatusCode

  Write-Host ""
  Write-Host "StockShield is running."
  Write-Host "API:       http://127.0.0.1:3001"
  Write-Host "Dashboard: http://127.0.0.1:5173"
  Write-Host "Login:     demo@stockshield.local / StockShield@123"
  Write-Host "Logs:      $logDir"
  Write-Host ""
  Write-Host "Processes:"
  Write-Host "  API       $($api.Id)"
  Write-Host "  Worker    $($worker.Id)"
  Write-Host "  Scheduler $($scheduler.Id)"
  Write-Host "  Dashboard $($dashboard.Id)"
  Write-Host ""
  Write-Host "Health:    $($health.status)"
  Write-Host "Dashboard: HTTP $dashboardStatus"
}
finally {
  Pop-Location
}
