import test from 'node:test';
import assert from 'node:assert/strict';
import {cafeLesson,newLessonState,lessonScore,evidenceText,submitLessonTurn} from './lesson-model.js';
test('questions and expressions point to the same clip evidence',()=>{
 for(const q of cafeLesson.questions){assert.ok(q.options[q.answer]);assert.ok(evidenceText(q));for(const id of q.evidence)assert.ok(cafeLesson.lines.some(l=>l.id===id));}
 for(const p of cafeLesson.phrases)assert.ok(cafeLesson.lines.find(l=>l.id===p.line).text.includes(p.text));
});
test('connected flow keeps quiz answers and practice history in role-play',()=>{
 let s=newLessonState();s.answers=[1,2];s.practised=['p1'];s.checked=true;
 s=submitLessonTurn(s,cafeLesson.phrases[0].text);s=submitLessonTurn(s,cafeLesson.phrases[1].text);
 assert.equal(lessonScore(s),2);assert.deepEqual(s.practised,['p1']);assert.deepEqual(s.used,['p1','p2']);assert.equal(s.messages.length,4);
});
test('incorrect fixture is corrected before the expression is counted',()=>{
 let s=submitLessonTurn(newLessonState(),cafeLesson.sampleError);
 assert.equal(s.feedback.after,'Jeg vil gjerne ha');assert.deepEqual(s.used,[]);
 s=submitLessonTurn(s,cafeLesson.phrases[0].text);assert.equal(s.feedback,null);assert.deepEqual(s.used,['p1']);
 s=submitLessonTurn(s,cafeLesson.phrases[0].text);assert.deepEqual(s.used,['p1']);
});
test('empty replies and a fresh session cannot invent progress',()=>{
 const s=newLessonState();assert.equal(submitLessonTurn(s,'  '),s);assert.equal(lessonScore(s),0);assert.deepEqual(s.used,[]);assert.equal(s.played,false);
});
