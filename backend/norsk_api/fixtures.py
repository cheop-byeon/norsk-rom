"""Authored A2 fixture, exported from the existing frontend (never live publisher media)."""
import json
from pathlib import Path

LESSON = json.loads(Path(__file__).with_name('cafe_lesson.json').read_text())
LESSON_ID = LESSON['id']
PHRASES = {p['id']: p for p in LESSON['phrases']}

def lesson_public():
    return {
        'id': LESSON_ID, 'title': LESSON['title'], 'level': 'A2',
        'source': {'title': LESSON['source'], 'kind': LESSON['kind'], 'clip_id': 'cafe-ordering',
                   'range_label': LESSON['sourceRange'], 'timing_is_illustrative': True, 'audio_url': None},
        'questions': [{k: q[k] for k in ('id', 'prompt', 'options')} for q in LESSON['questions']],
        'phrases': LESSON['phrases'], 'steps': ['listen','answer','review','practise','roleplay','recap'],
        'mode': 'mock', 'audio': 'Use device TTS with the script endpoint; no recorded audio is supplied.'}

def initial_state():
    return {'step': 'listen', 'listening_mode': None, 'transcript_help': False,
            'answers': None, 'review': None, 'practised': [], 'used': [], 'turns': [],
            'roleplay_started': False, 'completed': False, 'last_correction': None,
            'action_count': 0}
