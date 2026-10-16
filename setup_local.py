#!/usr/bin/env python3
"""Prepare and inspect a local Norsk Rom installation.

No downloads happen unless explicitly requested with --install, --download-speech,
or --pull-conversation-model.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
VENV = BACKEND / ".venv"
PYTHON = VENV / "bin" / "python"
if os.name == "nt":
    PYTHON = VENV / "Scripts" / "python.exe"
DEV_PYTHON = BACKEND / "../../../work/live-venv/bin/python"
CONFIG = BACKEND / "norsk-rom-local-config.json"
MODELS = BACKEND / ".data" / "models"
OLLAMA_MODEL = "hf.co/NbAiLab/borealis-open-4b-gguf"


def run(command: list[str], *, cwd: Path = BACKEND) -> None:
    subprocess.run(command, cwd=cwd, check=True)


def human_size(size: int) -> str:
    value = float(size)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if value < 1024 or unit == "TB":
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} TB"


def folder_size(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file()) if path.exists() else 0


def ollama_model_installed() -> tuple[bool, bool]:
    """Return (daemon_reachable, target_model_installed)."""
    try:
        with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=1.5) as response:
            tags = json.load(response).get("models", [])
        names = {item.get("name", "") for item in tags}
        short = OLLAMA_MODEL.removeprefix("hf.co/")
        installed = any(name == OLLAMA_MODEL or name.startswith(short) for name in names)
        return True, installed
    except (OSError, ValueError, urllib.error.URLError):
        return False, False


def report() -> int:
    print("Norsk Rom local setup check")
    print(f"Project: {ROOT}")
    py_ok = sys.version_info >= (3, 11)
    print(f"Python {sys.version.split()[0]}: {'OK' if py_ok else 'need 3.11 or newer'}")
    if CONFIG.exists():
        try:
            config = json.loads(CONFIG.read_text())
            key_ok = bool(config.get("api_keys"))
            print(f"Private local config: {'OK' if key_ok else 'needs a development key'}")
        except (OSError, json.JSONDecodeError):
            print("Private local config: unreadable; rerun setup after preserving a copy")
    else:
        print("Private local config: missing")
    print(f"Project Python environment: {'OK' if PYTHON.exists() else 'not installed'}")
    if not PYTHON.exists() and DEV_PYTHON.exists():
        print("Existing development Python environment: available on this checkout (not included in source archives)")
    weights = MODELS / "nb-whisper-large"
    asr_ok = any((weights / name).exists() for name in ("model.safetensors", "model.safetensors.index.json"))
    piper = MODELS / "no_NO-talesyntese-medium.onnx"
    print(f"NB-Whisper Large: {'OK' if asr_ok else 'not downloaded'}" + (f" ({human_size(folder_size(weights))})" if asr_ok else ""))
    print(f"Piper Bokmål voice: {'OK' if piper.exists() else 'not downloaded'}" + (f" ({human_size(piper.stat().st_size)})" if piper.exists() else ""))
    ollama = shutil.which("ollama")
    daemon, model = ollama_model_installed() if ollama else (False, False)
    print(f"Ollama command: {'OK' if ollama else 'not installed'}")
    print(f"Ollama service: {'running' if daemon else 'not running'}")
    print(f"Borealis Open 4B: {'installed' if model else 'not installed / service unavailable'}")
    try:
        free = shutil.disk_usage(ROOT).free
        print(f"Free disk space: {human_size(free)} (allow at least 12 GB before downloading all models)")
    except OSError:
        pass
    if not PYTHON.exists() or not CONFIG.exists():
        print("\nFirst setup: python3.12 setup_local.py --install (Python 3.12 is recommended)")
    if not (asr_ok and piper.exists()):
        print("Download NB-Whisper and Piper after setup: python3 setup_local.py --download-speech")
    if not model:
        print("Install Ollama, start its local service, then run: python3 setup_local.py --pull-conversation-model")
    if py_ok and PYTHON.exists() and CONFIG.exists():
        if asr_ok and piper.exists() and model:
            print("\nLocal inference prerequisites are ready. Start Norsk Rom with: python3 start_local.py")
        else:
            print("\nBasic setup is ready; install any missing optional model components before using that feature.")
        return 0
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--install", action="store_true", help="create venv, install local inference dependencies, and create a private local key")
    parser.add_argument("--download-speech", action="store_true", help="download NB-Whisper Large and Piper voice files from Hugging Face")
    parser.add_argument("--pull-conversation-model", action="store_true", help="download Borealis Open 4B into the local Ollama installation")
    args = parser.parse_args()

    if sys.version_info < (3, 11):
        print("Python 3.11 or newer is required. Install Python, then rerun this command.", file=sys.stderr)
        return 2
    if args.install:
        VENV.mkdir(parents=True, exist_ok=True)
        if not PYTHON.exists():
            run([sys.executable, "-m", "venv", str(VENV)], cwd=ROOT)
        run([str(PYTHON), "-m", "pip", "install", "--upgrade", "pip"])
        run([str(PYTHON), "-m", "pip", "install", "-e", ".[live]"])
        if not CONFIG.exists():
            run([str(PYTHON), "init_dev.py"])
    if args.download_speech:
        if not PYTHON.exists():
            print("Run python3.12 setup_local.py --install first (Python 3.12 is recommended).", file=sys.stderr)
            return 2
        if not CONFIG.exists():
            run([str(PYTHON), "init_dev.py"])
        run([str(PYTHON), "setup_local_models.py"])
    if args.pull_conversation_model:
        if not shutil.which("ollama"):
            print("Ollama is not installed. Install it from https://ollama.com/download, start it, and retry.", file=sys.stderr)
            return 2
        run(["ollama", "pull", OLLAMA_MODEL], cwd=ROOT)
    return report()


if __name__ == "__main__":
    raise SystemExit(main())
