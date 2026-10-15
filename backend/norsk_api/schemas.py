from typing import Annotated, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]

class Input(BaseModel):
    model_config = ConfigDict(extra='forbid')

class CreateSession(Input):
    lesson_id: Annotated[str,StringConstraints(min_length=1,max_length=100)] = 'cafe-oatmilk-a2'
    request_id: UUID

class Mutation(Input):
    request_id: UUID
    revision: int = Field(ge=0, strict=True)

class Listening(Mutation):
    mode: Literal['played_self_reported', 'mock_skip']

class Answers(Mutation):
    answers: dict[str, Annotated[int, Field(ge=0, strict=True)]] = Field(min_length=1, max_length=20)

class Practice(Mutation):
    phrase_id: Annotated[str,StringConstraints(min_length=1,max_length=100)]
    practised: bool = Field(strict=True)

class Turn(Mutation):
    text: Text
    input_mode: Literal['typed','simulated_voice','confirmed_transcript'] = 'typed'

class CreateJob(Input):
    request_id: UUID
    kind: Literal['prepare_demo_lesson'] = 'prepare_demo_lesson'
    source_id: Literal['cafe-oatmilk-a2'] = 'cafe-oatmilk-a2'

class Correction(BaseModel):
    original: str
    suggestion: str
    explanation: str
    kind: Literal['grammar_fixture','grammar_suggestion'] = 'grammar_fixture'

class ConversationResult(BaseModel):
    partner_text: str
    correction: Correction | None = None
    matched_phrases: list[str] = Field(default_factory=list)
    provider: str = 'mock-cafe-v1'
    pronunciation: Literal['not_assessed'] = 'not_assessed'

class SessionView(BaseModel):
    id: str
    lesson_id: str
    revision: int
    created_at: str
    updated_at: str
    state: dict
    provider_mode: str = 'mock'

class JobView(BaseModel):
    id: str
    status: str
    kind: str
    mode: Literal['mock'] = 'mock'
    attempts: int
    result: dict | None
    error: str | None
    created_at: str
    updated_at: str

class Synthesis(Input):
    voice: Literal["female","male"] = "female"
    pace: Literal["slow","normal","fast"] = "slow"
    text: Annotated[str, StringConstraints(strip_whitespace=True,min_length=1,max_length=4000)]

class SourceSegment(Input):
    start: float = Field(ge=0, le=1800)
    end: float = Field(gt=0, le=1800)
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1200)]
    timestamp_quality: Literal['caption','hosted_asr','local_chunk','unknown'] = 'unknown'

    @model_validator(mode='after')
    def valid_range(self):
        if self.end <= self.start:
            raise ValueError('Source segment end must be after its start.')
        return self

class SourceTranscript(Input):
    segments: list[SourceSegment] = Field(min_length=1, max_length=300)

class GenerateLesson(Input):
    text: Annotated[str,StringConstraints(strip_whitespace=True,min_length=30,max_length=4000)]
    level: Literal['A1','A2','B1','B2','C1','C2'] = 'A2'
    source_kind: Literal['text','audio transcript'] = 'text'
    request_id: UUID
    source_segments: list[SourceSegment] = Field(default_factory=list, max_length=300)
    source_id: Annotated[str, StringConstraints(max_length=100)] = ''

class SaveWord(Input):
    word: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    meaning: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] = ''
    source_sentence: Annotated[str, StringConstraints(strip_whitespace=True, max_length=600)] = ''
    lesson_id: Annotated[str, StringConstraints(max_length=100)] = ''

class UpdateWord(Input):
    meaning: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None = None
    status: Literal['learning','known'] | None = None

class ImportURL(Input):
    url: Annotated[str, StringConstraints(strip_whitespace=True, min_length=8, max_length=2048)]

class YouTubeTranscriptRequest(Input):
    video_id: Annotated[str, StringConstraints(pattern=r'^[A-Za-z0-9_-]{11}$')]
    start: float = Field(ge=0, le=86400)
    end: float = Field(gt=0, le=86400)
