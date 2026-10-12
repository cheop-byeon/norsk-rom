#!/bin/sh
set -eu

BACKEND_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$BACKEND_DIR"

if [ -n "${NORSK_PYTHON:-}" ]; then
  PYTHON_BIN=$NORSK_PYTHON
elif [ -x "$BACKEND_DIR/.venv/bin/python" ]; then
  PYTHON_BIN="$BACKEND_DIR/.venv/bin/python"
elif [ -x "$BACKEND_DIR/../../../work/live-venv/bin/python" ]; then
  PYTHON_BIN="$BACKEND_DIR/../../../work/live-venv/bin/python"
else
  PYTHON_BIN=python3
fi

exec "$PYTHON_BIN" -m uvicorn norsk_api.main:create_app \
  --factory --host 127.0.0.1 --port "${NORSK_PORT:-8000}" \
  --reload --reload-dir "$BACKEND_DIR/norsk_api"
