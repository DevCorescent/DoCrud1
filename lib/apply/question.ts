/**
 * Turning a form field nobody could answer into a question a person can.
 *
 * ═══ WHAT THIS IS FOR ═══
 *
 * After the matcher and the reading pass, some fields are still empty, and they
 * are empty for an honest reason: the profile does not hold the answer. Work
 * authorisation, notice period, expected salary, "how did you hear about us",
 * and whatever a particular employer decided to ask. Nothing can invent those.
 *
 * So the extension asks. One field, one plain question, and — where the form
 * offers a list — buttons instead of a text box, because picking is faster than
 * typing and cannot be mistyped.
 *
 * ═══ THE SIGNATURE IS THE WHOLE TRICK ═══
 *
 * An answer is worth remembering only if it can be recognised again on a
 * different form. `signatureFor` is what decides that two questions are the
 * same question:
 *
 *   · When the field maps to a key in our taxonomy, the KEY is the signature.
 *     "Are you legally authorized to work in the United States?" and "Do you
 *     have the right to work in the US?" are worded nothing alike and are the
 *     same question — both resolve to `workAuthorization`, so an answer to one
 *     answers the other, on any employer's form, forever.
 *
 *   · Otherwise the normalised text of the question is the signature. That only
 *     recognises the same wording again, which is the honest limit: two
 *     questions we cannot classify and cannot read might mean anything, and
 *     answering one with the other's answer would be a guess made in someone's
 *     name.
 *
 * ═══ THE ANSWER IS STORED SEMANTICALLY ═══
 *
 * What is remembered is "Yes", not "option 3". The next form may word its
 * choices differently — "Yes", "Y", "Yes, I am authorized" — and `chooseOption`
 * in field-map.ts maps the remembered answer onto whatever that form offers.
 * Storing the option index would break the moment an employer reordered a
 * dropdown.
 *
 * PURE. No clock, no storage, no network.
 */

import type { AnswerKey, FieldDescriptor } from '@/lib/apply/answer-keys';
import { translateLabel } from '@/lib/apply/i18n-labels';

/** How the extension should ask. */
export type QuestionKind = 'choice' | 'boolean' | 'text' | 'longtext';

export interface Question {
  /** The field this answers, so the extension knows where to write. */
  fieldId: string;
  /** What to remember the answer under. */
  signature: string;
  /** Plain language, addressed to the person. */
  prompt: string;
  kind: QuestionKind;
  /** For `choice`: exactly what the form offers, in its own words. */
  options?: string[];
  /** The employer's own label, shown small beneath the prompt so the person can
      see what is actually being filled in. */
  sourceLabel?: string;
  required?: boolean;
  /** What they answered last time this question came up, anywhere. */
  recalled?: string;
  /** The answer to put in front of them, and where it came from. Pre-selected,
      never submitted on its own — a recommendation somebody confirms is a
      different thing from a value written into a form unasked. */
  suggested?: { value: string; why: string };
}

/* ── Normalising a question ──────────────────────────────────────────── */

/** Words that carry no meaning in a form question. Removing them is what makes
    "Are you willing to relocate?" and "Willing to relocate" one signature. */
const FILLER = new Set([
  'a', 'an', 'the', 'is', 'are', 'am', 'do', 'does', 'did', 'you', 'your',
  'yours', 'we', 'our', 'us', 'please', 'kindly', 'select', 'choose', 'enter',
  'provide', 'specify', 'tell', 'let', 'know', 'what', 'which', 'this', 'that',
  'for', 'to', 'of', 'in', 'on', 'at', 'and', 'or', 'if', 'be', 'will', 'would',
  'have', 'has', 'any', 'with', 'from', 'it', 'as', 'by', 'me', 'my', 'i',
]);

/**
 * The comparable core of a question.
 *
 * Lower case, punctuation gone, filler gone, words sorted — sorted because
 * "relocate willing" and "willing relocate" are the same question asked by two
 * people, and word order carries no meaning once the filler is out.
 */
export function normalizeQuestion(raw: string | undefined): string {
  if (!raw) return '';
  /* Translated first, for the same reason as `normalize` in field-map.ts: the
     strip below deletes every non-Latin character, so a question asked in
     Tamil produced an empty signature, which `signatureFor` rejects — and the
     question was never asked at all rather than being asked in Tamil. */
  const words = translateLabel(raw)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && w.length > 1 && !FILLER.has(w));
  return Array.from(new Set(words)).sort().join(' ');
}

/**
 * What to file this answer under.
 *
 * A known key wins: it generalises across every employer's wording. Otherwise
 * the normalised question, which only recognises itself.
 */
