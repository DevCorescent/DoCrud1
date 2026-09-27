/**
 * The form matcher, against the real vocabularies.
 *
 * Run: npx tsx scripts/apply-field-map.selftest.ts
 *
 * The cases below are the attribute names and labels these systems actually
 * ship — Greenhouse's `job_application[first_name]`, Lever's `urls[LinkedIn]`,
 * Workday's `--fullName`, and the hand-rolled forms on company career pages.
 * This is the only part of auto-apply that can be tested without a browser, and
 * it is the part that decides what an employer receives in someone's name, so
 * it is tested hard.
 *
 * The negative cases matter as much as the positive ones: a matcher that fills
 * everything is worse than one that fills half and says so.
 */

import {
  matchField, chooseOption, normalize, fillsSilently,
} from '../lib/apply/field-map';
import { SKIP_THRESHOLD, type AnswerKey, type FieldDescriptor } from '../lib/apply/answer-keys';

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass += 1; return; }
  fail += 1;
  failures.push(`  ✗ ${name}\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`);
}

function expectKey(name: string, f: FieldDescriptor, want: AnswerKey | null) {
  const m = matchField(f);
  check(name, m?.key ?? null, want);
}

/* ══ 1. Greenhouse ══ */
expectKey('gh first name', { id: '1', name: 'job_application[first_name]', label: 'First Name *' }, 'firstName');
expectKey('gh last name', { id: '2', name: 'job_application[last_name]', label: 'Last Name *' }, 'lastName');
expectKey('gh email', { id: '3', name: 'job_application[email]', label: 'Email *', type: 'email' }, 'email');
expectKey('gh phone', { id: '4', name: 'job_application[phone]', label: 'Phone' }, 'phone');
expectKey('gh resume', { id: '5', name: 'job_application[resume]', label: 'Resume/CV *', type: 'file' }, 'resume');
expectKey('gh cover letter', { id: '6', name: 'job_application[cover_letter_text]', label: 'Cover Letter', multiline: true }, 'coverLetter');
expectKey('gh linkedin question', { id: '7', name: 'job_application[answers_attributes][0][text_value]', label: 'LinkedIn Profile' }, 'linkedin');

/* ══ 2. Lever ══ */
expectKey('lever name', { id: '8', name: 'name', label: 'Full name✱' }, 'fullName');
expectKey('lever email', { id: '9', name: 'email', label: 'Email✱' }, 'email');
expectKey('lever phone', { id: '10', name: 'phone', label: 'Phone' }, 'phone');
expectKey('lever linkedin url', { id: '11', name: 'urls[LinkedIn]', label: 'LinkedIn URL' }, 'linkedin');
expectKey('lever github url', { id: '12', name: 'urls[GitHub]', label: 'GitHub URL' }, 'github');
expectKey('lever portfolio', { id: '13', name: 'urls[Portfolio]', label: 'Portfolio URL' }, 'portfolio');
expectKey('lever org', { id: '14', name: 'org', label: 'Current company' }, 'currentCompany');

/* ══ 3. Workday-style ══ */
expectKey('wd legal first', { id: '15', domId: '--legalName--firstName', label: 'First Name' }, 'firstName');
expectKey('wd address line', { id: '16', domId: '--addressSection--addressLine1', label: 'Address Line 1' }, 'addressLine');
expectKey('wd city', { id: '17', domId: '--addressSection--city', label: 'City' }, 'city');
expectKey('wd postal', { id: '18', domId: '--addressSection--postalCode', label: 'Postal Code' }, 'postalCode');
expectKey('wd country', { id: '19', domId: '--country', label: 'Country', options: ['India', 'United States'] }, 'country');

/* ══ 4. autocomplete beats everything ══ */
expectKey('autocomplete email on an odd name',
  { id: '20', name: 'f_2871', autocomplete: 'email' }, 'email');
expectKey('autocomplete given-name',
  { id: '21', name: 'applicant_a', autocomplete: 'given-name' }, 'firstName');
check('autocomplete is filled silently',
  fillsSilently(matchField({ id: '22', name: 'x', autocomplete: 'family-name' })!.confidence), true);

/* ══ 5. "first name" must beat "name" ══
   The bug this whole scoring scheme exists to prevent: a longer, more specific
   phrase has to win, or every name field on the internet becomes `fullName`. */
expectKey('first name is not full name', { id: '23', name: 'first_name', label: 'First name' }, 'firstName');
expectKey('surname is not full name', { id: '24', name: 'surname', label: 'Surname' }, 'lastName');

/* ══ 6. The awkward questions ══ */
expectKey('work authorisation', { id: '25', label: 'Are you legally authorized to work in the United States?', options: ['Yes', 'No'] }, 'workAuthorization');
expectKey('sponsorship', { id: '26', label: 'Will you now or in the future require visa sponsorship?', options: ['Yes', 'No'] }, 'requiresSponsorship');
expectKey('relocation', { id: '27', label: 'Are you willing to relocate?', options: ['Yes', 'No'] }, 'willRelocate');
expectKey('notice period', { id: '28', name: 'notice_period', label: 'Notice period' }, 'noticePeriod');
expectKey('expected ctc', { id: '29', label: 'Expected CTC' }, 'salaryExpectation');
expectKey('current ctc is not expected', { id: '30', label: 'Current CTC' }, 'currentSalary');
expectKey('how did you hear', { id: '31', name: 'source', label: 'How did you hear about us?' }, 'howDidYouHear');
expectKey('years of experience', { id: '32', label: 'Total years of experience' }, 'yearsExperience');

