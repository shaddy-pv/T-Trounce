@echo off
:: Tarang — FastWhisper Sidecar Launcher (Windows)
:: ================================================
:: Double-click this file or run from the project root.
:: It installs Python dependencies and starts the sidecar.

echo.
echo  Tarang FastWhisper Sidecar
echo  ==========================
echo.

:: Check Python
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo         Download it from https://python.org/downloads
    echo         Make sure to check "Add Python to PATH" during install.
    pause
    exit /b 1
)

echo [1/2] Installing Python dependencies...
pip install -r requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)

echo.
echo [2/2] Starting FastWhisper sidecar on http://localhost:8765 ...
echo        The first run will download the Whisper model (~74MB). Please wait.
echo        Press Ctrl+C to stop.
echo.

:: Optional: set model size (tiny / base / small)
:: set WHISPER_MODEL=base

python whisper_sidecar.py

pause
