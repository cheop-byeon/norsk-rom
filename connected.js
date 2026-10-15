import {NorskClient} from './api-client.js';
import {splitSentences,wordMeaning} from './reader.js?v=karaoke-sync-7';
const $=id=>document.getElementById(id);
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
let rememberLogin=localStorage.getItem('norsk.rememberLogin')==='true';
let token=(rememberLogin&&localStorage.getItem('norsk.rememberToken'))||sessionStorage.getItem('norsk.token')||'';
const api=new NorskClient({token});
let capabilities=null,lesson=null,script=[],saved=[],savedWords=[],history=[],stage=0,busy=false,error='',draft='',inputMode='typed',answers={},played=false,tab='lesson',playbackText='',lessonSourceSegments=[],sourceTranscriptSegments=[],karaokeSentences=[],activeKaraokeIndex=-1,activeKaraokeWord=null,sourceAudioPlaying=false,lessonSourceId='',lessonSourceAudioAvailable=false,lessonSourceAudioURL=null,catalogue=[],studioText='',studioTextTruncated=false,studioLevel='A2',studioKind='text',studioFile=null,studioURL=null,studioStart=0,studioEnd=20,studioRequest=null,studioSourceURL='',studioImportSource='file',studioYoutubeId='',studioYoutubeStart=0,studioYoutubeEnd=20,studioLongClips=[],studioSourceSegments=[],studioLongClipIndex=-1,pronunciationTarget='',pronunciationFeedback=null,activeReaderSentence='',dictationTarget='',dictationInput='',dictationFeedback='',reviewIndex=0,reviewRevealed=false;
let speechVoice=localStorage.getItem('norsk.voice')||'female',speechPace=localStorage.getItem('norsk.pace')||'slow';
if(!['female','male'].includes(speechVoice))speechVoice='female';
if(!['slow','normal','fast'].includes(speechPace))speechPace='slow';
let speechWaiting=false;
let audio=null,audioURL=null,originalAudio=null,mediaStream=null,recorder=null,recordTimer=null,recording=false,audioGeneration=0,recordEpoch=0;
let studioMicStream=null,studioMicRecorder=null,studioMicTimer=null,studioRecording=false,studioRecordEpoch=0,studioPodcastEpisodes=[],studioEpisodeTitle='';
const stages=['listen','answer','review','practise','roleplay','recap'];
const stageIcons=['🎧','🧩','💡','🗣️','💬','⭐'];
function B(text,fn,cls='chip',disabled=false){const b=E('button',text,cls);b.type='button';b.disabled=disabled||busy||!!api.pending;b.onclick=fn;return b;}
function sourceLogo(id,fallback){
 const icon=E('span',undefined,`source-icon source-icon-${id}`);
 const svg=(viewBox)=>{const el=document.createElementNS('http://www.w3.org/2000/svg','svg');el.setAttribute('viewBox',viewBox);el.setAttribute('aria-hidden','true');return el;};
 const shape=(name,attrs)=>{const el=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,value);return el;};
 if(id==='youtube'){const mark=svg('0 0 48 34');mark.append(shape('rect',{x:1,y:1,width:46,height:32,rx:9,fill:'#ff0033'}),shape('path',{d:'M20 10.5 33 17 20 23.5z',fill:'#fff'}));icon.append(mark);}
 else if(id==='nrk')icon.append(E('span','NRK','source-logo-nrk'));
 else if(['tv2','aftenposten','vg','dagbladet'].includes(id)){const labels={tv2:'TV 2',aftenposten:'AP',vg:'VG',dagbladet:'DB'};icon.append(E('span',labels[id],`source-logo-${id}`));}
 else if(id==='instagram'){const mark=svg('0 0 36 36');mark.append(shape('rect',{x:3,y:3,width:30,height:30,rx:9,fill:'none',stroke:'currentColor','stroke-width':3}),shape('circle',{cx:18,cy:18,r:7,fill:'none',stroke:'currentColor','stroke-width':3}),shape('circle',{cx:27,cy:9,r:2,fill:'currentColor'}));icon.append(mark);}
 else if(id==='tiktok'){const mark=svg('0 0 36 36');mark.append(shape('path',{d:'M22 4v17.2a6.7 6.7 0 1 1-5.2-6.5v5.1a2 2 0 1 0 1.2 1.8V4h4c.3 3.2 2.1 5.5 5.5 6.2v4.4c-2.2-.4-4.1-1.3-5.5-2.8',fill:'currentColor'}));icon.append(mark);}
 else icon.textContent=fallback;
 return icon;
}
function timeLabel(seconds){const value=Math.max(0,Math.floor(seconds));return `${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`;}
function makeKaraokeSentences(segments){
 const sentences=[];
 for(const segment of segments){
  const parts=splitSentences(segment.text||'').filter(Boolean),weights=parts.map(text=>Math.max(1,text.length)),total=weights.reduce((sum,n)=>sum+n,0);
  let offset=0;
  parts.forEach((text,index)=>{const start=Number(segment.start),end=Number(segment.end),from=start+(end-start)*offset/total;offset+=weights[index];const to=start+(end-start)*offset/total;sentences.push({text,start:from,end:to});});
 }
 return sentences;
}
function updateKaraokeAt(seconds){
 if(!karaokeSentences.length)return;
 let index=karaokeSentences.findIndex(item=>seconds>=item.start&&seconds<item.end);
 if(index<0&&seconds>=karaokeSentences.at(-1).end)index=karaokeSentences.length-1;
 if(index===activeKaraokeIndex)return;
 activeKaraokeIndex=index;
 document.querySelectorAll('.karaoke-sentence').forEach((row,i)=>row.classList.toggle('active',i===index));
 const active=index>=0?document.getElementById(`karaoke-sentence-${index}`):null;
 active?.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function youtubeId(value){try{const u=new URL(value),host=u.hostname.toLowerCase().replace(/^www\./,'');if(!['youtube.com','m.youtube.com','music.youtube.com','youtu.be','youtube-nocookie.com'].includes(host))return '';const id=host==='youtu.be'?u.pathname.split('/').filter(Boolean)[0]:u.searchParams.get('v')||u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1]||'';return /^[A-Za-z0-9_-]{11}$/.test(id)?id:'';}catch{return '';}}
