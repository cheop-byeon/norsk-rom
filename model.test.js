import test from 'node:test';
import assert from 'node:assert/strict';
import {levels, scenarios, exercise, mockReply, splitSentences, hintForWord} from './model.js';
test('each level and fixture has a usable answer and source disclosure',()=>{
 for(const level of levels) for(let v=0;v<2;v++) { const e=exercise(level,v); assert.ok(e.text); assert.ok(e.options[e.answer]); assert.match(e.source,/fictional/); }
});
test('supported intent branches stay within their scenario',()=>{
 assert.match(mockReply(scenarios[0],'Hva koster den?',0).reply,/35/);
 assert.match(mockReply(scenarios[1],'Når går neste tog?',0).reply,/ti/);
 assert.equal(mockReply(scenarios[2],'Hva koster den?',0).reply,scenarios[2].replies[0]);
});
test('only the known grammar fixture is corrected',()=>{
 assert.equal(mockReply(scenarios[0],'Jeg er gå på kafé.',0).correction.after,'Jeg går');
 assert.equal(mockReply(scenarios[0],'Jeg vil gjerne ha en kaffe.',0).correction,null);
});
test('unsupported CEFR level is rejected',()=>assert.throws(()=>exercise('D1')));
test('listening transcript splits into speakable sentences and keeps punctuation',()=>{
 assert.deepEqual(splitSentences('Hei! Biblioteket er åpent. Er du her?'),['Hei!','Biblioteket er åpent.','Er du her?']);
 assert.deepEqual(splitSentences(''),[]);
});
test('offline word hints normalize punctuation and identify unsupported words',()=>{
 assert.equal(hintForWord('Biblioteket?'),'the library');
 assert.equal(hintForWord('ukjentord'),null);
});

import {splitClips} from './model.js';
test('clip ranges cover the media without gaps or an empty tail',()=>{
 assert.deepEqual(splitClips(45,20),[{start:0,end:20},{start:20,end:40},{start:40,end:45}]);
 assert.deepEqual(splitClips(40,20),[{start:0,end:20},{start:20,end:40}]);
 assert.deepEqual(splitClips(4,20),[{start:0,end:4}]);
});
test('invalid media duration or clip length does not produce ranges',()=>{
 for(const d of [NaN,Infinity,0,-1]) assert.deepEqual(splitClips(d),[]);
 for(const n of [0,-1,NaN,Infinity]) assert.deepEqual(splitClips(45,n),[]);
});
