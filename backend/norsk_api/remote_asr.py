"""Optional NB-Whisper hosted demo; never silently uploads on local mode."""
import io
import re
import tempfile
from html import unescape
from pathlib import Path
from .live import ProviderFailure

SPACE='https://nbailab-nb-whisper-demo.hf.space'


def selected_wav(data,start,end,max_duration=90):
    import av
    import numpy as np
    import wave
    lower=int(start*16000);upper=int(end*16000) if end is not None else lower+max_duration*16000
    if upper-lower>max_duration*16000:raise ValueError(f'Selected audio exceeds {max_duration // 60} minutes.')
    position=0;parts=[]
    with av.open(io.BytesIO(data)) as container:
        resampler=av.AudioResampler(format='s16',layout='mono',rate=16000)
        for frame in container.decode(audio=0):
            done=False
            for converted in resampler.resample(frame):
                samples=converted.to_ndarray().reshape(-1)
                lo=max(0,lower-position);hi=min(len(samples),upper-position)
                if hi>lo:parts.append(samples[lo:hi])
                position+=len(samples)
                if position>=upper:
                    if end is None:raise ValueError('Use an audio clip shorter than 90 seconds.')
                    done=True;break
            if done:break
    if not parts:raise ValueError('No audio in the selected range.')
    samples=np.concatenate(parts)
    if len(samples)<4000:raise ValueError('Audio must be at least 0.25 seconds.')
    output=io.BytesIO()
    with wave.open(output,'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(samples.astype('<i2').tobytes())
    return output.getvalue()


def _transcript_html(result):
    if not isinstance(result,(list,tuple)) or len(result)!=3 or not isinstance(result[1],str):
        raise ValueError('Unexpected transcription response')
    # The demo appends its attribution outside the transcript.
    text=re.sub(r'<i>Transkribert med NB-Whisper demo</i>\s*$','',result[1])
    return text


def plain_transcript(result,max_chars=20000):
    text=_transcript_html(result)
    text=re.sub(r'<br\s*/?>','\n',text,flags=re.I)
    text=unescape(re.sub(r'<[^>]*>','',text)).strip()
    if not text or len(text)>max_chars:raise ValueError('Empty or oversized transcript')
    return text


def timestamped_segments(result,offset=0):
    """Extract the demo's timestamped HTML lines into source-relative text segments."""
    html=_transcript_html(result)
    html=re.sub(r'<br\s*/?>','\n',html,flags=re.I)
    segments=[]
    for line in html.splitlines():
        line=unescape(re.sub(r'<[^>]*>','',line)).strip()
        match=re.match(r'^\[(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)\s*(?:-->|->|–>|-)\s*(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)\]\s*(.*)$',line)
        if not match:continue
        def seconds(value):
            h,m,s=value.split(':');return int(h)*3600+int(m)*60+float(s)
        start,end=seconds(match.group(1)),seconds(match.group(2));text=match.group(3).strip()
        if end>start and text:segments.append({'start':round(offset+start,2),'end':round(offset+end,2),'text':text})
    return segments


def group_practice_clips(segments,max_seconds=90,max_chars=3500):
    clips=[];current=[];first=last=None;length=0
    for segment in segments:
        text=segment['text']
        if current and (segment['end']-first>max_seconds or length+len(text)+1>max_chars):
            clips.append({'start':first,'end':last,'text':' '.join(current)});current=[];first=None;length=0
        if first is None:first=segment['start']
        current.append(text);last=segment['end'];length+=len(text)+1
    if current:clips.append({'start':first,'end':last,'text':' '.join(current)})
    return clips


def transcribe_remote(data,start=0,end=None,*,timestamps=False,max_duration=90):
    # Decode locally to mono 16 kHz WAV. Hosted mode uploads only the selected
    # interval; the long-recording endpoint opts into a bounded 30-minute range.
    try:audio=selected_wav(data,start,end,max_duration=max_duration)
    except Exception as exc:
        limit=f'{max_duration // 60} minute' if max_duration>=60 else f'{max_duration} second'
        raise ValueError(f'Could not decode the selected audio. Use a valid 0.25 second to {limit} clip.') from exc
    job=None
    try:
        from gradio_client import Client, handle_file
        client=Client(SPACE,verbose=False,download_files=False,httpx_kwargs={'timeout':30})
        info=client.view_api(return_format='dict',print_info=False)
        endpoints=info.get('named_endpoints',{})
        candidates=[name for name,meta in endpoints.items() if [p.get('parameter_name') for p in meta.get('parameters',[])]==['file','return_timestamps','lang_nn']]
        if len(candidates)!=1:raise ValueError('Demo API contract changed')
        with tempfile.TemporaryDirectory(prefix='norsk-asr-') as folder:
            path=Path(folder)/'clip.wav';path.write_bytes(audio)
            job=client.submit(handle_file(str(path)),timestamps,False,api_name=candidates[0])
            result=job.result(timeout=540)
            text=plain_transcript(result,max_chars=100000 if timestamps else 20000)
            segments=timestamped_segments(result,start) if timestamps else []
        return {'text':text,'segments':segments, 'provider':'NbAiLab/nb-whisper-large (hosted demo)',
                'processing':'remote','timestamps':'returned' if timestamps else 'not requested','requires_confirmation':True,'pronunciation':'not_assessed'}
    except Exception as exc:
        if job is not None:
            try:job.cancel()
            except Exception:pass
        raise ProviderFailure('NB hosted Whisper is unavailable, timed out, or its API changed. Choose Local NB-Whisper to continue. No local fallback was run automatically.') from exc
