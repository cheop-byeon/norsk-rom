#!/bin/bash
cd "$(dirname "$0")"
if command -v python3.12 >/dev/null 2>&1; then
  PYTHON=python3.12
else
  PYTHON=python3
fi
"$PYTHON" setup_local.py --install
status=$?
echo
if [ "$status" -eq 0 ]; then
  echo "Setup complete. Model downloads are separate because they are large."
  echo "For speech: $PYTHON setup_local.py --download-speech"
  echo "For Borealis role-play: $PYTHON setup_local.py --pull-conversation-model"
else
  echo "Setup needs attention. Review the message above."
fi
read -r -p "Press Return to close this window..."
exit "$status"
