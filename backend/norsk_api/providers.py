"""Replace provider implementations without coupling them to HTTP routes."""
import re
from typing import Protocol
from .fixtures import LESSON
from .schemas import ConversationResult, Correction

class ConversationProvider(Protocol):
    def reply(self, text: str, history: list[dict], lesson=None) -> ConversationResult: ...

class SpeechToTextProvider(Protocol):
    def transcribe(self, audio: bytes, mime_type: str) -> dict: ...

class TextToSpeechProvider(Protocol):
    def synthesize(self, text: str, language: str) -> bytes: ...

class PronunciationProvider(Protocol):
    def assess(self, audio: bytes, reference: str) -> dict: ...

class ProviderNotConfigured(RuntimeError):
    pass

class UnconfiguredSpeech:
    def transcribe(self, audio: bytes, mime_type: str) -> dict:
        raise ProviderNotConfigured('NB-Whisper is not connected.')
    def synthesize(self, text: str, language: str) -> bytes:
        raise ProviderNotConfigured('Server TTS is not connected. Device TTS remains available in the frontend.')
    def assess(self, audio: bytes, reference: str) -> dict:
        raise ProviderNotConfigured('Pronunciation assessment is not connected.')

class MockConversation:
    def reply(self, text: str, history: list[dict], lesson=None) -> ConversationResult:
        t = text.lower().strip()
        correction = None
        if re.search(r'\bvil gjerne har\b', t):
            c = LESSON['correction']
            correction = Correction(original=c['before'], suggestion=c['after'], explanation=c['why'])
        matched = []
        if re.search(r'vil gjerne ha.*kaffe.*havremelk', t) and correction is None:
            matched.append('p1')
        if re.search(r'\bta (den )?med\b', t):
            matched.append('p2')
        reply = 'Vil du ha en kaffe, eller vil du ha noe annet?'
        if 'havremelk' in t or 'kaffe' in t:
            reply = 'Selvfølgelig! Skal du sitte her eller ta med?'
        if re.search(r'\bta (den )?med\b', t):
            reply = 'Det blir førtifem kroner. Vil du betale med kort?'
        if 'koster' in t or 'pris' in t:
            reply = 'Kaffen koster førtifem kroner.'
        if 'kort' in t:
            reply = 'Takk skal du ha! Kaffen kommer snart.'
        return ConversationResult(partner_text=reply, correction=correction, matched_phrases=matched)
