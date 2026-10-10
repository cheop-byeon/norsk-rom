from copy import deepcopy
from fastapi import HTTPException
from sqlalchemy import select
from .database import GeneratedLesson
from .fixtures import LESSON, LESSON_ID


def get_lesson(db, owner, lesson_id):
    if lesson_id==LESSON_ID:return deepcopy(LESSON)
    row=db.scalar(select(GeneratedLesson).where(GeneratedLesson.id==lesson_id,GeneratedLesson.owner==owner))
    if not row:raise HTTPException(404,'Lesson not found')
    return deepcopy(row.document)


def public_lesson(doc):
    return {'id':doc['id'],'title':doc['title'],'level':doc['level'],
            'source':{'title':doc['source'],'kind':doc['kind'],'clip_id':doc['id'],
                      'range_label':doc['sourceRange'],'timing_is_illustrative':doc.get('generated',False) is False,'audio_url':None},
            'questions':[{k:q[k] for k in ('id','prompt','options')} for q in doc['questions']],
            'phrases':doc['phrases'],'steps':['listen','answer','review','practise','roleplay','recap'],
            'mode':'generated' if doc.get('generated') else 'authored',
            'roleplay_context':doc.get('roleplay_context','Order coffee with oat milk and choose takeaway.'),
            'audio':'Original imported audio stays in the browser. Backend replay synthesizes the confirmed transcript.'}


def find_phrase(db,owner,pid):
    if pid in ('p1','p2'):return next(p for p in LESSON['phrases'] if p['id']==pid),LESSON_ID
    if ':' not in pid:raise HTTPException(404,'Phrase not found')
    doc=get_lesson(db,owner,pid.split(':')[0])
    for p in doc['phrases']:
        if p['id']==pid:return p,doc['id']
    raise HTTPException(404,'Phrase not found')
