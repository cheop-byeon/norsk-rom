#!/usr/bin/env python3
"""Guide setup and inspect a local Norsk Rom installation.

The wizard installs Python dependencies after confirmation. Large model downloads
always require a separate confirmation. Use --check for a read-only status check.
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
FULL_MODELS_ESTIMATE = 12 * 1024**3


def run(command: list[str], *, cwd: Path = BACKEND) -> None:
    subprocess.run(command, cwd=cwd, check=True)


def prompt_yes_no(question: str, *, default: bool = False) -> bool:
    suffix = " [Y/n] " if default else " [y/N] "
    try:
        answer = input(question + suffix).strip().lower()
    except EOFError:
        return default
    if not answer:
        return default
    return answer in {"y", "yes"}


def install_environment() -> None:
    if not PYTHON.exists():
        VENV.mkdir(parents=True, exist_ok=True)
        run([sys.executable, "-m", "venv", str(VENV)], cwd=ROOT)
    run([str(PYTHON), "-m", "pip", "install", "--upgrade", "pip"])
    run([str(PYTHON), "-m", "pip", "install", "-e", ".[live]"])
    if not CONFIG.exists():
        run([str(PYTHON), "init_dev.py"])


def available_python() -> Path | None:
    if PYTHON.exists():
        return PYTHON
    if DEV_PYTHON.exists():
        return DEV_PYTHON
    return None


def ensure_ollama_service() -> tuple[subprocess.Popen | None, bool]:
    daemon, _ = ollama_model_installed()
    if daemon:
        return None, True
    command = shutil.which("ollama")
    if not command:
        return None, False
    try:
        child = subprocess.Popen([command, "serve"], cwd=ROOT,
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:
        return None, False
    for _ in range(30):
        try:
            child.wait(timeout=0.5)
            return child, False
        except subprocess.TimeoutExpired:
            daemon, _ = ollama_model_installed()
            if daemon:
                return child, True
    child.terminate()
    return child, False


def stop_child(child: subprocess.Popen | None) -> None:
    if child is None or child.poll() is not None:
        return
    child.terminate()
    try:
        child.wait(timeout=3)
    except subprocess.TimeoutExpired:
        child.kill()


def guided_setup() -> int:
    print("Norsk Rom guided local setup")
    print("Setup installs the local app dependencies. Model weights are large and are downloaded only after you choose them.")
    if sys.version_info < (3, 11):
        print("Install Python 3.12 (recommended) or 3.11+, then run this setup again.", file=sys.stderr)
        return 2

    current_python = available_python()
    if current_python:
        try:
            subprocess.run([str(current_python), "-c", "import fastapi, torch, piper"], cwd=BACKEND,
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            source = "project" if current_python == PYTHON else "existing development"
            print(f"Using the {source} Python environment.")
        except (subprocess.CalledProcessError, OSError):
            if prompt_yes_no("Repair/install the local Python environment?", default=True):
                install_environment()
                current_python = PYTHON
    else:
        if not prompt_yes_no("Install the local Python environment now? (requires internet)", default=True):
            print("Skipped dependency installation. You can restart with this setup command later.")
            return report()
        install_environment()
        current_python = PYTHON

    if not CONFIG.exists():
        if current_python is None:
            print("Python environment is unavailable; cannot create the private local key.", file=sys.stderr)
            return 2
        run([str(current_python), "init_dev.py"])

    free = shutil.disk_usage(ROOT).free
    print(f"Available disk space: {human_size(free)}. Plan for about 12 GB for the full model set; sizes vary by platform.")

    weights = MODELS / "nb-whisper-large"
    asr_ok = any((weights / name).exists() for name in ("model.safetensors", "model.safetensors.index.json"))
    piper = MODELS / "no_NO-talesyntese-medium.onnx"
    if asr_ok and piper.exists():
        print("Speech models are already installed.")
    elif prompt_yes_no("Download NB-Whisper Large and the Norwegian Piper voice from Hugging Face?", default=False):
        if current_python is None:
            print("Run the Python environment setup first, then rerun this wizard.", file=sys.stderr)
            return 2
        run([str(current_python), "setup_local_models.py"])
    else:
        print("Skipped speech model downloads.")

    ollama = shutil.which("ollama")
    child = None
    if not ollama:
        print("Ollama is not installed. Install it from https://ollama.com/download to enable local role-play and lesson generation.")
    else:
        child, daemon = ensure_ollama_service()
        if not daemon:
            print("Could not start the local Ollama service. Start Ollama, then rerun setup to install Borealis.")
        else:
            _, model = ollama_model_installed()
            if model:
                print("Borealis Open 4B is already installed in Ollama.")
            elif prompt_yes_no("Download NB Borealis Open 4B to Ollama? (about 3.3 GB; requires internet)", default=False):
                try:
                    run([ollama, "pull", OLLAMA_MODEL], cwd=ROOT)
                finally:
                    stop_child(child)
                child = None
            else:
                print("Skipped Borealis download; the app can open, but generated role-play and lessons need this model.")
    stop_child(child)
    print("\nSetup check:")
    return report()


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
        names = {item.get("name", "").split(":", 1)[0] for item in tags}
        installed = OLLAMA_MODEL.split(":", 1)[0] in names
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
    env_available = PYTHON.exists() or DEV_PYTHON.exists()
    if PYTHON.exists():
        print("Project Python environment: OK")
    elif DEV_PYTHON.exists():
        print("Python environment: existing development environment available for this checkout")
    else:
        print("Project Python environment: not installed")
    weights = MODELS / "nb-whisper-large"
    asr_ok = any((weights / name).exists() for name in ("model.safetensors", "model.safetensors.index.json"))
    piper = MODELS / "no_NO-talesyntese-medium.onnx"
    print(f"NB-Whisper Large: {'OK' if asr_ok else 'not downloaded'}" + (f" ({human_size(folder_size(weights))})" if asr_ok else ""))
    print(f"Piper Bokmål voice: {'OK' if piper.exists() else 'not downloaded'}" + (f" ({human_size(piper.stat().st_size)})" if piper.exists() else ""))
    ollama = shutil.which("ollama")
    daemon, model = ollama_model_installed() if ollama else (False, False)
    print(f"Ollama command: {'OK' if ollama else 'not installed'}")
    print(f"Ollama service: {'running' if daemon else 'not running'}")
    model_status = "installed" if model else ("not installed" if daemon else "unknown; Ollama service unavailable")
    print(f"Borealis Open 4B: {model_status}")
    try:
        free = shutil.disk_usage(ROOT).free
        print(f"Free disk space: {human_size(free)} (plan for about 12 GB for the full model set)")
    except OSError:
        pass
    if not env_available or not CONFIG.exists():
        print("\nFirst setup: python3.12 setup_local.py --install (Python 3.12 is recommended)")
    if not (asr_ok and piper.exists()):
        print("Download NB-Whisper and Piper after setup: python3 setup_local.py --download-speech")
    if not model:
        print("Install Ollama, start its local service, then run: python3 setup_local.py --pull-conversation-model")
    if py_ok and env_available and CONFIG.exists():
        if asr_ok and piper.exists() and model:
            print("\nLocal inference prerequisites are ready. Start Norsk Rom with: python3 start_local.py")
        else:
            print("\nBasic setup is ready; install any missing optional model components before using that feature.")
        return 0
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wizard", action="store_true", help="run the guided first-time setup")
    parser.add_argument("--check", action="store_true", help="check local setup without installing or downloading")
    parser.add_argument("--install", action="store_true", help="create venv, install local inference dependencies, and create a private local key")
    parser.add_argument("--download-speech", action="store_true", help="download NB-Whisper Large and Piper voice files from Hugging Face")
    parser.add_argument("--pull-conversation-model", action="store_true", help="download Borealis Open 4B into the local Ollama installation")
    args = parser.parse_args()

    if sys.version_info < (3, 11):
        print("Python 3.11 or newer is required. Install Python, then rerun this command.", file=sys.stderr)
        return 2
    if args.wizard:
        return guided_setup()
    if args.check:
        return report()
    if args.install:
        install_environment()
    if args.download_speech:
        model_python = available_python()
        if model_python is None:
            print("Run python3.12 setup_local.py --install first (Python 3.12 is recommended).", file=sys.stderr)
            return 2
        if not CONFIG.exists():
            run([str(model_python), "init_dev.py"])
        run([str(model_python), "setup_local_models.py"])
    if args.pull_conversation_model:
        if not shutil.which("ollama"):
            print("Ollama is not installed. Install it from https://ollama.com/download, start it, and retry.", file=sys.stderr)
            return 2
        run(["ollama", "pull", OLLAMA_MODEL], cwd=ROOT)
    return report()


if __name__ == "__main__":
    raise SystemExit(main())
