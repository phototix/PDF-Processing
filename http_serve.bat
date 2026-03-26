@echo off
setlocal

set "PORT=8080"
set "URL=https://localhost:%PORT%"
set "KIOSK_URL=%URL%?kiosk=1"
set "PID_FILE=%~dp0logs\kiosk.pid"

echo Starting PDF Processing HTTPS Server on %URL%
start "PDF Processing Server" /b "C:\node\node.exe" "server.js"

REM Wait for server to start listening, then open browser
set "MAX_RETRIES=30"
set "RETRY_DELAY=1"

for /L %%i in (1,1,%MAX_RETRIES%) do (
	powershell -NoProfile -Command "if (Test-NetConnection -ComputerName 'localhost' -Port %PORT% -InformationLevel Quiet) { exit 0 } else { exit 1 }" >nul 2>&1
	if not errorlevel 1 (
		echo Server is up. Launching kiosk...
		goto :launch
	)
	timeout /t %RETRY_DELAY% /nobreak >nul
)

echo Server did not start within %MAX_RETRIES% seconds. Open %URL% manually if needed.
goto :end

:launch
set "EDGE_EXE="
set "CHROME_EXE="

where msedge >nul 2>&1 && set "EDGE_EXE=msedge"
where chrome >nul 2>&1 && set "CHROME_EXE=chrome"

if not defined EDGE_EXE if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE_EXE if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE_EXE if exist "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"

if not defined CHROME_EXE if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if defined EDGE_EXE (
	if exist "%PID_FILE%" del /f /q "%PID_FILE%"
	powershell -NoProfile -Command "$p = Start-Process -FilePath '%EDGE_EXE%' -ArgumentList '--kiosk','%KIOSK_URL%','--edge-kiosk-type=fullscreen','--no-first-run','--disable-pinch' -PassThru; Set-Content -Path '%PID_FILE%' -Value $p.Id; $p.WaitForExit()"
) else if defined CHROME_EXE (
	if exist "%PID_FILE%" del /f /q "%PID_FILE%"
	powershell -NoProfile -Command "$p = Start-Process -FilePath '%CHROME_EXE%' -ArgumentList '--kiosk','%KIOSK_URL%','--no-first-run','--disable-pinch' -PassThru; Set-Content -Path '%PID_FILE%' -Value $p.Id; $p.WaitForExit()"
) else (
	echo Could not find Edge or Chrome. Opening default browser instead...
	start "" "%KIOSK_URL%"
	goto :end
)

echo Kiosk closed. Exiting...

:end
endlocal
exit /b