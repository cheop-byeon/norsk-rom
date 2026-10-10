from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import JSON, Integer, String, Text, Float, ForeignKey, UniqueConstraint, create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


def now():
    return datetime.now(timezone.utc).isoformat()

class Base(DeclarativeBase):
    pass

class LessonSession(Base):
    __tablename__ = 'lesson_sessions'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner: Mapped[str] = mapped_column(String(200), index=True)
    lesson_id: Mapped[str] = mapped_column(String(100))
    revision: Mapped[int] = mapped_column(Integer, default=0)
    state: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[str] = mapped_column(String(40), default=now)
    updated_at: Mapped[str] = mapped_column(String(40), default=now)

class ActionReceipt(Base):
    __tablename__ = 'action_receipts'
    session_id: Mapped[str] = mapped_column(ForeignKey('lesson_sessions.id', ondelete='CASCADE'), primary_key=True)
    request_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict] = mapped_column(JSON)

class SavedPhrase(Base):
    __tablename__ = 'saved_phrases'
    owner: Mapped[str] = mapped_column(String(200), primary_key=True)
    phrase_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    created_at: Mapped[str] = mapped_column(String(40), default=now)

class MediaJob(Base):
    __tablename__ = 'media_jobs'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner: Mapped[str] = mapped_column(String(200), index=True)
    request_id: Mapped[str] = mapped_column(String(36))
    status: Mapped[str] = mapped_column(String(20), default='queued', index=True)
    payload: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    lease_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    lease_until: Mapped[float | None] = mapped_column(Float, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[str] = mapped_column(String(40), default=now)
    updated_at: Mapped[str] = mapped_column(String(40), default=now)
    __table_args__ = (UniqueConstraint('owner', 'request_id'),)


def database(url: str):
    parsed = make_url(url)
    if parsed.drivername.startswith('sqlite') and parsed.database and parsed.database != ':memory:':
        Path(parsed.database).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(url, connect_args={'check_same_thread': False, 'timeout': 15} if parsed.drivername.startswith('sqlite') else {}, pool_pre_ping=True)
    if parsed.drivername.startswith('sqlite'):
        @event.listens_for(engine, 'connect')
        def configure_sqlite(dbapi_connection, _):
            cursor = dbapi_connection.cursor()
            cursor.execute('PRAGMA journal_mode=WAL')
            cursor.execute('PRAGMA foreign_keys=ON')
            cursor.close()
    return engine, sessionmaker(engine, expire_on_commit=False)

class GeneratedLesson(Base):
    __tablename__ = 'generated_lessons'
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    owner: Mapped[str] = mapped_column(String(200), index=True)
    document: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[str] = mapped_column(String(40), default=now)
