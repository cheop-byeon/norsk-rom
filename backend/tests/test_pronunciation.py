import pytest
from fastapi.testclient import TestClient
from norsk_api.config import Settings
from norsk_api.main import create_app
from norsk_api.pronunciation import compare_phrase


def test_phrase_comparison_reports_word_differences_without_a_score():
    result=compare_phrase('Jeg vil gjerne ha kaffe','Jeg vil gjerne kaffe')
    assert result['differences']==[{'target':['ha'],'heard':[]}]
    assert result['feedback_kind']=='transcript_comparison_hint'
    assert 'score' not in result
    exact=compare_phrase('Hei, hvordan går det?','Hei hvordan går det')
    assert exact['differences']==[]


def test_pronunciation_endpoint_uses_selected_transcriber(tmp_path,monkeypatch):
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/db',api_keys={'a'*40:'alice'}))
    calls=[]
    def transcribe(data,start,end):
        calls.append((data,start,end));return {'text':'Jeg vil gjerne kaffe'}
    monkeypatch.setattr(app.state.speech,'transcribe',transcribe)
    with TestClient(app,headers={'Authorization':'Bearer '+'a'*40}) as client:
        response=client.post('/v1/speech/pronunciation-check?target=Jeg%20vil%20gjerne%20ha%20kaffe',content=b'audio')
        assert response.status_code==200,response.text
        result=response.json()
        assert result['differences']==[{'target':['ha'],'heard':[]}]
        assert calls==[(b'audio',0,None)]
        assert client.post('/v1/speech/pronunciation-check?target=Hei&provider=unknown',content=b'audio').status_code==422
        assert client.post('/v1/speech/pronunciation-check?target=hi').status_code==422


def test_phrase_comparison_requires_recognized_speech():
    with pytest.raises(ValueError):compare_phrase('Hei','')
