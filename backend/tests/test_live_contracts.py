from copy import deepcopy
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from norsk_api.main import create_app
from norsk_api.config import Settings
from norsk_api.fixtures import LESSON
from norsk_api.live import ProviderFailure
from norsk_api.generate import DraftLesson, validate_draft

KEY='a'*40
OTHER='b'*40

@pytest.fixture
def client(tmp_path):
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/db',api_keys={KEY:'alice',OTHER:'bob'},conversation_mode='ollama'))
    with TestClient(app,headers={'Authorization':'Bearer '+KEY}) as c:
        yield c,app


def test_generated_lesson_is_private_idempotent_and_usable(client,monkeypatch):
    c,app=client
    def generate(*args):
        doc=deepcopy(LESSON);doc['generated']=True;doc['roleplay_context']='Cafe';return doc
    monkeypatch.setattr('norsk_api.main.generate_lesson',generate)
    body={'text':'Dette er en norsk tekst som brukes i en test.','level':'B1','source_kind':'text','request_id':str(uuid4())}
    r=c.post('/v1/studio/lessons',json=body);assert r.status_code==201,r.text
    lesson=r.json();lid=lesson['id']
    assert c.post('/v1/studio/lessons',json=body).json()==lesson
    assert c.post('/v1/studio/lessons',json={**body,'level':'B2'}).status_code==409
    assert 'answer' not in lesson['questions'][0]
    assert c.get('/v1/lessons/'+lid,headers={'Authorization':'Bearer '+OTHER}).status_code==404
    assert len(c.get('/v1/lessons',headers={'Authorization':'Bearer '+OTHER}).json()['items'])==1
    s=c.post('/v1/sessions',json={'lesson_id':lid,'request_id':str(uuid4())});assert s.status_code==201
    pid=lesson['phrases'][0]['id']
    assert c.put('/v1/phrases/'+pid).status_code==200
    assert c.put('/v1/phrases/'+pid,headers={'Authorization':'Bearer '+OTHER}).status_code==404


def test_vocabulary_is_private_upsertable_and_reviewable(client):
    c, _ = client
    sentence='Jeg vil gjerne ha en kaffe.'
    body={'word':'gjerne','meaning':'gladly; would like to','source_sentence':sentence,'lesson_id':'cafe-oatmilk-a2'}
    first=c.post('/v1/vocabulary',json=body);assert first.status_code==201,first.text
    word=first.json()['word']
    again=c.post('/v1/vocabulary',json={**body,'meaning':'I would like'});assert again.status_code==201
    assert again.json()['word']['id']==word['id']
    assert again.json()['word']['meaning']=='I would like'
    assert len(c.get('/v1/vocabulary').json()['items'])==1
    assert c.get('/v1/vocabulary',headers={'Authorization':'Bearer '+OTHER}).json()['items']==[]
    assert c.patch('/v1/vocabulary/'+word['id'],json={'status':'known'}).json()['word']['status']=='known'
    assert c.get('/v1/vocabulary?status=learning').json()['items']==[]
    assert c.patch('/v1/vocabulary/'+word['id'],headers={'Authorization':'Bearer '+OTHER},json={'status':'known'}).status_code==404
    assert c.delete('/v1/vocabulary/'+word['id']).status_code==204
    assert c.get('/v1/vocabulary').json()['items']==[]


def test_generated_lesson_keeps_timed_source_segments(client,monkeypatch):
    c,_=client
    def generate(*args):
        doc=deepcopy(LESSON);doc['generated']=True;return doc
    monkeypatch.setattr('norsk_api.main.generate_lesson',generate)
    segment={'start':12.4,'end':15.1,'text':'Jeg vil gjerne ha en kaffe.','timestamp_quality':'caption'}
    body={'text':'Dette er en norsk tekst som brukes i en test.','level':'A2','source_kind':'audio transcript','request_id':str(uuid4()),'source_segments':[segment]}
    created=c.post('/v1/studio/lessons',json=body);assert created.status_code==201,created.text
    script=c.get('/v1/lessons/'+created.json()['id']+'/script').json()
    assert script['source_segments']==[segment]
    invalid={**body,'request_id':str(uuid4()),'source_segments':[{**segment,'end':segment['start']}]}
    assert c.post('/v1/studio/lessons',json=invalid).status_code==422


def test_provider_errors_and_asset_allowlist(client,monkeypatch):
    c,app=client
    def fail(*args):raise ProviderFailure('Unavailable for test')
    monkeypatch.setattr(app.state.speech,'synthesize',fail)
    assert c.post('/v1/speech/synthesize',json={'text':'Hei!'}).status_code==503
    assert c.post('/v1/speech/synthesize',json={'text':'x'*4001}).status_code==422
    assert c.post('/v1/speech/transcribe?start=20&end=10',content=b'test').status_code==422
    assert c.get('/app/').status_code==200
    assert c.get('/app/connected.js').status_code==200
    assert c.get('/app/.local-config.json').status_code==404
    assert c.get('/app/main.py').status_code==404


def test_unsupported_generated_evidence_is_rejected():
    draft=DraftLesson(title='Test',roleplay_context='Test',opening='Hei',questions=[dict(prompt='When?',options=['one','two','three'],answer=0,evidence_quote='invented',explanation='Test')]*2,phrases=[dict(text='Hei',meaning='Hello'),dict(text='Norge',meaning='Norway')])
    with pytest.raises(ValueError):validate_draft(draft,'Hei Norge.','A1','text')
