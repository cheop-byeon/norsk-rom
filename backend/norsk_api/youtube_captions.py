"""Best-effort retrieval of public Norwegian YouTube captions."""
import re

VIDEO_ID = re.compile(r'^[A-Za-z0-9_-]{11}$')


class CaptionUnavailable(ValueError):
    pass


def fetch_youtube_captions(video_id: str, start: float, end: float) -> dict:
    if not VIDEO_ID.fullmatch(video_id):
        raise CaptionUnavailable('Enter a valid YouTube video ID.')
    if end <= start:
        raise CaptionUnavailable('Choose an end time after the start time.')
    if end - start > 90:
        raise CaptionUnavailable('Choose a clip no longer than 90 seconds.')

    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError as exc:
        raise RuntimeError('Automatic captions are not installed on this backend. Install the YouTube captions extra and restart Norsk Rom.') from exc

    try:
        transcript = YouTubeTranscriptApi().fetch(video_id, languages=['no', 'nb', 'nn'])
    except Exception as exc:
        kind = type(exc).__name__
        if kind in {'TranscriptsDisabled', 'NoTranscriptFound'}:
            raise CaptionUnavailable('No Norwegian captions are available for this video. You can still paste captions manually.') from exc
        if kind in {'RequestBlocked', 'IpBlocked', 'PoTokenRequired'}:
            raise CaptionUnavailable('YouTube blocked automatic caption retrieval for this request. You can still paste captions manually.') from exc
        if kind in {'VideoUnavailable', 'AgeRestricted'}:
            raise CaptionUnavailable('This video is unavailable to the caption service. You can still paste captions manually.') from exc
        raise RuntimeError('YouTube captions could not be retrieved right now. You can still paste captions manually.') from exc

    parts = [
        ' '.join(line.text.split())
        for line in transcript
        if line.start < end and line.start + line.duration > start and line.text.strip()
    ]
    text = ' '.join(parts)[:4000].strip()
    if len(text) < 30:
        raise CaptionUnavailable('No usable Norwegian captions were found in this clip. Choose another segment or paste captions manually.')
    return {
        'text': text,
        'language': getattr(transcript, 'language_code', 'unknown'),
        'is_generated': bool(getattr(transcript, 'is_generated', False)),
    }
