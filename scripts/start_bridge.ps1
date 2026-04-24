$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Server = Join-Path $Root "apps\bridge\syncodex_server.py"

if (-not (Test-Path -LiteralPath $Server)) {
  throw "Syncodex server not found: $Server"
}

$HostName = if ($env:SYNCODEX_HOST) { $env:SYNCODEX_HOST } else { "127.0.0.1" }
$Port = if ($env:SYNCODEX_PORT) { $env:SYNCODEX_PORT } else { "8765" }

Write-Host "Starting Syncodex bridge at http://${HostName}:${Port}"
py $Server --host $HostName --port $Port
