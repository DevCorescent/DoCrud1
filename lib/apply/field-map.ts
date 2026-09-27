/**
 * Reading a job application form.
 *
 * Given what a form control looks like — its label, its name, its autocomplete
 * hint, the options it offers — decide which question it is asking, from the
 * closed set in answer-keys.ts.
 *
 * ═══ SIGNALS, STRONGEST FIRST ═══
 *
 * 1. `autocomplete`. The one attribute that exists to say what a field means,
 *    standardised, and wrong almost never — a form that bothers to set it is
 *    telling the truth. Highest confidence.
 * 2. `name` / `id`. Machine-written and stable: `job_application[first_name]`,
 *    `cards[abc][field0]`, `--fullName`. Very reliable when it matches.
 * 3. The visible `<label>`. What the candidate reads. Reliable but written by
 *    humans in prose, so it needs the most careful matching.
 * 4. `placeholder` / `aria-label`. Often the only signal on a hand-rolled form.
 *
 * Each signal contributes; agreement between two of them is what pushes a
 * match above the threshold where it is filled silently.
 *
 * ═══ WHY NOT JUST ASK AN LLM ═══
 *
 * Because most of this is not a judgement call, and a model is the wrong tool
 * for `autocomplete="email"`. A round trip per field would be slow, costly,
 * non-deterministic across runs, and impossible to unit test — and it would
 * still be wrong in the same places. The model earns its place on the fields
 * this file cannot name: the prose questions, which are handled elsewhere.
 *
 * ═══ IT WOULD RATHER LEAVE A FIELD EMPTY ═══
 *
 * Below `SKIP_THRESHOLD` nothing is written. A blank box is a small
 * inconvenience; a salary expectation typed into "years of experience" is sent
 * to an employer in the candidate's name and cannot be recalled.
 */

import {
  FILL_THRESHOLD, SKIP_THRESHOLD,
  type AnswerKey, type FieldDescriptor,
} from '@/lib/apply/answer-keys';
import { equivalents, sameAnswer, isAffirmative, isNegative } from '@/lib/apply/synonyms';
import { translateLabel } from '@/lib/apply/i18n-labels';

/* ── Text handling ───────────────────────────────────────────────────── */

/** Lower case, punctuation and separators to single spaces, trimmed. A form's
    `first_name`, `firstName`, `First Name *` and `FIRST-NAME` all land here as
    `first name`. */
