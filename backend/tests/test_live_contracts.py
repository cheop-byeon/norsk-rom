from copy import deepcopy
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from norsk_api.main import create_app
from norsk_api.config import Settings
from norsk_api.fixtures import LESSON
from norsk_api.live import LocalSpeech, OllamaConversation, ProviderFailure
from norsk_api.generate import DraftLesson, validate_draft, generate_lesson

KEY='a'*40
OTHER='b'*40


def test_local_speech_reports_sharded_nb_whisper_large(tmp_path):
    model_path=tmp_path/'nb-whisper-large'
    model_path.mkdir()
    (model_path/'model.safetensors.index.json').write_text('{}')
    speech=LocalSpeech(str(model_path))
    assert speech.capabilities()['transcription']=='NbAiLab/nb-whisper-large (local)'


def test_hosted_tts_configuration_is_rejected():
    with pytest.raises(ValueError,match='Only local Piper'):
        Settings(api_keys={KEY:'alice'},tts_provider='nb_voxcpm_space')


def test_ollama_exact_echo_is_replaced_with_a_conversational_followup(monkeypatch):
    import json
    import norsk_api.live as module
    class Response:
        def raise_for_status(self): pass
        def json(self): return {'message': {'content': json.dumps({'partner_text':'Det bøtter ned!','correction':None})}}
    class Client:
        def __init__(self,**kwargs): pass
        def __enter__(self): return self
        def __exit__(self,*args): pass
        def post(self,*args,**kwargs): return Response()
    monkeypatch.setattr(module.httpx,'Client',Client)
    result=OllamaConversation().reply('Det bøtter ned.',[])
    assert result.partner_text=='Det skjønner jeg. Kan du fortelle litt mer?'


def test_ollama_prompt_interprets_asr_text_as_a_clue_and_uses_correct_bokmal(monkeypatch):
    import json
    import norsk_api.live as module
    requests=[]
    class Response:
        def raise_for_status(self): pass
        def json(self): return {'message': {'content': json.dumps({'partner_text':'Skjønner. Hva vil du gjøre?', 'correction':None})}}
    class Client:
        def __init__(self,**kwargs): pass
        def __enter__(self): return self
        def __exit__(self,*args): pass
        def post(self,*args,**kwargs): requests.append(kwargs['json']);return Response()
    monkeypatch.setattr(module.httpx,'Client',Client)
    lesson={'generated':True,'level':'A2','roleplay_context':'Snakk om været og regn.',
            'phrases':[{'text':'det bøtter ned'}]}
    OllamaConversation().reply('Jeg skal kjøpe en ny skydebue.',[],lesson)
    system=requests[0]['messages'][0]['content'].casefold()
    assert 'imperfect speech-recognition transcript' in system
    assert 'intended meaning' in system
    assert 'correct, natural standard bokmål' in system
    assert 'if the meaning is unclear' in system

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


def test_generated_lesson_can_store_private_full_source_transcript(client,monkeypatch):
    c,_=client
    monkeypatch.setattr('norsk_api.main.generate_lesson',lambda *args:{**deepcopy(LESSON),'generated':True})
    body={'text':'Dette er en norsk tekst som brukes i en test.','level':'A2','source_kind':'audio transcript','request_id':str(uuid4())}
    lesson=c.post('/v1/studio/lessons',json=body).json();lid=lesson['id']
    segments=[{'start':0,'end':25,'text':'Hei, dette er en øvelse.','timestamp_quality':'local_chunk'}]
    attached=c.put(f'/v1/lessons/{lid}/source-transcript',json={'segments':segments})
    assert attached.status_code==200,attached.text
    assert c.get(f'/v1/lessons/{lid}/script').json()['source_transcript_segments']==segments
    assert c.get(f'/v1/lessons/{lid}/script',headers={'Authorization':'Bearer '+OTHER}).status_code==404
    assert c.put(f'/v1/lessons/{lid}/source-transcript',json={'segments':[{**segments[0],'end':0}]}).status_code==422


