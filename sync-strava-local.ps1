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

function Get-EnvOrDefault {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Name,
        [Parameter(Mandatory = $true)]
        [string] $Default
    )

    $value = [Environment]::GetEnvironmentVariable($Name, "Process")
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $Default
    }
    return $value
}

$title = Get-EnvOrDefault -Name "TITLE" -Default "Workouts"
$titleGrid = Get-EnvOrDefault -Name "TITLE_GRID" -Default "Over 10km Workouts"
$athlete = Get-EnvOrDefault -Name "ATHLETE" -Default "Neewii"
$minGridDistance = Get-EnvOrDefault -Name "MIN_GRID_DISTANCE" -Default "10"
$birthdayMonth = Get-EnvOrDefault -Name "BIRTHDAY_MONTH" -Default "2000-06"
$currentYear = Get-Date -Format "yyyy"

function Invoke-CheckedPython {
    python @args
    if ($LASTEXITCODE -ne 0) {
        throw "Python command failed with exit code $LASTEXITCODE`: python $($args -join ' ')"
    }
}

Invoke-CheckedPython "$PSScriptRoot\run_page\strava_sync.py" `
    $env:STRAVA_CLIENT_ID `
    $env:STRAVA_CLIENT_SECRET `
    $env:STRAVA_CLIENT_REFRESH_TOKEN `
    @SyncArgs

Invoke-CheckedPython "$PSScriptRoot\run_page\gen_svg.py" `
    --from-db `
    --title "$title" `
    --type github `
    --github-style align-firstday `
    --athlete "$athlete" `
    --special-distance 10 `
    --special-distance2 20 `
    --special-color yellow `
    --special-color2 red `
    --output "$PSScriptRoot\assets\github.svg" `
    --use-localtime `
    --min-distance 0.1

Invoke-CheckedPython "$PSScriptRoot\run_page\gen_svg.py" `
    --from-db `
    --title "$titleGrid" `
    --type grid `
    --athlete "$athlete" `
    --output "$PSScriptRoot\assets\grid.svg" `
    --special-color yellow `
    --special-color2 red `
    --special-distance 20 `
    --special-distance2 40 `
    --use-localtime `
    --min-distance "$minGridDistance"

Invoke-CheckedPython "$PSScriptRoot\run_page\gen_svg.py" `
    --from-db `
    --type circular `
    --use-localtime

Invoke-CheckedPython "$PSScriptRoot\run_page\gen_svg.py" `
    --from-db `
    --year "$currentYear" `
    --language zh_CN `
    --title "$currentYear Workouts" `
    --type github `
    --github-style align-firstday `
    --athlete "$athlete" `
    --special-distance 10 `
    --special-distance2 20 `
    --special-color yellow `
    --special-color2 red `
    --output "$PSScriptRoot\assets\github_$currentYear.svg" `
    --use-localtime `
    --min-distance 0.1

Invoke-CheckedPython "$PSScriptRoot\run_page\gen_svg.py" `
    --from-db `
    --type monthoflife `
    --birth "$birthdayMonth" `
    --special-color "#f9d367" `
    --special-color2 "#f0a1a8" `
    --output "$PSScriptRoot\assets\mol.svg" `
    --use-localtime `
    --athlete "$athlete" `
    --title "Month of Life" `
    --sport-type all
