#!/usr/bin/env bash
# Tarang — FastWhisper Sidecar Launcher (Linux/macOS)
# ====================================================
# Run from the project root:  bash start_whisper.sh

set -e

echo ""
echo " Tarang FastWhisper Sidecar"
echo " =========================="
echo ""

# Check Python
if ! command -v python3 &>/dev/null; then
  echo "[ERROR] python3 is not installed."
  echo "        Install it via your package manager, e.g.:"
  echo "        Ubuntu/Debian: sudo apt install python3 python3-pip"
  echo "        macOS:         brew install python"
  exit 1
fi

echo "[1/2] Installing Python dependencies..."
pip3 install -r requirements.txt

echo ""
echo "[2/2] Starting FastWhisper sidecar on http://localhost:8765 ..."
echo "      The first run downloads the Whisper model (~74MB). Please wait."
echo "      Press Ctrl+C to stop."
echo ""

# Optional: export WHISPER_MODEL=base
python3 whisper_sidecar.py
