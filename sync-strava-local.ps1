param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $SyncArgs
)

$ErrorActionPreference = "Stop"

$envPath = Join-Path $PSScriptRoot ".env"

if (-not (Test-Path -LiteralPath $envPath)) {
    throw "Missing .env file at $envPath"
}

Get-Content -LiteralPath $envPath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
        return
    }

    if ($line -match "^\s*([^=]+?)\s*=\s*(.*)\s*$") {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

$requiredVars = @(
    "STRAVA_CLIENT_ID",
    "STRAVA_CLIENT_SECRET",
    "STRAVA_CLIENT_REFRESH_TOKEN"
)

$missingVars = $requiredVars | Where-Object {
    [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_, "Process"))
}

if ($missingVars.Count -gt 0) {
    throw "Please fill these values in .env first: $($missingVars -join ', ')"
}

python "$PSScriptRoot\run_page\strava_sync.py" `
    $env:STRAVA_CLIENT_ID `
    $env:STRAVA_CLIENT_SECRET `
    $env:STRAVA_CLIENT_REFRESH_TOKEN `
    @SyncArgs
