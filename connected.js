import {NorskClient} from './api-client.js';
const $=id=>document.getElementById(id);
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
let token=sessionStorage.getItem('norsk.token')||'';
const api=new NorskClient({token});
let capabilities=null,lesson=null,script=[],saved=[],history=[],stage=0,busy=false,error='',draft='',inputMode='typed',answers={},played=false,tab='lesson',playbackText='',catalogue=[],studioText='',studioLevel='A2',studioKind='text',studioFile=null,studioURL=null,studioStart=0,studioEnd=20,studioRequest=null;
let speechVoice=localStorage.getItem('norsk.voice')||'female',speechPace=localStorage.getItem('norsk.pace')||'slow';
if(!['female','male'].includes(speechVoice))speechVoice='female';
if(!['slow','normal','fast'].includes(speechPace))speechPace='slow';
let transcriptionProvider='local';
let speechWaiting=false;
let audio=null,audioURL=null,mediaStream=null,recorder=null,recordTimer=null,recording=false,audioGeneration=0,recordEpoch=0;
const stages=['listen','answer','review','practise','roleplay','recap'];
const stageIcons=['🎧','🧩','💡','🗣️','💬','⭐'];
function B(text,fn,cls='chip',disabled=false){const b=E('button',text,cls);b.type='button';b.disabled=disabled||busy||!!api.pending;b.onclick=fn;return b;}
function stopAudio(){audioGeneration++;if(audio)audio.pause();if(audioURL)URL.revokeObjectURL(audioURL);audio=null;audioURL=null;}
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
async function transcribeBlob(blob){
 await run(async()=>{const result=await api.request('/speech/transcribe?provider='+transcriptionProvider,{method:'POST',body:blob,raw:true,timeoutMs:600000});draft=result.text;inputMode='confirmed_transcript';},transcriptionProvider==='local'?'Transcribing locally with NB-Whisper…':'Uploading selected audio to NB hosted Whisper…');
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
 const form=E('form');const input=E('input');input.type='password';input.autocomplete='off';input.placeholder='Local API key';input.setAttribute('aria-label','Local API key');const submit=B('Connect',()=>{},'primary dark');submit.type='submit';form.append(input,submit);form.onsubmit=e=>{e.preventDefault();api.token=input.value.trim();run(connect,'Connecting…');};
 const label=E('label','Or choose backend/.local-config.json: ','notice');const file=E('input');file.type='file';file.accept='.json';file.onchange=()=>run(async()=>{const config=JSON.parse(await file.files[0].text());api.token=Object.keys(config.api_keys||{})[0]||'';if(!api.token)throw new Error('No API key in that file.');await connect();},'Connecting…');label.append(file);
 card.append(form,E('p','The key stays in this browser tab’s session storage and is sent only to this local server. Sign out clears it.','notice'),label);root.append(card);
}
function providerStatus(){
 $('connection').replaceChildren();if(!capabilities)return;
 $('connection').append(E('div',`Conversation: ${capabilities.conversation} · Transcription: ${transcriptionProvider==='nb_hosted'?'NB-Whisper Large (hosted demo · experimental)':capabilities.transcription} · Voice: ${capabilities.tts} · Pronunciation: not assessed`,'statusbar'));
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
 const card=E('section',undefined,'card');root.append(card);card.append(E('div','YOUR CONTENT → YOUR NEXT CONVERSATION','eyebrow'),E('h2','Make a lesson from a clip.'),E('p','Use your own or permitted Norwegian text, or select up to 90 seconds from a local audio/video file. Confirm the transcript before generating questions.','muted'));
 const picker=E('input');picker.type='file';picker.accept='audio/*,video/*';picker.disabled=busy;picker.setAttribute('aria-label','Local audio or video');picker.onchange=()=>{studioFile=picker.files[0];if(studioURL)URL.revokeObjectURL(studioURL);studioURL=studioFile?URL.createObjectURL(studioFile):null;studioStart=0;studioEnd=20;render();};card.append(picker);
 if(studioFile){
  card.append(E('p',studioFile.name,'notice'));const player=E('video');player.controls=true;player.src=studioURL;player.style.cssText='width:100%;max-height:260px';player.preload='metadata';card.append(player);
  const ranges=E('div',undefined,'actions');
  for(const [name,value,setter] of [['Start (seconds)',studioStart,v=>studioStart=v],['End (seconds)',studioEnd,v=>studioEnd=v]]){const label=E('label',name+' '),input=E('input');input.type='number';input.min=0;input.step=0.1;input.value=value;input.style.width='90px';input.setAttribute('aria-label',name);input.oninput=()=>setter(Number(input.value));label.append(input);ranges.append(label);}
  ranges.append(B('▶ Play selected range',()=>{player.currentTime=studioStart;player.play().catch(()=>{error='This browser could not play the file.';render();});}));
  player.ontimeupdate=()=>{if(player.currentTime>=studioEnd)player.pause();};card.append(ranges);
  card.append(B('Transcribe selected clip',()=>run(async()=>{
   if(studioFile.size>12*1024*1024)throw new Error('Use a file smaller than 12 MB.');
   if(!Number.isFinite(studioStart)||!Number.isFinite(studioEnd)||studioEnd-studioStart<0.25||studioEnd-studioStart>90)throw new Error('Choose a range from 0.25 to 90 seconds.');
   const result=await api.request(`/speech/transcribe?provider=${transcriptionProvider}&start=${studioStart}&end=${studioEnd}`,{method:'POST',body:studioFile,raw:true,timeoutMs:600000});studioText=result.text;studioKind='audio transcript';studioRequest=null;
  },transcriptionProvider==='local'?'Transcribing your clip locally…':'Uploading selected clip to NB hosted Whisper…'),'primary dark'));
 }
 card.append(E('h3','Confirm the Norwegian text'));const source=E('textarea');source.value=studioText;source.maxLength=4000;source.setAttribute('aria-label','Confirmed source text');source.placeholder='Paste Norwegian text here, or transcribe a clip above.';source.oninput=()=>{studioText=source.value;studioRequest=null;};card.append(source);
 const level=E('select');level.setAttribute('aria-label','Target question level');for(const l of ['A1','A2','B1','B2','C1','C2']){const o=E('option',l);o.value=l;level.append(o);}level.value=studioLevel;level.onchange=()=>{studioLevel=level.value;studioRequest=null;};card.append(E('p','Target question level (not a certified audio difficulty):','notice'),level);
 card.append(B('Generate my connected lesson →',()=>run(async()=>{
  if(studioText.trim().length<30)throw new Error('Add at least 30 characters of clear Norwegian source text.');
  studioRequest=studioRequest||crypto.randomUUID();
  const generated=await api.request('/studio/lessons',{method:'POST',body:{text:studioText,level:studioLevel,source_kind:studioKind,request_id:studioRequest}});
  await loadLesson(generated.id);await api.create(generated.id);syncStage();draft='';answers={};played=false;tab='lesson';studioRequest=null;
 },'Generating questions and expressions from your source…'),'primary dark wide',capabilities.exercise_generation==='not_configured'));
 card.append(E('p','Conversation and exercise generation run locally. Transcription uses your selected Local or Hosted provider. The confirmed text and generated lesson are saved in your private database. Source audio/video is not retained by the backend. AI answers need review; unsupported evidence is rejected.','notice'));
}
function render(){
 providerStatus();$('error').replaceChildren();if(error){$('error').append(E('p',error,'error'));}
 if(api.pending){const retry=E('button','Retry pending action','primary');retry.disabled=busy;retry.onclick=()=>run(async()=>{await api.retry();await api.refresh();syncStage();},'Retrying…');$('error').append(retry,E('p','The same request id will be reused to prevent duplicate submissions.','notice'));}
 $('account').replaceChildren();const root=$('content');root.replaceChildren();
 if(!capabilities){authScreen(root);return;}
 $('account').append(B('Library',()=>run(async()=>{stopAudio();stopRecording(true);catalogue=(await api.request('/lessons')).items;history=await api.request('/sessions');tab='library';})),B('My lesson',()=>{stopRecording(true);stopAudio();tab='lesson';render();}),B('Studio',()=>{stopRecording(true);stopAudio();tab='studio';render();}),B('Saved phrases',()=>{stopRecording(true);stopAudio();tab='saved';render();}),B('Sign out',()=>{stopAudio();stopRecording(true);sessionStorage.removeItem('norsk.token');sessionStorage.removeItem('norsk.session');api.rememberPending(null);api.token='';api.session=null;capabilities=null;draft='';render();}));
 if(tab==='library'){const card=E('section',undefined,'card');card.append(E('h2','Your listening library.'));for(const l of catalogue)card.append(B(l.title+' · '+l.level,()=>run(async()=>{await loadLesson(l.id);await api.create(l.id);syncStage();draft='';answers={};played=false;tab='lesson';})));card.append(E('h3','Saved sessions'));for(const h of history)card.append(B((h.state.completed?'Completed':'Continue')+' · '+h.created_at.slice(0,16),()=>run(async()=>{api.session=await api.request('/sessions/'+h.id);await loadLesson(api.session.lesson_id);syncStage();tab='lesson';})));root.append(card);return;}
 if(tab==='studio'){renderStudio(root);return;}
 if(tab==='saved'){const card=E('section',undefined,'card');card.append(E('h2','Words worth keeping.'));for(const p of saved){const row=E('div',undefined,'phrase');row.append(E('span',p.text),B('Hear',()=>play(p.text)),B('Remove',()=>run(async()=>{await api.request('/phrases/'+p.id,{method:'DELETE'});saved=(await api.request('/phrases')).items;})));card.append(row);}if(!saved.length)card.append(E('p','Save expressions during your lesson.'));root.append(card);return;}
 const head=E('div',undefined,'lesson-heading');head.append(E('h2',lesson.title),E('p','One clip → listening questions → useful expressions → your conversation.','muted'));root.append(head);
 if(!api.session){root.append(B('Start a lesson →',()=>run(async()=>{await api.create(lesson.id);syncStage();draft='';answers={};played=false;}),'primary dark'));if(history.length){root.append(E('h3','Previous sessions'));for(const s of history)root.append(B(`${s.state.completed?'Completed':'Continue'} · ${s.created_at.slice(0,16)}`,()=>run(async()=>{api.session=await api.request('/sessions/'+s.id);await loadLesson(api.session.lesson_id);syncStage();})));}return;}
 const s=api.session.state;
 const progress=E('nav',undefined,'lesson-steps');progress.setAttribute('aria-label','Lesson progress');stages.forEach((name,i)=>{const b=B(`${stageIcons[i]} ${i+1}. ${name}`,()=>{stopAudio();stage=i;render();},'lesson-step'+(stage===i?' current':''),i>stages.indexOf(s.step));if(stage===i)b.setAttribute('aria-current','step');progress.append(b);});root.append(progress);
 root.append(E('p',`✦ Progress saved · Step ${stage+1} of ${stages.length}`,'notice'));
 const grid=E('div',undefined,'grid'),main=E('section',undefined,'card'),side=E('aside',undefined,'card');grid.append(main,side);root.append(grid);
 side.append(E('div','SAME CLIP, THROUGHOUT','eyebrow'),E('h2',lesson.source.title),E('p',lesson.mode==='generated'?'Your confirmed source. Lesson replay synthesizes the transcript; original audio stays in Studio.':'Authored Norwegian dialogue. Playback is synthesized on the backend; not an NRK recording.','notice'));
 const speed=E('select');speed.id='speed';speed.setAttribute('aria-label','Audio speed');for(const rate of ['1','0.8']){const o=E('option',rate+'×');o.value=rate;speed.append(o);}const controls=E('div',undefined,'actions');controls.append(B('▶ Replay clip',()=>play(playbackText,true)),B('Stop audio',stopAudio),speed);side.append(controls);
 for(const p of lesson.phrases){side.append(E('p',`${s.used.includes(p.id)?'✓ Used':s.practised.includes(p.id)?'✓ Practised':'○'} ${p.short}`,'notice'));}
 side.append(E('p','You can edit speech transcripts before sending. Grammar suggestions may be imperfect. Pronunciation is not scored.','notice'));
 const addSave=(box,p)=>box.append(B(saved.some(x=>x.id===p.id)?'✓ Saved':'Save phrase',()=>run(async()=>{await api.request('/phrases/'+p.id,{method:'PUT'});saved=(await api.request('/phrases')).items;})));
 if(stage===0){
  main.append(E('h2','Ready, set… listen!'),E('p',lesson.mode==='generated'?'Listen to your confirmed source, then answer two questions.':'Is the coffee for here or takeaway? How much does it cost?'),B('▶ Listen',()=>play(playbackText,true),'primary dark'));
  main.append(B('Show transcript',()=>run(async()=>{if(!s.transcript_help&&!s.completed)await api.mutate('transcript-help');const lines=$('transcript-lines');lines?.classList.remove('hidden');})));const lines=E('div',undefined,s.transcript_help?'':'hidden');lines.id='transcript-lines';for(const l of script)lines.append(E('p',`${l.speaker}: ${l.text}`));main.append(lines);
  main.append(B('Continue to questions →',()=>run(async()=>{if(s.step==='listen')await advance('listening',{mode:played?'played_self_reported':'mock_skip'});else stage=1;}),'primary wide'));
  main.append(E('p',played?'Audio played.':'You may continue without listening; the recap will record that audio was skipped.','notice'));
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
  for(const p of lesson.phrases){const box=E('div',undefined,'callout');box.append(E('h3',p.text),E('p',p.meaning),E('p',p.tip),B('▶ Hear',()=>play(p.text)),B(s.practised.includes(p.id)?'✓ Marked practised':'I said it aloud',()=>run(()=>advance('practice',{phrase_id:p.id,practised:!s.practised.includes(p.id)},3)), 'chip',!['review','practise'].includes(s.step)));addSave(box,p);main.append(box);}
  main.append(B('Enter role-play →',()=>run(async()=>{if(s.roleplay_started)stage=4;else await advance('roleplay');}),'primary dark wide'));
 }else if(stage===4){
  main.append(E('h2','Your words, your adventure.'),E('p',lesson.roleplay_context,'muted'));
  const tray=E('div',undefined,'chips');for(const p of lesson.phrases)tray.append(B(p.short,()=>{draft=p.text;inputMode='typed';render();}));main.append(tray);
  const log=E('div',undefined,'conversation');log.setAttribute('role','log');
  const messages=[{role:'Partner',text:s.opening}];for(const turn of s.turns)messages.push({role:'You',text:turn.learner_text},{role:'Partner',text:turn.result.partner_text});
  for(const m of messages){const row=E('div',undefined,'bubble'+(m.role==='You'?' user':''));row.append(E('small',m.role),E('div',m.text));if(m.role==='Partner')row.append(B('▶ Hear reply',()=>play(m.text)));log.append(row);}main.append(log);
  if(s.last_correction){const c=s.last_correction;main.append(E('div',`${c.original} → ${c.suggestion}. ${c.explanation}`,'feedback'));}
  const form=E('form'),input=E('textarea');input.value=draft;input.maxLength=2000;input.placeholder='Speak, confirm the transcript, then send. Or type your reply.';input.setAttribute('aria-label','Your reply');input.oninput=()=>draft=input.value;form.append(input);
  const send=B('Confirm & send',()=>{},'primary dark',s.completed);send.type='submit';form.append(send);form.onsubmit=e=>{e.preventDefault();if(!draft.trim())return;run(async()=>{await advance('turns',{text:draft,input_mode:inputMode});draft='';inputMode='typed';},'Your conversation partner is thinking…');};main.append(form);
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
