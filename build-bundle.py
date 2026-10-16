"""Package source only; never include local keys, databases or environments."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent
excluded_dirs = {'.data', '.venv', '__pycache__', '.pytest_cache', '.git', 'node_modules'}
excluded_files = {'norsk-rom-local-config.json', '.local-config.json', '.env'}

def include(path):
    rel = path.relative_to(root)
    if any(part in excluded_dirs or part.endswith('.egg-info') for part in rel.parts):
        return False
    if path.name in excluded_files:
        return False
    if any(part.startswith('.') and part not in {'.gitignore', '.env.example'} for part in rel.parts):
        return False
    return path.is_file() and path.suffix not in {'.pyc', '.db', '.sqlite', '.zip', '.ses'}

with ZipFile(root.parent / 'norsk-rom-starter.zip', 'w', ZIP_DEFLATED) as archive:
    for path in sorted(root.rglob('*')):
        if include(path):
            archive.write(path, Path('norsk-rom') / path.relative_to(root))
with ZipFile(root.parent / 'norsk-rom-backend.zip', 'w', ZIP_DEFLATED) as archive:
    for path in sorted((root / 'backend').rglob('*')):
        if include(path):
            archive.write(path, Path('backend') / path.relative_to(root / 'backend'))
    for name in ['connected.html','connected.js','connected.css','api-client.js']:
        archive.write(root / name, name)
print('Created source archives; credentials, local data and caches excluded.')
