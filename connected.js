import {NorskClient} from './api-client.js';
const $=id=>document.getElementById(id);
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
let rememberLogin=localStorage.getItem('norsk.rememberLogin')==='true';
let token=(rememberLogin&&localStorage.getItem('norsk.rememberToken'))||sessionStorage.getItem('norsk.token')||'';
const api=new NorskClient({token});
let capabilities=null,lesson=null,script=[],saved=[],history=[],stage=0,busy=false,error='',draft='',inputMode='typed',answers={},played=false,tab='lesson',playbackText='',catalogue=[],studioText='',studioLevel='A2',studioKind='text',studioFile=null,studioURL=null,studioStart=0,studioEnd=20,studioRequest=null,studioSourceURL='',studioImportSource='file',studioYoutubeId='',studioYoutubeStart=0,studioYoutubeEnd=20,studioLongClips=[],studioLongClipIndex=-1,pronunciationTarget='',pronunciationFeedback=null;
let speechVoice=localStorage.getItem('norsk.voice')||'female',speechPace=localStorage.getItem('norsk.pace')||'slow';
if(!['female','male'].includes(speechVoice))speechVoice='female';
if(!['slow','normal','fast'].includes(speechPace))speechPace='slow';
let transcriptionProvider='local';
let speechWaiting=false;
let audio=null,audioURL=null,originalAudio=null,mediaStream=null,recorder=null,recordTimer=null,recording=false,audioGeneration=0,recordEpoch=0;
const stages=['listen','answer','review','practise','roleplay','recap'];
const stageIcons=['🎧','🧩','💡','🗣️','💬','⭐'];
function B(text,fn,cls='chip',disabled=false){const b=E('button',text,cls);b.type='button';b.disabled=disabled||busy||!!api.pending;b.onclick=fn;return b;}
function timeLabel(seconds){const value=Math.max(0,Math.floor(seconds));return `${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`;}
function youtubeId(value){try{const u=new URL(value),host=u.hostname.toLowerCase().replace(/^www\./,'');if(!['youtube.com','m.youtube.com','music.youtube.com','youtu.be','youtube-nocookie.com'].includes(host))return '';const id=host==='youtu.be'?u.pathname.split('/').filter(Boolean)[0]:u.searchParams.get('v')||u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1]||'';return /^[A-Za-z0-9_-]{11}$/.test(id)?id:'';}catch{return '';}}
function isUnsupportedStreamingPage(value){try{const host=new URL(value).hostname.toLowerCase().replace(/^www\./,'');return host==='spotify.com'||host.endsWith('.spotify.com');}catch{return false;}}
function youtubeEmbed(id,start=0,end=0){return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&start=${Math.max(0,Math.floor(start))}${end>start?`&end=${Math.floor(end)}`:''}`;}
function stopAudio(){audioGeneration++;if(audio)audio.pause();if(audioURL)URL.revokeObjectURL(audioURL);if(originalAudio){originalAudio.pause();originalAudio.src='';}audio=null;audioURL=null;originalAudio=null;}
function stopRecording(discard=false){if(discard)recordEpoch++;if(recorder&&recorder.state==='recording')recorder.stop();mediaStream?.getTracks().forEach(t=>t.stop());clearTimeout(recordTimer);recording=false;}
function syncStage(){if(api.session)stage=stages.indexOf(api.session.state.step);}
function remember(){if(api.session)sessionStorage.setItem('norsk.session',api.session.id);}
async function run(fn,label='Saving…'){
 if(busy)return;busy=true;error='';render();$('operation').textContent=label;
 try{await fn();remember();}catch(e){error=e.message;if(e.status===409&&api.session){try{await api.refresh();syncStage();}catch{}}}
 finally{busy=false;$('operation').textContent='';render();}
}
async function connect(){
 capabilities=await api.request('/capabilities');catalogue=(await api.request('/lessons')).items;
 saved=(await api.request('/phrases')).items;history=await api.request('/sessions');
 const last=sessionStorage.getItem('norsk.session');api.session=history.find(s=>s.id===last)||history.find(s=>!s.state.completed)||null;await loadLesson(api.session?.lesson_id||catalogue[0].id);syncStage();
 sessionStorage.setItem('norsk.token',api.token);
 if(rememberLogin){localStorage.setItem('norsk.rememberLogin','true');localStorage.setItem('norsk.rememberToken',api.token);}else{localStorage.removeItem('norsk.rememberLogin');localStorage.removeItem('norsk.rememberToken');}
}
async function loadLesson(id){lesson=await api.request('/lessons/'+id);const data=await api.request('/lessons/'+id+'/script');script=data.lines;playbackText=data.playback_text;}
async function advance(action,payload={},next){await api.mutate(action,payload);syncStage();if(next!==undefined)stage=next;}
async function play(text,wholeClip=false){
 if(speechWaiting){$('operation').textContent='Speech is already being generated. Please wait.';return;}
 speechWaiting=true;
 stopAudio();const generation=audioGeneration;$('operation').textContent='Generating Norwegian audio · '+capabilities.tts+' · please wait…';
 const started=Date.now();const waiting=setInterval(()=>{if(generation===audioGeneration)$('operation').textContent='Waiting for '+capabilities.tts+' · '+Math.floor((Date.now()-started)/1000)+' seconds · remote speech can take several minutes.';},1000);
 try{
  const blob=await api.request('/speech/synthesize',{method:'POST',body:{text,voice:speechVoice,pace:speechPace},timeoutMs:620000});clearInterval(waiting);if(generation!==audioGeneration)return;
  audioURL=URL.createObjectURL(blob);audio=new Audio(audioURL);audio.playbackRate=Number($('speed')?.value||1);
  audio.onended=()=>{if(wholeClip)played=true;$('operation').textContent='Playback finished.';render();};
  await audio.play();$('operation').textContent='Playing · '+capabilities.tts;
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
async function transcribeBlob(blob){
 await run(async()=>{const result=await api.request('/speech/transcribe?provider='+transcriptionProvider,{method:'POST',body:blob,raw:true,timeoutMs:600000});draft=result.text;inputMode='confirmed_transcript';},transcriptionProvider==='local'?'Transcribing locally with NB-Whisper…':'Uploading selected audio to NB hosted Whisper…');
}
async function checkPhraseAudio(blob,target){
 await run(async()=>{pronunciationFeedback=await api.request(`/speech/pronunciation-check?provider=${transcriptionProvider}&target=${encodeURIComponent(target)}`,{method:'POST',body:blob,raw:true,timeoutMs:600000});},'Listening for the phrase…');
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
function authScreen(root){
 const card=E('section',undefined,'card');card.append(E('h2','Connect to your learning.'),E('p','Your backend saves your lesson and runs the configured speech models. Open the local development key file to sign in.','muted'));
 const form=E('form');const input=E('input');input.type='password';input.autocomplete='off';input.placeholder='Local API key';input.setAttribute('aria-label','Local API key');const submit=B('Connect',()=>{},'primary dark');submit.type='submit';
 const rememberLabel=E('label',' Keep me signed in on this device '),remember=E('input');remember.type='checkbox';remember.checked=rememberLogin;remember.setAttribute('aria-label','Keep me signed in on this device');rememberLabel.prepend(remember);
 form.append(input,rememberLabel,submit);form.onsubmit=e=>{e.preventDefault();rememberLogin=remember.checked;api.token=input.value.trim();run(connect,'Connecting…');};
 const label=E('label','Or choose backend/.local-config.json: ','notice');const file=E('input');file.type='file';file.accept='.json';file.onchange=()=>{rememberLogin=remember.checked;run(async()=>{const config=JSON.parse(await file.files[0].text());api.token=Object.keys(config.api_keys||{})[0]||'';if(!api.token)throw new Error('No API key in that file.');await connect();},'Connecting…');};label.append(file);
 card.append(form,E('p',rememberLogin?'This device remembers your local API key until you sign out or clear browser data.':'By default, your key lasts only for this browser tab. “Keep me signed in” stores it in this browser on this device.','notice'),label);root.append(card);
}
function providerStatus(){
 $('connection').replaceChildren();if(!capabilities)return;
 $('connection').append(E('div',`Conversation: ${capabilities.conversation} · Transcription: ${transcriptionProvider==='nb_hosted'?'NB-Whisper Large (hosted demo · experimental)':capabilities.transcription} · Voice: ${capabilities.tts} · Pronunciation: phrase transcript hints only`,'statusbar'));
 const asrLabel=E('label','Speech recognition '),asr=E('select');asr.setAttribute('aria-label','Speech recognition');
 for(const [value,text] of [['local','Local · NB-Whisper Tiny'],['nb_hosted','Hosted API · NB-Whisper Large (experimental)']]){const o=E('option',text);o.value=value;asr.append(o);}asr.value=transcriptionProvider;
 asr.disabled=busy||recording;asr.onchange=()=>{transcriptionProvider=asr.value;render();};asrLabel.append(asr);$('connection').append(asrLabel,E('p',transcriptionProvider==='local'?'Recordings are transcribed on your local backend.':'Hosted mode uploads your selected audio to NB’s public Hugging Face demo. Availability and retention are controlled by that service; the demo may be offline.','notice'));
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
 const sourceOptions=[
  ['file','📁','On my device','Use a non-DRM file you are allowed to use.'],
  ['youtube','▶️','YouTube','Use available Norwegian captions.'],
  ['nrk','📻','NRK','Try a public page or accessible programme audio.'],
  ['public_audio','🎙️','Podcast / public audio','Use a public episode page or direct audio link.'],
  ['text','📝','Paste text','Add captions, a transcript, or Norwegian text.']
 ];
 const pickerGrid=E('div',undefined,'source-picker');
 for(const [id,icon,title,description] of sourceOptions){
  const button=E('button',undefined,'source-option'+(studioImportSource===id?' selected':''));button.type='button';button.disabled=busy;button.setAttribute('aria-pressed',studioImportSource===id?'true':'false');
  button.append(E('span',icon,'source-icon'),E('strong',title),E('small',description));
  button.onclick=()=>{if(studioImportSource!==id){stopAudio();studioImportSource=id;studioText='';studioFile=null;studioYoutubeId='';studioSourceURL='';studioRequest=null;studioLongClips=[];studioLongClipIndex=-1;if(studioURL)URL.revokeObjectURL(studioURL);studioURL=null;}render();};pickerGrid.append(button);
 }
 card.append(pickerGrid);

 if(studioImportSource==='file'){
  card.append(step(2,'Add your audio or video file'));
  const picker=E('input');picker.type='file';picker.accept='audio/*,video/*';picker.disabled=busy;picker.setAttribute('aria-label','Local audio or video');
  picker.onchange=()=>{stopAudio();studioYoutubeId='';studioFile=picker.files[0];if(studioURL)URL.revokeObjectURL(studioURL);studioURL=studioFile?URL.createObjectURL(studioFile):null;studioStart=0;studioEnd=20;studioText='';studioLongClips=[];studioLongClipIndex=-1;studioRequest=null;render();};card.append(picker);
  if(!studioFile)card.append(E('p',transcriptionProvider==='nb_hosted'?'Choose a file up to 50 MB. Hosted NB-Whisper can transcribe a recording up to 30 minutes and split it into practice clips.':'Choose a file up to 12 MB. Longer recordings can be divided into short clips for practice. Switch to Hosted NB-Whisper for longer files.','notice'));
 }
 if(['youtube','nrk','public_audio'].includes(studioImportSource)){
  card.append(step(2,studioImportSource==='youtube'?'Add your YouTube link':studioImportSource==='nrk'?'Add an NRK link':'Add a public podcast or audio link'));
  const urlInput=E('input');urlInput.type='url';urlInput.placeholder=studioImportSource==='youtube'?'Paste YouTube URL here':studioImportSource==='nrk'?'Paste an NRK programme or article URL':'Paste a public episode page or direct audio URL';urlInput.value=studioSourceURL;urlInput.autocomplete='url';urlInput.setAttribute('aria-label','Source URL');urlInput.oninput=()=>{studioSourceURL=urlInput.value;};card.append(urlInput);
  const importLabel=studioImportSource==='youtube'?'Load YouTube video':studioImportSource==='nrk'?'Import NRK source':'Import podcast / audio';
  card.append(B(importLabel,()=>run(async()=>{
   if(!studioSourceURL.trim())throw new Error('Paste a URL first.');
   const youtubeVideoId=youtubeId(studioSourceURL.trim());
   if(studioImportSource==='youtube'&&!youtubeVideoId)throw new Error('Paste a valid YouTube video link.');
   if(studioImportSource!=='youtube'&&youtubeVideoId)throw new Error('Choose the YouTube source option for YouTube links.');
   if(studioImportSource==='nrk'){let host='';try{host=new URL(studioSourceURL.trim()).hostname.toLowerCase();}catch{}if(host!=='nrk.no'&&!host.endsWith('.nrk.no'))throw new Error('That link is not on nrk.no. Choose “Podcast / public audio” for a public episode or direct audio link.');}
   if(youtubeVideoId){stopAudio();studioYoutubeId=youtubeVideoId;studioYoutubeStart=0;studioYoutubeEnd=20;studioFile=null;if(studioURL)URL.revokeObjectURL(studioURL);studioURL=null;studioText='';studioKind='audio transcript';studioRequest=null;return;}
   if(isUnsupportedStreamingPage(studioSourceURL.trim()))throw new Error('Spotify streaming pages are not supported. Try a public direct audio link or a file you are allowed to use.');
   if(/(?:youtube\.com|youtu\.be)/i.test(studioSourceURL.trim()))throw new Error('I could not find a valid YouTube video ID in that link.');
   let result;try{result=await api.request('/studio/import-url',{method:'POST',body:{url:studioSourceURL.trim()},timeoutMs:60000});}catch(e){if(e.status===404)throw new Error('URL import is not available in the backend currently running. Restart Norsk Rom’s backend, then try again.');throw e;}
   if(result instanceof Blob){
    stopAudio();studioYoutubeId='';if(studioURL)URL.revokeObjectURL(studioURL);
    let name='online-media';try{name=decodeURIComponent(new URL(studioSourceURL).pathname.split('/').pop())||name;}catch{}
    studioFile=new File([result],name,{type:result.type||'application/octet-stream'});studioURL=URL.createObjectURL(studioFile);studioStart=0;studioEnd=20;studioText='';studioKind='audio transcript';
   }else{studioText=result.text||'';studioKind='text';studioFile=null;studioYoutubeId='';if(studioURL)URL.revokeObjectURL(studioURL);studioURL=null;}
   studioRequest=null;
  },studioImportSource==='nrk'?'Importing NRK source…':studioImportSource==='public_audio'?'Importing public audio…':'Loading source…'),'primary dark'));
  card.append(E('p',studioImportSource==='youtube'?'The video appears below. Norsk Rom uses available Norwegian captions and does not download YouTube audio.':studioImportSource==='nrk'?'NRK pages vary. Norsk Rom tries public text or directly accessible media; it cannot sign in or bypass DRM.':'Use an openly accessible episode page or direct audio file up to 12 MB. Pages that require sign-in, subscription access, or DRM cannot be imported.','notice'));
 }
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
   studioText=result.text;studioKind='audio transcript';studioRequest=null;if(result.is_generated)error='These captions were auto-generated. Review names and wording below.';
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
  if(transcriptionProvider==='nb_hosted'){
   card.append(B('Transcribe the full recording · NB-Whisper',()=>run(async()=>{
    if(studioFile.size>50*1024*1024)throw new Error('Choose a file smaller than 50 MB.');
    if(!Number.isFinite(player.duration)||player.duration<0.25||player.duration>1800)throw new Error('The recording must be between 0.25 seconds and 30 minutes.');
    const result=await api.request(`/speech/transcribe-long?end=${player.duration}`,{method:'POST',body:studioFile,raw:true,timeoutMs:900000});
    studioLongClips=result.clips||[];if(!studioLongClips.length)throw new Error('NB-Whisper returned a transcript without usable timestamps. Try a short clip or paste the transcript manually.');
    studioLongClipIndex=0;studioStart=studioLongClips[0].start;studioEnd=studioLongClips[0].end;studioText=studioLongClips[0].text;studioKind='audio transcript';studioRequest=null;
   },'Uploading the recording to NB hosted Whisper. Long audio can take several minutes…'),'primary dark'));
   card.append(E('p','The full recording is uploaded to the public Hugging Face NB demo. Use only media you have permission to process; remote availability and handling are controlled by Hugging Face/NB.','notice'));
  }
  if(studioLongClips.length){
   const choices=E('div',undefined,'actions');choices.append(E('p','Choose a transcript clip to review and turn into a lesson:','notice'));
   studioLongClips.forEach((clip,index)=>choices.append(B(`Clip ${index+1} · ${timeLabel(clip.start)}–${timeLabel(clip.end)}`,()=>{studioLongClipIndex=index;studioStart=clip.start;studioEnd=clip.end;studioText=clip.text;studioRequest=null;render();},studioLongClipIndex===index?'primary':'chip')));
   card.append(choices);
  }
  card.append(B('Make transcript',()=>run(async()=>{
   if(studioFile.size>(transcriptionProvider==='nb_hosted'?50:12)*1024*1024)throw new Error(`Use a file smaller than ${transcriptionProvider==='nb_hosted'?50:12} MB.`);
   if(!Number.isFinite(studioStart)||!Number.isFinite(studioEnd)||studioEnd-studioStart<0.25||studioEnd-studioStart>90)throw new Error('Choose a range from 0.25 to 90 seconds.');
   const result=await api.request(`/speech/transcribe?provider=${transcriptionProvider}&start=${studioStart}&end=${studioEnd}`,{method:'POST',body:studioFile,raw:true,timeoutMs:600000});studioText=result.text;studioKind='audio transcript';studioRequest=null;
  },transcriptionProvider==='local'?'Transcribing your clip…':'Sending your clip to hosted Whisper…'),'primary dark'));
 }
 if(studioImportSource==='file'&&!studioFile)card.append(E('p','Step 3 will appear here after you choose a file.','notice'));

 {
  if(studioImportSource!=='text')card.append(step(4,'Review the Norwegian text'));
  const source=E('textarea');source.value=studioText;source.maxLength=4000;source.setAttribute('aria-label',studioImportSource==='text'?'Norwegian text or transcript':'Confirmed source text');source.placeholder=studioImportSource==='text'?'Paste Norwegian captions, a transcript, or text you are allowed to use.':studioYoutubeId&&studioImportSource==='youtube'?'Your fetched captions will appear here. You can also paste captions manually.':studioFile?'Your transcript will appear here after you click “Make transcript”.':'Imported text will appear here, or paste your own transcript.';source.oninput=()=>{studioText=source.value;studioRequest=null;};card.append(source);
  card.append(step(studioImportSource==='text'?3:5,studioImportSource==='text'?'Choose a level and create the lesson':'Choose a level and create the lesson'));
  const level=E('select');level.setAttribute('aria-label','Target question level');for(const l of ['A1','A2','B1','B2','C1','C2']){const o=E('option',l);o.value=l;level.append(o);}level.value=studioLevel;level.onchange=()=>{studioLevel=level.value;studioRequest=null;};card.append(E('p','Question level (not a certified audio difficulty):','notice'),level);
  card.append(B('Create my lesson →',()=>run(async()=>{
   if(studioText.trim().length<30)throw new Error('Add or fetch at least 30 characters of Norwegian text first.');
   studioRequest=studioRequest||crypto.randomUUID();const generated=await api.request('/studio/lessons',{method:'POST',body:{text:studioText,level:studioLevel,source_kind:studioKind,request_id:studioRequest}});
   await loadLesson(generated.id);await api.create(generated.id);syncStage();draft='';answers={};played=false;tab='lesson';studioRequest=null;
  },'Creating your listening lesson…'),'primary dark wide',capabilities.exercise_generation==='not_configured'));
  card.append(E('p','Your reviewed text and lesson are saved to your account. Source audio is not retained by the backend. Please review generated questions and expressions.','notice'));
 }
}
function render(){
 providerStatus();$('error').replaceChildren();if(error){$('error').append(E('p',error,'error'));}
 if(api.pending){const retry=E('button','Retry pending action','primary');retry.disabled=busy;retry.onclick=()=>run(async()=>{await api.retry();await api.refresh();syncStage();},'Retrying…');$('error').append(retry,E('p','The same request id will be reused to prevent duplicate submissions.','notice'));}
 $('account').replaceChildren();const root=$('content');root.replaceChildren();
 if(!capabilities){authScreen(root);return;}
 $('account').append(B('Library',()=>run(async()=>{stopAudio();stopRecording(true);catalogue=(await api.request('/lessons')).items;history=await api.request('/sessions');tab='library';})),B('My lesson',()=>{stopRecording(true);stopAudio();tab='lesson';render();}),B('Studio',()=>{stopRecording(true);stopAudio();tab='studio';render();}),B('Saved phrases',()=>{stopRecording(true);stopAudio();tab='saved';render();}),B('Sign out',()=>{stopAudio();stopRecording(true);sessionStorage.removeItem('norsk.token');sessionStorage.removeItem('norsk.session');localStorage.removeItem('norsk.rememberToken');localStorage.removeItem('norsk.rememberLogin');api.rememberPending(null);api.token='';api.session=null;capabilities=null;draft='';rememberLogin=false;render();}));
 if(tab==='library'){const card=E('section',undefined,'card');card.append(E('h2','Your listening library.'));for(const l of catalogue)card.append(B(l.title+' · '+l.level,()=>run(async()=>{await loadLesson(l.id);await api.create(l.id);syncStage();draft='';answers={};played=false;tab='lesson';})));card.append(E('h3','Saved sessions'));for(const h of history)card.append(B((h.state.completed?'Completed':'Continue')+' · '+h.created_at.slice(0,16),()=>run(async()=>{api.session=await api.request('/sessions/'+h.id);await loadLesson(api.session.lesson_id);syncStage();tab='lesson';})));root.append(card);return;}
 if(tab==='studio'){renderStudio(root);return;}
 if(tab==='saved'){const card=E('section',undefined,'card');card.append(E('h2','Words worth keeping.'));for(const p of saved){const row=E('div',undefined,'phrase');row.append(E('span',p.text),B('Hear',()=>play(p.text)),B('Remove',()=>run(async()=>{await api.request('/phrases/'+p.id,{method:'DELETE'});saved=(await api.request('/phrases')).items;})));card.append(row);}if(!saved.length)card.append(E('p','Save expressions during your lesson.'));root.append(card);return;}
 const head=E('div',undefined,'lesson-heading');head.append(E('h2',lesson.title),E('p','One clip → listening questions → useful expressions → your conversation.','muted'));root.append(head);
 if(!api.session){root.append(B('Start a lesson →',()=>run(async()=>{await api.create(lesson.id);syncStage();draft='';answers={};played=false;}),'primary dark'));if(history.length){root.append(E('h3','Previous sessions'));for(const s of history)root.append(B(`${s.state.completed?'Completed':'Continue'} · ${s.created_at.slice(0,16)}`,()=>run(async()=>{api.session=await api.request('/sessions/'+s.id);await loadLesson(api.session.lesson_id);syncStage();})));}return;}
 const s=api.session.state;
 const progress=E('nav',undefined,'lesson-steps');progress.setAttribute('aria-label','Lesson progress');stages.forEach((name,i)=>{const b=B(`${stageIcons[i]} ${i+1}. ${name}`,()=>{stopAudio();stage=i;render();},'lesson-step'+(stage===i?' current':''),i>stages.indexOf(s.step));if(stage===i)b.setAttribute('aria-current','step');progress.append(b);});root.append(progress);
 root.append(E('p',`✦ Progress saved · Step ${stage+1} of ${stages.length}`,'notice'));
 const grid=E('div',undefined,'grid'),main=E('section',undefined,'card'),side=E('aside',undefined,'card');grid.append(main,side);root.append(grid);
 side.append(E('div','SAME CLIP, THROUGHOUT','eyebrow'),E('h2',lesson.source.title),E('p',lesson.mode==='generated'?(studioYoutubeId?'YouTube video embedded below; transcript speech is synthesized separately.':studioURL?'Original source audio is available in this tab; transcript speech is synthesized separately.':'Transcript speech is synthesized. Choose the source file in Studio to replay the original audio.'):'Authored Norwegian dialogue. Playback is synthesized on the backend.','notice'));
 if(lesson.mode==='generated'&&studioYoutubeId){const player=E('iframe');player.id='youtube-source-player';player.src=youtubeEmbed(studioYoutubeId,studioYoutubeStart,studioYoutubeEnd);player.title='YouTube listening source';player.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';player.allowFullscreen=true;player.style.cssText='width:100%;aspect-ratio:16/9;border:0;border-radius:16px';side.append(player);}
 const speed=E('select');speed.id='speed';speed.setAttribute('aria-label','Audio speed');for(const rate of ['1','0.8']){const o=E('option',rate+'×');o.value=rate;speed.append(o);}const controls=E('div',undefined,'actions');if(lesson.mode==='generated'&&studioURL)controls.append(B('▶ Original source',playOriginalClip));controls.append(B(lesson.mode==='generated'?'Hear transcript (TTS)':'Replay sample',()=>play(playbackText,true)),B('Stop audio',stopAudio),speed);side.append(controls);
 for(const p of lesson.phrases){side.append(E('p',`${s.used.includes(p.id)?'✓ Used':s.practised.includes(p.id)?'✓ Practised':'○'} ${p.short}`,'notice'));}
 side.append(E('p','You can edit speech transcripts before sending. Ollama can suggest grammar corrections. Phrase practice compares the recognizer’s words with the target; it cannot score sounds, accent, or fluency.','notice'));
 const addSave=(box,p)=>box.append(B(saved.some(x=>x.id===p.id)?'✓ Saved':'Save phrase',()=>run(async()=>{await api.request('/phrases/'+p.id,{method:'PUT'});saved=(await api.request('/phrases')).items;})));
 if(stage===0){
  main.append(E('h2','Ready, set… listen!'));
  if(lesson.mode==='generated'&&studioYoutubeId){main.append(E('p','Play the selected segment in the YouTube player, then answer two questions. The app uses your confirmed transcript for the exercises.'),B('▶ Go to YouTube player',()=>$('youtube-source-player')?.scrollIntoView({behavior:'smooth',block:'center'}),'primary dark'),B('Hear transcript (TTS)',()=>play(playbackText,false)));}
  else main.append(E('p',lesson.mode==='generated'?'Listen to your confirmed source, then answer two questions.':'Is the coffee for here or takeaway? How much does it cost?'),B('▶ Listen',()=>play(playbackText,true),'primary dark'));
  if(lesson.mode==='generated'&&studioYoutubeId)main.append(B(played?'✓ Marked as listened':'I listened to the YouTube segment',()=>{played=true;render();}));
  main.append(B('Show transcript',()=>run(async()=>{if(!s.transcript_help&&!s.completed)await api.mutate('transcript-help');const lines=$('transcript-lines');lines?.classList.remove('hidden');})));const lines=E('div',undefined,s.transcript_help?'':'hidden');lines.id='transcript-lines';for(const l of script)lines.append(E('p',`${l.speaker}: ${l.text}`));main.append(lines);
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
  const form=E('form'),input=E('textarea');input.value=draft;input.maxLength=2000;input.placeholder='Speak, confirm the transcript, then send. Or type your reply.';input.setAttribute('aria-label','Your reply');input.oninput=()=>draft=input.value;form.append(input);
  const send=B('Confirm & send',()=>{},'primary dark',s.completed);send.type='submit';form.append(send);form.onsubmit=e=>{e.preventDefault();if(!draft.trim())return;run(async()=>{await advance('turns',{text:draft,input_mode:inputMode});draft='';inputMode='typed';},'Your conversation partner is thinking…');};main.append(form,E('p','Grammar feedback appears after you send a reply when the local Ollama conversation model is enabled. Speech recognition alone does not check grammar.','notice'));
  const mic=B(recording?'■ Stop recording':'◉ Speak Norwegian',record,'chip'+(recording?' recording':''),s.completed||capabilities.transcription==='not_configured');mic.disabled=busy||s.completed||!!api.pending||capabilities.transcription==='not_configured';main.append(mic);
  const label=E('label',' Or choose an audio clip: ','notice'),file=E('input');file.type='file';file.accept='audio/*';file.disabled=busy||s.completed;file.onchange=()=>{if(file.files[0])transcribeBlob(file.files[0]);};label.append(file);main.append(label,E('p','Recording stops after 60 seconds. Audio goes through your backend; Hosted mode uploads the selected audio to NB’s demo. Local temporary audio is discarded after transcription; the text you confirm is saved with the lesson.','notice'));
  main.append(B(s.completed?'View recap →':'Finish & see recap →',()=>run(async()=>{if(s.completed)stage=5;else await advance('complete');}),'primary wide',!s.turns.length||recording));
 }else{
  main.append(E('h2','Look what you did!'),E('p',`${s.review.filter(r=>r.is_correct).length}/${lesson.questions.length} correct · ${s.practised.length} marked practised · ${s.used.length} phrases matched.`),E('p',`${s.turns.length} replies saved. ${s.listening_mode==='mock_skip'?'Audio was skipped.':'Playback was self-reported.'} ${s.transcript_help?'Transcript help used.':''}`,'notice'));
  main.append(E('p','Phrase matches are literal text checks. There is no pronunciation or overall proficiency score.','notice'));
  for(const p of lesson.phrases){const row=E('div',undefined,'phrase');row.append(E('span',p.text));addSave(row,p);main.append(row);}
  main.append(B('Start another lesson →',()=>run(async()=>{await api.create(lesson.id);syncStage();draft='';answers={};played=false;}),'primary dark wide'));
 }
}
window.addEventListener('pagehide',()=>{stopAudio();stopRecording(true);if(studioURL)URL.revokeObjectURL(studioURL);});
render();if(token)run(connect,'Resuming your session…');
