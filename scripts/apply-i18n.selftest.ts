/**
 * Does a form in Hindi, Tamil, German or Spanish actually get filled?
 *
 * The bar here is not "translateLabel returns something". It is that a real
 * label in another language reaches the SAME AnswerKey an English form would,
 * through the untouched matcher — because that is the only thing the member
 * experiences. So most of these assertions run `matchField`, not the
 * translator.
 *
 *   npm run test:apply-i18n
 */

import { translateLabel, targetPhrases } from '@/lib/apply/i18n-labels';
import { matchField, chooseOption, normalize } from '@/lib/apply/field-map';
import { normalizeQuestion, signatureFor } from '@/lib/apply/question';
import type { AnswerKey } from '@/lib/apply/answer-keys';

let passed = 0;
const failures: string[] = [];

function check(what: string, got: unknown, want: unknown) {
  if (got === want) { passed += 1; return; }
  failures.push(`${what}\n    expected ${JSON.stringify(want)}\n    got      ${JSON.stringify(got)}`);
}

/** A label in some language should land on the key an English form would. */
function key(label: string, want: AnswerKey | null, extra: Record<string, unknown> = {}) {
  const m = matchField({ id: 'x', label, ...extra });
  check(`label "${label}"`, m?.key ?? null, want);
}

/* ── Hindi ───────────────────────────────────────────────────────────── */

key('पहला नाम', 'firstName');
key('अंतिम नाम', 'lastName');
key('पूरा नाम', 'fullName');
key('ईमेल', 'email');
key('मोबाइल नंबर', 'phone');
key('शहर', 'city');
key('देश', 'country');
key('वर्तमान कंपनी', 'currentCompany');
key('वर्तमान पद', 'currentTitle');
key('कुल अनुभव', 'yearsExperience');
key('अपेक्षित वेतन', 'salaryExpectation');
key('वर्तमान वेतन', 'currentSalary');
key('नोटिस अवधि', 'noticePeriod');
key('रेज़्यूमे अपलोड करें', 'resume');

/* The qualifier must survive. This is what the longest-first ordering buys:
   without it "वर्तमान वेतन" loses "वर्तमान" and becomes plain salary, which
   is the difference between what somebody earns and what they are asking for. */
check('current vs expected salary are not confused',
  matchField({ id: 'a', label: 'वर्तमान वेतन' })?.key === 'currentSalary'
  && matchField({ id: 'b', label: 'अपेक्षित वेतन' })?.key === 'salaryExpectation',
  true);

/* ── Marathi, Bengali, Tamil, Telugu, Gujarati, Kannada, Malayalam, Punjabi ── */

key('पहिले नाव', 'firstName');           // Marathi
key('প্রথম নাম', 'firstName');            // Bengali
key('মোবাইল', 'phone');
key('முதல் பெயர்', 'firstName');          // Tamil
key('மின்னஞ்சல்', 'email');
key('தற்போதைய நிறுவனம்', 'currentCompany');
key('మొదటి పేరు', 'firstName');           // Telugu
key('ఇమెయిల్', 'email');
key('પહેલું નામ', 'firstName');            // Gujarati
key('ಮೊದಲ ಹೆಸರು', 'firstName');          // Kannada
key('ಪ್ರಸ್ತುತ ಸಂಬಳ', 'currentSalary');
key('ആദ്യ പേര്', 'firstName');            // Malayalam
key('ਪਹਿਲਾ ਨਾਮ', 'firstName');           // Punjabi
key('ਮੌਜੂਦਾ ਕੰਪਨੀ', 'currentCompany');

/* ── Latin-script languages ──────────────────────────────────────────── */

key('Apellidos', 'lastName');             // Spanish
key('Correo electrónico', 'email');
key('Teléfono', 'phone');
key('Ciudad', 'city');
key('Salario deseado', 'salaryExpectation');
key('Prénom', 'firstName');               // French
key('Nom de famille', 'lastName');
key('Lettre de motivation', 'coverLetter', { multiline: true });
key('Ville', 'city');
key('Vorname', 'firstName');              // German
key('Nachname', 'lastName');
key('Telefonnummer', 'phone');
key('Gehaltsvorstellung', 'salaryExpectation');
key('Lebenslauf hochladen', 'resume');
key('Sobrenome', 'lastName');             // Portuguese
key('Currículo', 'resume');