function isUnsupportedStreamingPage(value){try{const host=new URL(value).hostname.toLowerCase().replace(/^www\./,'');return host==='spotify.com'||host.endsWith('.spotify.com');}catch{return false;}}
function youtubeEmbed(id,start=0,end=0,autoplay=false){return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&start=${Math.max(0,Math.floor(start))}${end>start?`&end=${Math.floor(end)}`:''}${autoplay?'&autoplay=1':''}`;}
function stopAudio(){audioGeneration++;if(audio)audio.pause();if(audioURL)URL.revokeObjectURL(audioURL);if(originalAudio){originalAudio.pause();originalAudio.src='';}if(lessonSourceAudioURL)URL.revokeObjectURL(lessonSourceAudioURL);$('karaoke-audio-player')?.replaceChildren();$('audio-output')?.replaceChildren();document.querySelectorAll('.karaoke-sentence.active').forEach(row=>row.classList.remove('active'));audio=null;audioURL=null;originalAudio=null;lessonSourceAudioURL=null;sourceAudioPlaying=false;activeKaraokeIndex=-1;if($('operation'))$('operation').textContent='Playback stopped.';}
function stopStudioRecording(discard=true){if(discard)studioRecordEpoch++;if(studioMicRecorder?.state==='recording')studioMicRecorder.stop();studioMicStream?.getTracks().forEach(t=>t.stop());clearTimeout(studioMicTimer);studioRecording=false;}
function stopRecording(discard=false){if(discard)recordEpoch++;if(recorder&&recorder.state==='recording')recorder.stop();mediaStream?.getTracks().forEach(t=>t.stop());clearTimeout(recordTimer);recording=false;stopStudioRecording(true);}
function syncStage(){if(api.session)stage=stages.indexOf(api.session.state.step);}
function remember(){if(api.session)sessionStorage.setItem('norsk.session',api.session.id);}
async function run(fn,label='Saving…'){
 if(busy)return;busy=true;error='';render();$('operation').textContent=label;
 try{await fn();remember();}catch(e){error=e.message;if(e.status===409&&api.session){try{await api.refresh();syncStage();}catch{}}}
 finally{busy=false;$('operation').textContent='';render();}
}
async function connect(){
 capabilities=await api.request('/capabilities');catalogue=(await api.request('/lessons')).items;
 saved=(await api.request('/phrases')).items;savedWords=(await api.request('/vocabulary')).items;history=await api.request('/sessions');
 const last=sessionStorage.getItem('norsk.session');api.session=history.find(s=>s.id===last)||history.find(s=>!s.state.completed)||null;await loadLesson(api.session?.lesson_id||catalogue[0].id);syncStage();
 sessionStorage.setItem('norsk.token',api.token);
 if(rememberLogin){localStorage.setItem('norsk.rememberLogin','true');localStorage.setItem('norsk.rememberToken',api.token);}else{localStorage.removeItem('norsk.rememberLogin');localStorage.removeItem('norsk.rememberToken');}
}
async function loadLesson(id){lesson=await api.request('/lessons/'+id);const data=await api.request('/lessons/'+id+'/script');script=data.lines;playbackText=data.playback_text;lessonSourceSegments=data.source_segments||[];sourceTranscriptSegments=data.source_transcript_segments||[];karaokeSentences=makeKaraokeSentences(sourceTranscriptSegments);activeKaraokeIndex=-1;activeKaraokeWord=null;lessonSourceId=data.source_id||'';lessonSourceAudioAvailable=!!data.source_audio;}
async function advance(action,payload={},next){await api.mutate(action,payload);syncStage();if(next!==undefined)stage=next;}
async function play(text,wholeClip=false,onEnd=null){
 if(speechWaiting){$('operation').textContent='Speech is already being generated. Please wait.';return;}
 speechWaiting=true;
 stopAudio();const generation=audioGeneration;$('operation').textContent='Generating Norwegian audio · '+capabilities.tts+' · please wait…';
 const started=Date.now();const waiting=setInterval(()=>{if(generation===audioGeneration)$('operation').textContent='Waiting for '+capabilities.tts+' · '+Math.floor((Date.now()-started)/1000)+' seconds · remote speech can take several minutes.';},1000);
 try{
  const blob=await api.request('/speech/synthesize',{method:'POST',body:{text,voice:speechVoice,pace:speechPace},timeoutMs:620000});clearInterval(waiting);if(generation!==audioGeneration)return;
  audioURL=URL.createObjectURL(blob);audio=document.createElement('audio');audio.controls=true;audio.preload='auto';audio.src=audioURL;audio.playbackRate=Number($('speed')?.value||1);audio.setAttribute('aria-label','Generated Norwegian audio');$('audio-output')?.replaceChildren(audio);
  audio.onended=()=>{if(wholeClip)played=true;$('operation').textContent='Playback finished. Use the player below to replay.';if(onEnd)onEnd();else render();};
  audio.onerror=()=>{$('operation').textContent='Audio arrived, but this browser could not decode it. Use another voice or try again.';};
  try{await audio.play();$('operation').textContent='Playing · '+capabilities.tts;}
  catch(e){if(e.name==='NotAllowedError')$('operation').textContent='Audio is ready. Press Play in the player below.';else throw e;}
 }catch(e){if(generation===audioGeneration){error=e.message;$('operation').textContent='';render();}}
 finally{clearInterval(waiting);speechWaiting=false;}
}
async function playOriginalClip(){
 if(!studioURL||!studioFile){error='Choose the source file in Studio first to replay its original audio.';render();return;}
 stopAudio();const clip=new Audio(studioURL);originalAudio=clip;clip.preload='auto';
 try{
  await new Promise((resolve,reject)=>{if(clip.readyState>=1)return resolve();clip.addEventListener('loadedmetadata',resolve,{once:true});clip.addEventListener('error',()=>reject(new Error('The browser could not open the original audio.')),{once:true});});
  if(originalAudio!==clip)return;
  clip.currentTime=Math.min(studioStart,Math.max(0,clip.duration-0.1));
  const finish=()=>{if(originalAudio!==clip)return;clip.pause();played=true;$('operation').textContent='Original clip finished.';render();};
  clip.ontimeupdate=()=>{if(Number.isFinite(studioEnd)&&clip.currentTime>=studioEnd)finish();};clip.onended=finish;
  await clip.play();$('operation').textContent='Playing the original source clip.';
 }catch(e){if(originalAudio===clip){error=e.message;render();}}
}
async function playLessonSource(fullRecording=false,seekTo=null){
 if(!lessonSourceAudioAvailable){error='This lesson has no saved original recording. Import an audio file in Studio to keep it with the lesson.';render();return;}
 stopAudio();const generation=audioGeneration;$('operation').textContent='Loading the original recording…';
 try{
  const blob=await api.request(`/lessons/${lesson.id}/source-audio`,{timeoutMs:120000});if(generation!==audioGeneration)return;
  lessonSourceAudioURL=URL.createObjectURL(blob);const clip=new Audio(lessonSourceAudioURL);originalAudio=clip;clip.preload='metadata';clip.controls=true;clip.className='karaoke-audio';clip.setAttribute('aria-label','Original recording playback');
  await new Promise((resolve,reject)=>{if(clip.readyState>=1)return resolve();clip.addEventListener('loadedmetadata',resolve,{once:true});clip.addEventListener('error',()=>reject(new Error('The browser could not open the saved source recording.')),{once:true});});
  if(originalAudio!==clip)return;
  const starts=lessonSourceSegments.map(segment=>Number(segment.start)).filter(Number.isFinite),ends=lessonSourceSegments.map(segment=>Number(segment.end)).filter(Number.isFinite);
  const start=seekTo!==null?Math.max(0,Math.min(Number(seekTo),clip.duration-0.1)):fullRecording?0:(starts.length?Math.min(...starts):0),end=(fullRecording||seekTo!==null)?clip.duration:(ends.length?Math.min(clip.duration,Math.max(...ends)):clip.duration);
  clip.currentTime=Math.min(start,Math.max(0,clip.duration-0.1));clip.playbackRate=Number($('speed')?.value||1);
  sourceAudioPlaying=fullRecording||seekTo!==null;
  $('karaoke-audio-player')?.append(clip);
  const finish=()=>{if(originalAudio!==clip)return;clip.pause();sourceAudioPlaying=false;played=true;$('operation').textContent='Source playback finished.';render();};
  clip.ontimeupdate=()=>{if(sourceAudioPlaying)updateKaraokeAt(clip.currentTime);if(!fullRecording&&seekTo===null&&clip.currentTime>=end)finish();};clip.onended=finish;
  await clip.play();$('operation').textContent=fullRecording?'Playing the full original recording.':'Playing the original recording from this sentence.';
 }catch(e){if(originalAudio){originalAudio=null;}error=e.message;render();}
}
async function transcribeBlob(blob){
 await run(async()=>{const result=await api.request('/speech/transcribe',{method:'POST',body:blob,raw:true,timeoutMs:600000});draft=result.text;inputMode='confirmed_transcript';},'Transcribing locally with NB-Whisper…');
}
async function checkPhraseAudio(blob,target){
 await run(async()=>{pronunciationFeedback=await api.request(`/speech/pronunciation-check?target=${encodeURIComponent(target)}`,{method:'POST',body:blob,raw:true,timeoutMs:600000});},'Listening for the phrase…');
}
async function recordPhrase(target){
 if(recording){if(pronunciationTarget===target){stopRecording();render();}return;}
 try{
  stopAudio();const epoch=++recordEpoch;pronunciationTarget=target;pronunciationFeedback=null;mediaStream=await navigator.mediaDevices.getUserMedia({audio:true});
  if(epoch!==recordEpoch){mediaStream.getTracks().forEach(t=>t.stop());return;}
  recorder=new MediaRecorder(mediaStream);const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  recorder.onstop=()=>{mediaStream?.getTracks().forEach(t=>t.stop());recording=false;clearTimeout(recordTimer);if(epoch!==recordEpoch)return;checkPhraseAudio(new Blob(chunks,{type:recorder.mimeType}),target);};
  recorder.start();recording=true;recordTimer=setTimeout(stopRecording,15000);render();
 }catch(e){error='Microphone unavailable or permission denied. Allow microphone access, then try again.';mediaStream?.getTracks().forEach(t=>t.stop());recording=false;render();}
}
async function record(){
 if(recording){stopRecording();render();return;}
 try{
  stopAudio();const epoch=++recordEpoch;mediaStream=await navigator.mediaDevices.getUserMedia({audio:true});if(epoch!==recordEpoch){mediaStream.getTracks().forEach(t=>t.stop());return;}
  recorder=new MediaRecorder(mediaStream);const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  recorder.onstop=()=>{mediaStream?.getTracks().forEach(t=>t.stop());recording=false;clearTimeout(recordTimer);if(epoch!==recordEpoch)return;transcribeBlob(new Blob(chunks,{type:recorder.mimeType}));};
  recorder.start();recording=true;recordTimer=setTimeout(stopRecording,60000);render();
 }catch(e){error='Microphone unavailable or permission denied. Type your reply or choose an audio file.';mediaStream?.getTracks().forEach(t=>t.stop());render();}
}
async function recordStudioClip(){
 if(studioRecording){stopStudioRecording(false);return;}
 try{
  const epoch=++studioRecordEpoch;studioMicStream=await navigator.mediaDevices.getUserMedia({audio:true});
  if(epoch!==studioRecordEpoch){studioMicStream.getTracks().forEach(track=>track.stop());return;}
  studioMicRecorder=new MediaRecorder(studioMicStream);const chunks=[];studioMicRecorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
  studioMicRecorder.onstop=()=>{studioMicStream?.getTracks().forEach(track=>track.stop());clearTimeout(studioMicTimer);studioRecording=false;if(epoch!==studioRecordEpoch)return;const blob=new Blob(chunks,{type:studioMicRecorder.mimeType||'audio/webm'});studioFile=new File([blob],'norsk-rom-microphone.webm',{type:blob.type});studioKind='audio transcript';if(studioURL)URL.revokeObjectURL(studioURL);studioURL=URL.createObjectURL(studioFile);studioStart=0;studioEnd=90;studioText='';studioSourceSegments=[];studioRequest=null;render();};
  studioMicRecorder.start();studioRecording=true;studioMicTimer=setTimeout(()=>stopStudioRecording(false),90000);render();
 }catch{error='Microphone unavailable or permission denied. Allow microphone access, then try again.';studioMicStream?.getTracks().forEach(track=>track.stop());studioRecording=false;render();}
}
function authScreen(root){
 const card=E('section',undefined,'card');card.append(E('h2','Connect to your learning.'),E('p','Your backend saves your lesson and runs the configured speech models. Open the local development key file to sign in.','muted'));
 const form=E('form');const input=E('input');input.type='password';input.autocomplete='off';input.placeholder='Local API key';input.setAttribute('aria-label','Local API key');const submit=B('Connect',()=>{},'primary dark');submit.type='submit';
 const rememberLabel=E('label',' Keep me signed in on this device '),remember=E('input');remember.type='checkbox';remember.checked=rememberLogin;remember.setAttribute('aria-label','Keep me signed in on this device');rememberLabel.prepend(remember);
 form.append(input,rememberLabel,submit);form.onsubmit=e=>{e.preventDefault();rememberLogin=remember.checked;api.token=input.value.trim();run(connect,'Connecting…');};
 const label=E('label','Or choose backend/norsk-rom-local-config.json: ','notice');const file=E('input');file.type='file';file.accept='.json';file.onchange=()=>{rememberLogin=remember.checked;run(async()=>{const config=JSON.parse(await file.files[0].text());api.token=Object.keys(config.api_keys||{})[0]||'';if(!api.token)throw new Error('No API key in that file.');await connect();},'Connecting…');};label.append(file);
 card.append(form,E('p',rememberLogin?'This device remembers your local API key until you sign out or clear browser data.':'By default, your key lasts only for this browser tab. “Keep me signed in” stores it in this browser on this device.','notice'),label);root.append(card);
}
function providerStatus(){
 $('connection').replaceChildren();if(!capabilities)return;
 $('connection').append(E('div',`Conversation: ${capabilities.conversation} · Transcription: ${capabilities.transcription} · Voice: ${capabilities.tts} · Pronunciation: transcript comparison hints`,'statusbar'));
 if(capabilities.tts_options){
  const controls=E('div',undefined,'actions');
  for(const [title,value,options,change] of [
   ['Speaking voice',speechVoice,[['female','Female · Oslo'],['male','Male · Oslo']],v=>{speechVoice=v;localStorage.setItem('norsk.voice',v);} ],
   ['Speaking pace',speechPace,[['slow','Slowest · Rolig'],['normal','Normal'],['fast','Fast · Rask']],v=>{speechPace=v;localStorage.setItem('norsk.pace',v);} ]]){
   const label=E('label',title+' '),select=E('select');select.setAttribute('aria-label',title);
   for(const [v,t] of options){const option=E('option',t);option.value=v;select.append(option);}select.value=value;
   select.onchange=()=>{change(select.value);stopAudio();};label.append(select);controls.append(label);
  }
  $('connection').append(controls,E('p','Voice and pace apply to the next playback and are remembered on this device.','notice'));
 }
 if(capabilities.tts_notice)$('connection').append(E('p',capabilities.tts_notice,'notice'));
}
function renderStudio(root){
 const card=E('section',undefined,'card');root.append(card);
 card.append(E('div','YOUR CONTENT → YOUR NEXT CONVERSATION','eyebrow'),E('h2','Bring something you found.'),E('p','Follow the steps from top to bottom. First choose a source, then add it, make a short transcript, and create your lesson.','muted'));
 const step=(n,title)=>E('h3',`${n}. ${title}`,'studio-step-title');
 card.append(step(1,'Choose your source'));
 const sourceGroups=[
  ['Your material',[
   ['file','📁','On my device','Upload or record audio, video, or a supported document.'],
   ['subtitles','💬','Subtitle file','Add SRT/VTT captions you can access.'],
   ['text','📝','Paste text','Use a transcript or captions as a listening script.']
  ]],
  ['Norwegian media',[
   ['nrk','📻','NRK','Try public programme pages or audio.'],
   ['tv2','TV','TV 2','Try public news pages or directly accessible media.'],
   ['aftenposten','AP','Aftenposten','Try public articles and podcast pages.'],
   ['vg','VG','VG','Try public news and podcast pages.'],
   ['dagbladet','DB','Dagbladet','Try public news and podcast pages.']
  ]],
  ['Podcasts & audio',[
   ['podcast','🎧','Podcast RSS','Browse public podcast episodes.'],
   ['public_audio','🎙️','Podcast / audio URL','Paste a public episode or audio link.'],
   ['podimo','🎧','Podimo','Import text visible on public episode pages.']
  ]],
  ['Video & social',[
   ['youtube','▶','YouTube','Use available Norwegian captions.'],
   ['instagram','◎','Instagram','Try a public post if its content is accessible.'],
   ['tiktok','♪','TikTok','Try a public post if its content is accessible.'],
   ['social','✦','Other public social','Try an X/Twitter or other public post.']
  ]]
 ];
 const picker=E('div',undefined,'source-categories');
 for(const [groupTitle,options] of sourceGroups){
  const group=E('section',undefined,'source-group');group.setAttribute('aria-label',groupTitle);group.append(E('h4',groupTitle,'source-group-title'));
  const pickerGrid=E('div',undefined,'source-picker');
  for(const [id,icon,title,description] of options){
   const button=E('button',undefined,'source-option'+(studioImportSource===id?' selected':''));button.type='button';button.disabled=busy;button.setAttribute('aria-pressed',studioImportSource===id?'true':'false');
   button.append(sourceLogo(id,icon),E('strong',title),E('small',description));
   button.onclick=()=>{if(studioImportSource!==id){stopAudio();studioImportSource=id;studioText='';studioTextTruncated=false;studioKind='text';studioFile=null;studioYoutubeId='';studioSourceURL='';studioRequest=null;studioLongClips=[];studioSourceSegments=[];studioPodcastEpisodes=[];studioEpisodeTitle='';studioLongClipIndex=-1;if(studioURL)URL.revokeObjectURL(studioURL);studioURL=null;}render();};pickerGrid.append(button);
  }
  group.append(pickerGrid);picker.append(group);
 }
 card.append(picker);

 if(['file','subtitles'].includes(studioImportSource)){
  card.append(step(2,studioImportSource==='subtitles'?'Choose a subtitle file':'Record, upload, or open a document'));
  const picker=E('input');picker.type='file';picker.accept=studioImportSource==='subtitles'?'.srt,.vtt': 'audio/*,video/*,.txt,.md,.srt,.vtt,.pdf,.epub,.docx';picker.disabled=busy;picker.setAttribute('aria-label',studioImportSource==='subtitles'?'SRT or VTT subtitle file':'Audio, video, or document file');
  picker.onchange=()=>{const file=picker.files[0];if(!file)return;stopAudio();studioYoutubeId='';studioPodcastEpisodes=[];studioTextTruncated=false;if(studioURL)URL.revokeObjectURL(studioURL);studioURL=null;studioFile=null;studioText='';studioLongClips=[];studioSourceSegments=[];studioLongClipIndex=-1;studioRequest=null;
   if(/\.(txt|md|srt|vtt|pdf|epub|docx)$/i.test(file.name)){run(async()=>{const doc=await api.request('/studio/import-document?filename='+encodeURIComponent(file.name),{method:'POST',body:file,raw:true,timeoutMs:120000});studioText=doc.text;studioTextTruncated=!!doc.truncated;studioKind='text';},'Extracting document text…');}
   else{studioFile=file;studioKind='audio transcript';studioURL=URL.createObjectURL(file);studioStart=0;studioEnd=20;render();}
  };card.append(picker);
  card.append(B(studioRecording?'■ Stop recording':'🎙 Record a clip with my microphone',recordStudioClip,'chip'));
  if(!studioFile&&!studioText)card.append(E('p',studioImportSource==='subtitles'?'Choose a Norwegian SRT or VTT subtitle file up to 25 MB. You can use captions that are available to you from a streaming service.':'Choose audio/video up to 12 MB, or a TXT, Markdown, SRT/VTT, PDF, EPUB, or DOCX document up to 25 MB. You can also record a clip here.','notice'));
  if(studioText&&studioKind==='text')card.append(E('p',studioTextTruncated?'Document text is longer than the current lesson limit. The first 4,000 characters are loaded for review.':'Document text is ready for review below. Scanned-image OCR is not enabled; PDFs need selectable text.','notice'));
  if(studioRecording)card.append(E('p','Recording locally in this tab · maximum 90 seconds. Select Stop recording when finished.','notice'));
  else if(studioFile?.name==='norsk-rom-microphone.webm')card.append(E('p','Microphone clip ready. Listen to it, choose a segment, then make the transcript.','notice'));
 }
 if(['youtube','nrk','tv2','aftenposten','vg','dagbladet','podimo','public_audio','podcast','social','instagram','tiktok'].includes(studioImportSource)){
  const sourceNames={nrk:'NRK',tv2:'TV 2',aftenposten:'Aftenposten',vg:'VG',dagbladet:'Dagbladet',podimo:'Podimo',instagram:'Instagram',tiktok:'TikTok'};
  card.append(step(2,studioImportSource==='youtube'?'Add your YouTube link':studioImportSource==='podcast'?'Add a podcast RSS feed':studioImportSource==='social'?'Add another public social link':sourceNames[studioImportSource]?`Add a link from ${sourceNames[studioImportSource]}`: 'Add a public podcast or audio link'));
  const urlInput=E('input');urlInput.type='url';urlInput.placeholder=studioImportSource==='youtube'?'Paste YouTube URL here':studioImportSource==='nrk'?'Paste an NRK programme or article URL':studioImportSource==='tv2'?'Paste a public TV 2 article or media URL':studioImportSource==='aftenposten'?'Paste a public Aftenposten article or podcast URL':studioImportSource==='vg'?'Paste a public VG article or podcast URL':studioImportSource==='dagbladet'?'Paste a public Dagbladet article or podcast URL':studioImportSource==='podimo'?'Paste a public Podimo episode page URL':studioImportSource==='podcast'?'Paste a podcast RSS or Atom feed URL':studioImportSource==='instagram'?'Paste a public Instagram post URL':studioImportSource==='tiktok'?'Paste a public TikTok video URL':studioImportSource==='social'?'Paste a public X/Twitter URL':'Paste a public episode page or direct audio URL';urlInput.value=studioSourceURL;urlInput.autocomplete='url';urlInput.setAttribute('aria-label',studioImportSource==='podcast'?'Podcast feed URL':'Source URL');urlInput.oninput=()=>{studioSourceURL=urlInput.value;};card.append(urlInput);
  if(studioImportSource==='podcast'){card.append(B('Try the Norskpodden learner feed',()=>{studioSourceURL='https://feeds.captivate.fm/norskpodden/';urlInput.value=studioSourceURL;},'chip'));const links=E('p',undefined,'notice');for(const [label,href] of [['Browse NRK Radio','https://radio.nrk.no/podkast'],['Browse Aftenposten podcasts','https://www.aftenposten.no/podkast']]){const link=E('a',label);link.href=href;link.target='_blank';link.rel='noopener noreferrer';links.append(link,E('span',' · '));}links.append(E('span','Norskpodden is a learner-focused feed; the other catalogues offer authentic Norwegian listening.'));card.append(links);}
  const importLabel=studioImportSource==='youtube'?'Load YouTube video':studioImportSource==='podcast'?'Load podcast episodes':studioImportSource==='instagram'?'Try public Instagram post':studioImportSource==='tiktok'?'Try public TikTok video':studioImportSource==='social'?'Try public post':sourceNames[studioImportSource]?`Import ${sourceNames[studioImportSource]}`:'Import podcast / audio';
  card.append(B(importLabel,()=>run(async()=>{
   if(!studioSourceURL.trim())throw new Error('Paste a URL first.');
   const youtubeVideoId=youtubeId(studioSourceURL.trim());
   if(studioImportSource==='youtube'&&!youtubeVideoId)throw new Error('Paste a valid YouTube video link.');
   if(studioImportSource!=='youtube'&&youtubeVideoId)throw new Error('Choose the YouTube source option for YouTube links.');
   if(studioImportSource==='nrk'){let host='';try{host=new URL(studioSourceURL.trim()).hostname.toLowerCase();}catch{}if(host!=='nrk.no'&&!host.endsWith('.nrk.no'))throw new Error('That link is not on nrk.no. Choose “Podcast / public audio” for a public episode or direct audio link.');}
   for(const [source,allowed,label] of [['tv2',['tv2.no'],'TV 2'],['aftenposten',['aftenposten.no'],'Aftenposten'],['vg',['vg.no'],'VG'],['dagbladet',['dagbladet.no'],'Dagbladet']])if(studioImportSource===source){let host='';try{host=new URL(studioSourceURL.trim()).hostname.toLowerCase().replace(/^www\./,'');}catch{}if(!allowed.some(domain=>host===domain||host.endsWith('.'+domain)))throw new Error(`Paste a public ${label} link.`);}
   if(studioImportSource==='podimo'){let host='';try{host=new URL(studioSourceURL.trim()).hostname.toLowerCase();}catch{}if(host!=='podimo.com'&&!host.endsWith('.podimo.com'))throw new Error('Paste a link from podimo.com. For a publisher’s public RSS feed, choose “Podcast RSS feed” instead.');}
   for(const [source,hosts,label] of [['instagram',['instagram.com'],'Instagram'],['tiktok',['tiktok.com','vm.tiktok.com'],'TikTok'],['social',['x.com','twitter.com'],'X/Twitter']])if(studioImportSource===source){let host='';try{host=new URL(studioSourceURL.trim()).hostname.toLowerCase().replace(/^www\./,'');}catch{}if(!hosts.some(allowed=>host===allowed||host.endsWith('.'+allowed)))throw new Error(`Paste a public ${label} link.`);}
   if(youtubeVideoId){stopAudio();studioYoutubeId=youtubeVideoId;studioYoutubeStart=0;studioYoutubeEnd=20;studioFile=null;if(studioURL)URL.revokeObjectURL(studioURL);studioURL=null;studioText='';studioKind='audio transcript';studioRequest=null;return;}
   if(studioImportSource==='podcast'){const feed=await api.request('/studio/podcast-feed',{method:'POST',body:{url:studioSourceURL.trim()},timeoutMs:60000});studioPodcastEpisodes=feed.episodes||[];studioEpisodeTitle=feed.title||'Podcast';studioText='';studioFile=null;return;}
   if(isUnsupportedStreamingPage(studioSourceURL.trim()))throw new Error('Spotify streaming pages are not supported. Try a public direct audio link or a file you are allowed to use.');
   if(/(?:youtube\.com|youtu\.be)/i.test(studioSourceURL.trim()))throw new Error('I could not find a valid YouTube video ID in that link.');
   let result;try{result=await api.request(studioImportSource==='podimo'?'/studio/podimo-page':'/studio/import-url',{method:'POST',body:{url:studioSourceURL.trim()},timeoutMs:60000});}catch(e){if(e.status===404)throw new Error('This import needs the updated backend. Restart Norsk Rom’s backend, then try again.');throw e;}
   if(result instanceof Blob){
    stopAudio();studioYoutubeId='';if(studioURL)URL.revokeObjectURL(studioURL);
    let name='online-media';try{name=decodeURIComponent(new URL(studioSourceURL).pathname.split('/').pop())||name;}catch{}
    studioFile=new File([result],name,{type:result.type||'application/octet-stream'});studioURL=URL.createObjectURL(studioFile);studioStart=0;studioEnd=20;studioText='';studioKind='audio transcript';
   }else{studioText=result.text||'';studioKind='text';studioFile=null;studioYoutubeId='';if(studioURL)URL.revokeObjectURL(studioURL);studioURL=null;}
   studioRequest=null;
  },studioImportSource==='nrk'?'Importing NRK source…':studioImportSource==='podimo'?'Loading public Podimo page…':studioImportSource==='public_audio'?'Importing public audio…':studioImportSource==='instagram'?'Trying public Instagram content…':studioImportSource==='tiktok'?'Trying public TikTok content…':'Loading source…'),'primary dark'));
  const mediaSources=['tv2','aftenposten','vg','dagbladet'];
  const sourceNotice=E('p',studioImportSource==='youtube'?'The video appears below. Norsk Rom uses available Norwegian captions and does not download YouTube audio.':studioImportSource==='nrk'?'NRK pages vary. Norsk Rom tries public text or directly accessible media; it cannot sign in or bypass DRM.':mediaSources.includes(studioImportSource)?'Norsk Rom can import readable public page text or a directly accessible media file. A page may provide only an article or description; sign-in, paid streams, and DRM-protected audio are not accessed.':studioImportSource==='podimo'?'This imports only text visible on a public Podimo page; it may be a description, not an episode transcript. Norsk Rom does not sign in, extract subscriber audio, or use offline downloads. Try a publisher’s public RSS feed or a transcript/media file you are allowed to use.':(['instagram','tiktok','social'].includes(studioImportSource)?'Only public page text is attempted. Sign-in or platform restrictions may block imports; use an audio file, captions, or RSS feed you are allowed to process if this fails.':' '), 'notice');
  if(mediaSources.includes(studioImportSource)){const browse={tv2:['Open TV 2','https://www.tv2.no/'],aftenposten:['Open Aftenposten','https://www.aftenposten.no/'],vg:['Open VG','https://www.vg.no/'],dagbladet:['Open Dagbladet','https://www.dagbladet.no/']}[studioImportSource];sourceNotice.append(document.createTextNode(' '));const link=E('a',browse[0]);link.href=browse[1];link.target='_blank';link.rel='noopener noreferrer';sourceNotice.append(link);}
  if(studioImportSource==='podimo'){sourceNotice.append(document.createTextNode(' '));const browse=E('a','Browse Podimo shows');browse.href='https://podimo.com/no/shows';browse.target='_blank';browse.rel='noopener noreferrer';sourceNotice.append(browse,document.createTextNode(' · Read '));const terms=E('a','Podimo’s terms');terms.href='https://podimo.com/no/terms-of-use';terms.target='_blank';terms.rel='noopener noreferrer';sourceNotice.append(terms,document.createTextNode(' for its content-use rules.'));}
  if(['podimo','instagram','tiktok','social',...mediaSources].includes(studioImportSource))card.append(sourceNotice);
  else card.append(E('p',studioImportSource==='podcast'?'RSS/Atom feeds expose episode metadata and public audio enclosures. A subscription-only or private feed may not be accessible. Norsk Rom does not retain the feed or episode.':'Use an openly accessible episode page or direct audio file up to 50 MB. Sign-in, subscription-only, and DRM-protected sources are not imported.','notice'));
 }
 if(studioImportSource==='podcast'&&studioPodcastEpisodes.length){card.append(E('h3',`Episodes · ${studioEpisodeTitle}`,'studio-step-title'));for(const episode of studioPodcastEpisodes){const row=E('div',undefined,'phrase'),copy=E('div');copy.append(E('strong',episode.title),E('small',episode.published||'Podcast episode'));if(episode.description)copy.append(E('small',episode.description));row.append(copy,B('Use this episode',()=>run(async()=>{const result=await api.request('/studio/import-url',{method:'POST',body:{url:episode.audio_url},timeoutMs:120000});if(!(result instanceof Blob))throw new Error('This feed item does not link to a downloadable audio file.');const safeName=(episode.title||'podcast-episode').replace(/[^\p{L}\p{N}-]+/gu,'-').slice(0,80)+'.mp3';studioFile=new File([result],safeName,{type:result.type||'audio/mpeg'});if(studioURL)URL.revokeObjectURL(studioURL);studioURL=URL.createObjectURL(studioFile);studioStart=0;studioEnd=20;studioText='';studioKind='audio transcript';studioSourceSegments=[];},'Loading the selected podcast episode…'),'primary'));card.append(row);}}
 if(studioImportSource==='text')card.append(step(2,'Paste your Norwegian text or transcript'));

 if(studioYoutubeId&&studioImportSource==='youtube'){
  card.append(step(3,'Choose a short listening clip'));
  const player=E('iframe');player.src=youtubeEmbed(studioYoutubeId,studioYoutubeStart,studioYoutubeEnd);player.title='YouTube listening source';player.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';player.allowFullscreen=true;player.loading='lazy';player.referrerPolicy='strict-origin-when-cross-origin';player.style.cssText='width:100%;aspect-ratio:16/9;border:0;border-radius:16px';card.append(player);
  const ranges=E('div',undefined,'actions');
  for(const [name,value,setter] of [['Start (seconds)',studioYoutubeStart,v=>studioYoutubeStart=v],['End (seconds)',studioYoutubeEnd,v=>studioYoutubeEnd=v]]){const label=E('label',name+' '),input=E('input');input.type='number';input.min=0;input.step=1;input.value=value;input.style.width='100px';input.setAttribute('aria-label',name);input.onchange=()=>{setter(Number(input.value));if(studioYoutubeEnd>studioYoutubeStart)player.src=youtubeEmbed(studioYoutubeId,studioYoutubeStart,studioYoutubeEnd);};label.append(input);ranges.append(label);}
  card.append(ranges,E('p','Choose any segment up to 90 seconds. The URL stays above this player, so you can follow the page downward.','notice'));
  card.append(B('Get Norwegian captions',()=>run(async()=>{
   if(studioYoutubeEnd<=studioYoutubeStart||studioYoutubeEnd-studioYoutubeStart>90)throw new Error('Choose a clip from 1 to 90 seconds.');
   let result;try{result=await api.request('/studio/youtube-transcript',{method:'POST',body:{video_id:studioYoutubeId,start:studioYoutubeStart,end:studioYoutubeEnd},timeoutMs:60000});}catch(e){if(e.status===404)throw new Error('Automatic captions need the updated backend. Restart Norsk Rom’s backend and reload this page, or paste captions below.');throw e;}
   studioText=result.text;studioSourceSegments=result.segments||[];studioKind='audio transcript';studioRequest=null;if(result.is_generated)error='These captions were auto-generated. Review names and wording below.';
  },'Getting captions for this clip…'),'primary dark'));
 }
 if(studioFile){
  card.append(step(3,'Choose a short listening clip'),E('p',studioFile.name,'notice'));
  const player=E(studioFile.type.startsWith('audio/')?'audio':'video');player.controls=true;player.src=studioURL;player.style.cssText=studioFile.type.startsWith('audio/')?'width:100%':'width:100%;max-height:260px';player.preload='metadata';card.append(player);
  const ranges=E('div',undefined,'actions'),rangeInputs={};let repeatSelectedClip=false;
  for(const [name,value,setter] of [['Start (seconds)',studioStart,v=>studioStart=v],['End (seconds)',studioEnd,v=>studioEnd=v]]){const label=E('label',name+' '),input=E('input');input.type='number';input.min=0;input.step=0.1;input.value=value;input.style.width='100px';input.setAttribute('aria-label',name);input.oninput=()=>setter(Number(input.value));label.append(input);ranges.append(label);rangeInputs[name]=input;}
  ranges.append(B('Play this clip',()=>{player.currentTime=studioStart;player.play().catch(()=>{error='This browser could not play the file.';render();});}));
  const speedLabel=E('label','Playback speed '),speed=E('select');speed.setAttribute('aria-label','Playback speed');for(const [value,label] of [['0.65','Slowest · 0.65×'],['0.8','Slow · 0.8×'],['1','Normal · 1×']]){const option=E('option',label);option.value=value;speed.append(option);}speed.value='0.8';speed.onchange=()=>{player.playbackRate=Number(speed.value);};speedLabel.append(speed);ranges.append(speedLabel);
  const repeatButton=B('Repeat clip: off',()=>{repeatSelectedClip=!repeatSelectedClip;repeatButton.textContent=`Repeat clip: ${repeatSelectedClip?'on':'off'}`;});ranges.append(repeatButton);
  player.ontimeupdate=()=>{if(player.currentTime>=studioEnd){if(repeatSelectedClip){player.currentTime=studioStart;player.play().catch(()=>{});}else player.pause();}};
  const clipChoices=E('div',undefined,'actions');
  player.addEventListener('loadedmetadata',()=>{
   const duration=Number(player.duration);
   if(!Number.isFinite(duration)||duration<=90)return;
   clipChoices.replaceChildren(E('p',`This recording is ${timeLabel(duration)} long. Pick a short clip to practice:`,'notice'));
   const count=Math.ceil(duration/90),shown=Math.min(count,120);
   for(let i=0;i<shown;i++){
    const start=i*90,end=Math.min(duration,start+90);
    if(end-start<0.25)continue;
    clipChoices.append(B(`Clip ${i+1} · ${timeLabel(start)}–${timeLabel(end)}`,()=>{
     studioStart=start;studioEnd=end;rangeInputs['Start (seconds)'].value=String(start);rangeInputs['End (seconds)'].value=String(end);player.currentTime=start;
    }));
   }
   if(count>shown)clipChoices.append(E('p','Only the first two hours are listed. Select a later range using the time fields.','notice'));
  });
  card.append(ranges,clipChoices,E('p','Long recordings are divided into selectable clips of up to 90 seconds. Choose one, listen, then make its transcript.','notice'));
  if(studioLongClips.length){
   const choices=E('div',undefined,'actions');choices.append(E('p','Choose a transcript clip to review and turn into a lesson:','notice'));
   studioLongClips.forEach((clip,index)=>choices.append(B(`Clip ${index+1} · ${timeLabel(clip.start)}–${timeLabel(clip.end)}`,()=>{studioLongClipIndex=index;studioStart=clip.start;studioEnd=clip.end;studioText=clip.text;studioRequest=null;render();},studioLongClipIndex===index?'primary':'chip')));
   card.append(choices);
  }
  card.append(B('Make transcript',()=>run(async()=>{
   if(studioFile.size>12*1024*1024)throw new Error('Use a file smaller than 12 MB.');
   if(!Number.isFinite(studioStart)||!Number.isFinite(studioEnd)||studioEnd-studioStart<0.25||studioEnd-studioStart>90)throw new Error('Choose a range from 0.25 to 90 seconds.');
   const result=await api.request(`/speech/transcribe?start=${studioStart}&end=${studioEnd}`,{method:'POST',body:studioFile,raw:true,timeoutMs:600000});studioText=result.text;studioSourceSegments=(result.segments||[]).map(segment=>({...segment,timestamp_quality:'local_chunk'}));studioKind='audio transcript';studioRequest=null;
  },'Transcribing your clip locally…'),'primary dark'));
 }
 if(['file','subtitles'].includes(studioImportSource)&&!studioFile&&!studioText)card.append(E('p','Step 3 will appear here after you choose a file.','notice'));

 {
  if(studioImportSource!=='text')card.append(step(4,'Review the Norwegian text'));
  const source=E('textarea');source.value=studioText;source.maxLength=4000;source.setAttribute('aria-label',studioImportSource==='text'?'Norwegian text or transcript':'Confirmed source text');source.placeholder=studioImportSource==='text'?'Paste Norwegian captions, a transcript, or text you are allowed to use.':studioYoutubeId&&studioImportSource==='youtube'?'Your fetched captions will appear here. You can also paste captions manually.':studioFile?'Your transcript will appear here after you click “Make transcript”.':'Imported text will appear here, or paste your own transcript.';source.oninput=()=>{studioText=source.value;studioRequest=null;};card.append(source);
  card.append(step(studioImportSource==='text'?3:5,studioImportSource==='text'?'Choose a level and create the lesson':'Choose a level and create the lesson'));
  const level=E('select');level.setAttribute('aria-label','Target question level');for(const l of ['A1','A2','B1','B2','C1','C2']){const o=E('option',l);o.value=l;level.append(o);}level.value=studioLevel;level.onchange=()=>{studioLevel=level.value;studioRequest=null;};card.append(E('p','Question level (not a certified audio difficulty):','notice'),level);
  card.append(B('Create my lesson →',()=>run(async()=>{
   if(studioText.trim().length<30)throw new Error('Add or fetch at least 30 characters of Norwegian text first.');
   studioRequest=studioRequest||crypto.randomUUID();const sourceStart=studioYoutubeId?studioYoutubeStart:studioStart,sourceEnd=studioYoutubeId?studioYoutubeEnd:studioEnd;const timedSegments=studioSourceSegments.filter(segment=>segment.end>sourceStart&&segment.start<sourceEnd).slice(0,300);const generated=await api.request('/studio/lessons',{method:'POST',body:{text:studioText,level:studioLevel,source_kind:studioKind,source_segments:timedSegments,source_id:studioYoutubeId||(studioURL?'browser-file':''),request_id:studioRequest}});
   if(studioFile)await api.request(`/lessons/${generated.id}/source-audio`,{method:'PUT',body:studioFile,raw:true,timeoutMs:180000});
   await loadLesson(generated.id);await api.create(generated.id);syncStage();draft='';answers={};played=false;tab='lesson';studioRequest=null;
  },'Creating your listening lesson…'),'primary dark wide',capabilities.exercise_generation==='not_configured'));
  card.append(E('p','Your reviewed text and lesson are saved to your account. Audio files you import are saved on your local backend with the lesson, so you can replay the source excerpt or full recording. Please review generated questions and expressions.','notice'));
 }
}
function segmentMatch(sentence){
 const words=value=>new Set((value.toLocaleLowerCase('nb').match(/[\p{L}\p{M}]+/gu)||[]).filter(w=>w.length>2));
 const target=words(sentence);if(!target.size||!lessonSourceSegments.length)return [];
 const scored=lessonSourceSegments.map(segment=>{const tokens=words(segment.text);let hits=0;for(const word of target)if(tokens.has(word))hits++;return {segment,score:hits/target.size};});
 const best=Math.max(...scored.map(item=>item.score));if(best<0.35)return [];
 return scored.filter(item=>item.score>=Math.max(0.35,best-0.15)).map(item=>item.segment).sort((a,b)=>a.start-b.start);
}
async function playReaderSentence(sentence,onEnd=null){
 const matches=segmentMatch(sentence);
 if(studioYoutubeId&&lessonSourceId===studioYoutubeId&&matches.length){const start=Math.min(...matches.map(item=>item.start)),end=Math.max(...matches.map(item=>item.end)),player=$('youtube-source-player');if(player)player.src=youtubeEmbed(studioYoutubeId,start,end,true);$('operation').textContent=matches.some(item=>item.timestamp_quality==='caption')?'Jumped to the matching caption time in the source video.':'Jumped to the approximate matching source segment.';if(onEnd)setTimeout(onEnd,Math.max(700,(end-start)*1000));return;}
 if(studioURL&&lessonSourceId==='browser-file'&&matches.length){
  stopAudio();const clip=new Audio(studioURL);originalAudio=clip;
  try{await new Promise((resolve,reject)=>{if(clip.readyState>=1)return resolve();clip.addEventListener('loadedmetadata',resolve,{once:true});clip.addEventListener('error',()=>reject(new Error('Could not play the imported source audio.')),{once:true});});
   const start=Math.min(...matches.map(item=>item.start)),end=Math.max(...matches.map(item=>item.end));clip.currentTime=Math.max(0,start);const finish=()=>{if(originalAudio!==clip)return;clip.pause();originalAudio=null;if(onEnd)onEnd();};clip.ontimeupdate=()=>{if(originalAudio===clip&&clip.currentTime>=end)finish();};clip.onended=finish;await clip.play();
   const quality=matches.some(item=>item.timestamp_quality==='local_chunk')?'Approximate source segment · local Whisper provides chunk timing, not sentence alignment.':matches.some(item=>item.timestamp_quality==='hosted_asr')?'Source segment from timestamped NB‑Whisper transcription.':'Source segment from timed captions.';
   $('operation').textContent=quality;return;
  }catch(e){if(originalAudio===clip)originalAudio=null;error=e.message;render();return;}
 }
 play(sentence,false,onEnd);
}
function renderTranscriptReader(parent){
 const reader=E('div',undefined,'transcript-reader'),detail=E('aside',undefined,'word-meaning');detail.setAttribute('aria-live','polite');
 script.forEach(line=>{
  const sentences=splitSentences(line.text);
  sentences.forEach((sentence,index)=>{
   const id=`${line.id}:${index}`,row=E('article',undefined,'reader-sentence'+(activeReaderSentence===id?' active':''));
   const head=E('div',undefined,'reader-sentence-head');head.append(E('span',`${line.speaker} · ${index+1}/${sentences.length}`,'reader-speaker'));
   const hear=B(activeReaderSentence===id?'▶ Hear again':'▶ Hear sentence',()=>{activeReaderSentence=id;render();playReaderSentence(sentence,()=>{if(activeReaderSentence===id){activeReaderSentence='';render();}});},'reader-hear');hear.setAttribute('aria-pressed',activeReaderSentence===id);head.append(hear);row.append(head);
   const words=E('p',undefined,'reader-words');words.lang='nb';let cursor=0;
   const pattern=/[\p{L}\p{M}]+(?:[’'-][\p{L}\p{M}]+)*/gu;
   for(const match of sentence.matchAll(pattern)){
    words.append(document.createTextNode(sentence.slice(cursor,match.index)));
    const token=E('button',match[0],'reader-word');token.type='button';token.setAttribute('aria-label',`Show a meaning hint for ${match[0]}`);
    token.onclick=()=>{const hint=wordMeaning(match[0],lesson.phrases||[]);detail.replaceChildren();detail.append(E('strong',match[0]));
     const meaning=E('input');meaning.type='text';meaning.maxLength=300;meaning.placeholder=hint?.meaning||'Add a meaning in your own words';meaning.value=hint?.meaning||'';meaning.setAttribute('aria-label',`Meaning of ${match[0]}`);detail.append(meaning);
     detail.append(E('small',hint?(hint.phrase?`From “${hint.phrase}” in this lesson.`:'Starter glossary · check the meaning in this sentence.'):'Save your own meaning to build a personal vocabulary list.'));
     const actions=E('div',undefined,'actions');actions.append(B('Save word',()=>run(async()=>{await api.request('/vocabulary',{method:'POST',body:{word:match[0],meaning:meaning.value,source_sentence:sentence,lesson_id:lesson.id}});savedWords=(await api.request('/vocabulary')).items;},'Saving word…')),
      B('▶ Listen & type',()=>{dictationTarget=sentence;dictationInput='';dictationFeedback='';render();},'chip'),
      B('🎙 Repeat aloud',()=>recordPhrase(sentence),'chip',capabilities.transcription==='not_configured'));
     detail.append(actions);
    };words.append(token);cursor=match.index+match[0].length;
   }
   words.append(document.createTextNode(sentence.slice(cursor)));row.append(words);reader.append(row);
  });
 });
 reader.append(detail);parent.append(reader);
 if(pronunciationTarget&&!lesson.phrases.some(phrase=>phrase.text===pronunciationTarget)){const repeat=E('section',undefined,'dictation-card');repeat.append(E('h3','Repeat and compare'),E('p',`Target: “${pronunciationTarget}”`,'notice'),B(recording?'■ Stop recording':'🎙 Record your repetition',()=>recordPhrase(pronunciationTarget),'chip',capabilities.transcription==='not_configured'));if(pronunciationFeedback?.target===pronunciationTarget){repeat.append(E('p',`Recognizer heard: “${pronunciationFeedback.recognized}”`,'notice'),E('p',pronunciationFeedback.message,'feedback'));}repeat.append(E('p','This compares the speech recognizer’s transcript with the target. It is not a phonetic pronunciation score.','notice'));parent.append(repeat);}
 if(dictationTarget){const exercise=E('section',undefined,'dictation-card');exercise.append(E('h3','Listen, then type what you heard'),E('p','Play the sentence once or twice, then write what you hear.','notice'),B('▶ Play sentence',()=>playReaderSentence(dictationTarget)));
  const input=E('textarea');input.value=dictationInput;input.placeholder='Type the Norwegian sentence you heard';input.setAttribute('aria-label','Dictation answer');input.oninput=()=>dictationInput=input.value;exercise.append(input,
   B('Check my listening',()=>{const normalize=s=>s.toLocaleLowerCase('nb').replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');dictationFeedback=normalize(dictationInput)===normalize(dictationTarget)?'That matches the source sentence.':`Compare your answer with the sentence: “${dictationTarget}”`;render();},'primary'),
   B('Close',()=>{dictationTarget='';dictationInput='';dictationFeedback='';render();}));if(dictationFeedback)exercise.append(E('p',dictationFeedback,dictationFeedback.startsWith('That')?'feedback':'notice'));parent.append(exercise);}
}

function renderKaraokeWordDetail(parent){
 const detail=E('aside',undefined,'word-meaning');detail.id='karaoke-word-detail';detail.setAttribute('aria-live','polite');
 if(activeKaraokeWord){
  const {word,sentence}=activeKaraokeWord,savedWord=savedWords.find(item=>item.word.toLocaleLowerCase('nb-NO')===word.toLocaleLowerCase('nb-NO')),hint=wordMeaning(word,lesson.phrases||[]);
  detail.append(E('strong',word),E('p',sentence,'muted'));
  const meaning=E('input');meaning.type='text';meaning.maxLength=300;meaning.placeholder=hint?.meaning||'Add a meaning in your own words';meaning.value=savedWord?.meaning||hint?.meaning||'';meaning.setAttribute('aria-label',`Meaning of ${word}`);detail.append(meaning);
  detail.append(E('small',hint?(hint.phrase?`Lesson expression: “${hint.phrase}”. Check that the hint fits this sentence.`:'Starter glossary hint · check that it fits this sentence.'):'Add a translation or meaning that helps you remember this word.'));
  const actions=E('div',undefined,'actions');actions.append(B('▶ Hear word',()=>play(word)),B(savedWord?'✓ Update saved word':'Save word',()=>run(async()=>{await api.request('/vocabulary',{method:'POST',body:{word,meaning:meaning.value,source_sentence:sentence,lesson_id:lesson.id}});savedWords=(await api.request('/vocabulary')).items;},'Saving word…'),'chip'),B(recording&&pronunciationTarget===word?'■ Stop recording':'🎙 Practise aloud',()=>recordPhrase(word),'chip',capabilities.transcription==='not_configured'),B('Close',()=>{activeKaraokeWord=null;renderKaraokeWordDetail(detail.parentElement);},'chip'));detail.append(actions);
 }
 const current=parent.querySelector('#karaoke-word-detail');if(current)current.replaceWith(detail);else parent.append(detail);
}
function showKaraokeWord(word,sentence){activeKaraokeWord={word,sentence};const panel=$('karaoke-word-detail')?.parentElement;if(panel){renderKaraokeWordDetail(panel);$('karaoke-word-detail')?.scrollIntoView({behavior:'smooth',block:'nearest'});}}
function renderKaraokeTranscript(parent){
 if(!karaokeSentences.length)return;
 const block=E('section',undefined,'karaoke-card');block.append(E('h3','Follow the full recording'),E('p','Follow each sentence as it highlights. Tap an underlined word to see a meaning hint, hear it, or save it. Sentence timing is approximate because the local recognizer returns short audio chunks.','notice'));
 const player=E('div',undefined,'karaoke-player-host');player.id='karaoke-audio-player';if(originalAudio?.controls)player.append(originalAudio);block.append(player);
 const rows=E('div',undefined,'karaoke-list');
 karaokeSentences.forEach((item,index)=>{
  const row=E('article',undefined,'karaoke-sentence'+(activeKaraokeIndex===index?' active':''));row.id=`karaoke-sentence-${index}`;
  const head=E('div',undefined,'karaoke-line-head');head.append(E('span',`${timeLabel(item.start)} · ${index+1}`,'reader-speaker'));
  head.append(B('▶ Play from here',()=>{if(sourceAudioPlaying&&originalAudio){originalAudio.currentTime=item.start;originalAudio.play().catch(()=>{});updateKaraokeAt(item.start);}else playLessonSource(true,item.start);},'reader-hear'));
  const words=E('p',undefined,'karaoke-words'),pattern=/[\p{L}\p{M}]+(?:[’'-][\p{L}\p{M}]+)*/gu;let cursor=0;
  for(const match of item.text.matchAll(pattern)){
   words.append(document.createTextNode(item.text.slice(cursor,match.index)));
   const token=E('button',match[0],'karaoke-word');token.type='button';token.setAttribute('aria-label',`Show meaning and practice options for ${match[0]}`);token.onclick=()=>showKaraokeWord(match[0],item.text);words.append(token);cursor=match.index+match[0].length;
  }
  words.append(document.createTextNode(item.text.slice(cursor)));row.append(head,words);rows.append(row);
 });
 block.append(rows);renderKaraokeWordDetail(block);parent.append(block);
}

function render(){
 providerStatus();$('error').replaceChildren();if(error){$('error').append(E('p',error,'error'));}
 if(api.pending){const retry=E('button','Retry pending action','primary');retry.disabled=busy;retry.onclick=()=>run(async()=>{await api.retry();await api.refresh();syncStage();},'Retrying…');$('error').append(retry,E('p','The same request id will be reused to prevent duplicate submissions.','notice'));}
 $('account').replaceChildren();const root=$('content');root.replaceChildren();
 if(!capabilities){authScreen(root);return;}
 $('account').append(B('Library',()=>run(async()=>{stopAudio();stopRecording(true);catalogue=(await api.request('/lessons')).items;history=await api.request('/sessions');tab='library';})),B('My lesson',()=>{stopRecording(true);stopAudio();tab='lesson';render();}),B('Studio',()=>{stopRecording(true);stopAudio();tab='studio';render();}),B('Word review',()=>{stopRecording(true);stopAudio();tab='saved';reviewRevealed=false;render();}),B('Sign out',()=>{stopAudio();stopRecording(true);sessionStorage.removeItem('norsk.token');sessionStorage.removeItem('norsk.session');localStorage.removeItem('norsk.rememberToken');localStorage.removeItem('norsk.rememberLogin');api.rememberPending(null);api.token='';api.session=null;capabilities=null;draft='';rememberLogin=false;render();}));
 if(tab==='library'){const card=E('section',undefined,'card');card.append(E('h2','Your listening library.'));for(const l of catalogue)card.append(B(l.title+' · '+l.level,()=>run(async()=>{await loadLesson(l.id);await api.create(l.id);syncStage();draft='';answers={};played=false;tab='lesson';})));card.append(E('h3','Saved sessions'));for(const h of history)card.append(B((h.state.completed?'Completed':'Continue')+' · '+h.created_at.slice(0,16),()=>run(async()=>{api.session=await api.request('/sessions/'+h.id);await loadLesson(api.session.lesson_id);syncStage();tab='lesson';})));root.append(card);return;}
 if(tab==='studio'){renderStudio(root);return;}
 if(tab==='saved'){
  const card=E('section',undefined,'card');card.append(E('div','A LITTLE PRACTICE EVERY DAY','eyebrow'),E('h2','Your word garden.'));
  const learning=savedWords.filter(word=>word.status==='learning');
  if(learning.length){if(reviewIndex>=learning.length)reviewIndex=0;const word=learning[reviewIndex];const flash=E('div',undefined,'word-flashcard');flash.append(E('small',`WORD ${reviewIndex+1} OF ${learning.length}`,'reader-speaker'),E('h3',word.word));
   if(reviewRevealed){flash.append(E('p',word.meaning||'Add a meaning that makes sense to you.'),E('blockquote',word.source_sentence||'No source sentence saved.'),B('▶ Hear source sentence',()=>play(word.source_sentence||word.word)));}
   flash.append(B(reviewRevealed?'Hide meaning':'Show meaning',()=>{reviewRevealed=!reviewRevealed;render();}));
   const actions=E('div',undefined,'actions');actions.append(B('✓ I know this',()=>run(async()=>{await api.request('/vocabulary/'+word.id,{method:'PATCH',body:{status:'known'}});savedWords=(await api.request('/vocabulary')).items;reviewIndex=learning.length?reviewIndex%learning.length:0;reviewRevealed=false;},'Updating review…'),'primary'),B('↻ Practise again',()=>{reviewIndex=(reviewIndex+1)%learning.length;reviewRevealed=false;render();}));flash.append(actions);card.append(flash);
  }else card.append(E('p','No words waiting for review. Tap a word in a lesson transcript to save one.','notice'));
  card.append(E('h3','Saved words'));
  if(savedWords.length){for(const word of savedWords){const row=E('div',undefined,'phrase'),copy=E('div'),meaning=E('input');copy.append(E('strong',word.word));meaning.type='text';meaning.maxLength=300;meaning.value=word.meaning;meaning.placeholder='Your meaning';meaning.setAttribute('aria-label',`Meaning of ${word.word}`);copy.append(meaning);if(word.source_sentence)copy.append(E('small',word.source_sentence));row.append(copy,B('Save meaning',()=>run(async()=>{await api.request('/vocabulary/'+word.id,{method:'PATCH',body:{meaning:meaning.value}});savedWords=(await api.request('/vocabulary')).items;})),B(word.status==='known'?'Practise again':'Mark known',()=>run(async()=>{await api.request('/vocabulary/'+word.id,{method:'PATCH',body:{status:word.status==='known'?'learning':'known'}});savedWords=(await api.request('/vocabulary')).items;})),B('Hear',()=>play(word.source_sentence||word.word)),B('Remove',()=>run(async()=>{await api.request('/vocabulary/'+word.id,{method:'DELETE'});savedWords=(await api.request('/vocabulary')).items;})));card.append(row);}}
  card.append(E('h3','Saved lesson phrases'));
  for(const phrase of saved){const row=E('div',undefined,'phrase');row.append(E('span',phrase.text),B('Hear',()=>play(phrase.text)),B('Remove',()=>run(async()=>{await api.request('/phrases/'+phrase.id,{method:'DELETE'});saved=(await api.request('/phrases')).items;})));card.append(row);}
  if(!saved.length)card.append(E('p','Save expressions during a lesson to keep them here.','notice'));root.append(card);return;
 }
 const head=E('div',undefined,'lesson-heading');head.append(E('h2',lesson.title),E('p','One clip → listening questions → useful expressions → your conversation.','muted'));root.append(head);
 if(!api.session){root.append(B('Start a lesson →',()=>run(async()=>{await api.create(lesson.id);syncStage();draft='';answers={};played=false;}),'primary dark'));if(history.length){root.append(E('h3','Previous sessions'));for(const s of history)root.append(B(`${s.state.completed?'Completed':'Continue'} · ${s.created_at.slice(0,16)}`,()=>run(async()=>{api.session=await api.request('/sessions/'+s.id);await loadLesson(api.session.lesson_id);syncStage();})));}return;}
 const s=api.session.state;
 const progress=E('nav',undefined,'lesson-steps');progress.setAttribute('aria-label','Lesson progress');stages.forEach((name,i)=>{const b=B(`${stageIcons[i]} ${i+1}. ${name}`,()=>{stopAudio();stage=i;render();},'lesson-step'+(stage===i?' current':''),i>stages.indexOf(s.step));if(stage===i)b.setAttribute('aria-current','step');progress.append(b);});root.append(progress);
 root.append(E('p',`✦ Progress saved · Step ${stage+1} of ${stages.length}`,'notice'));
 const grid=E('div',undefined,'grid'),main=E('section',undefined,'card'),side=E('aside',undefined,'card');grid.append(main,side);root.append(grid);
 side.append(E('div','SAME CLIP, THROUGHOUT','eyebrow'),E('h2',lesson.source.title),E('p',lesson.mode==='generated'?(studioYoutubeId?'YouTube video embedded below; transcript speech is synthesized separately.':lessonSourceAudioAvailable?'Original source audio is saved with this lesson. Choose the excerpt or full recording below.':'Transcript speech is synthesized. Import an audio file in Studio to replay the original recording.'):'Authored Norwegian dialogue. Playback is synthesized on the backend.','notice'));
 if(lesson.mode==='generated'&&studioYoutubeId&&lessonSourceId===studioYoutubeId){const player=E('iframe');player.id='youtube-source-player';player.src=youtubeEmbed(studioYoutubeId,studioYoutubeStart,studioYoutubeEnd);player.title='YouTube listening source';player.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';player.allowFullscreen=true;player.style.cssText='width:100%;aspect-ratio:16/9;border:0;border-radius:16px';side.append(player);}
 const speed=E('select');speed.id='speed';speed.setAttribute('aria-label','Audio speed');for(const rate of ['1','0.8']){const o=E('option',rate+'×');o.value=rate;speed.append(o);}const controls=E('div',undefined,'actions');if(lesson.mode==='generated'&&lessonSourceAudioAvailable){controls.append(B('▶ Lesson excerpt',()=>playLessonSource(false)),B('🎧 Full recording',()=>playLessonSource(true)));}else if(lesson.mode==='generated'&&studioURL)controls.append(B('▶ Original source',playOriginalClip));controls.append(B(lesson.mode==='generated'?'Hear transcript (TTS)':'Replay sample',()=>play(playbackText,true)),B('Stop audio',stopAudio),speed);side.append(controls);
 for(const p of lesson.phrases){side.append(E('p',`${s.used.includes(p.id)?'✓ Used':s.practised.includes(p.id)?'✓ Practised':'○'} ${p.short}`,'notice'));}
 side.append(E('p','You can edit speech transcripts before sending. Ollama can suggest grammar corrections. Phrase practice compares the recognizer’s words with the target; it cannot score sounds, accent, or fluency.','notice'));
 const addSave=(box,p)=>box.append(B(saved.some(x=>x.id===p.id)?'✓ Saved':'Save phrase',()=>run(async()=>{await api.request('/phrases/'+p.id,{method:'PUT'});saved=(await api.request('/phrases')).items;})));
 if(stage===0){
  main.append(E('h2','Ready, set… listen!'));
  if(lesson.mode==='generated'&&studioYoutubeId){main.append(E('p','Play the selected segment in the YouTube player, then answer two questions. The app uses your confirmed transcript for the exercises.'),B('▶ Go to YouTube player',()=>$('youtube-source-player')?.scrollIntoView({behavior:'smooth',block:'center'}),'primary dark'),B('Hear transcript (TTS)',()=>play(playbackText,false)));}
  else if(lesson.mode==='generated'&&lessonSourceAudioAvailable){const starts=lessonSourceSegments.map(segment=>Number(segment.start)).filter(Number.isFinite),ends=lessonSourceSegments.map(segment=>Number(segment.end)).filter(Number.isFinite);const excerptLength=starts.length&&ends.length?timeLabel(Math.max(...ends)-Math.min(...starts)):'lesson excerpt';main.append(E('p','Listen to the original recording for full context, or replay the excerpt used for your questions.'),B(`▶ Lesson excerpt · ${excerptLength}`,()=>playLessonSource(false),'primary dark'),B('🎧 Listen to full recording',()=>playLessonSource(true),'chip'),B('Hear transcript (TTS)',()=>play(playbackText,true),'chip'));}
  else main.append(E('p',lesson.mode==='generated'?'Listen to your confirmed source, then answer two questions.':'Is the coffee for here or takeaway? How much does it cost?'),B('▶ Listen',()=>play(playbackText,true),'primary dark'));
  if(lesson.mode==='generated'&&studioYoutubeId)main.append(B(played?'✓ Marked as listened':'I listened to the YouTube segment',()=>{played=true;render();}));
  main.append(B('Show transcript',()=>run(async()=>{if(!s.transcript_help&&!s.completed)await api.mutate('transcript-help');const lines=$('transcript-lines');lines?.classList.remove('hidden');})));main.append(E('p','Tap “Hear sentence” for a replay, or tap an underlined word for a meaning hint. Sentence replay uses generated Norwegian speech.','notice'));const lines=E('div',undefined,s.transcript_help?'':'hidden');lines.id='transcript-lines';renderTranscriptReader(lines);main.append(lines);
  renderKaraokeTranscript(main);
  main.append(B('Continue to questions →',()=>run(async()=>{if(s.step==='listen')await advance('listening',{mode:played?'played_self_reported':'mock_skip'});else stage=1;}),'primary wide'));
  main.append(E('p',lesson.mode==='generated'&&studioYoutubeId?(played?'You marked the YouTube segment as listened; playback is not verified.':'Listen to the YouTube segment or continue without it.'):(played?'Audio played.':'You may continue without listening; the recap will record that audio was skipped.'),'notice'));
 }else if(stage===1){
  main.append(E('h2','Let’s see what you caught!'));
  for(const q of lesson.questions){const box=E('fieldset',undefined,'lesson-question');box.append(E('legend',q.prompt));q.options.forEach((o,i)=>{const selected=(s.answers||answers)[q.id]===i;const b=B(o,()=>{answers[q.id]=i;render();},'answer'+(selected?' chosen':''),!!s.answers);b.setAttribute('aria-pressed',selected);box.append(b);});main.append(box);}
  main.append(B(s.answers?'View feedback →':'Check answers →',()=>run(async()=>{if(s.answers)stage=2;else await advance('answers',{answers});}),'primary dark wide',!s.answers&&lesson.questions.some(q=>answers[q.id]===undefined)));
 }else if(stage===2){
  main.append(E('h2',`${s.review.filter(r=>r.is_correct).length} of ${s.review.length} correct`));
  for(const r of s.review){const q=lesson.questions.find(q=>q.id===r.question_id),box=E('div',undefined,'callout');box.append(E('strong',q.prompt),E('p','Your answer: '+q.options[r.selected]),E('p','Correct answer: '+q.options[r.correct]),E('blockquote',r.evidence.map(l=>l.text).join(' ')),E('p',r.explanation),B('▶ Hear evidence',()=>play(r.evidence.map(l=>l.text).join(' '))));main.append(box);}
  main.append(B('Practise expressions →',()=>{stage=3;render();},'primary dark wide'));
 }else if(stage===3){
  main.append(E('h2','Say it, then make it yours.'));
  for(const p of lesson.phrases){const box=E('div',undefined,'callout');box.append(E('h3',p.text),E('p',p.meaning),E('p',p.tip),B('▶ Hear',()=>play(p.text)),B(recording&&pronunciationTarget===p.text?'■ Stop recording':'🎙 Try saying it',()=>recordPhrase(p.text),'chip',capabilities.transcription==='not_configured'),B(s.practised.includes(p.id)?'✓ Marked practised':'I said it aloud',()=>run(()=>advance('practice',{phrase_id:p.id,practised:!s.practised.includes(p.id)},3)), 'chip',!['review','practise'].includes(s.step)));if(pronunciationFeedback?.target===p.text){box.append(E('p',`Recognizer heard: “${pronunciationFeedback.recognized}”`,'notice'),E('p',pronunciationFeedback.message,'feedback'));for(const diff of pronunciationFeedback.differences){const expected=diff.target.join(' ')||'—',heard=diff.heard.join(' ')||'—';box.append(E('p',`Compare: “${expected}” → “${heard}”`,'notice'));}}addSave(box,p);main.append(box);}
  main.append(B('Enter role-play →',()=>run(async()=>{if(s.roleplay_started)stage=4;else await advance('roleplay');}),'primary dark wide'));
 }else if(stage===4){
  main.append(E('h2','Your words, your adventure.'),E('p',lesson.roleplay_context,'muted'));
  const tray=E('div',undefined,'chips');for(const p of lesson.phrases)tray.append(B(p.short,()=>{draft=p.text;inputMode='typed';render();}));main.append(tray);
  const log=E('div',undefined,'conversation');log.setAttribute('role','log');
  const messages=[{role:'Partner',text:s.opening}];for(const turn of s.turns)messages.push({role:'You',text:turn.learner_text},{role:'Partner',text:turn.result.partner_text});
  for(const m of messages){const row=E('div',undefined,'bubble'+(m.role==='You'?' user':''));row.append(E('small',m.role),E('div',m.text));if(m.role==='Partner')row.append(B('▶ Hear reply',()=>play(m.text)));log.append(row);}main.append(log);
  if(s.last_correction){const c=s.last_correction;main.append(E('div',`${c.original} → ${c.suggestion}. ${c.explanation}`,'feedback'));}
  if(s.completed){main.append(E('div','This conversation has ended. Your lesson progress is saved. Start a fresh role-play to keep speaking; the old dialogue will remain in your saved history.','callout'),B('Start a fresh role-play →',()=>run(async()=>{await advance('roleplay/restart');draft='';inputMode='typed';},'Starting a fresh conversation…'),'primary dark wide'));return;}
  const composer=E('section',undefined,'roleplay-composer');composer.append(E('label','Your turn','reader-speaker'));
  const toolbar=E('div',undefined,'roleplay-toolbar'),mic=B(recording?'■ Stop recording':'🎙 Speak Norwegian',record,'chip'+(recording?' recording':''),s.completed||capabilities.transcription==='not_configured');mic.disabled=busy||s.completed||!!api.pending||capabilities.transcription==='not_configured';toolbar.append(mic);
  const fileLabel=E('label','Or choose audio ' ,'notice'),file=E('input');file.type='file';file.accept='audio/*';file.disabled=busy||s.completed;file.onchange=()=>{if(file.files[0])transcribeBlob(file.files[0]);};fileLabel.append(file);toolbar.append(fileLabel);composer.append(toolbar);
  const input=E('textarea');input.value=draft;input.maxLength=2000;input.placeholder='Your Norwegian reply; edit the transcript if needed.';input.setAttribute('aria-label','Your reply');input.oninput=()=>{draft=input.value;send.disabled=s.completed||!draft.trim();};composer.append(input);
  const form=E('form',undefined,'roleplay-form'),send=B('Send your turn →',()=>{},'primary dark',s.completed||!draft.trim());send.type='submit';form.append(send);form.onsubmit=e=>{e.preventDefault();if(!draft.trim())return;run(async()=>{await advance('turns',{text:draft,input_mode:inputMode});draft='';inputMode='typed';},'Your conversation partner is thinking…');};composer.append(form);
  const turnsToFinish=Math.max(0,3-s.turns.length);composer.append(E('p','Review the recognized words, then send. Your partner should answer and move the scenario forward.','notice'),B(turnsToFinish?`Keep talking · ${s.turns.length}/3 turns`:'End role-play & see recap →',()=>run(async()=>{await advance('complete');}),'chip wide',turnsToFinish>0||recording));main.append(composer);
 }else{
  main.append(E('h2','Look what you did!'),E('p',`${s.review.filter(r=>r.is_correct).length}/${lesson.questions.length} correct · ${s.practised.length} marked practised · ${s.used.length} phrases matched.`),E('p',`${s.turns.length} replies saved. ${s.listening_mode==='mock_skip'?'Audio was skipped.':'Playback was self-reported.'} ${s.transcript_help?'Transcript help used.':''}`,'notice'));
  main.append(E('p','Phrase matches are literal text checks. There is no pronunciation or overall proficiency score.','notice'));
  for(const p of lesson.phrases){const row=E('div',undefined,'phrase');row.append(E('span',p.text));addSave(row,p);main.append(row);}
  if(s.roleplay_started)main.append(B('Start a fresh role-play →',()=>run(async()=>{await advance('roleplay/restart');draft='';inputMode='typed';},'Starting a fresh conversation…'),'primary dark wide'));
  main.append(B('Start another lesson →',()=>run(async()=>{await api.create(lesson.id);syncStage();draft='';answers={};played=false;}),'primary dark wide'));
 }
}
window.addEventListener('pagehide',()=>{stopAudio();stopRecording(true);if(studioURL)URL.revokeObjectURL(studioURL);});
render();if(token)run(connect,'Resuming your session…');
