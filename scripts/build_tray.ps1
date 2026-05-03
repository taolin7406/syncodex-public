$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Entry = Join-Path $Root "apps\tray\syncodex_tray.py"
$Dist = Join-Path $Root "dist"

if (-not (Test-Path -LiteralPath $Entry)) {
  throw "Tray entry not found: $Entry"
}

& (Join-Path $PSScriptRoot "build_web_bundle.ps1")

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
$DefaultScratchRoot = if ($env:LOCALAPPDATA) {
  Join-Path $env:LOCALAPPDATA "Syncodex\build"
} else {
  Join-Path ([System.IO.Path]::GetTempPath()) "syncodex-build"
}
$BuildScratchRoot = if ($env:SYNCODEX_BUILD_SCRATCH) {
  $env:SYNCODEX_BUILD_SCRATCH
} else {
  $DefaultScratchRoot
}
$BuildDistRoot = Join-Path $BuildScratchRoot "dist_build"
$BuildStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BuildDist = Join-Path $BuildDistRoot ("syncodex-" + $BuildStamp)
$BuildWorkRoot = Join-Path $BuildScratchRoot "build_tmp"
$BuildWork = Join-Path $BuildWorkRoot ("syncodex-" + $BuildStamp)

New-Item -ItemType Directory -Path $BuildDist -Force | Out-Null
New-Item -ItemType Directory -Path $BuildWork -Force | Out-Null
Write-Host "Using build scratch: $BuildScratchRoot"

py -m PyInstaller `
  --noconfirm `
  --onefile `
  --windowed `
  --name Syncodex `
  --distpath $BuildDist `
  --workpath $BuildWork `
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

$BuiltExe = Join-Path $BuildDist "Syncodex.exe"
if (-not (Test-Path -LiteralPath $BuiltExe)) {
  throw "Build finished but executable was not found: $BuiltExe"
}

Copy-Item -LiteralPath $BuiltExe -Destination $Exe -Force
Copy-Item -LiteralPath $Exe -Destination $LegacyExe -Force

Write-Host "Built: $Exe"
Write-Host "Build source: $BuiltExe"
Write-Host "Updated legacy compatibility entry: $LegacyExe"
