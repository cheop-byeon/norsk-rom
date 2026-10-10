"""Exercise the running API without displaying credentials or requiring live AI."""
import argparse
import json
import os
from pathlib import Path
from uuid import uuid4
import httpx


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    args = parser.parse_args()
    key = os.environ.get('NORSK_DEMO_TOKEN')
    if not key:
        config = json.loads((Path(__file__).resolve().parent / '.local-config.json').read_text())
        key = next(iter(config['api_keys']))
    with httpx.Client(base_url=args.url, headers={'Authorization':f'Bearer {key}'}, timeout=15) as client:
        def checked(r):
            r.raise_for_status()
            return r.json()
        lesson = checked(client.get('/v1/lessons'))['items'][0]
        session = checked(client.post('/v1/sessions',json={'request_id':str(uuid4()),'lesson_id':lesson['id']}))
        def act(route, **body):
            nonlocal session
            session = checked(client.post(f'/v1/sessions/{session["id"]}/{route}',json={
                'request_id':str(uuid4()), 'revision':session['revision'], **body}))
        act('listening',mode='mock_skip')
        act('answers',answers={'q1':1,'q2':2})
        act('practice',phrase_id='p1',practised=True)
        act('roleplay')
        act('turns',text='Jeg vil gjerne har en kaffe med havremelk.',input_mode='simulated_voice')
        assert session['state']['last_correction'] is not None
        for phrase in lesson['phrases']:
            act('turns',text=phrase['text'])
        act('complete')
        summary = checked(client.get(f'/v1/sessions/{session["id"]}/recap'))
        print(json.dumps(summary,ensure_ascii=False,indent=2))
        # This walkthrough keeps its sample session so it can be inspected in /docs.

if __name__ == '__main__':
    main()
