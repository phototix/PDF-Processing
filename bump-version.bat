@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bump-version.ps1"
if errorlevel 1 exit /b 1

endlocal