export function normalize(raw: string | undefined): string {
  if (!raw) return '';
  /* Before anything is stripped. The strip below removes every character
     outside `[a-zA-Z0-9+ ]`, which turns a label reading "पहला नाम" into the
     empty string — so a form in any Indic script matched nothing at all until
     this ran first. See lib/apply/i18n-labels.ts. */
  return translateLabel(raw)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')   // firstName → first Name
    .replace(/[_\-.[\]()/\\]+/g, ' ')
    .replace(/[^a-zA-Z0-9+ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Whole-word containment, so `name` does not match `surname` and `url` does
    not match `curl`. */
function hasPhrase(haystack: string, phrase: string): boolean {
  if (!haystack || !phrase) return false;
  return new RegExp(`(^| )${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($| )`).test(haystack);
}

/* ── The vocabulary ──────────────────────────────────────────────────── */

interface Rule {
  key: AnswerKey;
  /** Matched against `autocomplete`. Exact, and definitive. */
  auto?: string[];
  /** Phrases in the name/id or the label. Order is irrelevant; length is not —
      longer phrases win, because "first name" must beat "name". */
  phrases: string[];
  /** Any of these present means this rule does NOT apply, however well the
      phrases matched. "current company" is not "company website". */
  not?: string[];
  /** A rule only worth applying to a textarea, or only to an input. */
  multilineOnly?: boolean;
}

/* Ordered only for readability — matching scores every rule and takes the best,
   so a rule cannot win merely by being early. */
const RULES: Rule[] = [
  { key: 'email', auto: ['email'], phrases: ['email', 'e mail', 'email address'], not: ['confirm', 'verify'] },
  { key: 'phone', auto: ['tel', 'tel national'], phrases: ['phone', 'mobile', 'telephone', 'phone number', 'contact number', 'cell'] },

  { key: 'firstName', auto: ['given-name'], phrases: ['first name', 'given name', 'forename', 'firstname'] },
  { key: 'lastName', auto: ['family-name'], phrases: ['last name', 'family name', 'surname', 'lastname'] },
  { key: 'preferredName', auto: ['nickname'], phrases: ['preferred name', 'nickname', 'known as', 'goes by'] },
  /* Plain "name" is last-resort: it must not outrank "first name", which it
     cannot, because the phrase is shorter and scoring prefers length. */
  { key: 'fullName', auto: ['name'], phrases: ['full name', 'your name', 'name', 'candidate name', 'applicant name'],
    not: ['first', 'last', 'given', 'family', 'sur', 'company', 'school', 'university', 'employer', 'referrer', 'file'] },

  { key: 'addressLine', auto: ['street-address', 'address-line1'], phrases: ['address', 'street', 'address line'] , not: ['email', 'ip'] },
  { key: 'city', auto: ['address-level2'], phrases: ['city', 'town'] },
  { key: 'state', auto: ['address-level1'], phrases: ['state', 'province', 'region', 'county'] },
  { key: 'country', auto: ['country', 'country-name'], phrases: ['country', 'nation'] },
  { key: 'postalCode', auto: ['postal-code'], phrases: ['postal code', 'zip', 'zip code', 'pin code', 'postcode'] },
  { key: 'location', phrases: ['location', 'where are you based', 'current location', 'based in', 'place of residence'] },

  { key: 'linkedin', phrases: ['linkedin', 'linked in', 'linkedin profile', 'linkedin url'] },
  { key: 'github', phrases: ['github', 'git hub', 'github profile', 'github url'] },
  { key: 'dribbble', phrases: ['dribbble', 'behance'] },
  { key: 'stackoverflow', phrases: ['stack overflow', 'stackoverflow'] },
  { key: 'twitter', phrases: ['twitter', 'x profile', 'x url'] },
  { key: 'portfolio', phrases: ['portfolio', 'portfolio url', 'portfolio link', 'work samples', 'personal site'] },
  { key: 'website', auto: ['url'], phrases: ['website', 'web site', 'url', 'personal website', 'blog'],
    not: ['company', 'employer', 'linkedin', 'github', 'portfolio'] },

  { key: 'currentTitle', phrases: ['current title', 'job title', 'current role', 'current position', 'your title', 'present designation', 'designation'] },
  { key: 'currentCompany', phrases: ['current company', 'current employer', 'company', 'employer', 'organisation', 'organization', 'present company'],
    not: ['website', 'url', 'size', 'why', 'about'] },
  { key: 'yearsExperience', phrases: ['years of experience', 'total experience', 'years experience', 'yrs of experience', 'experience in years', 'relevant experience'] },

  { key: 'school', phrases: ['school', 'university', 'college', 'institution', 'alma mater'] },
  { key: 'degree', phrases: ['degree', 'qualification', 'highest degree'] },
  { key: 'fieldOfStudy', phrases: ['field of study', 'major', 'discipline', 'specialisation', 'specialization', 'branch'] },
  { key: 'graduationYear', phrases: ['graduation year', 'year of graduation', 'passing year', 'graduation date', 'class of'] },

  { key: 'workAuthorization', phrases: ['work authorization', 'work authorisation', 'authorized to work', 'authorised to work', 'legally authorized', 'right to work', 'work permit', 'work eligibility'] },
  { key: 'requiresSponsorship', phrases: ['sponsorship', 'require sponsorship', 'need sponsorship', 'visa sponsorship', 'require a visa'] },
  { key: 'willRelocate', phrases: ['relocate', 'willing to relocate', 'open to relocation', 'relocation'] },
  { key: 'noticePeriod', phrases: ['notice period', 'notice', 'how soon can you join', 'joining time', 'availability to start'] },
  { key: 'availableFrom', phrases: ['available from', 'start date', 'earliest start', 'when can you start', 'date available'] },
  { key: 'salaryExpectation', phrases: ['expected salary', 'salary expectation', 'desired salary', 'expected ctc', 'compensation expectation', 'expected compensation'] },
  { key: 'currentSalary', phrases: ['current salary', 'current ctc', 'present salary', 'current compensation'] },

  { key: 'howDidYouHear', phrases: ['how did you hear', 'where did you hear', 'referral source', 'how you found us', 'source'] },
  { key: 'coverLetter', phrases: ['cover letter', 'covering letter', 'letter of interest', 'motivation letter'], multilineOnly: true },
  { key: 'resume', phrases: ['resume', 'cv', 'curriculum vitae', 'upload resume', 'attach resume'] },
];

/* ── Scoring ─────────────────────────────────────────────────────────── */

/**
 * Weights per signal. They sum above 1 on purpose: two agreeing signals should
 * reach certainty, and the result is clamped.
 *
 * `placeholder` and `aria` are deliberately tuned so that either one ALONE
 * lands between the two thresholds — enough to fill, never enough to fill
 * silently. A hand-rolled careers form often has nothing but a placeholder, and
 * at 0.3 those fields scored 0.23 and were skipped entirely, which left exactly
 * the forms this feature exists for untouched. At 0.6 a one-word placeholder
 * scores 0.46: written into the field, and flagged for the candidate to check.
 */
const W = { auto: 0.92, name: 0.55, label: 0.75, placeholder: 0.6, aria: 0.62 };

/** Longer phrases are more specific and beat shorter ones — the whole reason
    "first name" does not lose to "name". Saturates so a very long phrase is
    not arbitrarily better than a merely long one. */
function specificity(phrase: string): number {
  return Math.min(1, 0.55 + phrase.split(' ').length * 0.22);
}

function scoreRule(rule: Rule, f: FieldDescriptor): { score: number; reason: string } | null {
  const nameText = normalize(`${f.name ?? ''} ${f.domId ?? ''}`);
  const labelText = normalize(f.label);
  const placeholderText = normalize(f.placeholder);
  const ariaText = normalize(f.ariaLabel);
  const all = `${nameText} ${labelText} ${placeholderText} ${ariaText}`;

  if (rule.not?.some((n) => hasPhrase(all, normalize(n)))) return null;
  if (rule.multilineOnly && f.multiline === false) return null;

  let score = 0;
  const why: string[] = [];

  const auto = normalize(f.autocomplete);
  if (auto && rule.auto?.some((a) => normalize(a) === auto)) {
    score += W.auto;
    why.push(`autocomplete="${f.autocomplete}"`);
  }

  /* The best phrase per signal, not the sum of all of them: a label reading
     "first name" should not score twice for matching both "first name" and
     "name". */
  const best = (text: string) => {
    let top = 0; let phrase = '';
    for (const p of rule.phrases) {
      const n = normalize(p);
      if (hasPhrase(text, n) && specificity(n) > top) { top = specificity(n); phrase = p; }
    }
    return { top, phrase };
  };

  const byName = best(nameText);
  if (byName.top) { score += W.name * byName.top; why.push(`name matches “${byName.phrase}”`); }

  const byLabel = best(labelText);
  if (byLabel.top) { score += W.label * byLabel.top; why.push(`label “${f.label?.trim()}”`); }

  const byPlaceholder = best(placeholderText);
  if (byPlaceholder.top && !byLabel.top) { score += W.placeholder * byPlaceholder.top; why.push('placeholder'); }

  const byAria = best(ariaText);
  if (byAria.top && !byLabel.top) { score += W.aria * byAria.top; why.push('aria-label'); }

  if (score <= 0) return null;
  return { score: Math.min(1, score), reason: why.join(', ') };
}

/** The input's own type is a hard constraint, not a hint: `type="email"` is an
    email box whatever it is called, and a file input is never a text answer. */
function typeOverride(f: FieldDescriptor): { key: AnswerKey; score: number; reason: string } | null {
  const t = (f.type ?? '').toLowerCase();
  if (t === 'email') return { key: 'email', score: 0.9, reason: 'type="email"' };
  if (t === 'tel') return { key: 'phone', score: 0.9, reason: 'type="tel"' };
  if (t === 'file') return { key: 'resume', score: 0.75, reason: 'file input' };
  return null;
}

export interface Match {
  key: AnswerKey;
  confidence: number;
  reason: string;
}

/**
 * Which question is this field asking?
 *
 * Returns `freeText` for a textarea nothing else claimed — that is the signal
 * to the caller that an AI-written answer is wanted, not that matching failed.
 * Returns null when the field should be left alone entirely.
 */
export function matchField(f: FieldDescriptor): Match | null {
  let best: Match | null = null;

  for (const rule of RULES) {
    const r = scoreRule(rule, f);
    if (r && (!best || r.score > best.confidence)) {
      best = { key: rule.key, confidence: r.score, reason: r.reason };
    }
  }

  const forced = typeOverride(f);
  if (forced) {
    /* Mapped into a Match rather than assigned across — `typeOverride` reports
       a `score` and a Match carries a `confidence`, and assigning one to the
       other produced an object whose confidence was `undefined`. Every
       comparison against it was then false, so `type="email"` — the single
       most reliable signal on the page — matched nothing at all. */
    if (!best || forced.score > best.confidence) {
      best = { key: forced.key, confidence: forced.score, reason: forced.reason };
    }
  }

  if (best && best.confidence >= SKIP_THRESHOLD) return best;

  /* Nothing named it. A prose box on a job application is a question about the
     candidate, and answering it is exactly what the model is for. */
  if (f.multiline && (f.label || f.ariaLabel || f.placeholder)) {
    return { key: 'freeText', confidence: 0.5, reason: 'an open question — answered from your profile' };
  }
  return null;
}

/* ── Choosing from a list ────────────────────────────────────────────── */

/**
 * The option to pick when the field is a select or a radio group.
 *
 * ═══ WHY THIS IS SCORED AND NOT A SERIES OF `includes` ═══
 *
 * It used to be: exact, then "either string contains the other", then a yes/no
 * check. Substring containment is not word-aware, and the result was that a
 * member answering "No" had **"North America"** selected for them — "no" is
 * inside "north". It also missed everything that needed a synonym: "30 days"
 * against an option list offering "1 month", "United States" against "US",
 * "Bengaluru" against "Bangalore".
 *
 * Every option is now scored and the best one wins, on whole words only.
 *
 * ═══ AND IT REFUSES TO GUESS ═══
 *
 * A winner must clear a threshold AND beat the runner-up by a margin. Two
 * options that score alike — "Yes, I am authorized" and "Yes, with sponsorship"
 * against a bare "Yes" — are genuinely ambiguous, so nothing is selected and the
 * field becomes a question the member answers themselves. That is the whole
 * point: an unanswered dropdown is visible, and a wrongly answered one about
 * work authorisation is a lie told on somebody's behalf.
 */

/** Whole words, for set comparison. */
function tokens(normalized: string): Set<string> {
  return new Set(normalized.split(' ').filter(Boolean));
}

/** How much of `a` is present in `b`, by whole words. */
function coverage(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0;
  let hit = 0;
  a.forEach((t) => { if (b.has(t)) hit += 1; });
  return hit / a.size;
}

/** Must clear this to be selected at all. */
const OPTION_FLOOR = 0.6;
/** And must beat the next best by this, or the choice is ambiguous. */
const OPTION_MARGIN = 0.08;

function scoreOption(wantNorm: string, wantTokens: Set<string>, optionText: string): number {
  const optNorm = normalize(optionText);
  if (!optNorm) return 0;

  /* Identical, or the same answer under another name. Nothing beats these, and
     they are the reason "30 days" finds "1 month". */
  if (optNorm === wantNorm) return 1;
  if (sameAnswer(wantNorm, optNorm)) return 0.96;

  /* One of the value's synonyms appears as a whole phrase in the option, or the
     other way round — "United States" inside "United States (US)". */
  const optTokens = tokens(optNorm);
  /* `forEach` rather than `for…of`: this file is compiled to an ES5 target for
     the widest runtime support, where iterating a Set needs downlevelIteration. */
  let synonymScore = 0;
  equivalents(wantNorm).forEach((alt) => {
    if (synonymScore) return;
    const altTokens = tokens(alt);
    if (altTokens.size && coverage(altTokens, optTokens) === 1) {
      /* Every word of the answer is in the option. Shorter options are better
         matches — "India" over "India and South Asia". */
      synonymScore = 0.9 - Math.min(0.2, (optTokens.size - altTokens.size) * 0.04);
    }
  });
  if (synonymScore) return synonymScore;

  /* The option is wholly contained in the answer: the member said "Bengaluru,
     Karnataka" and the list offers "Bengaluru". */
  if (optTokens.size && coverage(optTokens, wantTokens) === 1) {
    return 0.86 - Math.min(0.2, (wantTokens.size - optTokens.size) * 0.04);
  }

  /* Partial word overlap, which is where a real but imperfect match lands. */
  const overlap = Math.max(coverage(wantTokens, optTokens), coverage(optTokens, wantTokens));
  return overlap * 0.7;
}

/**
 * The best option and how good it is, whatever the threshold.
 *
 * `chooseOption` answers "may I select this for them?" and says no when it is
 * not sure. This answers "which is most likely?", which is a different and
 * weaker question — it is what the chat uses to pre-select an option for the
 * person to confirm. A suggestion nobody has to accept can afford to be less
 * certain than a value written into a form unasked.
 */
export function bestOption(value: string, options: string[]): { option: string; score: number } | null {
  if (!value || options.length === 0) return null;
  const wantNorm = normalize(value);
  if (!wantNorm) return null;
  const wantTokens = tokens(wantNorm);
  let best: { option: string; score: number } | null = null;
  for (const option of options) {
    const score = scoreOption(wantNorm, wantTokens, option);
    if (!best || score > best.score) best = { option, score };
  }
  return best && best.score > 0.2 ? best : null;
}

/**
 * The options that plausibly mean what the member said, best first.
 *
 * `chooseOption` picks one or refuses. This returns the shortlist behind that
 * decision, which is what the sidebar's editor offers when somebody wants to
 * change an answer: the options the matcher nearly chose are far more useful
 * than the top of an alphabetical list of two hundred countries, and they are
 * already computed.
 *
 * The floor is low on purpose. Nothing here is written into a form — a person
 * presses one — so the cost of a weak suggestion is one line they ignore.
 */
export function rankOptions(value: string, options: string[], limit = 3): string[] {
  if (!value || options.length === 0) return [];
  const wantNorm = normalize(value);
  if (!wantNorm) return [];
  const wantTokens = tokens(wantNorm);
  return options
    .map((option) => ({ option, score: scoreOption(wantNorm, wantTokens, option) }))
    .filter((o) => o.score > 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((o) => o.option);
}

export function chooseOption(value: string, options: string[]): string | null {
  if (!value || options.length === 0) return null;

  const wantNorm = normalize(value);
  if (!wantNorm) return null;
  const wantTokens = tokens(wantNorm);

  const scored = options
    .map((option) => ({ option, score: scoreOption(wantNorm, wantTokens, option) }))
    .sort((a, b) => b.score - a.score);

  /* Yes/no is decided on meaning rather than on words, because "Yes" and "Yes,
     I am authorized to work in the United States" share exactly one token out
     of eight. Only ever applied when the answer is itself a yes or a no, and
     only when the list offers exactly one option of that polarity — two
     affirmative choices is a real question, not a formality. */
  const wantsYes = isAffirmative(wantNorm);
  const wantsNo = isNegative(wantNorm);
  if (wantsYes !== wantsNo) {
    const test = wantsYes ? isAffirmative : isNegative;
    const matching = options.filter((o) => test(normalize(o)));
    if (matching.length === 1) return matching[0];
    /* More than one, or none: fall through to scoring rather than picking the
       first — "Yes, remote" and "Yes, hybrid" need the member. */
  }

  const best = scored[0];
  if (!best || best.score < OPTION_FLOOR) return null;
  /* An exact match is never ambiguous, however close the runner-up. */
  if (best.score < 1) {
    const second = scored[1];
    if (second && best.score - second.score < OPTION_MARGIN) return null;
  }
  return best.option;
}

/** Whether a matched field should be filled without asking. */
export function fillsSilently(confidence: number): boolean {
  return confidence >= FILL_THRESHOLD;
}
