@echo off
setlocal

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$files = Get-ChildItem -LiteralPath (Get-Location) -Filter 'Variflight_*.json' -File;" ^
  "if (-not $files) { Write-Host 'No Variflight_*.json files found.'; exit 0 }" ^
  "foreach ($file in $files) {" ^
  "  try {" ^
  "    $points = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json;" ^
  "    if (-not $points) { Write-Warning ('Skipped empty file: ' + $file.Name); continue }" ^
  "    $trackName = [System.IO.Path]::GetFileNameWithoutExtension($file.Name);" ^
  "    $outFile = [System.IO.Path]::ChangeExtension($file.FullName, '.gpx');" ^
  "    $settings = New-Object System.Xml.XmlWriterSettings;" ^
  "    $settings.Indent = $true;" ^
  "    $settings.Encoding = New-Object System.Text.UTF8Encoding($false);" ^
  "    $writer = [System.Xml.XmlWriter]::Create($outFile, $settings);" ^
  "    $writer.WriteStartDocument();" ^
  "    $writer.WriteStartElement('gpx', 'http://www.topografix.com/GPX/1/1');" ^
  "    $writer.WriteAttributeString('version', '1.1');" ^
  "    $writer.WriteAttributeString('creator', 'Variflight JSON to GPX');" ^
  "    $writer.WriteAttributeString('xmlns', 'xsi', 'http://www.w3.org/2000/xmlns/', 'http://www.w3.org/2001/XMLSchema-instance');" ^
  "    $writer.WriteAttributeString('xmlns', 'gpxtpx', 'http://www.w3.org/2000/xmlns/', 'http://www.garmin.com/xmlschemas/TrackPointExtension/v1');" ^
  "    $writer.WriteAttributeString('xsi', 'schemaLocation', 'http://www.w3.org/2001/XMLSchema-instance', 'http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd');" ^
  "    $writer.WriteElementString('name', $trackName);" ^
  "    $writer.WriteStartElement('trk');" ^
  "    $writer.WriteElementString('name', $trackName);" ^
  "    $writer.WriteStartElement('trkseg');" ^
  "    foreach ($point in $points) {" ^
  "      if ($null -eq $point.latitude -or $null -eq $point.longitude) { continue }" ^
  "      $writer.WriteStartElement('trkpt');" ^
  "      $writer.WriteAttributeString('lat', ([double]$point.latitude).ToString('R', [Globalization.CultureInfo]::InvariantCulture));" ^
  "      $writer.WriteAttributeString('lon', ([double]$point.longitude).ToString('R', [Globalization.CultureInfo]::InvariantCulture));" ^
  "      if ($null -ne $point.height) { $writer.WriteElementString('ele', ([double]$point.height).ToString('R', [Globalization.CultureInfo]::InvariantCulture)) }" ^
  "      $utcText = $point.'UTC Time';" ^
  "      if ($utcText) {" ^
  "        $dt = [datetime]::SpecifyKind(([datetime]::ParseExact($utcText, 'yyyy-MM-dd HH:mm:ss', [Globalization.CultureInfo]::InvariantCulture)), [DateTimeKind]::Utc);" ^
  "        $writer.WriteElementString('time', $dt.ToString('yyyy-MM-ddTHH:mm:ssZ'));" ^
  "      }" ^
  "      if ($null -ne $point.speed -or $null -ne $point.angle) {" ^
  "        $writer.WriteStartElement('extensions');" ^
  "        if ($null -ne $point.speed) { $writer.WriteElementString('speed', ([double]$point.speed).ToString('R', [Globalization.CultureInfo]::InvariantCulture)) }" ^
  "        if ($null -ne $point.angle) { $writer.WriteElementString('course', ([double]$point.angle).ToString('R', [Globalization.CultureInfo]::InvariantCulture)) }" ^
  "        $writer.WriteEndElement();" ^
  "      }" ^
  "      $writer.WriteEndElement();" ^
  "    }" ^
  "    $writer.WriteEndElement();" ^
  "    $writer.WriteEndElement();" ^
  "    $writer.WriteEndElement();" ^
  "    $writer.WriteEndDocument();" ^
  "    $writer.Close();" ^
  "    Write-Host ('Converted: ' + $file.Name + ' -> ' + [System.IO.Path]::GetFileName($outFile));" ^
  "  } catch {" ^
  "    if ($writer) { $writer.Close() }" ^
  "    Write-Error ('Failed: ' + $file.Name + ' - ' + $_.Exception.Message);" ^
  "  }" ^
  "}"

if errorlevel 1 (
  echo.
  echo Conversion failed.
  pause
  exit /b 1
)

echo.
echo Done.
pause
