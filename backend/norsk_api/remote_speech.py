"""Opt-in NB MOSS Nano Space TTS. ASR remains local; no silent voice fallback."""
import io
import json
import re
import time
import wave
from functools import lru_cache
from urllib.parse import urlsplit
import httpx
from .live import LocalSpeech, ProviderFailure

SPACE = 'https://nbailab-nb-tts-norwegian-moss-nano-demo.hf.space'


def chunks(text, limit=180):
    words = text.split()
    parts, current = [], ''
    for word in words:
        if len(word)>limit:
            raise ProviderFailure('Speech text contains an unusually long word. Shorten the text and retry.')
        if current and len(current)+len(word)+1>limit:
            parts.append(current); current=''
        current = (current+' '+word).strip()
        if re.search(r'[.!?]$',word):
            parts.append(current); current=''
    if current:parts.append(current)
    return parts


class MossNanoSpeech(LocalSpeech):
    space = SPACE
    label = "NB MOSS Nano"

    def payload(self,text,voice="female",pace="slow"):
        return [text,260,10,13]

    def text_parts(self,text):
        return chunks(text)

    def capabilities(self):
        return {**super().capabilities(),
                'tts':self.label+' (remote Hugging Face demo)',
                'tts_processing':'remote',
                'tts_notice':f'Spoken text is sent to the public {self.label} Hugging Face Space. Microphone transcription uses the selected speech-recognition provider. The demo may queue or be unavailable.'}

    @lru_cache(maxsize=24)
    def synthesize(self,text,voice="female",pace="slow"):
        if not self.tts_lock.acquire(blocking=False):
            raise ProviderFailure('Speech is already being generated. Wait for it to finish before playing another clip.')
        try:
            deadline=time.monotonic()+600
            with httpx.Client(timeout=30,trust_env=False) as client:
                audio=[self._part(client,part,deadline,voice,pace) for part in self.text_parts(text)]
            output=io.BytesIO(); expected=None
            with wave.open(output,'wb') as target:
                for data in audio:
                    with wave.open(io.BytesIO(data),'rb') as source:
                        fmt=(source.getnchannels(),source.getsampwidth(),source.getframerate())
                        if expected is None:
                            expected=fmt;target.setnchannels(fmt[0]);target.setsampwidth(fmt[1]);target.setframerate(fmt[2])
                        if fmt!=expected or source.getnframes()==0:raise ValueError('Invalid audio')
                        target.writeframes(source.readframes(source.getnframes()))
                        target.writeframes(b'\x00'*int(fmt[2]*0.12)*fmt[0]*fmt[1])
            return output.getvalue()
        except ProviderFailure:
            raise
        except Exception as exc:
            raise ProviderFailure(f'{self.label} demo could not generate speech. It may be busy, asleep or failing. Retry later; no substitute voice was used.') from exc
        finally:self.tts_lock.release()

    def _part(self,client,text,deadline,voice="female",pace="slow"):
        def remaining():
            value=deadline-time.monotonic()
            if value<=0:raise ProviderFailure(f'{self.label} took too long. Try a shorter reply or retry later.')
            return value
        response=client.post(self.space+'/gradio_api/call/synthesize',json={'data':self.payload(text,voice,pace)},timeout=remaining())
        response.raise_for_status();event_id=response.json()['event_id']
        if not re.fullmatch(r'[a-zA-Z0-9_-]+',event_id):raise ValueError('Invalid event')
        event='';result=None
        with client.stream('GET',self.space+'/gradio_api/call/synthesize/'+event_id,timeout=remaining()) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                remaining()
                if line.startswith('event:'):event=line[6:].strip()
                if line.startswith('data:'):
                    if event=='error':
                        # Inspect only to classify; never expose upstream tracebacks.
                        if 'not a valid model identifier' in line or 'RepositoryNotFoundError' in line:
                            raise ProviderFailure(f'{self.label} cannot load its model on the demo server. Waiting longer will not fix this; the Space maintainer must restore model access.')
                        raise ProviderFailure(f'{self.label} reported a server-side synthesis error. This is not a playback timeout; please retry after the demo recovers.')
                    if event=='complete':result=json.loads(line[5:]);break
        if not result:raise ValueError('No completed result')
        url=result[0].get('url')
        if not url or urlsplit(url).scheme!='https' or urlsplit(url).netloc!=urlsplit(self.space).netloc:
            raise ValueError('Unexpected audio host')
        # Never follow arbitrary download hosts or keep remote server files locally.
        with client.stream('GET',url,timeout=remaining()) as response:
            response.raise_for_status();data=bytearray()
            for block in response.iter_bytes():
                remaining();data.extend(block)
                if len(data)>12*1024*1024:raise ValueError('Audio too large')
        return bytes(data)


class VoxCPMSpeech(MossNanoSpeech):
    space = 'https://nbailab-nb-tts-voxcpm2-voices-2607-demo.hf.space'
    label = 'NB Opplest VoxCPM2'

    def payload(self,text,voice="female",pace="slow"):
        return [text,{'female':'Kvinne · Oslo','male':'Mann · Oslo'}[voice],{'slow':'Rolig','normal':'Normal','fast':'Rask'}[pace]]

    def text_parts(self,text):
        # This Space already splits at sentence boundaries and joins the audio.
        return [text]

    def capabilities(self):
        return {**super().capabilities(), 'tts_options': True}
