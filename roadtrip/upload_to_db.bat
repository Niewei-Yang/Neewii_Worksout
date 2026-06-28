@echo off
setlocal

set "ROADTRIP_DIR=%~dp0"
set "PROJECT_ROOT=%ROADTRIP_DIR%.."
set "IMPORTER=%PROJECT_ROOT%\run_page\roadtrip_sync.py"
set "REQUIREMENTS=%PROJECT_ROOT%\requirements.txt"
set "PYTHON_CMD="

cd /d "%PROJECT_ROOT%" || (
  echo Failed to enter project root: "%PROJECT_ROOT%"
  goto :fail
)

if not exist "%IMPORTER%" (
  echo Cannot find importer: "%IMPORTER%"
  goto :fail
)

where py >nul 2>nul
if %ERRORLEVEL% equ 0 (
  set "PYTHON_CMD=py -3"
)

if not defined PYTHON_CMD (
  where python >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON_CMD=python"
  )
)

if not defined PYTHON_CMD (
  echo Python was not found. Please install Python or add it to PATH.
  goto :fail
)

%PYTHON_CMD% -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)" >nul 2>nul
if errorlevel 1 (
  echo Python 3.12 or newer is required.
  %PYTHON_CMD% --version
  goto :fail
)

if exist "%REQUIREMENTS%" (
  %PYTHON_CMD% -c "import httpx, gpxpy, stravalib, appdirs, svgwrite, colour, s2sphere, arrow, geopy, polyline, sqlalchemy, timezonefinder, yaml, aiofiles, cloudscraper, tcxreader, rich, lxml, eviltransform, stravaweblib, tenacity, numpy, tzlocal, garmin_fit_sdk, haversine, garth, Crypto, duckdb, openai, certifi" >nul 2>nul
  if errorlevel 1 (
    echo Installing missing Python dependencies with %PYTHON_CMD%...
    %PYTHON_CMD% -m pip install -r "%REQUIREMENTS%"
    if errorlevel 1 goto :fail
  )
)

%PYTHON_CMD% "%IMPORTER%" --folder "%ROADTRIP_DIR%." %*
if errorlevel 1 goto :fail
exit /b 0

:fail
echo.
echo Upload failed. Press any key to close this window.
pause >nul
exit /b 1
