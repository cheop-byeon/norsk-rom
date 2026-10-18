from contextlib import asynccontextmanager
import hmac
from typing import Annotated, Literal
from uuid import UUID, uuid4, uuid5, NAMESPACE_URL
import hashlib
import json
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Response, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from starlette.concurrency import run_in_threadpool
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, update, delete
from sqlalchemy.exc import IntegrityError
from .config import Settings
from .database import Base, LessonSession, SavedPhrase, SavedWord, MediaJob, GeneratedLesson, database, now
from .fixtures import LESSON, LESSON_ID, PHRASES, lesson_public
from .providers import MockConversation
from .live import OllamaConversation, LocalSpeech, ProviderFailure
from .pronunciation import compare_phrase
from .schemas import CreateSession, Mutation, Listening, Answers, Practice, Turn, CreateJob, SessionView, JobView, Synthesis, GenerateLesson, ImportURL, YouTubeTranscriptRequest, SaveWord, UpdateWord, SourceTranscript
from .service import Lessons, owned, view, recap
from .jobs import enqueue, job_owned, job_view
from .catalogue import get_lesson, public_lesson, find_phrase
from .generate import generate_lesson
from .imports import import_url, import_podimo_page, import_podcast_feed, extract_document
from .youtube_captions import CaptionUnavailable, fetch_youtube_captions


def word_view(row):
    return {key:getattr(row,key) for key in ('id','word','meaning','source_sentence','lesson_id','status','created_at','updated_at')}


