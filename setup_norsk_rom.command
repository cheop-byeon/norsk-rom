#!/bin/bash
cd "$(dirname "$0")"
if command -v python3.12 >/dev/null 2>&1; then
  PYTHON=python3.12
else
  PYTHON=python3
fi
"$PYTHON" setup_local.py --wizard
status=$?
echo
if [ "$status" -eq 0 ]; then
  echo "Setup wizard finished. Run $PYTHON setup_local.py --check to see local readiness."
else
  echo "Setup needs attention. Review the message above."
fi
read -r -p "Press Return to close this window..."
exit "$status"
