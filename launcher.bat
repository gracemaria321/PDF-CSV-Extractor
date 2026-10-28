@echo off
cd /d "%~dp0"
echo Starting Extractor.exe and capturing all errors...
app.exe >error_log.txt 2>&1
echo.
echo ==============================================
echo Process has stopped or crashed.
echo Check error_log.txt for details.
echo ==============================================
pause
