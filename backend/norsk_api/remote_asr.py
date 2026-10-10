"""Optional NB-Whisper hosted demo; never silently uploads on local mode."""
import io
import re
import tempfile
from html import unescape
from pathlib import Path
from .live import ProviderFailure

SPACE='https://nbailab-nb-whisper-demo.hf.space'


def selected_wav(data,start,end):
    import av
    import numpy as np
    import wave
    lower=int(start*16000);upper=int(end*16000) if end is not None else lower+90*16000
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


def plain_transcript(result):
    if not isinstance(result,(list,tuple)) or len(result)!=3 or not isinstance(result[1],str):
        raise ValueError('Unexpected transcription response')
    # The demo appends its attribution outside the transcript.
    text=re.sub(r'<i>Transkribert med NB-Whisper demo</i>\s*$','',result[1])
    text=re.sub(r'<br\s*/?>','\n',text,flags=re.I)
    text=unescape(re.sub(r'<[^>]*>','',text)).strip()
    if not text or len(text)>20000:raise ValueError('Empty or oversized transcript')
    return text


def transcribe_remote(data,start=0,end=None):
    # Decode and clip locally: upload only the selected audio, never the full video.
    try:audio=selected_wav(data,start,end)
    except Exception as exc:raise ValueError('Could not decode the selected audio. Use a valid 0.25–90 second clip.') from exc
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
            job=client.submit(handle_file(str(path)),False,False,api_name=candidates[0])
            text=plain_transcript(job.result(timeout=540))
        return {'text':text,'segments':[], 'provider':'NbAiLab/nb-whisper-large (hosted demo)',
                'processing':'remote','timestamps':'not requested','requires_confirmation':True,'pronunciation':'not_assessed'}
    except Exception as exc:
        if job is not None:
            try:job.cancel()
            except Exception:pass
        raise ProviderFailure('NB hosted Whisper is unavailable, timed out, or its API changed. Choose Local NB-Whisper to continue. No local fallback was run automatically.') from exc
