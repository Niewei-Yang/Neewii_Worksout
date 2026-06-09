$ErrorActionPreference = "Continue"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot

$failed = $false

function Test-Command {
    param([Parameter(Mandatory = $true)][string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

Write-Host "Project root: $projectRoot"
Write-Host ""

Write-Host "Running Prettier auto-format..."
if (Test-Command "pnpm") {
    pnpm exec prettier . --write
} elseif (Test-Command "npx") {
    npx prettier . --write
} else {
    Write-Host "Prettier skipped: neither pnpm nor npx was found in PATH." -ForegroundColor Red
    $failed = $true
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "Prettier failed with exit code $LASTEXITCODE." -ForegroundColor Red
    $failed = $true
}

Write-Host ""
Write-Host "Running Black auto-format..."
if (Test-Command "black") {
    black .
} else {
    Write-Host "Black skipped: black was not found in PATH." -ForegroundColor Red
    Write-Host "Install it with: pip install black" -ForegroundColor Yellow
    $failed = $true
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "Black failed with exit code $LASTEXITCODE." -ForegroundColor Red
    $failed = $true
}

Write-Host ""
if ($failed) {
    Write-Host "Formatting finished with errors. See messages above." -ForegroundColor Red
    exit 1
}

Write-Host "Formatting completed successfully." -ForegroundColor Green
