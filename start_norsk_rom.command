#!/bin/bash
cd "$(dirname "$0")"
if command -v python3.12 >/dev/null 2>&1; then
  PYTHON=python3.12
else
  PYTHON=python3
fi
"$PYTHON" start_local.py
status=$?
echo
if [ "$status" -ne 0 ]; then
  echo "Norsk Rom did not start. See the message above and run python3 setup_local.py for setup guidance."
fi
read -r -p "Press Return to close this window..."
exit "$status"
