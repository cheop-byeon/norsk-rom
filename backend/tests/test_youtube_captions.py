from types import SimpleNamespace
import sys

import pytest

from norsk_api.youtube_captions import CaptionUnavailable, fetch_youtube_captions


def test_fetch_filters_captions_to_selected_clip(monkeypatch):
    # FetchedTranscript is iterable; define it as an explicit list-like test double.
    class FakeTranscript:
        language_code = 'no'
        is_generated = True

        def __iter__(self):
            return iter([
                SimpleNamespace(text='utenfor før', start=0, duration=4),
                SimpleNamespace(text=' Dette  er norsk. ', start=10, duration=2),
                SimpleNamespace(text='Enda en setning her.', start=11, duration=2),
                SimpleNamespace(text='utenfor etter', start=30, duration=4),
            ])

    class FakeApi:
        def fetch(self, video_id, languages):
            assert languages == ['no', 'nb', 'nn']
            return FakeTranscript()

    monkeypatch.setitem(sys.modules, 'youtube_transcript_api', SimpleNamespace(YouTubeTranscriptApi=FakeApi))
    result = fetch_youtube_captions('S9Dove6pCc0', 10, 13)
    assert result == {'text':'Dette er norsk. Enda en setning her.','language':'no','is_generated':True,
        'segments':[{'start':10,'end':12.0,'text':'Dette er norsk.','timestamp_quality':'caption'},
                    {'start':11,'end':13,'text':'Enda en setning her.','timestamp_quality':'caption'}]}


@pytest.mark.parametrize(('video_id','start','end'), [
    ('not-an-id', 0, 10), ('S9Dove6pCc0', 4, 4), ('S9Dove6pCc0', 0, 91),
])
def test_rejects_invalid_or_oversized_clip(video_id, start, end):
    with pytest.raises(CaptionUnavailable):
        fetch_youtube_captions(video_id, start, end)
