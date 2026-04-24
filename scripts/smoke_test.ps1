$ErrorActionPreference = "Stop"

$BaseUrl = if ($env:SYNCODEX_BASE_URL) { $env:SYNCODEX_BASE_URL } else { "http://127.0.0.1:8765" }

function Assert-Ok($Name, $ScriptBlock) {
  try {
    & $ScriptBlock | Out-Null
    Write-Host "[ok] $Name"
  } catch {
    Write-Host "[failed] $Name"
    throw
  }
}

Assert-Ok "GET /" {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/" -TimeoutSec 5
  if ($response.StatusCode -ne 200) { throw "Unexpected status $($response.StatusCode)" }
}

Assert-Ok "GET /app.js" {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/app.js" -TimeoutSec 5
  if ($response.StatusCode -ne 200) { throw "Unexpected status $($response.StatusCode)" }
}

Assert-Ok "GET /health" {
  $health = Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 5
  if (-not $health.ok) { throw "Health check failed" }
}

Assert-Ok "GET /api/projects" {
  $projects = Invoke-RestMethod -Uri "$BaseUrl/api/projects" -TimeoutSec 5
  if ($projects.count -lt 1) { throw "No projects returned" }
}

$sessions = $null
Assert-Ok "GET /api/sessions" {
  $script:sessions = Invoke-RestMethod -Uri "$BaseUrl/api/sessions" -TimeoutSec 5
  if ($script:sessions.count -lt 1) { throw "No sessions returned" }
}

Assert-Ok "GET /api/sessions/:id/timeline" {
  $sessionId = $script:sessions.items[0].sessionId
  $timeline = Invoke-RestMethod -Uri "$BaseUrl/api/sessions/$sessionId/timeline?limit=10" -TimeoutSec 10
  if ($timeline.items.Count -lt 1) { throw "No timeline events returned" }
}

Write-Host "Syncodex smoke test passed: $BaseUrl"
