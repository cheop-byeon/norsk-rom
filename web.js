import {levels,scenarios,mockReply,exercise,splitClips} from './model.js';
const $=id=>document.getElementById(id);
let scene=scenarios[0],turn=0,variant=0,selected=null,currentExercise,corrections=0,saved=[],heard=false,helpUsed=false;
try {const value=JSON.parse(localStorage.getItem('norsk-phrases')||'[]'); if(Array.isArray(value)) saved=value.filter(p=>Array.isArray(p)&&p.length===2&&p.every(x=>typeof x==='string'));}catch{}
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
let toastTimer;function toast(message){$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),3500);}
function save(phrase){const index=saved.findIndex(p=>p[0]===phrase[0]);if(index>=0)saved.splice(index,1);else saved.push(phrase);try{localStorage.setItem('norsk-phrases',JSON.stringify(saved));}catch{toast('Saved for this session only; device storage is unavailable.');}renderPhrases();renderSaved();}
for(const level of levels){const option=el('option',level);option.value=level;$('level').append(option);}$('level').value='A2';
function pickScenario(s){scene=s;$('place').textContent=s.place;$('scene-title').textContent=s.title;$('goal').textContent=s.goal;renderScenarios();}
function renderScenarios(){$('scenarios').replaceChildren();for(const s of scenarios){const b=el('button',undefined,'scenario'+(s.id===scene.id?' selected':''));b.setAttribute('aria-pressed',s.id===scene.id);b.append(el('span',s.icon,'icon'));const d=el('div');d.append(el('strong',s.short),el('small',s.role+' · guided conversation'));b.append(d);b.onclick=()=>pickScenario(s);$('scenarios').append(b);}}
function phraseRow(p,removable=false){const row=el('div',undefined,'phrase');const label=el('div');const b=el('button',p[0]);b.style.cssText='width:auto;height:auto;border-radius:0;background:none;text-align:left;padding:0';b.lang='nb';b.onclick=()=>{if(removable){toast('Open a role-play to use this expression.');}else{$('message').value=p[0];$('message').focus();}};label.append(b,el('small',p[1]));const isSaved=saved.some(x=>x[0]===p[0]);const add=el('button',isSaved?'✓':'+');add.setAttribute('aria-label',(isSaved?'Remove saved phrase: ':'Save phrase: ')+p[0]);add.onclick=()=>save(p);row.append(label,add);return row;}
function renderPhrases(){$('phrases').replaceChildren(...scene.phrases.map(p=>phraseRow(p)));}
function renderSaved(){$('saved-list').replaceChildren(...(saved.length?saved.map(p=>phraseRow(p,true)):[el('p','Your phrasebook is empty. Save expressions with + during a role-play.','muted')]));}
function bubble(text,who){const n=el('div',undefined,'bubble'+(who==='You'?' user':''));n.append(el('small',who),el('div',text));n.lastChild.lang='nb';$('messages').append(n);$('messages').scrollTop=$('messages').scrollHeight;}
$('start').onclick=()=>{turn=0;corrections=0;$('browse').classList.add('hidden');$('session').classList.remove('hidden');$('summary').classList.add('hidden');$('messages').replaceChildren();$('feedback').replaceChildren();$('message').value='';$('partner').textContent='Your partner · '+scene.role;$('chat-title').textContent=scene.short;bubble(scene.opening,'Partner');renderPhrases();};
$('back').onclick=()=>{$('session').classList.add('hidden');$('browse').classList.remove('hidden');};
function send(text){text=text.trim();if(!text)return;$('summary').classList.add('hidden');bubble(text,'You');const data=mockReply(scene,text,turn++);bubble(data.reply,'Partner');$('feedback').replaceChildren();if(data.correction){corrections++;const c=data.correction;const f=el('div',undefined,'feedback');f.append(el('strong','Grammar example: '+c.before+' → '+c.after),el('p',c.why));$('feedback').append(f);}else{$('feedback').append(el('p','No fixture correction triggered. This demo does not evaluate other grammar or pronunciation.','notice'));}$('message').value='';}
$('compose').onsubmit=e=>{e.preventDefault();send($('message').value);};
$('voice').onclick=()=>{send(scene.phrases[0][0]);toast('Simulated transcript inserted. No audio was recorded.');};
$('mistake').onclick=()=>{$('message').value='Jeg er gå på kafé.';$('message').focus();};
$('finish').onclick=()=>{$('summary').classList.remove('hidden');$('summary').replaceChildren(el('strong','Practice recap'),el('p',`${turn} replies sent · ${corrections} sample corrections shown. Keep one useful expression and try it again tomorrow.`),el('p','Pronunciation: not assessed. No proficiency score is calculated.'));};
function renderExercise(){stopAudio();heard=false;helpUsed=false;$('article').classList.add('hidden');$('reveal').textContent='Reveal transcript · counts as help';$('audio-status').textContent='Listen before answering. Norwegian device voice required.';currentExercise=exercise($('level').value,variant);selected=null;const e=currentExercise;$('exercise-level').textContent=e.level;$('article-title').textContent=e.title;$('article').textContent=e.text;$('question').textContent=e.question;$('result').replaceChildren();$('check').disabled=true;$('options').replaceChildren();e.options.forEach((text,i)=>{const b=el('button',text,'answer');b.setAttribute('aria-pressed','false');b.onclick=()=>{selected=i;for(const x of $('options').children){x.classList.remove('chosen');x.setAttribute('aria-pressed','false');}b.classList.add('chosen');b.setAttribute('aria-pressed','true');$('result').replaceChildren();$('check').disabled=!heard;};$('options').append(b);});}
$('check').onclick=()=>{if(selected===null||!heard)return;const e=currentExercise;$('result').replaceChildren(el('p',(selected===e.answer?'Riktig! ':'Not quite. ')+e.explanation+(helpUsed?' Transcript help used.':''),'feedback'));};
$('generate').onclick=()=>{variant++;renderExercise();};$('level').onchange=renderExercise;
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>{document.dispatchEvent(new Event('lesson-leave'));stopAudio();$('local-media').pause();for(const n of document.querySelectorAll('[data-tab]')){n.classList.toggle('active',n===b);n.setAttribute('aria-current',n===b?'page':'false');}for(const id of ['lesson','role','practice','saved'])$(id).classList.toggle('hidden',id!==b.dataset.tab);renderSaved();};

