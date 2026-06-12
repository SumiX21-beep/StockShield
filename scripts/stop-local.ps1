$ErrorActionPreference = "Stop"

$patterns = @(
  "dist/main.js",
  "dist/main-worker.js",
  "dist/main-scheduler.js",
  "stockshield-vite.config.mjs"
)

$stopped = @()
Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object {
    $commandLine = $_.CommandLine
    $patterns | Where-Object { $commandLine -like "*$_*" }
  } |
  ForEach-Object {
    $stopped += $_.ProcessId
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }

Write-Host "Stopped StockShield node processes: $($stopped -join ', ')"
Write-Host "Postgres and Redis containers were left running."
