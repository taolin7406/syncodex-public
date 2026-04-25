$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Entry = Join-Path $Root "apps\tray\syncodex_tray.py"
$Dist = Join-Path $Root "dist"

if (-not (Test-Path -LiteralPath $Entry)) {
  throw "Tray entry not found: $Entry"
}

$hasPyInstaller = $true
try {
  py -m PyInstaller --version *> $null
  if ($LASTEXITCODE -ne 0) {
    $hasPyInstaller = $false
  }
} catch {
  $hasPyInstaller = $false
}

if (-not $hasPyInstaller) {
  Write-Host "PyInstaller is not installed. Installing it for the current Python..."
  py -m pip install pyinstaller
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to install PyInstaller."
  }
}

$hasQrcode = $true
try {
  py -c "import qrcode, qrcode.image.svg" *> $null
  if ($LASTEXITCODE -ne 0) {
    $hasQrcode = $false
  }
} catch {
  $hasQrcode = $false
}

if (-not $hasQrcode) {
  Write-Host "qrcode is not installed. Installing it for the current Python..."
  py -m pip install qrcode
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to install qrcode."
  }
}

$Exe = Join-Path $Dist "Syncodex.exe"
$LegacyExe = Join-Path $Dist "SyncodexNext.exe"

function Remove-FileWithRetry {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [int]$Attempts = 20,
    [int]$DelayMs = 300
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    try {
      Remove-Item -LiteralPath $Path -Force
      return
    } catch {
      if ($attempt -ge $Attempts) {
        throw
      }
      Start-Sleep -Milliseconds $DelayMs
    }
  }
}

if (Test-Path -LiteralPath $Exe) {
  Remove-FileWithRetry -Path $Exe
}

py -m PyInstaller `
  --noconfirm `
  --clean `
  --onefile `
  --windowed `
  --name Syncodex `
  --paths (Join-Path $Root "apps\bridge") `
  --paths (Join-Path $Root "apps\tray") `
  --hidden-import qrcode `
  --hidden-import qrcode.image.svg `
  --add-data "$((Join-Path $Root 'package\web'));package\web" `
  --add-data "$((Join-Path $Root 'scripts'));scripts" `
  $Entry

if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller build failed."
}

if (-not (Test-Path -LiteralPath $Exe)) {
  throw "Build finished but executable was not found: $Exe"
}

Copy-Item -LiteralPath $Exe -Destination $LegacyExe -Force

Write-Host "Built: $Exe"
Write-Host "Updated legacy compatibility entry: $LegacyExe"