/* ── What must NOT change ────────────────────────────────────────────────
   Every English label has to come through untouched. This file sits in the
   hot path of every match on every form, so a false positive here is a
   regression for the ninety-odd percent of forms that were already working. */

for (const english of [
  'First Name', 'Last Name', 'Email Address', 'Phone', 'City', 'Country',
  'Current Company', 'Expected Salary', 'Notice Period', 'Resume/CV',
  'LinkedIn Profile', 'Are you legally authorized to work in the US?',
  'How did you hear about us?', 'Years of Experience', 'Cover Letter',
  'Website', 'Portfolio', 'What is your name?', 'Full Name',
]) {
  check(`English untouched: "${english}"`, translateLabel(english), english);
}

/* Machine field names must survive too — `normalize` runs on `name` and `id`
   attributes, which are ASCII and must not be rewritten. */
for (const name of ['first_name', 'candidate.email', 'job_application[resume]', 'cf-turnstile-response']) {
  check(`field name untouched: "${name}"`, translateLabel(name), name);
}

/* ── Options, not just labels ────────────────────────────────────────────
   A translated label is half the job. A Hindi form offers Hindi options, and
   an answer only lands if `chooseOption` can find "हाँ" from "Yes". */

check('चुनता है हाँ for Yes', chooseOption('Yes', ['हाँ', 'नहीं']), 'हाँ');
check('चुनता है नहीं for No', chooseOption('No', ['हाँ', 'नहीं']), 'नहीं');
check('Tamil yes', chooseOption('Yes', ['ஆம்', 'இல்லை']), 'ஆம்');
check('German ja', chooseOption('Yes', ['Ja', 'Nein']), 'Ja');
check('French non', chooseOption('No', ['Oui', 'Non']), 'Non');
check('Spanish sí', chooseOption('Yes', ['Sí', 'No']), 'Sí');

/* The bug that started the synonyms file, in another script: a negative answer
   must not select an unrelated option because of a shared substring. */
check('No does not select a region', chooseOption('No', ['उत्तर अमेरिका', 'नहीं', 'हाँ']), 'नहीं');

/* ── Questions ───────────────────────────────────────────────────────────
   A question in another language must produce a usable signature. Without
   translation `normalizeQuestion` returned '' and `signatureFor` rejected it,
   so the field was never even asked about. */

check('Hindi question normalises', normalizeQuestion('नोटिस अवधि क्या है?').includes('notice'), true);
check('Hindi question gets a signature',
  signatureFor(null, 'आपकी नोटिस अवधि') !== '', true);
check('taxonomy signature still wins over wording',
  signatureFor('workAuthorization', 'कार्य अनुमति'), 'key:workAuthorization');

/* ── The table points at phrases the matcher knows ───────────────────────
   A translation that lands on a phrase outside RULES is a silent no-op: it
   looks like support for a language and fills nothing. Every target is
   checked against the real matcher rather than a copy of the rule list. */

/* Two kinds of target legitimately do not match a rule. */
const NOT_LABELS = new Set([
  /* Option VALUES, consumed by `chooseOption`, never by `matchField`. */
  'yes', 'no', 'immediately', 'month', 'months', 'days', 'weeks', 'years',
  /* Part of an address, which is matched by the surrounding phrase. */
  'street',
  /* Deliberately unmatched, in English too: a label reading only "Salary" does
     not say whether it means what somebody earns or what they are asking for,
     and the matcher refuses rather than guessing. The translation still earns
     its place — it is what gives a Hindi form's "वेतन" a usable signature, so
     the member is ASKED the question instead of the field being skipped in
     silence. See `normalizeQuestion`. */
  'salary',
]);

const ORPHANS = targetPhrases().filter((phrase) => {
  if (NOT_LABELS.has(phrase)) return false;
  return matchField({ id: 'probe', label: phrase }) === null;
});
check(`every target phrase is in the vocabulary (orphans: ${ORPHANS.join(', ') || 'none'})`,
  ORPHANS.length, 0);

/* ── Normalisation still ends up ASCII ───────────────────────────────────
   Whatever went in, what leaves `normalize` must be the lower-case ASCII the
   rest of the matcher is written against. */
check('normalize output stays ascii',
  /^[a-z0-9+ ]*$/.test(normalize('पहला नाम / Prénom')), true);

/* ── Report ──────────────────────────────────────────────────────────── */

if (failures.length) {
  console.error(`\n${failures.length} failed:\n`);
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  console.error(`${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`\n${passed} passed, 0 failed`);
console.log('Non-English forms OK.');
