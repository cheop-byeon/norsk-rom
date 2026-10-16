#!/usr/bin/env python3
"""Start the local Norsk Rom API and open its browser app."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

from setup_local import CONFIG, DEV_PYTHON, PYTHON, ollama_model_installed

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"


def get(url: str, timeout: float = 1.0):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return response.status, response.read()
    except (OSError, urllib.error.URLError):
        return None, b""


def is_norsk_rom(url: str) -> bool:
    status, body = get(url + "/health")
    if status != 200:
        return False
    try:
        data = json.loads(body)
        return data.get("status") == "ok" and data.get("version") == "0.2.0"
    except (ValueError, AttributeError):
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=int(os.environ.get("NORSK_PORT", "8000")))
    parser.add_argument("--no-browser", action="store_true", help="start the local server without opening a browser")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    if not CONFIG.exists():
        print("Norsk Rom is not set up yet. Run: python3.12 setup_local.py --install", file=sys.stderr)
        return 2
    try:
        config = json.loads(CONFIG.read_text())
    except (OSError, json.JSONDecodeError):
        print("Could not read the private local configuration. Check backend/norsk-rom-local-config.json.", file=sys.stderr)
        return 2
    if not config.get("api_keys"):
        print("The private local configuration has no API key. Run: python3.12 setup_local.py --install", file=sys.stderr)
        return 2

    python = PYTHON if PYTHON.exists() else (DEV_PYTHON if DEV_PYTHON.exists() else Path(sys.executable))
    if python == PYTHON and not python.exists():
        print("Python environment missing. Run: python3.12 setup_local.py --install", file=sys.stderr)
        return 2
    try:
        subprocess.run([str(python), "-c", "import fastapi, uvicorn"], cwd=BACKEND, check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except (subprocess.CalledProcessError, OSError):
        print("Backend dependencies are missing. Run: python3.12 setup_local.py --install", file=sys.stderr)
        return 2

    url = f"http://127.0.0.1:{args.port}"
    if is_norsk_rom(url):
        print(f"Norsk Rom is already running at {url}/app/")
        if not args.no_browser:
            webbrowser.open(url + "/app/")
        return 0
    # If something else owns the requested port, don't launch another service on a fallback port.
    try:
        import socket
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", args.port))
    except PermissionError:
        print("The OS denied local network access to this launcher, so it cannot check or bind the app port. Run it from a local Terminal with network access enabled.", file=sys.stderr)
        return 2
    except OSError:
        print(f"Port {args.port} is already in use, and it did not answer as Norsk Rom. Set NORSK_PORT to another port.", file=sys.stderr)
        return 2

    ollama_child = None
    daemon, model = ollama_model_installed() if shutil.which("ollama") else (False, False)
    if shutil.which("ollama") and not daemon:
        print("Starting the local Ollama service…")
        ollama_child = subprocess.Popen(["ollama", "serve"], cwd=ROOT,
                                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(30):
            time.sleep(0.5)
            daemon, model = ollama_model_installed()
            if daemon:
                break
    if not daemon:
        print("Ollama is not running; local role-play and lesson generation will be unavailable until it is started.")
    elif not model:
        print("Borealis Open 4B is not installed. Install it with: python3.12 setup_local.py --pull-conversation-model")

    asr_path = Path(config.get("asr_path", "")) if config.get("asr_path") else None
    tts_path = Path(config.get("tts_path", "")) if config.get("tts_path") else None
    if not asr_path or not any((asr_path / name).exists() for name in ("model.safetensors", "model.safetensors.index.json")):
        print("NB-Whisper Large is not configured; speech recognition will be unavailable.")
    if not tts_path or not tts_path.exists():
        print("Piper voice files are not configured; local Piper speech will be unavailable.")

    command = [str(python), "-m", "uvicorn", "norsk_api.main:create_app", "--factory",
               "--host", "127.0.0.1", "--port", str(args.port)]
    print(f"Starting Norsk Rom locally at {url}/app/ (Ctrl-C to stop).")
    if not args.no_browser:
        # Wait for the API process to become ready before showing the page.
        def open_when_ready():
            for _ in range(60):
                if is_norsk_rom(url):
                    webbrowser.open(url + "/app/")
                    return
                time.sleep(0.5)
            print(f"Server is taking longer than expected. Open {url}/app/ manually.")
        import threading
        threading.Thread(target=open_when_ready, daemon=True).start()

    server = subprocess.Popen(command, cwd=BACKEND)
    try:
        return server.wait()
    except KeyboardInterrupt:
        print("\nStopping Norsk Rom…")
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
        return 0
    finally:
        if ollama_child is not None and ollama_child.poll() is None:
            ollama_child.terminate()
            try:
                ollama_child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                ollama_child.kill()


if __name__ == "__main__":
    raise SystemExit(main())
