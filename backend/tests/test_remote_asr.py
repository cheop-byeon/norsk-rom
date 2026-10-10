import io
import wave
import pytest
from fastapi.testclient import TestClient
from norsk_api.main import create_app
from norsk_api.config import Settings
from norsk_api.remote_asr import selected_wav,plain_transcript


def test_clip_only_selected_range_and_strip_demo_markup():
    out=io.BytesIO()
    with wave.open(out,'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\x01\x00'*32000)
    clipped=selected_wav(out.getvalue(),.5,1.5)
    with wave.open(io.BytesIO(clipped)) as w:assert w.getnframes()==16000
    assert plain_transcript((None,'Hei!<br>God dag.<br><br><i>Transkribert med NB-Whisper demo</i>',None))=='Hei!\nGod dag.'
    with pytest.raises(ValueError):plain_transcript((None,'',None))


def test_remote_is_explicit_and_never_default(tmp_path,monkeypatch):
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/db',api_keys={'a'*40:'alice'}))
    calls=[]
    def local(*args):calls.append('local');return {'text':'local'}
    def remote(*args):calls.append('remote');return {'text':'remote'}
    monkeypatch.setattr(app.state.speech,'transcribe',local)
    monkeypatch.setattr('norsk_api.main.transcribe_remote',remote)
    with TestClient(app,headers={'Authorization':'Bearer '+'a'*40}) as c:
        assert c.post('/v1/speech/transcribe',content=b'test').json()['text']=='local'
        assert c.post('/v1/speech/transcribe?provider=nb_hosted',content=b'test').json()['text']=='remote'
        assert c.post('/v1/speech/transcribe?provider=bad',content=b'test').status_code==422
    assert calls==['local','remote']
