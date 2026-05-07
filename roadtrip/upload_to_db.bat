@echo off
setlocal

set "ROADTRIP_DIR=%~dp0"
set "PROJECT_ROOT=%ROADTRIP_DIR%.."
set "IMPORTER=%PROJECT_ROOT%\run_page\roadtrip_sync.py"

cd /d "%PROJECT_ROOT%" || (
  echo Failed to enter project root: "%PROJECT_ROOT%"
  exit /b 1
)

if not exist "%IMPORTER%" (
  echo Cannot find importer: "%IMPORTER%"
  exit /b 1
)

where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
  python "%IMPORTER%" --folder "%ROADTRIP_DIR%." %*
  exit /b %ERRORLEVEL%
)

where py >nul 2>nul
if %ERRORLEVEL% equ 0 (
  py -3 "%IMPORTER%" --folder "%ROADTRIP_DIR%." %*
  exit /b %ERRORLEVEL%
)

echo Python was not found. Please install Python or add it to PATH.
exit /b 1
