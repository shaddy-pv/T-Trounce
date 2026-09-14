"""
Tarang — FastWhisper Transcription Sidecar
==========================================
Runs as a separate lightweight HTTP server alongside the TanStack Start app.
Accepts audio chunks from the Node server, transcribes them locally using
faster-whisper, and returns the text.

Usage:
    python whisper_sidecar.py

Env vars (optional):
    WHISPER_MODEL   — model size: tiny | base | small  (default: base)
    WHISPER_DEVICE  — compute device: cpu | cuda       (default: cpu)
    WHISPER_PORT    — port to listen on                (default: 8765)
    WHISPER_LANG    — language hint                    (default: en)

Requirements:
    pip install -r requirements.txt
"""

import base64
import io
import json
import logging
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

logging.basicConfig(
    level=logging.INFO,
    format="[WhisperSidecar] %(asctime)s %(levelname)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("whisper_sidecar")

# ──────────────────────────────────────────────
# Config from environment
# ──────────────────────────────────────────────
MODEL_SIZE = os.environ.get("WHISPER_MODEL", "base")
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
HOST = os.environ.get("WHISPER_HOST", "0.0.0.0")
PORT = int(os.environ.get("WHISPER_PORT", "8765"))
LANG = os.environ.get("WHISPER_LANG", "en")

# ──────────────────────────────────────────────
# Load model once at startup (downloaded to ~/.cache/huggingface on first run)
# ──────────────────────────────────────────────
try:
    from faster_whisper import WhisperModel  # type: ignore

    log.info(f"Loading faster-whisper model: '{MODEL_SIZE}' on {DEVICE} ...")
    _model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type="int8")
    log.info(f"Model '{MODEL_SIZE}' loaded and ready.")
except ImportError:
    log.error(
        "faster-whisper is not installed. Run:  pip install -r requirements.txt"
    )
    sys.exit(1)
except Exception as exc:
    log.error(f"Failed to load Whisper model: {exc}")
    sys.exit(1)

_model_lock = threading.Lock()


# ──────────────────────────────────────────────
# Transcription helper
# ──────────────────────────────────────────────
def transcribe_audio_bytes(audio_bytes: bytes, mime: str = "audio/wav") -> dict:
    """
    Write audio bytes to a temp file, run faster-whisper, return transcript dict.
    Returns: { text: str, confidence: float, language: str }
    """
    # Determine file extension from mime type
    ext_map = {
        "audio/wav": ".wav",
        "audio/wave": ".wav",
        "audio/webm": ".webm",
        "audio/mp4": ".mp4",
        "audio/ogg": ".ogg",
        "audio/mpeg": ".mp3",
    }
    # Strip codec suffix: "audio/webm;codecs=opus" → "audio/webm"
    clean_mime = mime.split(";")[0].strip().lower()
    ext = ext_map.get(clean_mime, ".wav")

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        with _model_lock:
            segments, info = _model.transcribe(
                tmp_path,
                language=LANG,
                beam_size=5,
                vad_filter=True,          # skip silent parts automatically
                vad_parameters=dict(
                    min_silence_duration_ms=300,
                    speech_pad_ms=100,
                ),
                word_timestamps=False,
                condition_on_previous_text=False,  # each chunk is independent
            )

        texts = []
        avg_logprob_sum = 0.0
        seg_count = 0

        for seg in segments:
            text = seg.text.strip()
            if text:
                texts.append(text)
                avg_logprob_sum += seg.avg_logprob
                seg_count += 1

        full_text = " ".join(texts).strip()

        # Convert avg log-prob to a 0-1 confidence score
        # avg_logprob is typically in [-2.0, 0.0]; 0 = perfect
        if seg_count > 0:
            avg_logprob = avg_logprob_sum / seg_count
            confidence = round(min(1.0, max(0.0, 1.0 + avg_logprob / 2.0)), 3)
        else:
            confidence = 0.0

        return {
            "text": full_text,
            "confidence": confidence,
            "language": info.language if info else LANG,
        }

    except Exception as exc:
        log.warning(f"Transcription error: {exc}")
        return {"text": "", "confidence": 0.0, "language": LANG}
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ──────────────────────────────────────────────
# HTTP Request Handler
# ──────────────────────────────────────────────
class WhisperHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # silence default access log spam
        pass

    def _send_json(self, data: dict, status: int = 200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._send_json({"status": "ok", "model": MODEL_SIZE, "device": DEVICE})
        else:
            self._send_json({"error": "Not found"}, 404)

    def do_POST(self):
        if self.path != "/transcribe":
            self._send_json({"error": "Not found"}, 404)
            return

        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            self._send_json({"error": "Empty body"}, 400)
            return

        try:
            raw = self.rfile.read(content_length)
            body = json.loads(raw.decode("utf-8"))
        except Exception:
            self._send_json({"error": "Invalid JSON body"}, 400)
            return

        audio_b64 = body.get("audio_b64", "")
        mime = body.get("mime", "audio/wav")

        if not audio_b64:
            self._send_json({"text": "", "confidence": 0.0}, 200)
            return

        try:
            # Strip data-URI prefix if present: "data:audio/wav;base64,..."
            if "," in audio_b64:
                audio_b64 = audio_b64.split(",", 1)[1]
            audio_bytes = base64.b64decode(audio_b64)
        except Exception:
            self._send_json({"error": "Invalid base64 audio"}, 400)
            return

        # Minimum size guard — skip very short/silent clips
        if len(audio_bytes) < 1000:
            self._send_json({"text": "", "confidence": 0.0}, 200)
            return

        result = transcribe_audio_bytes(audio_bytes, mime)
        log.info(
            f'Chunk transcribed ({len(audio_bytes)//1024}KB): '
            f'"{result["text"][:60]}{"..." if len(result["text"]) > 60 else ""}" '
            f'[conf={result["confidence"]}]'
        )
        self._send_json(result)


# ──────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────
def main():
    server = ThreadingHTTPServer((HOST, PORT), WhisperHandler)
    log.info(f"Trounce WhisperSidecar listening on http://{HOST}:{PORT}")
    log.info(f"  Model : {MODEL_SIZE}  |  Device : {DEVICE}  |  Lang : {LANG}")
    log.info(f"  Health: http://{HOST}:{PORT}/health")
    log.info("  Concurrency: ThreadingHTTPServer enabled.")
    log.info("  Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Sidecar stopped.")


if __name__ == "__main__":
    main()
