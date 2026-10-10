from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
import time
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from norsk_api.config import Settings
from norsk_api.main import create_app
from norsk_api.database import ActionReceipt, MediaJob
from norsk_api.jobs import run_once
from norsk_api.fixtures import LESSON_ID, LESSON

A = 'a'*40
B = 'b'*40

@pytest.fixture
def setup(tmp_path):
    settings = Settings(database_url=f'sqlite:///{tmp_path / "test.db"}', api_keys={A:'alice',B:'bob'})
    app = create_app(settings)
    with TestClient(app, headers={'Authorization':f'Bearer {A}'}) as client:
        yield client, app, settings


def create(client):
    r = client.post('/v1/sessions', json={'request_id':str(uuid4())})
    assert r.status_code == 201, r.text
    return r.json()


def action(client, s, route, **kw):
    payload = {'request_id':str(uuid4()), 'revision':s['revision'], **kw}
    r = client.post(f'/v1/sessions/{s["id"]}/{route}', json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def to_roleplay(client):
    s = create(client)
    s = action(client,s,'listening',mode='mock_skip')
    s = action(client,s,'answers',answers={'q1':1,'q2':2})
    return action(client,s,'roleplay')


def test_full_connected_flow_and_restart_persistence(setup):
    c, app, settings = setup
    lesson = c.get('/v1/lessons').json()['items'][0]
    assert lesson['id'] == LESSON_ID
    assert 'answer' not in lesson['questions'][0]
    s = create(c)
    s = action(c,s,'transcript-help')
    s = action(c,s,'listening',mode='played_self_reported')
    s = action(c,s,'answers',answers={'q1':1,'q2':0})
    assert s['state']['review'][0]['evidence'][1]['id'] == 'l4'
    assert not s['state']['review'][1]['is_correct']
    s = action(c,s,'practice',phrase_id='p1',practised=True)
    s = action(c,s,'roleplay')
    s = action(c,s,'turns',text=LESSON['sampleError'],input_mode='simulated_voice')
    assert s['state']['last_correction']['suggestion'] == 'Jeg vil gjerne ha'
    assert s['state']['used'] == []
    s = action(c,s,'turns',text=LESSON['phrases'][0]['text'])
    s = action(c,s,'turns',text=LESSON['phrases'][1]['text'])
    s = action(c,s,'complete')
    summary = c.get(f'/v1/sessions/{s["id"]}/recap').json()
    assert summary['quiz_correct'] == 1
    assert summary['literal_phrase_matches'] == ['p1','p2']
    assert summary['turn_count'] == 3
    assert summary['proficiency_score'] is None
    assert summary['pronunciation'] == 'not_assessed'
    with TestClient(create_app(settings),headers={'Authorization':f'Bearer {A}'}) as restarted:
        loaded = restarted.get(f'/v1/sessions/{s["id"]}').json()
        assert loaded == s


def test_authentication_and_owner_isolation(setup):
    c, app, _ = setup
    s = create(c)
    assert c.get('/v1/lessons',headers={'Authorization':''}).status_code == 401
    assert c.get('/v1/lessons',headers={'Authorization':'Bearer wrong'}).status_code == 401
    for method,path in [('get',''),('delete',''),('get','/recap')]:
        assert getattr(c,method)(f'/v1/sessions/{s["id"]}{path}',headers={'Authorization':f'Bearer {B}'}).status_code == 404
    assert c.get('/v1/sessions',headers={'Authorization':f'Bearer {B}'}).json() == []
    assert c.post(f'/v1/sessions/{s["id"]}/listening',json={'request_id':str(uuid4()),'revision':0,'mode':'mock_skip'},headers={'Authorization':f'Bearer {B}'}).status_code == 404


def test_idempotency_and_conflicting_retry(setup):
    c, _, _ = setup
    request = {'request_id':str(uuid4())}
    first = c.post('/v1/sessions',json=request).json()
    assert c.post('/v1/sessions',json=request).json()['id'] == first['id']
    s = to_roleplay(c)
    payload = {'request_id':str(uuid4()),'revision':s['revision'],'text':LESSON['phrases'][0]['text']}
    path = f'/v1/sessions/{s["id"]}/turns'
    r1 = c.post(path,json=payload)
    assert r1.status_code == 200
    assert c.post(path,json=payload).json() == r1.json()
    assert len(c.get(f'/v1/sessions/{s["id"]}').json()['state']['turns']) == 1
    assert c.post(path,json={**payload,'text':'different'}).status_code == 409
    assert c.post(path,json={**payload,'request_id':str(uuid4())}).status_code == 409


def test_concurrent_updates_have_one_winner(setup):
    c, _, _ = setup
    s = to_roleplay(c)
    path = f'/v1/sessions/{s["id"]}/turns'
    def post(_):
        return c.post(path,json={'request_id':str(uuid4()),'revision':s['revision'],'text':'Hei!'}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(post,range(2))) == [200,409]
    assert len(c.get(f'/v1/sessions/{s["id"]}').json()['state']['turns']) == 1


def test_validation_and_step_guards(setup):
    c, _, _ = setup
    s = create(c)
    base = {'request_id':str(uuid4()),'revision':0}
    url = f'/v1/sessions/{s["id"]}'
    assert c.post(url+'/turns',json={**base,'text':'hello'}).status_code == 409
    assert c.post(url+'/turns',json={**base,'text':'   '}).status_code == 422
    assert c.post(url+'/turns',json={**base,'text':'x'*2001}).status_code == 422
    assert c.post(url+'/answers',json={**base,'answers':{'q1':True,'q2':2}}).status_code == 422
    assert c.post(url+'/answers',json={**base,'answers':{'q1':7,'q2':2}}).status_code == 422
    assert c.post(url+'/answers',json={**base,'answers':{'q1':1}}).status_code == 422
    assert c.post(url+'/listening',json={**base,'mode':'mock_skip','owner':'bob'}).status_code == 422
    assert c.get('/v1/sessions/not-a-uuid').status_code == 422


def test_completion_lock_and_receipt_deletion(setup):
    c, app, _ = setup
    s = to_roleplay(c)
    payload = {'request_id':str(uuid4()),'revision':s['revision']}
    assert c.post(f'/v1/sessions/{s["id"]}/complete',json=payload).status_code == 409
    s = action(c,s,'turns',text='Hei!')
    s = action(c,s,'complete')
    assert c.post(f'/v1/sessions/{s["id"]}/turns',json={'request_id':str(uuid4()),'revision':s['revision'],'text':'Again'}).status_code == 409
    assert c.delete(f'/v1/sessions/{s["id"]}').status_code == 204
    assert c.get(f'/v1/sessions/{s["id"]}').status_code == 404
    with app.state.factory() as db:
        assert db.scalar(select(ActionReceipt).where(ActionReceipt.session_id==s['id'])) is None


def test_phrase_saves_are_idempotent_and_private(setup):
    c, _, _ = setup
    for _ in range(2):assert c.put('/v1/phrases/p1').status_code == 200
    assert len(c.get('/v1/phrases').json()['items']) == 1
    assert c.get('/v1/phrases',headers={'Authorization':f'Bearer {B}'}).json()['items'] == []
    assert c.put('/v1/phrases/unknown').status_code == 404
    assert c.delete('/v1/phrases/p1').status_code == 204
    assert c.get('/v1/phrases').json()['items'] == []


def test_job_worker_idempotency_and_cancel(setup):
    c, app, _ = setup
    payload = {'request_id':str(uuid4())}
    job = c.post('/v1/jobs',json=payload).json()
    assert c.post('/v1/jobs',json=payload).json()['id'] == job['id']
    assert job['status'] == 'queued'
    assert c.get(f'/v1/jobs/{job["id"]}',headers={'Authorization':f'Bearer {B}'}).status_code == 404
    assert run_once(app.state.factory)
    done = c.get(f'/v1/jobs/{job["id"]}').json()
    assert done['status'] == 'succeeded'
    assert done['result']['lesson_id'] == LESSON_ID
    assert done['mode'] == 'mock'
    job = c.post('/v1/jobs',json={'request_id':str(uuid4())}).json()
    assert c.post(f'/v1/jobs/{job["id"]}/cancel').json()['status'] == 'cancelled'
    assert not run_once(app.state.factory)
    assert c.post('/v1/jobs',json={'request_id':str(uuid4()),'kind':'transcribe_real_media'}).status_code == 422


def test_expired_job_lease_can_be_recovered(setup):
    c, app, _ = setup
    job = c.post('/v1/jobs',json={'request_id':str(uuid4())}).json()
    with app.state.factory() as db:
        db.execute(update(MediaJob).where(MediaJob.id==job['id']).values(status='running',lease_id=str(uuid4()),lease_until=time.time()-10,attempts=1))
        db.commit()
    assert run_once(app.state.factory)
    done = c.get(f'/v1/jobs/{job["id"]}').json()
    assert done['status'] == 'succeeded' and done['attempts'] == 2


def test_configuration_and_capabilities_are_honest(setup):
    c, _, _ = setup
    with pytest.raises(ValueError):Settings()
    with pytest.raises(ValueError):Settings(api_keys={'short':'alice'})
    with pytest.raises(ValueError):Settings(api_keys={A:'alice'},cors_origins=('*',))
    caps = c.get('/v1/capabilities').json()
    assert caps['transcription'] == 'not_configured'
    assert caps['supported_levels'] == ['A2']
    assert c.get('/openapi.json').status_code == 200
    r = c.options('/v1/lessons',headers={'Origin':'https://unknown.example','Access-Control-Request-Method':'GET'})
    assert 'access-control-allow-origin' not in r.headers
