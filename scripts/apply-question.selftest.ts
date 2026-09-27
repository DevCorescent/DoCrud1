/**
 * Asking, and remembering the answer.
 *
 * Run: npx tsx scripts/apply-question.selftest.ts
 *
 * The property that matters is the signature: two differently-worded questions
 * that mean the same thing must share one, and two that do not must not. Get
 * the first wrong and the member answers the same question on every form
 * forever; get the second wrong and an answer they gave about relocation is
 * quietly submitted as their salary expectation.
 */

import {
  normalizeQuestion, signatureFor, questionFor, recallFor,
  type RememberedAnswer,
} from '../lib/apply/question';
import type { FieldDescriptor } from '../lib/apply/answer-keys';

let pass = 0; let fail = 0;
const failures: string[] = [];
function check(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass += 1; return; }
  fail += 1;
  failures.push(`  ✗ ${name}\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`);
}
const f = (over: Partial<FieldDescriptor>): FieldDescriptor => ({ id: 'x', ...over });

/* ══ 1. Normalising ══ */
check('filler and punctuation go',
  normalizeQuestion('Are you willing to relocate?'), 'relocate willing');
check('word order does not matter',
  normalizeQuestion('Willing to relocate'), normalizeQuestion('Relocate, are you willing?'));
check('case does not matter',
  normalizeQuestion('NOTICE PERIOD'), normalizeQuestion('Notice period'));
check('duplicates collapse',
  normalizeQuestion('Salary salary expectations'), 'expectations salary');
check('empty', normalizeQuestion(undefined), '');
check('only filler yields nothing', normalizeQuestion('Are you? Please do.'), '');

/* ══ 2. A known key generalises across wordings ══
   This is the entire point: three employers, three sentences, one memory. */
{
  const a = signatureFor('workAuthorization', 'Are you legally authorized to work in the United States?');
  const b = signatureFor('workAuthorization', 'Do you have the right to work in the UK?');
  const c = signatureFor('workAuthorization', 'Work authorisation status');
  check('one key, one signature', a === b && b === c, true);
  check('and it is the key', a, 'key:workAuthorization');
}

/* ══ 3. Different questions must NOT collide ══ */
check('relocation is not salary',
  signatureFor('willRelocate', 'x') === signatureFor('salaryExpectation', 'x'), false);
check('current salary is not expected salary',
  signatureFor('currentSalary', 'Current CTC') === signatureFor('salaryExpectation', 'Expected CTC'), false);
check('two unknown questions with different words differ',
  signatureFor(null, 'Do you own a car?') === signatureFor(null, 'Do you have a laptop?'), false);

/* ══ 4. Unknown questions fall back to their own wording ══ */
{
  const a = signatureFor(null, 'Do you own a car?');
  const b = signatureFor(null, 'Do you own a car?');
  const c = signatureFor(null, 'Own a car?');
  check('identical wording matches itself', a, b);
  check('and survives the filler being different', a, c);
  check('it is a question signature, not a key', a.startsWith('q:'), true);
}

/* `freeText` is not a question anyone can answer twice — it is "why this
   company", and the answer is specific to the company. It must never become a
   remembered key. */
check('freeText never signs as a key',
  signatureFor('freeText', 'Why do you want to work here?').startsWith('q:'), true);

/* ══ 5. The question itself ══ */
{
  const q = questionFor(f({ label: 'Will you now or in the future require sponsorship for employment visa status?', options: ['Yes', 'No'] }), 'requiresSponsorship')!;
  check('legalese is asked in plain words', q.prompt, 'Would you need the company to sponsor a visa for you?');
  check('the employer’s own wording is still shown', q.sourceLabel?.startsWith('Will you now'), true);
  check('two yes/no options ask as a boolean', q.kind, 'boolean');
}
{
  const q = questionFor(f({ label: 'Preferred office', options: ['Bengaluru', 'Pune', 'Remote'] }), null)!;
  check('a list asks as a choice', q.kind, 'choice');
  check('and offers the form’s own options', q.options, ['Bengaluru', 'Pune', 'Remote']);
  check('an unknown label becomes the question', q.prompt, 'Preferred office?');
}
{
  const q = questionFor(f({ label: 'Are you willing to relocate?' }), null)!;
  check('a label that is already a question is not mangled', q.prompt, 'Are you willing to relocate?');
}
{
  const q = questionFor(f({ label: 'Tell us about a project', multiline: true }), null)!;
  check('a textarea asks for long text', q.kind, 'longtext');
}
check('an asterisk is not part of the question',
  questionFor(f({ label: 'Notice period *' }), 'noticePeriod')!.sourceLabel, 'Notice period');

/* ══ 6. Nothing sensible to ask ══ */
check('an unlabelled, unnamed field is not a question',
  questionFor(f({ id: 'a' }), null), null);
check('a field with only a machine name is not a question',
  questionFor(f({ id: 'a', name: 'f_2871' }), null)?.prompt ?? null, null);

/* ══ 7. Recall ══ */
{
  const memory: RememberedAnswer[] = [
    { signature: 'key:workAuthorization', value: 'Yes', prompt: 'Are you legally allowed to work…', uses: 3, updatedAt: '2026-01-01' },
    { signature: 'q:car own', value: 'No', prompt: 'Do you own a car?', uses: 1, updatedAt: '2026-01-01' },
  ];
  check('a known key recalls across wordings',
    recallFor(signatureFor('workAuthorization', 'Do you have the right to work in Canada?'), memory)?.value, 'Yes');
  check('an unknown question recalls its own wording',
    recallFor(signatureFor(null, 'Do you own a car?'), memory)?.value, 'No');
  check('nothing remembered means nothing offered',
    recallFor(signatureFor('salaryExpectation', 'Expected CTC'), memory), null);
  check('an empty signature recalls nothing', recallFor('', memory), null);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) { console.log('\n' + failures.join('\n')); process.exit(1); }
console.log('Questions and memory OK.\n');