/* ══ 7. Things it must NOT claim ══ */
expectKey('company website is not a personal website',
  { id: '33', name: 'company_website', label: 'Company website' }, null);
expectKey('confirm email is left alone',
  { id: '34', name: 'confirm_email', label: 'Confirm your email' }, null);
expectKey('a password is never ours',
  { id: '35', name: 'password', label: 'Password', type: 'password' }, null);
expectKey('an unlabelled text box is left alone',
  { id: '36', name: 'q_1' }, null);
expectKey('a search box is not an answer',
  { id: '37', name: 'q', placeholder: 'Search' }, null);

/* A bare label is the whole signal on a hand-rolled form, and `type` is the
   most reliable signal anywhere — both were returning null once. */
expectKey('a bare label still matches', { id: '42', label: 'Email' }, 'email');
expectKey('type=email with no other signal', { id: '43', name: 'f7', type: 'email' }, 'email');
expectKey('type=tel with no other signal', { id: '44', name: 'f8', type: 'tel' }, 'phone');

/* ══ 8. A prose box nothing named becomes an AI answer ══ */
expectKey('open question → freeText',
  { id: '38', label: 'Why do you want to work at Northwind?', multiline: true }, 'freeText');
expectKey('an unlabelled textarea is still left alone',
  { id: '39', multiline: true }, null);

/* ══ 9. Choosing from a list ══ */
check('exact option', chooseOption('India', ['United States', 'India', 'Germany']), 'India');
check('case-insensitive option', chooseOption('india', ['United States', 'India']), 'India');
check('contained option', chooseOption('Yes', ['Yes, I am authorized', 'No']), 'Yes, I am authorized');
check('yes → an affirmative option', chooseOption('yes', ['Y', 'N']), 'Y');
check('no → a negative option', chooseOption('No', ['Yes', 'No']), 'No');
check('no plausible option → null, never a guess',
  chooseOption('Mumbai', ['United States', 'Canada']), null);
check('empty value → null', chooseOption('', ['Yes', 'No']), null);

/* ══ 9b. Choosing from a list, the hard cases ══
   Every one of these was wrong or missing before the matcher was scored. The
   first is the one that mattered: substring containment selected a REGION when
   the member had answered a yes/no question, because "no" is inside "north". */
check('“No” must not select “North America”',
  chooseOption('No', ['North America', 'Europe', 'Asia']), null);
check('“Yes” finds the affirmative option however it is worded',
  chooseOption('Yes', ['Yes, I am authorized to work', 'No, I require sponsorship']),
  'Yes, I am authorized to work');
check('“No” finds the negative one',
  chooseOption('No', ['Yes, I am authorized to work', 'No, I require sponsorship']),
  'No, I require sponsorship');

/* Synonyms: the member and the form say the same thing differently. */
check('30 days is 1 month', chooseOption('30 days', ['Immediately', '2 weeks', '1 month', '3 months']), '1 month');
check('immediately is the shortest bucket', chooseOption('Immediately', ['0-15 days', '15-30 days', '30-60 days']), '0-15 days');
check('United States is US', chooseOption('United States', ['US', 'UK', 'IN']), 'US');
check('US is United States', chooseOption('US', ['United States', 'United Kingdom']), 'United States');
check('Bengaluru is Bangalore', chooseOption('Bengaluru', ['Bangalore', 'Mumbai', 'Delhi']), 'Bangalore');
check('Bombay is Mumbai', chooseOption('Bombay', ['Bengaluru', 'Mumbai']), 'Mumbai');
check('work from home is remote', chooseOption('Work from home', ['Remote', 'On-site', 'Hybrid']), 'Remote');

/* Word-aware, so a shared prefix is not a match. */
check('India is not Indiana', chooseOption('India', ['Indiana', 'India', 'Indonesia']), 'India');
check('a longer location still finds the city',
  chooseOption('Bengaluru, Karnataka', ['Bengaluru', 'Chennai']), 'Bengaluru');
check('the shorter of two containing options wins',
  chooseOption('India', ['India', 'India and South Asia']), 'India');

/* And it refuses when the answer genuinely does not decide it. */
check('two affirmative options are a real question, not a formality',
  chooseOption('Yes', ['Yes, remote', 'Yes, hybrid', 'No']), null);
check('nothing plausible is still null',
  chooseOption('Mumbai', ['United States', 'Canada']), null);

/* ══ 10. Normalisation ══ */
check('camelCase splits', normalize('firstName'), 'first name');
check('snake_case splits', normalize('job_application[first_name]'), 'job application first name');
check('workday dashes', normalize('--legalName--firstName'), 'legal name first name');
check('asterisks and spaces', normalize('  First Name *  '), 'first name');
check('undefined is empty', normalize(undefined), '');

/* ══ 11. Confidence behaves ══ */
{
  const strong = matchField({ id: '40', name: 'job_application[email]', label: 'Email', type: 'email', autocomplete: 'email' })!;
  check('three agreeing signals are certain', strong.confidence >= 0.95, true);

  const weak = matchField({ id: '41', placeholder: 'City' })!;
  check('a placeholder alone is not certain', fillsSilently(weak.confidence), false);
  check('a placeholder alone still clears the floor', weak.confidence >= SKIP_THRESHOLD, true);
}

/* ══ Result ══ */
console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log('\n' + failures.join('\n'));
  process.exit(1);
}
console.log('Form matcher OK.\n');
