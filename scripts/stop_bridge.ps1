$ErrorActionPreference = "Stop"

$Port = if ($env:SYNCODEX_PORT) { [int]$env:SYNCODEX_PORT } else { 8765 }
$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

if (-not $connections) {
  Write-Host "Syncodex bridge is not listening on port $Port."
  exit 0
}

$processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($processId in $processIds) {
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($process) {
    Write-Host "Stopping Syncodex bridge process $processId ($($process.ProcessName))."
    Stop-Process -Id $processId -Force
  }
}