def test_generated_lesson_can_keep_and_replay_original_source_audio(client,monkeypatch):
    c,app=client
    monkeypatch.setattr('norsk_api.main.generate_lesson',lambda *args:{**deepcopy(LESSON),'generated':True})
    body={'text':'Dette er en norsk tekst som brukes i en test.','level':'A2','source_kind':'audio transcript','request_id':str(uuid4())}
    lesson=c.post('/v1/studio/lessons',json=body).json();lid=lesson['id']
    audio=b'fake-mp3-source-bytes'
    attached=c.put(f'/v1/lessons/{lid}/source-audio',content=audio,headers={'Content-Type':'audio/mpeg'})
    assert attached.status_code==200,attached.text
    assert c.get(f'/v1/lessons/{lid}/script').json()['source_audio'] is True
    fetched=c.get(f'/v1/lessons/{lid}/source-audio')
    assert fetched.status_code==200
    assert fetched.headers['content-type']=='audio/mpeg'
    assert fetched.content==audio
    assert c.get(f'/v1/lessons/{lid}/source-audio',headers={'Authorization':'Bearer '+OTHER}).status_code==404
    assert c.put(f'/v1/lessons/{lid}/source-audio',content=b'nope',headers={'Content-Type':'text/plain'}).status_code==415


def test_on_device_audio_to_lesson_flow(client,monkeypatch):
    c,app=client
    transcript='Det bøtter ned i Oslo i dag. Mange tar bussen til jobb.'
    monkeypatch.setattr(app.state.speech,'transcribe',lambda data,start,end:{
        'text':transcript,'segments':[{'start':start,'end':end,'text':transcript,'timestamp_quality':'local_chunk'}],
        'provider':'NbAiLab/nb-whisper-large','processing':'local','requires_confirmation':True,
    })
    def generate(text,level,source_kind,model):
        assert text==transcript and level=='A2' and source_kind=='audio transcript'
        return {**deepcopy(LESSON),'generated':True,'title':'Det bøtter ned','playback_text':text,
                'lines':[{'id':'source','speaker':'Source','text':text}]}
    monkeypatch.setattr('norsk_api.main.generate_lesson',generate)

    audio=b'local audio bytes'
    recognized=c.post('/v1/speech/transcribe?start=0&end=12',content=audio,headers={'Content-Type':'audio/wav'})
    assert recognized.status_code==200 and recognized.json()['processing']=='local'
    created=c.post('/v1/studio/lessons',json={
        'text':recognized.json()['text'],'level':'A2','source_kind':'audio transcript',
        'source_segments':recognized.json()['segments'],'request_id':str(uuid4()),
    })
    assert created.status_code==201,created.text
    lesson_id=created.json()['id']
    assert c.put(f'/v1/lessons/{lesson_id}/source-audio',content=audio,headers={'Content-Type':'audio/wav'}).status_code==200
    script=c.get(f'/v1/lessons/{lesson_id}/script').json()
    assert script['source_audio'] is True
    assert script['source_segments']==recognized.json()['segments']
    assert script['playback_text']==transcript
    assert c.get(f'/v1/lessons/{lesson_id}/source-audio').content==audio
    caps=c.get('/v1/capabilities').json()
    assert caps['transcription_options']==['local']
    assert caps['media_processing']=='on_device_clips_up_to_90_seconds'


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


def test_lesson_generation_retries_and_normalizes_exact_source_spans(monkeypatch):
    import json
    import norsk_api.generate as module
    text='Det bøtter ned. Det pøser ned.'
    def draft(phrases,quote):
        return json.dumps({'title':'Rainy weather','roleplay_context':'Talk about rain','opening':'Det regner.','questions':[
            {'prompt':'What is happening?','options':['It rains heavily','It is sunny','It snows'],'answer':0,'evidence_quote':quote,'explanation':'The source describes heavy rain.'},
            {'prompt':'Which phrase is used?','options':['Bøtter ned','Solen skinner','Det snør'],'answer':0,'evidence_quote':quote,'explanation':'The phrase means heavy rain.'}],
            'phrases':[{'text':p,'meaning':'Heavy rain.'} for p in phrases]})
    responses=[draft(['invented phrase','other phrase'],'Det bøtter ned.'),draft(['det bøtter ned','det pøser ned'],'Det bøtter ned. ')]
    class Response:
        def __init__(self,content):self.content=content
        def raise_for_status(self):pass
        def json(self):return {'message':{'content':self.content}}
    class Client:
        def __init__(self,**kwargs):self.calls=0
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def post(self,*args,**kwargs):
            content=responses.pop(0);return Response(content)
    monkeypatch.setattr(module.httpx,'Client',Client)
    result=generate_lesson(text,'A2','audio transcript','local-test')
    assert [item['text'] for item in result['phrases']]==['Det bøtter ned','Det pøser ned']
    assert result['questions'][0]['evidence'][0]=='evidence1'
