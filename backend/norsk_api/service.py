from copy import deepcopy
import hashlib
import json
from uuid import uuid5, NAMESPACE_URL
from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from .database import LessonSession, ActionReceipt, now
from .fixtures import LESSON, LESSON_ID, PHRASES, initial_state
from .schemas import Mutation
from .catalogue import get_lesson


def view(row):
    return {'id': row.id, 'lesson_id': row.lesson_id, 'revision': row.revision,
            'created_at': row.created_at, 'updated_at': row.updated_at,
            'state': row.state, 'provider_mode': row.state.get('provider_mode','mock')}

def owned(db, owner, session_id):
    row = db.scalar(select(LessonSession).where(LessonSession.id == str(session_id), LessonSession.owner == owner))
    if row is None:
        raise HTTPException(404, 'Session not found')
    return row

def require(condition, message):
    if not condition:
        raise HTTPException(409, message)

class Lessons:
    def __init__(self, factory, conversation):
        self.factory = factory
        self.conversation = conversation

    def create(self, owner, body):
        sid = str(uuid5(NAMESPACE_URL, f'norsk:{owner}:{body.request_id}'))
        with self.factory() as db:
            get_lesson(db,owner,body.lesson_id)
            existing = db.get(LessonSession, sid)
            if existing:
                require(existing.lesson_id==body.lesson_id,'request_id already used for another lesson')
                return view(existing)
            state=initial_state()
            state['provider_mode']=getattr(self.conversation,'name','mock')
            row = LessonSession(id=sid, owner=owner, lesson_id=body.lesson_id, state=state)
            db.add(row)
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                return view(owned(db, owner, sid))
            return view(row)

    def mutate(self, owner, sid, body: Mutation, action, apply, allow_completed=False):
        payload = body.model_dump(mode='json', exclude={'revision','request_id'})
        fingerprint = hashlib.sha256(json.dumps({'action': action, 'payload': payload}, sort_keys=True).encode()).hexdigest()
        rid = str(body.request_id)
        with self.factory() as db:
            row = owned(db, owner, sid)
            old = db.get(ActionReceipt, (row.id, rid))
            if old:
                require(old.fingerprint == fingerprint, 'request_id was already used for a different action or payload')
                return old.response
            require(row.revision == body.revision, 'Revision conflict. Fetch the current session and retry with its revision.')
            require(allow_completed or not row.state['completed'], 'Session is complete. Start a new session to practise again.')
            require(row.state['action_count'] < 250, 'Session action limit reached. Start a new session.')
            state = deepcopy(row.state)
            doc=get_lesson(db,owner,row.lesson_id)
            apply(state,doc)
            state['provider_mode']=getattr(self.conversation,'name','mock')
            state['action_count'] += 1
            stamp = now()
            response = {'id': row.id, 'lesson_id': row.lesson_id, 'revision': row.revision + 1,
                        'created_at': row.created_at, 'updated_at': stamp,
                        'state': deepcopy(state), 'provider_mode': state['provider_mode']}
            count = db.execute(update(LessonSession).where(LessonSession.id == row.id, LessonSession.revision == body.revision)
                               .values(state=state, revision=body.revision + 1, updated_at=stamp)).rowcount
            require(count == 1, 'Concurrent update. Fetch the current session and retry.')
            db.add(ActionReceipt(session_id=row.id, request_id=rid, fingerprint=fingerprint, response=deepcopy(response)))
            db.commit()
            return response

    def listen(self, owner, sid, body):
        def apply(s,doc):
            require(s['step'] == 'listen', 'Listening is already acknowledged.')
            s['listening_mode'] = body.mode
            s['step'] = 'answer'
        return self.mutate(owner, sid, body, 'listen', apply)

    def transcript(self, owner, sid, body):
        def apply(s,doc):
            s['transcript_help'] = True
        return self.mutate(owner, sid, body, 'transcript', apply)

    def answers(self, owner, sid, body):
        def apply(s,doc):
            expected={q['id'] for q in doc['questions']}
            if set(body.answers)!=expected or any(body.answers[q['id']]>=len(q['options']) for q in doc['questions']):
                raise HTTPException(422,'Supply all question ids with valid zero-based option indexes.')
            require(s['step'] == 'answer', 'Listen first; answers can be submitted once per session.')
            review = []
            for q in doc['questions']:
                review.append({'question_id': q['id'], 'selected': body.answers[q['id']], 'correct': q['answer'],
                               'is_correct': body.answers[q['id']] == q['answer'], 'explanation': q['explanation'],
                               'evidence': [line for line in doc['lines'] if line['id'] in q['evidence']]})
            s['answers'] = body.answers
            s['review'] = review
            s['step'] = 'review'
        return self.mutate(owner, sid, body, 'answers', apply)

    def practice(self, owner, sid, body):
        def apply(s,doc):
            if body.phrase_id not in {p['id'] for p in doc['phrases']}:
                raise HTTPException(422,'Phrase does not belong to this lesson.')
            require(s['step'] in ('review','practise'), 'Review the quiz before practising expressions.')
            s['practised'] = sorted((set(s['practised']) | {body.phrase_id}) if body.practised else (set(s['practised']) - {body.phrase_id}))
            s['step'] = 'practise'
        return self.mutate(owner, sid, body, 'practice', apply)

    def start_roleplay(self, owner, sid, body):
        def apply(s,doc):
            require(s['step'] in ('review','practise'), 'Complete the quiz before starting role-play.')
            s['roleplay_started'] = True
            s['opening'] = doc['opening']
            s['step'] = 'roleplay'
        return self.mutate(owner, sid, body, 'start_roleplay', apply)

    def restart_roleplay(self, owner, sid, body):
        def apply(s,doc):
            require(s['roleplay_started'] and s['completed'], 'Finish the current role-play before starting a fresh one.')
            archives=s.setdefault('archived_roleplays',[])
            archives.append({'opening':s.get('opening',''),'turns':deepcopy(s.get('turns',[])),
                             'last_correction':deepcopy(s.get('last_correction')),'archived_at':now()})
            s['archived_roleplays']=archives[-10:]
            s['turns']=[]
            s['last_correction']=None
            s['opening']=doc['opening']
            s['completed']=False
            s['step']='roleplay'
        return self.mutate(owner,sid,body,'restart_roleplay',apply,allow_completed=True)

    def turn(self, owner, sid, body):
        def apply(s,doc):
            require(s['step'] == 'roleplay', 'Start role-play before submitting a turn.')
            require(len(s['turns']) < 50, 'Turn limit reached. Complete the lesson and start a new session.')
            result = self.conversation.reply(body.text, s['turns'], doc)
            s['turns'].append({'id': str(body.request_id), 'learner_text': body.text, 'input_mode': body.input_mode,
                               'result': result.model_dump(), 'created_at': now()})
            s['last_correction'] = result.correction.model_dump() if result.correction else None
            s['used'] = sorted(set(s['used']) | set(result.matched_phrases))
        return self.mutate(owner, sid, body, 'turn', apply)

    def complete(self, owner, sid, body):
        def apply(s,doc):
            require(s['step'] == 'roleplay' and bool(s['turns']), 'Submit at least one role-play turn before completing.')
            s['completed'] = True
            s['step'] = 'recap'
        return self.mutate(owner, sid, body, 'complete', apply)


def recap(row,doc=LESSON):
    s = row.state
    return {'session_id': row.id, 'completed': s['completed'], 'quiz_correct': sum(q['is_correct'] for q in s['review'] or []),
            'quiz_total': len(doc['questions']), 'quiz_submitted': s['answers'] is not None,
            'listening_mode': s['listening_mode'], 'transcript_help': s['transcript_help'],
            'self_reported_practised': s['practised'], 'literal_phrase_matches': s['used'],
            'turn_count': len(s['turns']), 'pronunciation': 'not_assessed', 'proficiency_score': None,
            'next_phrases': [p for p in doc['phrases'] if p['id'] not in s['used']],
            'disclosure': 'Authored lesson. Conversation provider: '+s.get('provider_mode','mock')+'. No acoustic or proficiency assessment.'}
