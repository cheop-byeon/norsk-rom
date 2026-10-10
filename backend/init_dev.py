"""Create a local development credential without printing it or overwriting existing data."""
import json
import os
from pathlib import Path
import secrets

path = Path(__file__).resolve().parent / '.local-config.json'
try:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
except FileExistsError:
    print('Local configuration already exists; left unchanged.')
else:
    with os.fdopen(fd, 'w') as f:
        json.dump({'api_keys': {secrets.token_urlsafe(32): 'local-learner'}}, f, indent=2)
        f.write('\n')
    print('Created .local-config.json (private). Use its API key as your Bearer token in /docs.')
