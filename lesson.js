import {cafeLesson,newLessonState,lessonScore,evidenceText,submitLessonTurn} from './lesson-model.js';
const lessonRoot=document.getElementById('lesson');
let lessonState=newLessonState(),lessonSpeechId=0,lessonUtterance=null;
const lessonSteps=['Listen','Answer','Review','Practise','Role-play','Recap'];
const L=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
function LB(text,fn,cls='chip',disabled=false){const b=L('button',text,cls);b.type='button';b.onclick=fn;b.disabled=disabled;return b;}
function cancelLessonSpeech(){lessonSpeechId++;if('speechSynthesis'in window)window.speechSynthesis.cancel();lessonUtterance=null;}
function lessonSpeak(text,finished){
 cancelLessonSpeech();const token=lessonSpeechId;
 document.getElementById('local-media').pause();
 const status=lessonRoot.querySelector('[data-lesson-audio]');
 function sayStatus(t){if(status&&token===lessonSpeechId)status.textContent=t;}
 if(!('speechSynthesis'in window)){sayStatus('Audio unavailable. Use “Continue without audio” to explore this mock lesson.');return;}
 const voices=window.speechSynthesis.getVoices();
 const voice=voices.find(v=>/^(nb|no|nn)(-|_|$)/i.test(v.lang));
 if(!voice){sayStatus('No Norwegian voice available yet. Enable a Norwegian system voice, retry, or continue without audio.');return;}
 lessonUtterance=new SpeechSynthesisUtterance(text);lessonUtterance.voice=voice;lessonUtterance.lang=voice.lang;
 lessonUtterance.rate=Number(document.getElementById('lesson-speed')?.value||1);
 lessonUtterance.onstart=()=>sayStatus('Playing Norwegian device speech…');
 lessonUtterance.onend=()=>{if(token!==lessonSpeechId)return;sayStatus('Playback complete. Replay whenever you need.');if(finished)finished();};
 lessonUtterance.onerror=e=>{if(e.error!=='canceled'&&e.error!=='interrupted')sayStatus('Playback failed. You can continue in mock mode.');};
 window.speechSynthesis.speak(lessonUtterance);
}
function goLesson(step){cancelLessonSpeech();lessonState.step=step;renderLesson();lessonRoot.querySelector('h2')?.focus({preventScroll:true});}
function lessonTranscript(container){for(const line of cafeLesson.lines){const row=L('p');row.append(L('strong',line.speaker+' · '),L('span',line.text));row.lastChild.lang='nb';container.append(row);}}
function lessonAudioBar(parent){const controls=L('div',undefined,'chips');controls.append(LB('▶ Replay lesson clip',()=>lessonSpeak(cafeLesson.lines.map(l=>l.text).join(' '),()=>{lessonState.played=true;})),LB('Stop',()=>{cancelLessonSpeech();const status=lessonRoot.querySelector('[data-lesson-audio]');if(status)status.textContent='Playback stopped.';}));const label=L('label','Speed ','notice'),speed=L('select');speed.id='lesson-speed';speed.setAttribute('aria-label','Lesson playback speed');for(const rate of ['1','0.8']){const o=L('option',rate+'×');o.value=rate;speed.append(o);}label.append(speed);controls.append(label);const status=L('p','Device voice when available · no original media recording.','notice');status.dataset.lessonAudio='';parent.append(controls,status);}
function phraseSaveButton(p){let stored=[];try{stored=JSON.parse(localStorage.getItem('norsk-phrases')||'[]');if(!Array.isArray(stored))stored=[];}catch{}const exists=stored.some(x=>Array.isArray(x)&&x[0]===p.text);return LB(exists?'✓ Saved':'＋ Save phrase',()=>{document.dispatchEvent(new CustomEvent('lesson-save-phrase',{detail:[p.text,p.meaning]}));renderLesson();});}
function renderLesson(){
 lessonRoot.replaceChildren();
 const head=L('div',undefined,'lesson-heading');head.append(L('div','ONE CLIP. YOUR NEXT CONVERSATION.','eyebrow'),L('h2',cafeLesson.title));head.querySelector('h2').tabIndex=-1;head.append(L('p','Hear it in a scene. Make sense of it. Make it your own.','muted'));
 const badge=L('span','A2 · connected mock lesson','badge');head.append(badge);lessonRoot.append(head);
 const progress=L('nav',undefined,'lesson-steps');progress.setAttribute('aria-label','Lesson progress');lessonSteps.forEach((name,i)=>{const b=LB(`${String(i+1).padStart(2,'0')}  ${name}`,()=>goLesson(i),'lesson-step'+(i===lessonState.step?' current':''),i>lessonState.step);if(i===lessonState.step)b.setAttribute('aria-current','step');progress.append(b);});lessonRoot.append(progress);
 const grid=L('div',undefined,'grid'),main=L('article',undefined,'card'),aside=L('aside',undefined,'card lesson-context');
 aside.append(L('div','YOUR SOURCE · SAME THROUGHOUT','eyebrow'),L('h2',cafeLesson.source),L('p',cafeLesson.kind,'notice'));
 const segments=L('div',undefined,'clip-stack');['01 · Arriving','02 · Ordering coffee','03 · Saying goodbye'].forEach((x,i)=>segments.append(L('div',x,'clip-row'+(i===1?' selected':''))));aside.append(segments,L('p','Selected clip: '+cafeLesson.sourceRange,'notice'),L('p','The surrounding clips are context placeholders. This lesson uses only “Ordering coffee”.','notice'));
 lessonAudioBar(aside);
 aside.append(L('div','TAKE THESE INTO YOUR CONVERSATION','eyebrow'));
 for(const p of cafeLesson.phrases){const row=L('div',undefined,'phrase');row.append(L('span',p.short),L('span',lessonState.used.includes(p.id)?'✓ Used':lessonState.practised.includes(p.id)?'✓ Practised':'○'));aside.append(row);}
 aside.append(L('p','One authored A2 lesson. The level selector applies to the separate listening studio. No AI or microphone is connected.','notice'));
 grid.append(main,aside);lessonRoot.append(grid);
 const s=lessonState;
 if(s.step===0){
  main.append(L('div','01 / LISTEN · START WITH YOUR EARS','eyebrow'),L('h2','A coffee to go.'),L('p','A customer is ordering coffee. Listen for where they will drink it and how much it costs.'));
  main.append(L('div','ııllı ııllı ııllı','lesson-wave'));
  main.append(LB('▶ Listen to the conversation',()=>lessonSpeak(cafeLesson.lines.map(l=>l.text).join(' '),()=>{s.played=true;renderLesson();}),'primary dark wide'));
  main.append(L('p',s.played?'✓ You played the sample. Ready for two questions?':'Transcript hidden. Replay as many times as you need.','notice'));
  const transcript=L('details');transcript.append(L('summary','Need help? Show the transcript'));const lines=L('div');lessonTranscript(lines);transcript.append(lines);transcript.ontoggle=()=>{if(transcript.open)s.transcriptHelp=true;};main.append(transcript);
  main.append(LB('Continue to questions →',()=>goLesson(1),'primary wide',!s.played));
  main.append(LB('Continue without audio · mock walkthrough',()=>{s.demoAudio=true;goLesson(1);},'plain'));
 }else if(s.step===1){
  main.append(L('div','02 / UNDERSTAND','eyebrow'),L('h2','What did you hear?'),L('p','Two questions from the same café clip. You can replay it on the right.','muted'));
  cafeLesson.questions.forEach((q,i)=>{const box=L('fieldset',undefined,'lesson-question');box.append(L('legend',`${i+1}. ${q.prompt}`));q.options.forEach((o,j)=>{const b=LB(o,()=>{s.answers[i]=j;renderLesson();},'answer'+(s.answers[i]===j?' chosen':''));b.setAttribute('aria-pressed',s.answers[i]===j);box.append(b);});main.append(box);});
  main.append(LB('Check & hear the evidence →',()=>{s.checked=true;goLesson(2);},'primary dark wide',s.answers.some(x=>x===null)));
 }else if(s.step===2){
  main.append(L('div','03 / REVIEW WITH THE CLIP','eyebrow'),L('h2',`${lessonScore(s)} of 2 answers correct`),L('p',(s.demoAudio?'Mock walkthrough without required audio. ':s.transcriptHelp?'Transcript-assisted practice. ':'Practice result. ')+'This is not a proficiency score.','notice'));
  cafeLesson.questions.forEach((q,i)=>{const box=L('div',undefined,'callout');box.append(L('strong',s.answers[i]===q.answer?'✓ '+q.prompt:'↻ '+q.prompt),L('p','Your answer: '+q.options[s.answers[i]]),L('p','Correct answer: '+q.options[q.answer]));const quote=L('blockquote',evidenceText(q));quote.lang='nb';box.append(quote,L('p',q.explanation),LB('▶ Replay supporting lines',()=>lessonSpeak(evidenceText(q))));main.append(box);});
  main.append(LB('Practise the expressions →',()=>goLesson(3),'primary dark wide'));
 }else if(s.step===3){
  main.append(L('div','04 / MAKE THE WORDS YOURS','eyebrow'),L('h2','Two expressions. Lots of possibilities.'),L('p','Listen, say it aloud, and try swapping one word. Mark your own practice; no recording or pronunciation scoring.','muted'));
  cafeLesson.phrases.forEach(p=>{const box=L('div',undefined,'callout');const phrase=L('h3',p.text);phrase.lang='nb';box.append(phrase,L('p',p.meaning),L('p',p.tip));const buttons=L('div',undefined,'chips');buttons.append(LB('▶ Hear expression',()=>lessonSpeak(p.text)),LB(s.practised.includes(p.id)?'✓ I practised this':'I said it aloud',()=>{s.practised=s.practised.includes(p.id)?s.practised.filter(id=>id!==p.id):[...s.practised,p.id];renderLesson();}),phraseSaveButton(p));box.append(buttons);main.append(box);});
  main.append(LB('Use them in a role-play →',()=>{if(!s.messages.length)s.messages=[{who:'Barista',text:cafeLesson.opening}];goLesson(4);},'primary dark wide'));
 }else if(s.step===4){
  main.append(L('div','05 / YOUR TURN AT THE COUNTER','eyebrow'),L('h2','Now you’re the customer.'),L('p','Order coffee with oat milk, then ask to take it away. Use the two expressions you just heard.','muted'));
  const tray=L('div',undefined,'chips');for(const p of cafeLesson.phrases)tray.append(LB(p.short,()=>{s.draft=p.text;renderLesson();document.getElementById('lesson-draft').focus();}));main.append(tray);
  const log=L('div',undefined,'conversation');log.setAttribute('role','log');log.setAttribute('aria-label','Café role-play conversation');for(const m of s.messages){const b=L('div',undefined,'bubble'+(m.who==='You'?' user':''));b.append(L('small',m.who),L('div',m.text));if(m.who==='Barista')b.append(LB('▶ Hear reply',()=>lessonSpeak(m.text)));log.append(b);}main.append(log);
  if(s.feedback){const f=L('div',undefined,'feedback');f.setAttribute('role','status');f.append(L('strong',s.feedback.before+' → '+s.feedback.after),L('p',s.feedback.why),LB('Prepare corrected retry',()=>{s.draft=cafeLesson.phrases[0].text;renderLesson();}));main.append(f);}
  const form=L('form',undefined,'composer'),input=L('input');input.id='lesson-draft';input.value=s.draft;input.placeholder='Confirm your mock transcript, or type…';input.maxLength=500;input.setAttribute('aria-label','Your reply or simulated transcript');input.oninput=()=>{s.draft=input.value;};const send=LB('Send',()=>{} ,'primary dark');send.type='submit';form.append(input,send);form.onsubmit=e=>{e.preventDefault();lessonState=submitLessonTurn(s,input.value);renderLesson();};main.append(form);
  main.append(LB('◉ Insert simulated spoken answer',()=>{s.draft=s.used.includes('p1')?cafeLesson.phrases[1].text:cafeLesson.sampleError;renderLesson();},'plain'));
  main.append(L('p','Simulated voice inserts an editable example. Confirm it before sending. Replies are scripted; the grammar example is predefined. Phrase checks use text matching, not speech assessment.','notice'));
  main.append(LB('Finish & see my recap →',()=>goLesson(5),'primary wide',!s.messages.some(m=>m.who==='You')));
 }else{
  main.append(L('div','06 / FROM HEARING TO USING','eyebrow'),L('h2','One clip, one conversation.'),L('p','Here is what you did with “Ordering coffee”.','muted'));
  const stats=L('div',undefined,'lesson-stats');for(const [n,label] of [[lessonScore(s)+'/2','quiz answers'],[s.practised.length+'/2','marked practised'],[s.used.length+'/2','expressions matched']]){const box=L('div');box.append(L('strong',n),L('small',label));stats.append(box);}main.append(stats);
  main.append(L('p',s.demoAudio?'Audio was skipped for this mock walkthrough.':s.transcriptHelp?'You used transcript help.':'No transcript help recorded.','notice'));
  const missing=cafeLesson.phrases.filter(p=>!s.used.includes(p.id));main.append(L('h3',missing.length?'Your next small step':'Try a new version'));
  main.append(L('p',missing.length?'Practise “'+missing[0].text+'” once more, then use it in the café role-play.':'Repeat the role-play and order tea instead of coffee. Keep the same sentence patterns.'));
  for(const p of cafeLesson.phrases){const box=L('div',undefined,'phrase');box.append(L('span',p.text),phraseSaveButton(p));main.append(box);}
  main.append(L('p',`${s.messages.filter(m=>m.who==='You').length} replies sent. Pronunciation not assessed. Practice marks are self-reported; phrase matches are literal demo checks.`,'notice'));
  main.append(LB('Try the role-play again',()=>{s.messages=[{who:'Barista',text:cafeLesson.opening}];s.used=[];s.feedback=null;s.draft='';goLesson(4);},'primary dark wide'),LB('Restart the whole lesson',()=>{lessonState=newLessonState();goLesson(0);},'plain'));
 }
 if(s.step>0)main.append(LB('← Previous step',()=>goLesson(s.step-1),'plain'));
}
document.addEventListener('lesson-leave',cancelLessonSpeech);
window.addEventListener('pagehide',cancelLessonSpeech);
renderLesson();
