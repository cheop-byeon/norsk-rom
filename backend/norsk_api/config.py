from dataclasses import dataclass, field
from pathlib import Path
import json
import os

ROOT = Path(__file__).resolve().parents[1]

@dataclass(frozen=True)
class Settings:
    database_url: str = f"sqlite:///{ROOT / '.data' / 'norsk.db'}"
    api_keys: dict[str, str] = field(default_factory=dict)
    cors_origins: tuple[str, ...] = ("http://localhost:8080", "http://127.0.0.1:8080")

    conversation_mode: str = 'mock'
    ollama_model: str = 'hf.co/NbAiLab/borealis-open-4b-gguf'
    asr_path: str = ''
    tts_path: str = ''
    tts_provider: str = 'piper'

    def __post_init__(self):
        if self.tts_provider not in ('piper','nb_moss_nano_space','nb_voxcpm_space'):
            raise ValueError('Unknown TTS provider')
        if self.conversation_mode not in ('mock','ollama'):
            raise ValueError('Unknown conversation provider')
        if not self.api_keys or any(not isinstance(k, str) or len(k) < 32 or not isinstance(v, str) or not v.strip() for k, v in self.api_keys.items()):
            raise ValueError("Configure API keys of at least 32 characters mapped to nonempty learner IDs. Run python init_dev.py for local setup.")
        if "*" in self.cors_origins or "null" in self.cors_origins:
            raise ValueError("Use explicit HTTP frontend origins, not '*' or file:// (null).")

    @classmethod
    def from_env(cls):
        local = ROOT / '.local-config.json'
        config = json.loads(local.read_text()) if local.exists() else {}
        keys = json.loads(os.environ['NORSK_API_KEYS']) if 'NORSK_API_KEYS' in os.environ else config.get('api_keys', {})
        return cls(database_url=os.environ.get('NORSK_DATABASE_URL', cls.__dataclass_fields__['database_url'].default),
                   api_keys=keys,
                   conversation_mode=os.environ.get('NORSK_CONVERSATION',config.get('conversation_mode','mock')),
                   ollama_model=os.environ.get('NORSK_OLLAMA_MODEL',config.get('ollama_model','hf.co/NbAiLab/borealis-open-4b-gguf')),
                   asr_path=os.environ.get('NORSK_ASR_PATH',config.get('asr_path','')),
                   tts_provider=os.environ.get('NORSK_TTS_PROVIDER',config.get('tts_provider','piper')),
                   tts_path=os.environ.get('NORSK_TTS_PATH',config.get('tts_path','')),
                   cors_origins=tuple(x.strip() for x in os.environ.get('NORSK_CORS_ORIGINS', 'http://localhost:8080,http://127.0.0.1:8080').split(',') if x.strip()))
