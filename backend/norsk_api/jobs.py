"""Durable local/PostgreSQL demo-job queue with leases and cancellation.

Only fixture preparation is implemented. Never masquerades as media transcription.
"""
import time
from uuid import uuid4
from sqlalchemy import select, update, or_, and_
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from .database import MediaJob, now
from .fixtures import LESSON_ID


def job_view(job):
    return {'id': job.id, 'status': job.status, 'kind': job.payload['kind'], 'mode': 'mock',
            'attempts': job.attempts, 'result': job.result, 'error': job.error,
            'created_at': job.created_at, 'updated_at': job.updated_at}

def job_owned(db, owner, jid):
    job = db.scalar(select(MediaJob).where(MediaJob.id == str(jid), MediaJob.owner == owner))
    if not job:
        raise HTTPException(404, 'Job not found')
    return job

def enqueue(factory, owner, body):
    payload = body.model_dump(mode='json', exclude={'request_id'})
    with factory() as db:
        existing = db.scalar(select(MediaJob).where(MediaJob.owner == owner, MediaJob.request_id == str(body.request_id)))
        if existing:
            if existing.payload != payload:
                raise HTTPException(409, 'request_id already used with different payload')
            return job_view(existing)
        job = MediaJob(id=str(uuid4()), owner=owner, request_id=str(body.request_id), payload=payload)
        db.add(job)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            existing = db.scalar(select(MediaJob).where(MediaJob.owner == owner, MediaJob.request_id == str(body.request_id)))
            if existing is None or existing.payload != payload:
                raise HTTPException(409, 'Concurrent conflicting job request')
            return job_view(existing)
        return job_view(job)

def run_once(factory):
    clock = time.time()
    eligible = or_(MediaJob.status == 'queued', and_(MediaJob.status == 'running', MediaJob.lease_until < clock))
    token = str(uuid4())
    with factory() as db:
        job = db.scalar(select(MediaJob).where(eligible).order_by(MediaJob.created_at).limit(1))
        if job is None:
            return False
        jid = job.id
        count = db.execute(update(MediaJob).where(MediaJob.id == jid, eligible).values(
            status='running', lease_id=token, lease_until=clock+60, attempts=MediaJob.attempts+1, updated_at=now())).rowcount
        db.commit()
        if count != 1:
            return False
    try:
        # No URL fetch, upload processing, or inference is performed by this provider.
        result = {'lesson_id': LESSON_ID, 'clip_id': 'cafe-ordering', 'provider': 'authored-fixture-v1',
                  'disclosure': 'Prepared an existing demo lesson. No real media was processed.'}
        values = dict(status='succeeded', result=result, error=None)
    except Exception:
        values = dict(status='failed', error='Demo preparation failed; retry with a new job request.')
    with factory() as db:
        db.execute(update(MediaJob).where(MediaJob.id == jid, MediaJob.status == 'running', MediaJob.lease_id == token)
                   .values(**values, lease_id=None, lease_until=None, updated_at=now()))
        db.commit()
    return True
