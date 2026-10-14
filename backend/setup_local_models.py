"""Download official model assets and enable local inference, preserving credentials."""
import json
import os
from pathlib import Path
from urllib.request import urlopen
from huggingface_hub import snapshot_download

ROOT = Path(__file__).resolve().parent
NB_REVISION = '8b38492d0e4111d5d6ad825e979cb082a2da013a'

TEXT_MODEL = 'hf.co/NbAiLab/borealis-open-4b-gguf'
def main():
    config_path = ROOT / '.local-config.json'
    if not config_path.exists():
        raise SystemExit('Run python init_dev.py first.')
    models = ROOT / '.data' / 'models'
    models.mkdir(parents=True, exist_ok=True)
    snapshot_download('NbAiLab/nb-whisper-tiny', revision=NB_REVISION,
        local_dir=models / 'nb-whisper-tiny', allow_patterns=['*.json','*.txt','*.safetensors'])
    # Resolve one immutable voice revision for all related files.
    with urlopen('https://huggingface.co/api/models/rhasspy/piper-voices') as response:
        revision = json.load(response)['sha']
    base = f'https://huggingface.co/rhasspy/piper-voices/resolve/{revision}/no/no_NO/talesyntese/medium/'
    for name in ['no_NO-talesyntese-medium.onnx','no_NO-talesyntese-medium.onnx.json','MODEL_CARD']:
        path = models / name
        temp = path.with_suffix(path.suffix + '.download')
        with urlopen(base + name) as source, temp.open('wb') as target:
            while chunk := source.read(1024 * 1024):
                target.write(chunk)
        temp.replace(path)
    config = json.loads(config_path.read_text())
    config.update(conversation_mode='ollama', ollama_model=TEXT_MODEL,
        asr_path=str(models / 'nb-whisper-tiny'),
        tts_path=str(models / 'no_NO-talesyntese-medium.onnx'))
    config_path.write_text(json.dumps(config, indent=2)+'\n')
    os.chmod(config_path, 0o600)
    (models / 'provenance.json').write_text(json.dumps({'nb_revision': NB_REVISION,'piper_revision': revision},indent=2))
    print(f'Local models configured. Run `ollama pull {TEXT_MODEL}`, then start the API.')

if __name__ == '__main__':
    main()
