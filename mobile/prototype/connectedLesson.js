// Local authored lesson fixture mirroring the browser's six-step lesson.
// Audio is spoken by the device; this is not imported media or an AI assessment.
export const connectedLesson = {
  id: 'cafe-oatmilk-a2',
  title: 'Your usual, with a little twist.',
  level: 'A2',
  source: 'A morning in Oslo · fictional mini-drama',
  clip: 'Ordering coffee · 00:18–00:48 (illustrative)',
  lines: [
    { id: 'l1', speaker: 'Barista', text: 'Hei! Hva vil du ha?' },
    { id: 'l2', speaker: 'Customer', text: 'Jeg vil gjerne ha en kaffe med havremelk.' },
    { id: 'l3', speaker: 'Barista', text: 'Selvfølgelig. Skal du sitte her eller ta med?' },
    { id: 'l4', speaker: 'Customer', text: 'Jeg vil gjerne ta den med. Hva koster den?' },
    { id: 'l5', speaker: 'Barista', text: 'Det blir førtifem kroner.' },
    { id: 'l6', speaker: 'Customer', text: 'Fint, jeg betaler med kort.' },
  ],
  questions: [
    { id: 'q1', prompt: 'How will the customer have the coffee?', options: ['At a table in the café', 'To take away', 'The customer does not say'], answer: 1, evidence: ['l3', 'l4'], explanation: '“Ta den med” means to take it away. The customer chooses takeaway.' },
    { id: 'q2', prompt: 'How much does the coffee cost?', options: ['35 kroner', '54 kroner', '45 kroner'], answer: 2, evidence: ['l5'], explanation: '“Førtifem” is forty-five. Listen for the number.' },
  ],
  phrases: [
    { id: 'p1', text: 'Jeg vil gjerne ha en kaffe med havremelk.', meaning: 'I would like a coffee with oat milk.', tip: 'Keep “Jeg vil gjerne ha …” and swap the drink.', short: 'Order with oat milk' },
    { id: 'p2', text: 'Jeg vil gjerne ta den med.', meaning: 'I would like to take it away.', tip: '“Ta med” is useful when you order takeaway.', short: 'Choose takeaway' },
  ],
  opening: 'Hei! Hva kan jeg hjelpe deg med?',
  sampleError: 'Jeg vil gjerne har en kaffe med havremelk.',
};

export const lessonSteps = ['Listen', 'Answer', 'Review', 'Practise', 'Role-play', 'Recap'];

export function getEvidence(question, lines = connectedLesson.lines) {
  return lines.filter(line => question.evidence.includes(line.id)).map(line => line.text).join(' ');
}

export function correctLessonText(text) {
  if (/\bvil gjerne har\b/i.test(String(text).trim())) {
    return { before: 'Jeg vil gjerne har', after: 'Jeg vil gjerne ha', why: 'After “vil”, use the infinitive “ha”, not the present-tense “har”.' };
  }
  return null;
}

export function replyToLesson(text) {
  const normalized = String(text).trim().toLocaleLowerCase('nb-NO');
  let reply = 'Vil du ha en kaffe, eller vil du ha noe annet?';
  if (/havremelk|kaffe/.test(normalized)) reply = 'Selvfølgelig! Skal du sitte her eller ta med?';
  if (/ta (den )?med/.test(normalized)) reply = 'Det blir førtifem kroner. Vil du betale med kort?';
  if (/koster|pris/.test(normalized)) reply = 'Kaffen koster førtifem kroner.';
  if (/kort/.test(normalized)) reply = 'Takk skal du ha! Kaffen kommer snart.';
  return reply;
}

export function scoreLesson(answers) {
  return connectedLesson.questions.reduce((score, question, index) => score + (answers[index] === question.answer ? 1 : 0), 0);
}
