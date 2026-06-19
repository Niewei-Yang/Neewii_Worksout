$ErrorActionPreference = "Continue"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot

$failed = $false

function Add-PathIfExists {
    param([Parameter(Mandatory = $true)][string]$Path)
    if ((Test-Path -LiteralPath $Path) -and (($env:Path -split ';') -notcontains $Path)) {
        $env:Path = "$Path;$env:Path"
    }
}

function Test-Command {
    param([Parameter(Mandatory = $true)][string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][scriptblock]$Command,
        [Parameter(Mandatory = $true)][string]$FailureMessage
    )

    $global:LASTEXITCODE = 0
    & $Command 2>&1 | ForEach-Object { Write-Host $_ }
    $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
    if ($exitCode -ne 0) {
        Write-Host "$FailureMessage Exit code: $exitCode." -ForegroundColor Red
        return $false
    }
    return $true
}

function Get-PythonCommand {
    if (Test-Command "python") {
        return "python"
    }
    if (Test-Command "py") {
        return "py"
    }
    return $null
}

$codexRuntimeRoot = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies"
Add-PathIfExists (Join-Path $codexRuntimeRoot "node\bin")
Add-PathIfExists (Join-Path $codexRuntimeRoot "bin")

$pnpmArgsPrefix = @()
if (Test-Command "pnpm") {
    try {
        $packageJson = Get-Content -Raw -LiteralPath (Join-Path $projectRoot "package.json") | ConvertFrom-Json
        if ($packageJson.packageManager -match "^pnpm@([^+]+)") {
            $expectedPnpmVersion = $Matches[1]
            $actualPnpmVersion = (& pnpm --version).Trim()
            if ($actualPnpmVersion -ne $expectedPnpmVersion) {
                Write-Host "Using pnpm $expectedPnpmVersion from package.json instead of PATH pnpm $actualPnpmVersion."
                $pnpmArgsPrefix = @("dlx", "pnpm@$expectedPnpmVersion")
            }
        }
    } catch {
        Write-Host "Could not read pnpm version from package.json. Using PATH pnpm." -ForegroundColor Yellow
    }
}

function Invoke-Pnpm {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    & pnpm @pnpmArgsPrefix @Arguments
}

Write-Host "Project root: $projectRoot"
Write-Host ""

Write-Host "Running Prettier auto-format..."
if (Test-Command "pnpm") {
    $prettierReady = Invoke-Step { Invoke-Pnpm install --frozen-lockfile } "pnpm install failed."
    if ($prettierReady) {
        $prettierReady = Invoke-Step { Invoke-Pnpm run format } "Prettier failed."
    }
    if (-not $prettierReady) { $failed = $true }
} elseif (Test-Command "npx") {
    if (-not (Invoke-Step { npx prettier . --write } "Prettier failed.")) { $failed = $true }
} else {
    Write-Host "Prettier skipped: neither pnpm nor npx was found in PATH." -ForegroundColor Red
    Write-Host "Install Node.js 20+ from https://nodejs.org/, then run this script again." -ForegroundColor Yellow
    $failed = $true
}

Write-Host ""
Write-Host "Running Black auto-format..."
$pythonCommand = Get-PythonCommand
if ($null -ne $pythonCommand) {
    $global:LASTEXITCODE = 0
    & $pythonCommand -m black --version *> $null
    $blackReady = $true
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Black was not found. Installing Python dev requirements..."
        $blackReady = Invoke-Step { & $pythonCommand -m pip install -r requirements-dev.txt } "Failed to install Python dev requirements."
    }

    if ($blackReady) {
        $blackReady = Invoke-Step { & $pythonCommand -m black . } "Black failed."
    }
    if (-not $blackReady) { $failed = $true }
} else {
    Write-Host "Black skipped: neither python nor py was found in PATH." -ForegroundColor Red
    Write-Host "Install Python 3.12+ and run: python -m pip install -r requirements-dev.txt" -ForegroundColor Yellow
    $failed = $true
}

Write-Host ""
if ($failed) {
    Write-Host "Formatting finished with errors. See messages above." -ForegroundColor Red
    exit 1
}

Write-Host "Formatting completed successfully." -ForegroundColor Green