export function signatureFor(key: AnswerKey | null, label: string | undefined): string {
  if (key && key !== 'freeText') return `key:${key}`;
  const norm = normalizeQuestion(label);
  return norm ? `q:${norm}` : '';
}

/* ── Asking well ─────────────────────────────────────────────────────── */

/**
 * Plain-language prompts for the questions we recognise.
 *
 * Written out rather than derived from the label, because an employer's wording
 * is frequently legalese — "Will you now or in the future require sponsorship
 * for employment visa status?" — and the person answering deserves the
 * question in the words they would use themselves. The employer's own label is
 * still shown underneath, so nothing is hidden.
 */
const PROMPTS: Partial<Record<AnswerKey, string>> = {
  workAuthorization: 'Are you legally allowed to work in the country this job is in?',
  requiresSponsorship: 'Would you need the company to sponsor a visa for you?',
  willRelocate: 'Would you move to another city for this role?',
  noticePeriod: 'How soon could you start?',
  availableFrom: 'What date could you start?',
  salaryExpectation: 'What salary are you looking for?',
  currentSalary: 'What are you paid now?',
  yearsExperience: 'How many years have you been working?',
  howDidYouHear: 'Where did you hear about this job?',
  currentTitle: 'What is your job title right now?',
  currentCompany: 'Where do you work right now?',
  phone: 'What is the best number to reach you on?',
  location: 'Which city are you based in?',
  city: 'Which city are you based in?',
  country: 'Which country are you in?',
  linkedin: 'What is your LinkedIn address?',
  github: 'What is your GitHub address?',
  portfolio: 'Where can they see your work?',
  school: 'Where did you study?',
  degree: 'What did you graduate with?',
  fieldOfStudy: 'What did you study?',
  graduationYear: 'What year did you finish?',
  coverLetter: 'Anything you would like to tell them?',
};

/** Options that mean yes/no, so a two-option choice can be asked as one. */
const YES_NO = new Set(['yes', 'no', 'y', 'n', 'true', 'false']);

function isYesNo(options: string[] | undefined): boolean {
  if (!options || options.length !== 2) return false;
  return options.every((o) => YES_NO.has(o.trim().toLowerCase()));
}

/** A label tidied for use inside a sentence: no asterisks, no trailing colon. */
function tidyLabel(label: string | undefined): string {
  return (label ?? '')
    .replace(/[*✱]/g, '')
    .replace(/\s*[:：]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The question to ask for one unfilled field.
 *
 * Returns null when there is nothing sensible to ask — a field with no label,
 * no name and no options is not a question, it is an input we failed to
 * understand, and inventing a prompt for it would produce "What is your
 * f_2871?".
 */
export function questionFor(
  field: FieldDescriptor,
  key: AnswerKey | null,
): Question | null {
  const label = tidyLabel(field.label || field.ariaLabel || field.placeholder);
  const signature = signatureFor(key, label || field.name);
  if (!signature) return null;

  /* A curated prompt when we know the question; otherwise the employer's own
     wording, which is at least accurate. A label that is already a question
     ("Are you willing to relocate?") is used as-is — rewriting it would only
     risk changing what was asked. */
  let prompt = (key && PROMPTS[key]) || '';
  if (!prompt) {
    if (!label) return null;
    prompt = /\?\s*$/.test(label) ? label : `${label}?`;
  }

  const options = field.options?.filter((o) => o && o.trim()) ?? [];
  let kind: QuestionKind;
  if (isYesNo(options)) kind = 'boolean';
  else if (options.length > 0) kind = 'choice';
  else if (field.multiline) kind = 'longtext';
  else kind = 'text';

  return {
    fieldId: field.id,
    signature,
    prompt,
    kind,
    options: options.length ? options : undefined,
    sourceLabel: label || undefined,
    required: field.required,
  };
}

/* ── Remembering ─────────────────────────────────────────────────────── */

export interface RememberedAnswer {
  signature: string;
  /** What the person said, in their words — not an option index. */
  value: string;
  /** The last prompt it was given for, so an admin or the member can read back
      what they actually agreed to. */
  prompt: string;
  /** How many forms it has now answered. Used to order suggestions. */
  uses: number;
  updatedAt: string;
}

/**
 * The answers to offer for a question, best first.
 *
 * An exact signature match is the answer. Beyond that nothing is offered: a
 * "similar" remembered answer is a guess, and this feature's whole value is
 * that the person's own previous answer goes in, not something like it.
 */
export function recallFor(
  signature: string,
  memory: readonly RememberedAnswer[],
): RememberedAnswer | null {
  if (!signature) return null;
  return memory.find((m) => m.signature === signature) ?? null;
}
