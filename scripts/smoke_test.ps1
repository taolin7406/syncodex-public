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
  if ($response.Content -notmatch '/app\.bundle\.js') { throw "Index does not load app.bundle.js" }
  if ($response.Content -match 'type="module" src="/app\.js"') { throw "Index still loads app.js as a module" }
}

Assert-Ok "GET /app.js" {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/app.js" -TimeoutSec 5
  if ($response.StatusCode -ne 200) { throw "Unexpected status $($response.StatusCode)" }
}

Assert-Ok "GET /app.bundle.js" {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/app.bundle.js" -TimeoutSec 5
  if ($response.StatusCode -ne 200) { throw "Unexpected status $($response.StatusCode)" }
  if ($response.Content.Length -lt 100000) { throw "Bundle response is unexpectedly small" }
}

Assert-Ok "POST /api/client-debug" {
  $payload = @{
    reason = "smoke-test"
    at = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json -Compress
  $response = Invoke-RestMethod -Uri "$BaseUrl/api/client-debug" -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 5
  if (-not $response.ok) { throw "Client debug endpoint did not acknowledge the payload" }
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

Assert-Ok "GET /api/sessions/:id/timeline first page" {
  $session = $script:sessions.items | Where-Object { $_.eventCount -gt 200 } | Select-Object -First 1
  if (-not $session) {
    $session = $script:sessions.items[0]
  }
  $timeline = Invoke-RestMethod -Uri "$BaseUrl/api/sessions/$($session.sessionId)/timeline?limit=200" -TimeoutSec 10
  if ($timeline.items.Count -lt 1) { throw "No first page timeline events returned" }
  if ($timeline.items.Count -gt 200) { throw "Timeline first page returned more than 200 items" }
}

Assert-Ok "POST+DELETE /api/sessions/:id/attachments" {
  $sessionId = $script:sessions.items[0].sessionId
  $attachmentId = "smoke-attachment-$([Guid]::NewGuid().ToString('N'))"
  $uploadPayload = @{
    attachments = @(
      @{
        id = $attachmentId
        name = "syncodex-smoke.txt"
        mimeType = "text/plain"
        data = "data:text/plain;base64,c3luY29kZXgtc21va2U="
      }
    )
  } | ConvertTo-Json -Depth 5 -Compress
  $uploaded = Invoke-RestMethod -Uri "$BaseUrl/api/sessions/$sessionId/attachments" -Method Post -ContentType "application/json" -Body $uploadPayload -TimeoutSec 10
  if ($uploaded.count -ne 1) { throw "Attachment upload did not return one item" }
  $path = [string]$uploaded.items[0].path
  if (-not $path) { throw "Attachment upload did not return a saved path" }

  $reuploaded = Invoke-RestMethod -Uri "$BaseUrl/api/sessions/$sessionId/attachments" -Method Post -ContentType "application/json" -Body $uploadPayload -TimeoutSec 10
  if ($reuploaded.count -ne 1) { throw "Idempotent attachment retry did not return one item" }
  $retryPath = [string]$reuploaded.items[0].path
  if ($retryPath -ne $path) { throw "Idempotent attachment retry returned a different path" }

  $deletePayload = @{
    attachments = @(@{ path = $path })
  } | ConvertTo-Json -Depth 5 -Compress
  $deleted = Invoke-RestMethod -Uri "$BaseUrl/api/sessions/$sessionId/attachments" -Method Delete -ContentType "application/json" -Body $deletePayload -TimeoutSec 10
  if ($deleted.deletedCount -ne 1) { throw "Attachment delete did not remove the uploaded item" }
}

Write-Host "Syncodex smoke test passed: $BaseUrl"
