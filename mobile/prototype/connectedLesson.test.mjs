import test from 'node:test';
import assert from 'node:assert/strict';
import { connectedLesson, getEvidence, correctLessonText, replyToLesson, scoreLesson } from './connectedLesson.js';

test('lesson fixture contains a continuous six-line conversation and two questions', () => {
  assert.equal(connectedLesson.lines.length, 6);
  assert.equal(connectedLesson.questions.length, 2);
  assert.equal(connectedLesson.phrases.length, 2);
});

test('evidence only includes lines linked to a question', () => {
  assert.equal(getEvidence(connectedLesson.questions[0]), 'Selvfølgelig. Skal du sitte her eller ta med? Jeg vil gjerne ta den med. Hva koster den?');
});

test('score handles correct and incorrect listening answers', () => {
  assert.equal(scoreLesson([1, 2]), 2);
  assert.equal(scoreLesson([0, 1]), 0);
});

test('role-play correction fixes the authored grammar example', () => {
  assert.equal(correctLessonText('Jeg vil gjerne har en kaffe.' )?.after, 'Jeg vil gjerne ha');
  assert.equal(correctLessonText('Jeg vil gjerne ha en kaffe.'), null);
});

test('scripted partner response follows the learner intent', () => {
  assert.match(replyToLesson('Jeg vil gjerne ta den med.'), /førtifem kroner/i);
  assert.match(replyToLesson('Jeg vil betale med kort.'), /kommer snart/i);
});
