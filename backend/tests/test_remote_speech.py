import io
import time
import wave
import httpx
import pytest
from norsk_api.remote_speech import MossNanoSpeech, SPACE, chunks
from norsk_api.live import ProviderFailure


def wav():
    out=io.BytesIO()
    with wave.open(out,'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(24000);w.writeframes(b'\0'*4800)
    return out.getvalue()


def test_public_gradio_contract_downloads_audio():
    calls=[]
    def handler(req):
        calls.append(req)
        if req.method=='POST':return httpx.Response(200,json={'event_id':'abc'})
        if req.url.path.endswith('/abc'):
            return httpx.Response(200,text='event: complete\ndata: [{"url":"'+SPACE+'/gradio_api/file=test.wav"},"OK"]\n\n')
        return httpx.Response(200,content=wav())
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        result=MossNanoSpeech()._part(client,'Hei!',time.monotonic()+10)
    assert result==wav()
    assert b'Hei!' in calls[0].content


@pytest.mark.parametrize('event',[
    'event: error\ndata: {"error":"private upstream traceback"}\n\n',
    'event: complete\ndata: [{"url":"https://other.example/audio.wav"}]\n\n'])
def test_error_or_untrusted_audio_host_never_downloads(event):
    calls=[]
    def handler(req):
        calls.append(req)
        return httpx.Response(200,json={'event_id':'abc'}) if req.method=='POST' else httpx.Response(200,text=event)
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises((ProviderFailure,ValueError)):
            MossNanoSpeech()._part(client,'Hei!',time.monotonic()+10)
    assert len(calls)==2


def test_chunking_preserves_words_and_remote_disclosure():
    text='Hei! '+('Dette er norsk tale. '*40)
    parts=chunks(text)
    assert ' '.join(parts).split()==text.split()
    assert all(len(p)<=180 for p in parts)
    assert MossNanoSpeech().capabilities()['tts_processing']=='remote'


def test_model_load_failure_is_distinct_from_timeout():
    def handler(req):
        if req.method=='POST':return httpx.Response(200,json={'event_id':'abc'})
        return httpx.Response(200,text='event: error\ndata: {"error":"not a valid model identifier"}\n\n')
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ProviderFailure,match='maintainer must restore model access'):
            MossNanoSpeech()._part(client,'Hei!',time.monotonic()+600)


def test_voxcpm_uses_its_own_endpoint_and_voice_contract():
    from norsk_api.remote_speech import VoxCPMSpeech
    import json
    speech=VoxCPMSpeech();seen=[]
    def handler(req):
        seen.append(req)
        if req.method=='POST':
            assert json.loads(req.content)['data']==['Hei!','Kvinne · Oslo','Rolig']
            return httpx.Response(200,json={'event_id':'abc'})
        if req.url.path.endswith('/abc'):
            return httpx.Response(200,text='event: complete\ndata: [{"url":"'+speech.space+'/gradio_api/file=voice.wav"},"OK"]\n\n')
        return httpx.Response(200,content=wav())
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        assert speech._part(client,'Hei!',time.monotonic()+600)==wav()
    assert all(str(r.url).startswith(speech.space) for r in seen)
    assert speech.text_parts('Hei! God morgen.')==['Hei! God morgen.']


def test_voice_pace_options_and_validation():
    from norsk_api.remote_speech import VoxCPMSpeech
    from norsk_api.schemas import Synthesis
    from pydantic import ValidationError
    assert VoxCPMSpeech().payload('Hei','male','fast')==['Hei','Mann · Oslo','Rask']
    assert Synthesis(text='Hei').pace=='slow'
    with pytest.raises(ValidationError):Synthesis(text='Hei',voice='unknown')
    with pytest.raises(ValidationError):Synthesis(text='Hei',pace='unknown')
