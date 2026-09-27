/**
 * The ways people and forms say the same thing.
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * A member says "30 days" and the dropdown offers "1 month". They say
 * "Bengaluru" and it offers "Bangalore". They say "United States" and it offers
 * "US". They say "Immediately" and it offers "0-15 days". None of those match as
 * text, all of them are the same answer, and without this the field is left
 * empty and the person is asked a question they have already answered.
 *
 * ═══ WHAT IS AND IS NOT IN HERE ═══
 *
 * Only pairs that are genuinely interchangeable in the context of a job
 * application. "Bangalore" and "Bengaluru" are one city under two names.
 * "Contract" and "Full-time" are not synonyms however similar the forms look,
 * and grouping them would make the extension answer an employment-type question
 * wrongly on the member's behalf.
 *
 * Every group is symmetric and transitive by construction: membership of a
 * group is the relation, so nothing here can claim A matches B but B does not
 * match A.
 *
 * PURE, and deliberately data rather than logic — adding a synonym should never
 * require reading code.
 */

/** Groups of interchangeable terms. Compared after `normalize()` in
    field-map.ts, so entries here are written in that form: lower case, no
    punctuation, single spaces. */
const GROUPS: readonly string[][] = [
  /* ── Yes and no, as forms phrase them ── */
  ['yes', 'y', 'yeah', 'yep', 'true', 'i am', 'i do', 'i have', 'i will',
    'authorized', 'authorised', 'eligible', 'confirmed', 'agree', 'accept'],
  ['no', 'n', 'nope', 'false', 'i am not', 'i do not', 'i dont', 'not authorized',
    'not authorised', 'none', 'decline'],

  /* ── Notice periods. The commonest place a form and a person disagree. ── */
  ['immediately', 'immediate', 'asap', 'right away', 'now', '0 days',
    'available immediately', 'immediate joiner', 'serving notice period'],
  ['15 days', '2 weeks', 'two weeks', 'fortnight', '0 15 days', 'within 15 days'],
  ['30 days', '1 month', 'one month', '4 weeks', 'a month', 'within 30 days', '15 30 days'],
  ['60 days', '2 months', 'two months', '8 weeks', 'within 60 days', '30 60 days'],
  ['90 days', '3 months', 'three months', '12 weeks', 'within 90 days', '60 90 days'],

  /* ── Countries, by the names forms actually use ── */
  ['united states', 'us', 'usa', 'u s', 'u s a', 'united states of america', 'america'],
  ['united kingdom', 'uk', 'u k', 'great britain', 'britain', 'england'],
  ['india', 'in', 'ind', 'bharat'],
  ['united arab emirates', 'uae'],
  ['australia', 'au', 'aus'],
  ['canada', 'ca', 'can'],
  ['germany', 'de', 'deu', 'deutschland'],
  ['singapore', 'sg', 'sgp'],

  /* ── Indian cities that were renamed, and are still listed both ways ── */
  ['bengaluru', 'bangalore', 'blr'],
  ['mumbai', 'bombay', 'bom'],
  ['kolkata', 'calcutta', 'ccu'],
  ['chennai', 'madras', 'maa'],
  ['gurugram', 'gurgaon'],
  ['pune', 'poona'],
  ['new delhi', 'delhi', 'ncr', 'national capital region'],
  ['thiruvananthapuram', 'trivandrum'],
  ['vadodara', 'baroda'],
  ['kochi', 'cochin'],

  /* ── Work mode ── */
  ['remote', 'work from home', 'wfh', 'fully remote', 'remotely', 'anywhere'],
  ['onsite', 'on site', 'in office', 'in person', 'office', 'office based'],
  ['hybrid', 'flexible', 'partially remote'],

  /* ── Employment type ── */
  ['full time', 'fulltime', 'permanent', 'regular', 'full time employee'],
  ['part time', 'parttime'],
  ['contract', 'contractor', 'contractual', 'fixed term', 'temporary'],
  ['internship', 'intern', 'trainee', 'apprenticeship'],
  ['freelance', 'freelancer', 'consultant', 'self employed'],
];

/** term → the index of its group. Built once. */
const INDEX = new Map<string, number>();
GROUPS.forEach((group, i) => group.forEach((term) => {
  /* First writer wins, so a term appearing in two groups is not silently
     reassigned by whichever happens to be later in the file. */
  if (!INDEX.has(term)) INDEX.set(term, i);
}));

/** Every way of saying this, including itself. An unknown term returns just
    itself, which is exactly right: no synonyms is not the same as no match. */
export function equivalents(normalized: string): ReadonlySet<string> {
  const group = INDEX.get(normalized);
  if (group === undefined) return new Set([normalized]);
  return new Set(GROUPS[group]);
}

/** Whether two already-normalised terms are the same answer. */
export function sameAnswer(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const ga = INDEX.get(a);
  const gb = INDEX.get(b);
  return ga !== undefined && ga === gb;
}

/* ── Yes and no ──
   Checked as whole terms or as the FIRST word, never as a substring. "No" must
   not match "North America", which is exactly what `includes` did: it selected
   a region when the member had answered a yes/no question. */

const AFFIRM = new Set(GROUPS[0]);
const NEGATE = new Set(GROUPS[1]);

function firstWord(s: string): string {
  return s.split(' ')[0] ?? '';
}

export function isAffirmative(normalized: string): boolean {
  if (!normalized) return false;
  return AFFIRM.has(normalized) || AFFIRM.has(firstWord(normalized));
}

export function isNegative(normalized: string): boolean {
  if (!normalized) return false;
  /* "not" leads a great many negative options — "not authorized", "no, I do
     not" — and is not itself in the group, so it is tested separately. */
  const first = firstWord(normalized);
  return NEGATE.has(normalized) || NEGATE.has(first) || first === 'not';
}
