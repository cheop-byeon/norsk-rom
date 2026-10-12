import io
import sys
import wave
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from norsk_api.main import create_app
from norsk_api.config import Settings
from norsk_api.remote_asr import selected_wav,plain_transcript,timestamped_segments,group_practice_clips,transcribe_remote


def test_clip_only_selected_range_and_strip_demo_markup():
    out=io.BytesIO()
    with wave.open(out,'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\x01\x00'*32000)
    clipped=selected_wav(out.getvalue(),.5,1.5)
    with wave.open(io.BytesIO(clipped)) as w:assert w.getnframes()==16000
    assert plain_transcript((None,'Hei!<br>God dag.<br><br><i>Transkribert med NB-Whisper demo</i>',None))=='Hei!\nGod dag.'
    with pytest.raises(ValueError):plain_transcript((None,'',None))


def test_timestamped_transcript_becomes_selectable_practice_clips():
    response=(None,'[00:00:00 -> 00:00:35] Første del.<br>[00:00:36 --> 00:01:20] Andre del.<br><i>Transkribert med NB-Whisper demo</i>',None)
    segments=timestamped_segments(response,offset=12)
    assert segments==[{'start':12.0,'end':47.0,'text':'Første del.'},{'start':48.0,'end':92.0,'text':'Andre del.'}]
    assert group_practice_clips(segments)==[{'start':12.0,'end':92.0,'text':'Første del. Andre del.'}]
    assert group_practice_clips([{'start':0,'end':50,'text':'a'*2000},{'start':50,'end':100,'text':'b'*2000}])==[
        {'start':0,'end':50,'text':'a'*2000},{'start':50,'end':100,'text':'b'*2000}]


def test_long_adapter_submits_audio_with_timestamps_to_expected_space_api(monkeypatch):
    out=io.BytesIO()
    with wave.open(out,'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\x01\x00'*32000)
    calls=[]
    class Job:
        def result(self,timeout):
            assert timeout==540
            return (None,'[00:00:00 -> 00:00:01] Hei der.<br><i>Transkribert med NB-Whisper demo</i>',None)
    class Client:
        def __init__(self,*args,**kwargs):
            assert args==('https://nbailab-nb-whisper-demo.hf.space',)
            calls.append(('connect',kwargs))
        def view_api(self,**kwargs):
            return {'named_endpoints':{'/predict':{'parameters':[{'parameter_name':n} for n in ['file','return_timestamps','lang_nn']]}}}
        def submit(self,file,timestamps,lang_nn,api_name):
            calls.append(('submit',file,timestamps,lang_nn,api_name))
            return Job()
    monkeypatch.setitem(sys.modules,'gradio_client',SimpleNamespace(Client=Client,handle_file=lambda p:p))
    result=transcribe_remote(out.getvalue(),0,2,timestamps=True,max_duration=1800)
    assert result['text']=='[00:00:00 -> 00:00:01] Hei der.'
    assert result['segments']==[{'start':0.0,'end':1.0,'text':'Hei der.'}]
    assert calls[1][1].endswith('.wav')
    assert calls[1][2:]==(True,False,'/predict')


def test_remote_is_explicit_and_never_default(tmp_path,monkeypatch):
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/db',api_keys={'a'*40:'alice'}))
    calls=[]
    def local(*args):calls.append('local');return {'text':'local'}
    def remote(*args):calls.append('remote');return {'text':'remote'}
    monkeypatch.setattr(app.state.speech,'transcribe',local)
    monkeypatch.setattr('norsk_api.main.transcribe_remote',remote)
    with TestClient(app,headers={'Authorization':'Bearer '+'a'*40}) as c:
        assert c.post('/v1/speech/transcribe',content=b'test').json()['text']=='local'
        assert c.post('/v1/speech/transcribe?provider=nb_hosted',content=b'test').json()['text']=='remote'
        assert c.post('/v1/speech/transcribe?provider=bad',content=b'test').status_code==422
    assert calls==['local','remote']


def test_long_hosted_endpoint_groups_timestamped_clips(tmp_path,monkeypatch):
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/db',api_keys={'a'*40:'alice'}))
    def remote(data,start,end,**kwargs):
        assert start==0 and end==2 and kwargs=={'timestamps':True,'max_duration':1800}
        return {'text':'Hei Norge','segments':[{'start':0,'end':1,'text':'Hei'},{'start':1,'end':2,'text':'Norge'}]}
    monkeypatch.setattr('norsk_api.main.transcribe_remote',remote)
    with TestClient(app,headers={'Authorization':'Bearer '+'a'*40}) as c:
        result=c.post('/v1/speech/transcribe-long?end=2',content=b'audio').json()
        assert result['clips']==[{'start':0,'end':2,'text':'Hei Norge'}]
        assert c.post('/v1/speech/transcribe-long?end=1801',content=b'audio').status_code==422
