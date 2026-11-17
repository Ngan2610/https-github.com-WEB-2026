"""Private STT service: local upload paths only, serialized CPU inference, no shell."""
import hmac
import json
import math
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOCK = threading.Lock()
MODEL = None
LANGUAGES = {"vi", "en", "zh"}

class InputError(Exception):
    def __init__(self, code, status=400):
        self.code, self.status = code, status


def input_path(raw, root=None):
    if not isinstance(raw, str) or not raw:
        raise InputError("invalid_video")
    root = Path(root or os.getenv("UPLOAD_DIR", "/app/server/uploads")).resolve()
    try:
        path = Path(raw).resolve(strict=True)
    except (OSError, ValueError):
        raise InputError("invalid_video", 404)
    if root not in path.parents or not path.is_file():
        raise InputError("video_path_forbidden", 403)
    if path.stat().st_size > 150 * 1024 * 1024:
        raise InputError("video_too_large", 413)
    return path


def recognize(path, language, model=None):
    global MODEL
    if language not in LANGUAGES | {"auto"}:
        raise InputError("unsupported_language", 422)
    if model is None:
        if MODEL is None:
            from faster_whisper import WhisperModel
            MODEL = WhisperModel(os.getenv("WHISPER_MODEL", "small"), device="cpu", compute_type="int8",
                                 cpu_threads=int(os.getenv("WHISPER_CPU_THREADS", "2")))
        model = MODEL
    # Probe before decode to reject oversized timelines instead of silently truncating.
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                            "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
                           capture_output=True, text=True, timeout=20, check=True)
    seconds = float(probe.stdout.strip())
    if not math.isfinite(seconds) or seconds <= 0 or seconds > 600:
        raise InputError("invalid_video", 422)
    with tempfile.TemporaryDirectory(prefix="dubchef-stt-") as folder:
        audio = str(Path(folder) / "speech.wav")
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(path),
                        "-vn", "-ac", "1", "-ar", "16000", audio],
                       capture_output=True, timeout=120, check=True)
        # Pass normalized PCM samples directly; avoids PyAV file-decoder API differences.
        import numpy as np
        with wave.open(audio, "rb") as source:
            samples = np.frombuffer(source.readframes(source.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
        segments, info = model.transcribe(samples, language=None if language == "auto" else language,
                                         beam_size=5, vad_filter=True)
        if info.language not in LANGUAGES:
            raise InputError("unsupported_language", 422)
        rows = []
        last_end = 0.0
        for seg in segments:
            text = seg.text.strip()
            start, end = max(last_end, float(seg.start)), float(seg.end)
            if text and end > start:
                if end > 600 or len(text) > 1500 or len(rows) >= 100:
                    raise InputError("transcript_too_large", 413)
                rows.append({"text": text, "start": start, "end": end})
                last_end = end
        if not rows:
            raise InputError("no_speech", 422)
        if sum(len(r["text"]) for r in rows) > 12000:
            raise InputError("transcript_too_large", 413)
        return {"language": info.language, "probability": info.language_probability, "segments": rows}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # Never log private upload paths or transcript text.

    def send_json(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"ok": True, "service": "transcription", "modelLoaded": MODEL is not None})
        else:
            self.send_json(404, {"code": "not_found"})

    def do_POST(self):
        token = os.getenv("TRANSCRIPTION_INTERNAL_TOKEN", "")
        if not hmac.compare_digest(token, self.headers.get("X-Internal-Token", "")):
            return self.send_json(401, {"code": "auth"})
        if self.path != "/transcribe":
            return self.send_json(404, {"code": "not_found"})
        if self.headers.get_content_type() != "application/json":
            return self.send_json(415, {"code": "invalid_content_type"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 8192:
                raise InputError("invalid", 413)
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise InputError("invalid")
            path = input_path(body.get("sourceVideoPath"))
            language = body.get("language", "auto")
            if not isinstance(language, str) or language not in LANGUAGES | {"auto"}:
                raise InputError("unsupported_language", 422)
            if not LOCK.acquire(blocking=False):
                raise InputError("transcription_busy", 429)
            try:
                result = recognize(path, language)
            finally:
                LOCK.release()
            self.send_json(200, result)
        except InputError as err:
            self.send_json(err.status, {"code": err.code})
        except (ValueError, TypeError):
            self.send_json(400, {"code": "invalid"})
        except Exception:
            self.send_json(503, {"code": "transcription_failed"})

if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.getenv("PORT", "4300"))), Handler).serve_forever()
