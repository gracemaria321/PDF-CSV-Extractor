@echo off
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Python virtual environment not found.
    echo Please create it using:
    echo py -3.15 -m venv .venv
    pause
    exit /b 1
)

echo Starting PDF Converter with Python 3.15...
".venv\Scripts\python.exe" app.py > crash_log.txt 2>&1

echo.
echo === Process exited ===
echo Check crash_log.txt for output.
pause