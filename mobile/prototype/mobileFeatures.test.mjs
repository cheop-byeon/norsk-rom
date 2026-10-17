import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTranscript, splitTranscript } from './transcriptParser.js';
import { buildLessonPrompt, chunkTranscript, parseGeneratedLesson } from './lessonFactory.js';

test('subtitle files become a clean transcript without timing or tags', () => {
  assert.equal(cleanTranscript('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<v Ola>Hei!</v>\n\n2\n00:00:02,000 --> 00:00:03,000\nHvordan går det?', 'sample.vtt'), 'Hei! Hvordan går det?');
});

test('transcript splitting preserves sentence order and limits line count', () => {
  assert.deepEqual(splitTranscript('Hei. Hvordan går det? Bra!'), ['Hei.', 'Hvordan går det?', 'Bra!']);
});

test('long transcripts are divided into sentence-preserving lesson chunks', () => {
  const chunks = chunkTranscript('One short sentence. Two short sentence. Three short sentence.', 45);
  assert.deepEqual(chunks, ['One short sentence. Two short sentence.', 'Three short sentence.']);
});

test('generated lesson schema keeps only grounded usable quiz and vocabulary rows', () => {
  const lesson = parseGeneratedLesson(JSON.stringify({
    title: 'På kafeen', lines: ['Jeg vil gjerne ha kaffe.', 'Det koster førti kroner.'],
    questions: [{ prompt: 'What does it cost?', options: ['40 kr', '50 kr'], answer: 0, evidence: 'Det koster førti kroner.', explanation: 'The speaker says forty.' }],
    phrases: [{ text: 'Jeg vil gjerne ha kaffe.', meaning: 'I would like coffee.', tip: 'Use for polite orders.' }],
  }), { transcript: 'Jeg vil gjerne ha kaffe. Det koster førti kroner.', level: 'A2', id: 'test' });
  assert.equal(lesson.id, 'test');
  assert.equal(lesson.questions[0].answer, 0);
  assert.equal(lesson.lines.length, 2);
  assert.match(buildLessonPrompt('hei', 'A1'), /TRANSCRIPT/);
});

test('invalid generated lesson JSON is rejected instead of silently creating fabricated answers', () => {
  assert.throws(() => parseGeneratedLesson('not json', { transcript: 'hei', level: 'A1' }), /valid lesson data/);
});
