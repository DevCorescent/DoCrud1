/**
 * Recommending an answer the member still has to confirm.
 *
 * ═══ A RECOMMENDATION IS NOT AN ANSWER ═══
 *
 * Everything else in this feature either knows an answer or leaves the field
 * empty. This is the middle ground: a question the member is about to be asked,
 * with the most likely option already highlighted so that answering it is one
 * click instead of reading forty countries. Nothing here is ever written into a
 * form on its own — the member presses the option, and only then does it go in.
 *
 * That is what makes it safe to be less certain here than anywhere else.
 *
 * ═══ WHAT IS NEVER RECOMMENDED ═══
 *
 * Work authorisation. Visa sponsorship. Salary, current or expected. A model
 * reasoning from a profile to "yes, they are authorised to work in the US" is
 * inventing a legal fact about a person, and pre-selecting it makes the wrong
 * answer the path of least resistance — the member clicks through and an
 * employer receives a false statement in their name.
 *
 * Those questions are still asked, just with nothing pre-selected. A profile
 * value or a previous answer may fill them; a guess never will.
 */

import { generateAiText, isAiConfigured, parseStructuredJson } from '@/lib/server/ai';
import type { Question } from '@/lib/apply/question';
import type { AnswerKey } from '@/lib/apply/answer-keys';

/** Questions a model may not pre-answer, however confident it is. */
const NEVER_RECOMMEND: ReadonlySet<string> = new Set<AnswerKey>([
  'workAuthorization', 'requiresSponsorship', 'salaryExpectation', 'currentSalary',
]);

/** Bounded: one call, and a page of forty unanswerable questions is not an
    application form. */
const MAX_QUESTIONS = 12;

export interface Recommendation {
  fieldId: string;
  value: string;
  why: string;
}

function keyOf(signature: string): string {
  return signature.startsWith('key:') ? signature.slice(4) : '';
}

/**
 * Pre-select the likely option for the questions worth guessing at.
 *
 * Only ever chooses from the options the form itself offers, and only for
 * questions that present a list — an open text box has nothing to pick from and
 * the profile has already been consulted for it. Returns an empty array when
 * there is no model, nothing eligible, or the reply cannot be trusted.
 */
export async function recommendAnswers(
  questions: readonly Question[],
  candidate: {
    location?: string; headline?: string; skills?: string[];
    yearsExperience?: string; currentTitle?: string; currentCompany?: string;
  },
  job: { title?: string; company?: string; location?: string },
): Promise<Recommendation[]> {
  if (!isAiConfigured()) return [];

  const eligible = questions
    .filter((q) => q.options && q.options.length > 1)
    .filter((q) => !NEVER_RECOMMEND.has(keyOf(q.signature)))
    /* Already answered from the profile or from memory — a recommendation would
       only be a second opinion on something the member has actually said. */
    .filter((q) => !q.suggested && !q.recalled)
    .slice(0, MAX_QUESTIONS);
  if (eligible.length === 0) return [];

  const who = [
    candidate.headline && `Headline: ${candidate.headline}`,
    candidate.location && `Based in: ${candidate.location}`,
    candidate.currentTitle && `Current title: ${candidate.currentTitle}`,
    candidate.currentCompany && `Current employer: ${candidate.currentCompany}`,
    candidate.yearsExperience && `Years of experience: ${candidate.yearsExperience}`,
    candidate.skills?.length && `Skills: ${candidate.skills.slice(0, 12).join(', ')}`,
  ].filter(Boolean).join('\n');

  const list = eligible.map((q, i) =>
    `${i + 1}. ${q.prompt}\n   options: ${q.options!.slice(0, 40).map((o) => `"${o}"`).join(', ')}`,
  ).join('\n');

  try {
    const raw = await generateAiText([
      {
        role: 'system',
        content:
          'You suggest which option a candidate is most likely to pick on a job '
          + 'application form. The candidate sees your suggestion highlighted and '
          + 'confirms or changes it — you are saving them a scroll, not answering '
          + 'for them.\n\n'
          + 'RULES:\n'
          + '1. Choose ONLY from the options listed for that question, copied exactly.\n'
          + '2. Suggest only where the profile genuinely indicates an answer — a '
          + 'candidate based in Bengaluru is in India. Where it does not, omit the '
          + 'question. Omitting is always acceptable.\n'
          + '3. Never guess about pay, visas, or the legal right to work. If a '
          + 'question touches those, omit it.\n'
          + '4. Reply with JSON only: {"picks":[{"n":1,"option":"India"}]}. No prose.',
      },
      {
        role: 'user',
        content: `CANDIDATE\n${who || '(little known)'}\n\n`
          + `THE ROLE\n${[job.title, job.company, job.location].filter(Boolean).join(' · ') || '(unknown)'}\n\n`
          + `QUESTIONS\n${list}`,
      },
    ], { jsonMode: true });

    const parsed = parseStructuredJson<{ picks?: Array<{ n?: number; option?: string }> }>(raw);
    const out: Recommendation[] = [];
    const seen = new Set<string>();

    for (const pick of parsed?.picks ?? []) {
      const index = Number(pick?.n) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= eligible.length) continue;
      const q = eligible[index];
      /* The option must be one the form actually offers. A model that returns
         "Indian" for a list containing "India" has not answered the question,
         and writing it in would produce a value the form rejects. */
      const option = (q.options ?? []).find((o) => o === pick?.option)
        ?? (q.options ?? []).find((o) => o.trim().toLowerCase() === String(pick?.option ?? '').trim().toLowerCase());
      if (!option || seen.has(q.fieldId)) continue;
      seen.add(q.fieldId);
      out.push({ fieldId: q.fieldId, value: option, why: 'suggested from your profile' });
    }
    return out;
  } catch {
    return [];
  }
}
