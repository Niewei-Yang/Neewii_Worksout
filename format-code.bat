@echo off
setlocal

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0format-code.ps1"

echo.
echo Press any key to close this window...
pause >nul