function stopAudio(){if('speechSynthesis' in window)window.speechSynthesis.cancel();}
function speak(text,onComplete){
 stopAudio();$('local-media').pause();
 if(!text.trim()){toast('Add some Norwegian text first.');return;}
 if(!('speechSynthesis' in window)){toast('Text-to-speech is unavailable in this browser. Try a local audio file.');return;}
 const voice=window.speechSynthesis.getVoices().find(v=>/^(nb|no|nn)(-|_|$)/i.test(v.lang));
 if(!voice){$('audio-status').textContent='No Norwegian voice is available. Enable a Norwegian system voice, or use a local audio file below.';return;}
 const utterance=new SpeechSynthesisUtterance(text);utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=Number($('speed').value);
 utterance.onstart=()=>{$('audio-status').textContent='Playing Norwegian device speech…';};
 utterance.onend=()=>{$('audio-status').textContent='Playback finished. Replay as often as you like.';if(onComplete)onComplete();};
 utterance.onerror=e=>{if(e.error!=='canceled'&&e.error!=='interrupted')$('audio-status').textContent='Speech playback failed. Try again or use a local audio file.';};
 window.speechSynthesis.speak(utterance);
}
$('listen').onclick=()=>speak(currentExercise.text,()=>{heard=true;$('check').disabled=selected===null;});
$('stop-listen').onclick=()=>{stopAudio();$('audio-status').textContent='Playback stopped.';};
$('reveal').onclick=()=>{helpUsed=true;$('article').classList.toggle('hidden');$('reveal').textContent=$('article').classList.contains('hidden')?'Reveal transcript · help used':'Hide transcript · help used';};
$('speak-custom').onclick=()=>speak($('custom-text').value);
let objectURL=null,activeClip=null;
const media=$('local-media');
function renderClips(){media.pause();activeClip=null;$('clips').replaceChildren();const clips=splitClips(media.duration,Number($('clip-length').value));clips.forEach((clip,i)=>{const b=el('button',`${i+1} · ${Math.floor(clip.start)}–${Math.ceil(clip.end)}s`,'chip');b.onclick=async()=>{stopAudio();activeClip=clip;media.currentTime=clip.start;media.playbackRate=Number($('speed').value);try{await media.play();$('media-status').textContent=`Practising clip ${i+1}: ${clip.start}–${clip.end.toFixed(1)} seconds. Listen, repeat, then retell.`;}catch{$('media-status').textContent='Playback failed. Choose a supported audio/video format.';}};$('clips').append(b);});}
$('media-file').onchange=()=>{stopAudio();media.pause();activeClip=null;if(objectURL)URL.revokeObjectURL(objectURL);const file=$('media-file').files[0];$('clips').replaceChildren();if(!file)return;objectURL=URL.createObjectURL(file);media.src=objectURL;media.classList.remove('hidden');$('media-status').textContent='Loading local media…';};
media.onloadedmetadata=()=>{if(!Number.isFinite(media.duration)){ $('media-status').textContent='Could not determine duration; try a different file.';return; }$('media-status').textContent='Ready. Select a clip below. No transcript or questions are generated.';renderClips();};
media.onerror=()=>{$('media-status').textContent='Unsupported or unreadable media file. Try MP3, WAV or MP4.';};
function clipBoundary(){if(activeClip&&media.currentTime>=activeClip.end-0.05){if($('loop-clip').checked){media.currentTime=activeClip.start;media.play().catch(()=>{});}else{media.pause();}}}
media.ontimeupdate=clipBoundary;media.onended=()=>{if(activeClip&&$('loop-clip').checked){media.currentTime=activeClip.start;media.play().catch(()=>{});}};
$('speed').onchange=()=>{media.playbackRate=Number($('speed').value);};$('clip-length').onchange=renderClips;$('stop-clip').onclick=()=>{media.pause();activeClip=null;};
window.addEventListener('pagehide',()=>{stopAudio();media.pause();if(objectURL)URL.revokeObjectURL(objectURL);});
pickScenario(scene);renderExercise();renderSaved();

document.addEventListener('lesson-save-phrase',e=>{save(e.detail);});