def create_app(settings: Settings | None = None, conversation=None):
    settings = settings or Settings.from_env()
    engine, factory = database(settings.database_url)
    @asynccontextmanager
    async def lifespan(app):
        Base.metadata.create_all(engine)
        yield
        engine.dispose()
    app = FastAPI(title='Norsk rom API', version='0.2.0', lifespan=lifespan,
                  description='Connected A2 lesson with selectable local Ollama, NB-Whisper and Norwegian Piper speech providers.')
    app.state.factory = factory
    app.state.engine = engine
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_credentials=False,
                       allow_methods=['GET','POST','PUT','PATCH','DELETE'], allow_headers=['Authorization','Content-Type'])
    bearer = HTTPBearer(auto_error=False)
    def user(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
        if credentials and credentials.scheme.lower() == 'bearer' and len(credentials.credentials) <= 4096:
            for key, owner in settings.api_keys.items():
                if hmac.compare_digest(credentials.credentials.encode(), key.encode()):
                    return owner
        raise HTTPException(401, 'Valid bearer token required', headers={'WWW-Authenticate':'Bearer'})
    User = Annotated[str, Depends(user)]
    provider = conversation or (OllamaConversation(settings.ollama_model) if settings.conversation_mode=='ollama' else MockConversation())
    speech = LocalSpeech(settings.asr_path,settings.tts_path)
    service = Lessons(factory, provider)
    app.state.speech=speech
    api = APIRouter(prefix='/v1')

    @app.get('/health')
    def health():
        return {'status':'ok', 'version':'0.2.0'}

    @api.get('/capabilities')
    def capabilities(owner: User):
        return {'conversation':getattr(provider,'name','mock-cafe-v1'), **speech.capabilities(),
                'transcription_options':['local'], 'pronunciation':'transcript_comparison_hint', 'media_processing':'on_device_clips_up_to_90_seconds', 'exercise_generation':settings.ollama_model if settings.conversation_mode=='ollama' else 'not_configured', 'auth':'local_bearer_keys',
                'supported_levels':['A2'], 'generation_target_levels':['A1','A2','B1','B2','C1','C2'], 'persistence':'sqlalchemy', 'supabase_auth':'not_connected'}


    @api.get('/lessons')
    def lessons(owner: User):
        with factory() as db:
            rows=db.scalars(select(GeneratedLesson).where(GeneratedLesson.owner==owner).order_by(GeneratedLesson.created_at.desc()).limit(50))
            return {'items':[public_lesson(LESSON)]+[public_lesson(r.document) for r in rows]}

    @api.get('/lessons/{lesson_id}')
    def lesson(lesson_id: str, owner: User):
        with factory() as db:
            return public_lesson(get_lesson(db,owner,lesson_id))

    @api.get('/lessons/{lesson_id}/script')
    def script(lesson_id: str, owner: User):
        with factory() as db:
            doc=get_lesson(db,owner,lesson_id)
            return {'lesson_id':lesson_id,'lines':doc['lines'],
                    'playback_text':doc.get('playback_text',' '.join(l['text'] for l in doc['lines'])),
                    'mode':'generated' if doc.get('generated') else 'authored_fixture',
                    'source_audio':bool(doc.get('source_audio')),
                    'source_segments':doc.get('source_segments',[]),
                    'source_transcript_segments':doc.get('source_transcript_segments',[]),
                    'source_id':doc.get('source_id','')}

    @api.put('/lessons/{lesson_id}/source-transcript')
    def attach_source_transcript(lesson_id: str, body: SourceTranscript, owner: User):
        with factory() as db:
            row=db.get(GeneratedLesson,lesson_id)
            if not row or row.owner!=owner:raise HTTPException(404,'Generated lesson not found.')
            doc=dict(row.document)
            doc['source_transcript_segments']=[segment.model_dump() for segment in body.segments]
            row.document=doc
            db.commit()
        return {'lesson_id':lesson_id,'sentences_source_segments':len(body.segments)}

    @api.put('/lessons/{lesson_id}/source-audio')
    async def attach_source_audio(lesson_id: str, request: Request, owner: User):
        media_type=request.headers.get('content-type','').split(';',1)[0].strip().lower()
        if not (media_type.startswith('audio/') or media_type.startswith('video/')):
            raise HTTPException(415,'Choose an audio or video file.')
        data=bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data)>100*1024*1024:
                raise HTTPException(413,'Source media must be 100 MB or smaller.')
        if not data:raise HTTPException(422,'Send the original source file.')
        with factory() as db:
            row=db.get(GeneratedLesson,lesson_id)
            if not row or row.owner!=owner:raise HTTPException(404,'Generated lesson not found.')
            source_audio_id=str(uuid4())
            media_dir=Path(__file__).resolve().parents[1]/'.data'/'source_audio'
            media_dir.mkdir(parents=True,exist_ok=True)
            path=media_dir/(source_audio_id+'.media')
            path.write_bytes(data)
            try:path.chmod(0o600)
            except OSError:pass
            doc=dict(row.document)
            old_audio=doc.get('source_audio') or {}
            doc['source_audio']={'id':source_audio_id,'media_type':media_type}
            row.document=doc
            try:db.commit()
            except Exception:
                path.unlink(missing_ok=True)
                raise
            old_id=old_audio.get('id')
            if old_id and old_id!=source_audio_id and str(old_id).replace('-','').isalnum():
                (media_dir/(str(old_id)+'.media')).unlink(missing_ok=True)
        return {'lesson_id':lesson_id,'source_audio':True,'media_type':media_type}

    @api.get('/lessons/{lesson_id}/source-audio')
    def get_source_audio(lesson_id: str, owner: User):
        with factory() as db:
            row=db.get(GeneratedLesson,lesson_id)
            if not row or row.owner!=owner:raise HTTPException(404,'Generated lesson not found.')
            media=row.document.get('source_audio') or {}
            media_id=media.get('id','')
            if not isinstance(media_id,str) or not media_id.replace('-','').isalnum():
                raise HTTPException(404,'This lesson has no saved source audio.')
            path=Path(__file__).resolve().parents[1]/'.data'/'source_audio'/(media_id+'.media')
            if not path.is_file():raise HTTPException(404,'The saved source audio is unavailable.')
            media_type=media.get('media_type','audio/mpeg')
            if not (media_type.startswith('audio/') or media_type.startswith('video/')):
                media_type='application/octet-stream'
            return FileResponse(path,media_type=media_type,headers={'Cache-Control':'private, no-store'})

    @api.post('/studio/lessons',status_code=201)
    def generate(body: GenerateLesson, owner: User):
        if settings.conversation_mode!='ollama':
            raise HTTPException(503,'Configure a live conversation model before generating lessons.')
        lid=str(uuid5(NAMESPACE_URL,f'generated:{owner}:{body.request_id}'))
        fingerprint=hashlib.sha256(json.dumps(body.model_dump(mode='json',exclude={'request_id'}),sort_keys=True).encode()).hexdigest()
        with factory() as db:
            old=db.get(GeneratedLesson,lid)
            if old:
                if old.document.get('_fingerprint')!=fingerprint:raise HTTPException(409,'Request id already used for different content.')
                return public_lesson(old.document)
        doc=generate_lesson(body.text,body.level,body.source_kind,settings.ollama_model)
        doc['id']=lid
        if body.source_segments:
            doc['source_segments']=[segment.model_dump() for segment in body.source_segments]
        if body.source_id:doc['source_id']=body.source_id
        for i,p in enumerate(doc['phrases']):p['id']=f'{lid}:p{i+1}'
        doc['_fingerprint']=fingerprint
        with factory() as db:
            db.add(GeneratedLesson(id=lid,owner=owner,document=doc))
            try:db.commit()
            except IntegrityError:
                db.rollback()
                old=db.get(GeneratedLesson,lid)
                if not old or old.document.get('_fingerprint')!=fingerprint:raise HTTPException(409,'Conflicting generation request.')
                doc=old.document
        return public_lesson(doc)

    @api.post('/studio/import-url')
    def studio_import_url(body: ImportURL, owner: User):
        try:
            result=import_url(body.url)
        except ValueError as exc:
            raise HTTPException(422,str(exc))
        except Exception as exc:
            raise HTTPException(502,'Could not import that URL. It may require a sign-in, block downloads, or be temporarily unavailable.') from exc
        if result['kind']=='media':
            return Response(result['data'],media_type=result['media_type'],headers={
                'Cache-Control':'no-store','X-Norsk-Rom-Import-Kind':'media',
                'X-Norsk-Rom-Import-Title':result['title'][:180]})
        return {'kind':'text','title':result['title'],'text':result['text'],'url':result['url']}

    @api.post('/studio/podimo-page')
    def studio_import_podimo_page(body: ImportURL, owner: User):
        try:return import_podimo_page(body.url)
        except ValueError as exc:raise HTTPException(422,str(exc)) from exc
        except Exception as exc:raise HTTPException(502,'Could not import public text from that Podimo page.') from exc

    @api.post('/studio/podcast-feed')
    def studio_podcast_feed(body: ImportURL, owner: User):
        try:return import_podcast_feed(body.url)
        except ValueError as exc:raise HTTPException(422,str(exc)) from exc
        except Exception as exc:raise HTTPException(502,'Could not read that public podcast feed.') from exc

    @api.post('/studio/import-document')
    async def studio_import_document(request: Request, owner: User, filename: str = Query(...,min_length=1,max_length=200)):
        data=bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data)>25*1024*1024:raise HTTPException(413,'Choose a document smaller than 25 MB.')
        try:return extract_document(bytes(data),filename)
        except ValueError as exc:raise HTTPException(422,str(exc)) from exc
        except RuntimeError as exc:raise HTTPException(503,str(exc)) from exc

    @api.post('/studio/youtube-transcript')
    def studio_youtube_transcript(body: YouTubeTranscriptRequest, owner: User):
        if body.end <= body.start:
            raise HTTPException(422, 'Choose an end time after the start time.')
        try:
            return fetch_youtube_captions(body.video_id, body.start, body.end)
        except CaptionUnavailable as exc:
            raise HTTPException(422, str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(503, str(exc)) from exc

    @api.post('/sessions', response_model=SessionView, status_code=201)
    def create_session(body: CreateSession, owner: User):
        return service.create(owner, body)

    @api.get('/sessions', response_model=list[SessionView])
    def sessions(owner: User, limit: int = Query(default=20, ge=1, le=100), offset: int = Query(default=0, ge=0)):
        with factory() as db:
            rows = db.scalars(select(LessonSession).where(LessonSession.owner == owner).order_by(LessonSession.created_at.desc(),LessonSession.id).limit(limit).offset(offset))
            return [view(row) for row in rows]

    @api.get('/sessions/{session_id}', response_model=SessionView)
    def session(session_id: UUID, owner: User):
        with factory() as db:
            return view(owned(db, owner, session_id))

    @api.delete('/sessions/{session_id}', status_code=204)
    def delete_session(session_id: UUID, owner: User):
        with factory() as db:
            db.delete(owned(db, owner, session_id))
            db.commit()
        return Response(status_code=204)

    @api.post('/sessions/{session_id}/listening', response_model=SessionView)
    def listening(session_id: UUID, body: Listening, owner: User):
        return service.listen(owner, session_id, body)

    @api.post('/sessions/{session_id}/transcript-help', response_model=SessionView)
    def transcript_help(session_id: UUID, body: Mutation, owner: User):
        return service.transcript(owner, session_id, body)

    @api.post('/sessions/{session_id}/answers', response_model=SessionView)
    def answers(session_id: UUID, body: Answers, owner: User):
        return service.answers(owner, session_id, body)

    @api.post('/sessions/{session_id}/practice', response_model=SessionView)
    def practice(session_id: UUID, body: Practice, owner: User):
        return service.practice(owner, session_id, body)

    @api.post('/sessions/{session_id}/roleplay', response_model=SessionView)
    def roleplay(session_id: UUID, body: Mutation, owner: User):
        return service.start_roleplay(owner, session_id, body)

    @api.post('/sessions/{session_id}/roleplay/restart', response_model=SessionView)
    def restart_roleplay(session_id: UUID, body: Mutation, owner: User):
        return service.restart_roleplay(owner, session_id, body)

    @api.post('/sessions/{session_id}/turns', response_model=SessionView)
    def turn(session_id: UUID, body: Turn, owner: User):
        return service.turn(owner, session_id, body)

    @api.post('/sessions/{session_id}/complete', response_model=SessionView)
    def complete(session_id: UUID, body: Mutation, owner: User):
        return service.complete(owner, session_id, body)

    @api.get('/sessions/{session_id}/recap')
    def get_recap(session_id: UUID, owner: User):
        with factory() as db:
            row=owned(db,owner,session_id)
            return recap(row,get_lesson(db,owner,row.lesson_id))

    @api.get('/phrases')
    def phrases(owner: User):
        with factory() as db:
            rows = db.scalars(select(SavedPhrase).where(SavedPhrase.owner == owner).order_by(SavedPhrase.created_at))
            items=[]
            for row in rows:
                p,lid=find_phrase(db,owner,row.phrase_id)
                items.append(dict(p,saved_at=row.created_at,lesson_id=lid))
            return {'items':items}

    @api.put('/phrases/{phrase_id}')
    def save_phrase(phrase_id: str, owner: User):
        with factory() as db:
            phrase,_=find_phrase(db,owner,phrase_id)
            if db.get(SavedPhrase, (owner, phrase_id)) is None:
                db.add(SavedPhrase(owner=owner, phrase_id=phrase_id))
                try:
                    db.commit()
                except IntegrityError:
                    db.rollback()  # Concurrent save is already the intended result.
        return {'phrase':phrase, 'saved':True}

    @api.delete('/phrases/{phrase_id}', status_code=204)
    def delete_phrase(phrase_id: str, owner: User):
        with factory() as db:
            db.execute(delete(SavedPhrase).where(SavedPhrase.owner == owner, SavedPhrase.phrase_id == phrase_id))
            db.commit()
        return Response(status_code=204)

    @api.get('/vocabulary')
    def vocabulary(owner: User, status: Literal['learning','known'] | None = None):
        with factory() as db:
            query=select(SavedWord).where(SavedWord.owner==owner)
            if status:query=query.where(SavedWord.status==status)
            rows=db.scalars(query.order_by(SavedWord.updated_at.desc()))
            return {'items':[word_view(row) for row in rows]}

    @api.post('/vocabulary', status_code=201)
    def save_word(body: SaveWord, owner: User):
        normalized=' '.join(body.word.casefold().split())
        if not normalized or not any(char.isalpha() for char in normalized):
            raise HTTPException(422,'Enter a word or expression to save.')
        with factory() as db:
            row=db.scalar(select(SavedWord).where(SavedWord.owner==owner,
                SavedWord.normalized_word==normalized,SavedWord.source_sentence==body.source_sentence))
            if row is None:
                row=SavedWord(id=str(uuid5(NAMESPACE_URL,f'word:{owner}:{normalized}:{body.source_sentence}')),
                    owner=owner,word=body.word,normalized_word=normalized,meaning=body.meaning,
                    source_sentence=body.source_sentence,lesson_id=body.lesson_id,status='learning')
                db.add(row)
            else:
                if body.meaning:row.meaning=body.meaning
                if body.lesson_id:row.lesson_id=body.lesson_id
                row.updated_at=now()
            db.commit();db.refresh(row)
            return {'word':word_view(row),'saved':True}

    @api.patch('/vocabulary/{word_id}')
    def update_word(word_id: UUID, body: UpdateWord, owner: User):
        with factory() as db:
            row=db.scalar(select(SavedWord).where(SavedWord.id==str(word_id),SavedWord.owner==owner))
            if row is None:raise HTTPException(404,'Saved word not found.')
            changes=body.model_dump(exclude_unset=True)
            if any(value is None for value in changes.values()):raise HTTPException(422,'Word updates cannot be null.')
            for key,value in changes.items():setattr(row,key,value)
            row.updated_at=now();db.commit();db.refresh(row)
            return {'word':word_view(row)}

    @api.delete('/vocabulary/{word_id}',status_code=204)
    def delete_word(word_id: UUID, owner: User):
        with factory() as db:
            db.execute(delete(SavedWord).where(SavedWord.id==str(word_id),SavedWord.owner==owner));db.commit()
        return Response(status_code=204)

    @api.post('/jobs', response_model=JobView, status_code=202)
    def create_job(body: CreateJob, owner: User):
        return enqueue(factory, owner, body)

    @api.get('/jobs/{job_id}', response_model=JobView)
    def get_job(job_id: UUID, owner: User):
        with factory() as db:
            return job_view(job_owned(db, owner, job_id))

    @api.post('/jobs/{job_id}/cancel', response_model=JobView)
    def cancel_job(job_id: UUID, owner: User):
        with factory() as db:
            job_owned(db, owner, job_id)
            db.execute(update(MediaJob).where(MediaJob.id == str(job_id), MediaJob.owner == owner,
                                              MediaJob.status.in_(['queued','running']))
                       .values(status='cancelled', lease_id=None, lease_until=None, updated_at=now()))
            db.commit()
            db.expire_all()
            return job_view(job_owned(db, owner, job_id))

    @app.exception_handler(ProviderFailure)
    async def provider_error(request: Request, exc: ProviderFailure):
        return JSONResponse(status_code=503,content={'detail':str(exc)})

    @api.post('/speech/synthesize')
    def synthesize(body: Synthesis, owner: User):
        audio = speech.synthesize(body.text)
        return Response(audio,media_type='audio/wav',headers={'Cache-Control':'no-store','X-Speech-Provider':settings.tts_provider})

    @api.post('/speech/transcribe')
    async def transcribe(request: Request, owner: User, provider: Literal['local'] = 'local', start: float = Query(default=0,ge=0,le=3600), end: float | None = Query(default=None,gt=0,le=3690)):
        if end is not None and not 0.25<=end-start<=90:
            raise HTTPException(422,"Select a clip between 0.25 and 90 seconds.")
        data=bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data)>50*1024*1024:
                raise HTTPException(413,'Audio must be smaller than 50 MB; select a shorter recording.')
        if not data:
            raise HTTPException(422,'Send audio bytes in the request body.')
        try:
            return await run_in_threadpool(speech.transcribe,bytes(data),start,end)
        except ValueError as exc:
            raise HTTPException(422,str(exc))

    @api.post('/speech/pronunciation-check')
    async def pronunciation_check(request: Request, owner: User, target: str = Query(...,min_length=1,max_length=200), provider: Literal['local'] = 'local'):
        """Offer a transcript comparison hint for a learner rehearsing a phrase."""
        data=bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data)>12*1024*1024:raise HTTPException(413,'Practice audio must be smaller than 12 MB.')
        if not data:raise HTTPException(422,'Record the phrase before checking it.')
        try:
            transcribed=await run_in_threadpool(speech.transcribe,bytes(data),0,None)
            if not isinstance(transcribed,dict):raise ValueError('Speech recognizer returned an invalid result.')
            return compare_phrase(target,transcribed.get('text',''))
        except ValueError as exc:raise HTTPException(422,str(exc))

    # Explicit public asset allowlist: never expose backend files, keys or databases.
    frontend=Path(__file__).resolve().parents[2]
    @app.get('/',include_in_schema=False)
    def home():
        return RedirectResponse('/app/')

    @app.get('/app/',include_in_schema=False)
    def connected_app():
        return FileResponse(frontend/'connected.html',headers={'Cache-Control':'no-store'})

    @app.get('/app/assets/{filename}',include_in_schema=False)
    def frontend_image(filename: str):
        if filename not in {'norsk-rom-fox.png'}:
            raise HTTPException(404,'Not found')
        return FileResponse(frontend/'assets'/filename,headers={'Cache-Control':'no-store'})

    @app.get('/app/{filename}',include_in_schema=False)
    def asset(filename: str):
        if filename not in {'connected.js','api-client.js','connected.css','reader.js'}:
            raise HTTPException(404,'Not found')
        return FileResponse(frontend/filename,headers={'Cache-Control':'no-store'})

    app.include_router(api)
    return app
