from fastapi.testclient import TestClient
from norsk_api.main import create_app
from norsk_api.config import Settings
def test_local_asr_is_the_only_available_provider(tmp_path,monkeypatch):
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/db',api_keys={'a'*40:'alice'}))
    calls=[]
    def local(*args):calls.append('local');return {'text':'local'}
    monkeypatch.setattr(app.state.speech,'transcribe',local)
    with TestClient(app,headers={'Authorization':'Bearer '+'a'*40}) as c:
        assert c.post('/v1/speech/transcribe',content=b'test').json()['text']=='local'
        assert c.post('/v1/speech/transcribe?provider=nb_hosted',content=b'test').status_code==422
        assert c.post('/v1/speech/transcribe?provider=bad',content=b'test').status_code==422
    assert calls==['local']


def test_long_hosted_endpoint_is_removed(tmp_path):
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/db',api_keys={'a'*40:'alice'}))
    with TestClient(app,headers={'Authorization':'Bearer '+'a'*40}) as c:
        assert c.post('/v1/speech/transcribe-long?end=2',content=b'audio').status_code==404
