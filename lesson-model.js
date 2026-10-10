// One connected, authored lesson. Offsets are illustrative source positions, not TTS timings.
export const cafeLesson = {
 id:'cafe-oatmilk-a2', title:'Your usual, with a little twist.', level:'A2',
 source:'A morning in Oslo', kind:'Fictional mini-drama · authored demo',
 clipLabel:'02 · Ordering coffee', sourceRange:'00:18–00:48 · illustrative',
 lines:[
  {id:'l1',speaker:'Barista',text:'Hei! Hva vil du ha?'},
  {id:'l2',speaker:'Customer',text:'Jeg vil gjerne ha en kaffe med havremelk.'},
  {id:'l3',speaker:'Barista',text:'Selvfølgelig. Skal du sitte her eller ta med?'},
  {id:'l4',speaker:'Customer',text:'Jeg vil gjerne ta den med. Hva koster den?'},
  {id:'l5',speaker:'Barista',text:'Det blir førtifem kroner.'},
  {id:'l6',speaker:'Customer',text:'Fint, jeg betaler med kort.'}
 ],
 questions:[
  {id:'q1',prompt:'How will the customer have the coffee?',options:['At a table in the café','To take away','The customer does not say'],answer:1,evidence:['l3','l4'],explanation:'“Ta den med” means to take it away. The barista offers a choice and the customer chooses takeaway.'},
  {id:'q2',prompt:'How much does the coffee cost?',options:['35 kroner','54 kroner','45 kroner'],answer:2,evidence:['l5'],explanation:'“Førtifem” is forty-five. Listen to the order of the number parts.'}
 ],
 phrases:[
  {id:'p1',text:'Jeg vil gjerne ha en kaffe med havremelk.',meaning:'I would like a coffee with oat milk.',line:'l2',tip:'Keep “Jeg vil gjerne ha …” and swap the drink.',short:'Order with oat milk'},
  {id:'p2',text:'Jeg vil gjerne ta den med.',meaning:'I would like to take it away.',line:'l4',tip:'“Ta med” is useful whenever you order takeaway.',short:'Choose takeaway'}
 ],
 opening:'Hei! Hva kan jeg hjelpe deg med?',
 sampleError:'Jeg vil gjerne har en kaffe med havremelk.',
 correction:{before:'Jeg vil gjerne har',after:'Jeg vil gjerne ha',why:'After the modal verb “vil”, use the infinitive “ha”, not the present-tense “har”.'},
};
export function newLessonState(){return {step:0,answers:[null,null],checked:false,transcriptHelp:false,demoAudio:false,played:false,practised:[],messages:[],feedback:null,draft:'',used:[]};}
export function lessonScore(s){return cafeLesson.questions.reduce((n,q,i)=>n+(s.answers[i]===q.answer?1:0),0);}
export function evidenceText(q){return cafeLesson.lines.filter(l=>q.evidence.includes(l.id)).map(l=>l.text).join(' ');}
export function lessonTurn(text){
 const t=text.trim().toLocaleLowerCase('nb-NO');
 const correction=/\bvil gjerne har\b/.test(t)?cafeLesson.correction:null;
 const used=[];
 if(/vil gjerne (ha|har).*kaffe.*havremelk/.test(t)&&!correction)used.push('p1');
 if(/ta (den )?med/.test(t))used.push('p2');
 let reply='Vil du ha en kaffe, eller vil du ha noe annet?';
 if(/havremelk|kaffe/.test(t))reply='Selvfølgelig! Skal du sitte her eller ta med?';
 if(/ta (den )?med/.test(t))reply='Det blir førtifem kroner. Vil du betale med kort?';
 if(/koster|pris/.test(t))reply='Kaffen koster førtifem kroner.';
 if(/kort/.test(t))reply='Takk skal du ha! Kaffen kommer snart.';
 return {reply,correction,used};
}
export function submitLessonTurn(s,text){
 if(!text.trim())return s;
 const result=lessonTurn(text);
 return {...s,draft:'',feedback:result.correction,messages:[...s.messages,{who:'You',text:text.trim()},{who:'Barista',text:result.reply}],used:[...new Set([...s.used,...result.used])]};
}
