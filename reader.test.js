import test from 'node:test';
import assert from 'node:assert/strict';
import {splitSentences,wordTokens,wordMeaning} from './reader.js';

test('splits Norwegian sentences while preserving punctuation',()=>{
  assert.deepEqual(splitSentences('Hei! Hvordan går det? Bra.'),['Hei!','Hvordan går det?','Bra.']);
  assert.deepEqual(splitSentences('Bare én setning'),['Bare én setning']);
});

test('tokenizes Norwegian letters and hyphenated words',()=>{
  assert.deepEqual(wordTokens('Jeg vil gjerne ha havre-melk, takk!'),['Jeg','vil','gjerne','ha','havre-melk','takk']);
});

test('looks up lesson expressions before the starter glossary',()=>{
  const phrases=[{text:'ta den med',meaning:'take it away'}];
  assert.deepEqual(wordMeaning('med',phrases),{meaning:'take it away',phrase:'ta den med',source:'lesson expression'});
  assert.equal(wordMeaning('Takk',[]).meaning,'thanks');
  assert.equal(wordMeaning('ukjentord',[]),null);
});
