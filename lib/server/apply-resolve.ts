/**
 * The fields the rules could not name.
 *
 * ═══ WHERE THE DETERMINISTIC MATCHER RUNS OUT ═══
 *
 * lib/apply/field-map.ts matches on vocabulary: it knows that "first name",
 * `given-name` and `job_application[first_name]` are the same question. What it
 * cannot do is read a sentence. A field labelled "Which city would you
 * relocate to?" or "Tell us the best number to reach you on" contains none of
 * its phrases, so it scored nothing and was skipped — the candidate then found
 * an empty box on a form that claimed to be filled.
 *
 * This is the second pass, and the only place a model is allowed near the
 * mapping. It runs ONCE for all the leftovers, not once per field.
 *
 * ═══ IT CHOOSES A QUESTION, NEVER AN ANSWER ═══
 *
 * The model is given the fields and the NAMES of the answers available — never
 * the values. It replies with a key per field and the server substitutes the
 * stored value itself. So the worst a bad model can do is put the right answer
 * in the wrong box, which the review panel shows; it can never put a sentence
 * the candidate never wrote in front of an employer.
 *
 * Anything it returns that is not in the taxonomy, or that names an answer the
 * profile does not have, is discarded.
 */

import { generateAiText, isAiConfigured, parseStructuredJson } from '@/lib/server/ai';
import { ANSWER_LABELS, type AnswerKey, type AnswerSet, type FieldDescriptor } from '@/lib/apply/answer-keys';

/** Keys the model may choose. `resume` is excluded — a file is matched by input
    type, not by reading a label — and so is `freeText`, which has its own path. */
const CHOOSABLE = Object.keys(ANSWER_LABELS)
  .filter((k) => k !== 'resume' && k !== 'freeText') as AnswerKey[];

export interface ResolvedField {
  id: string;
  key: AnswerKey;
  reason: string;
}

/** The model is asked about a bounded number of fields. A page with ninety
    unmatched inputs is not an application form, and one round trip should not
    grow without limit because of it. */
const MAX_FIELDS = 25;

/**
 * Ask the model which question each leftover field is asking.
 *
 * Returns an empty array — never throws, never blocks the fill — when there is
 * no model configured, nothing to resolve, or the reply cannot be trusted. The
 * deterministic matches are already written by the time this runs, so a failure
 * here costs the extra fields and nothing else.
 */
export async function resolveUnmatchedFields(
  fields: FieldDescriptor[],
  answers: AnswerSet,
  job: { title?: string; company?: string },
): Promise<ResolvedField[]> {
  if (fields.length === 0 || !isAiConfigured()) return [];

  /* Only answers the profile actually holds. Offering the model a key with no
     value behind it invites a mapping that then fills nothing, and makes the
     panel report a field as handled when it is empty. */
  const available = CHOOSABLE.filter((k) => Boolean((answers as Record<string, unknown>)[k]));
  if (available.length === 0) return [];

  const slice = fields.slice(0, MAX_FIELDS);
  const catalogue = available.map((k) => `  ${k} — ${ANSWER_LABELS[k]}`).join('\n');
  const list = slice.map((f, i) => {
    const bits = [
      f.label && `label: "${f.label}"`,
      f.ariaLabel && !f.label && `aria-label: "${f.ariaLabel}"`,
      f.placeholder && `placeholder: "${f.placeholder}"`,
      f.name && `name: "${f.name}"`,
      f.type && `type: ${f.type}`,
      f.options?.length && `options: ${f.options.slice(0, 8).map((o) => `"${o}"`).join(', ')}`,
      f.required && 'required',
    ].filter(Boolean).join(' · ');
    return `${i + 1}. ${bits}`;
  }).join('\n');

  try {
    const raw = await generateAiText([
      {
        role: 'system',
        content:
          'You map fields on a job application form to a fixed set of answer keys.\n\n'
          + 'You are given numbered fields and a catalogue of available keys. For each '
          + 'field, decide which key it is asking for.\n\n'
          + 'RULES:\n'
          + '1. Use ONLY keys from the catalogue. Never invent a key.\n'
          + '2. If a field is not asking for any of them — a password, a search box, a '
          + 'consent checkbox, a question about the employer, anything you are unsure of '
          + '— omit it entirely. Omitting is always correct when in doubt; a wrong '
          + 'mapping puts a real answer in the wrong box.\n'
          + '3. Never output a value, only a key. You are not being asked what the '
          + 'candidate should say.\n'
          + '4. Reply with JSON only: {"fields":[{"n":1,"key":"city"}]}. Omit any field '
          + 'you are not mapping. No prose, no explanation.',
      },
      {
        role: 'user',
        content: `AVAILABLE KEYS\n${catalogue}\n\n`
          + `THE ROLE\n${[job.title, job.company].filter(Boolean).join(' at ') || '(unknown)'}\n\n`
          + `FIELDS\n${list}`,
      },
    ], { jsonMode: true });

    const parsed = parseStructuredJson<{ fields?: Array<{ n?: number; key?: string }> }>(raw);
    const out: ResolvedField[] = [];
    const allowed = new Set<string>(available);

    for (const entry of parsed?.fields ?? []) {
      const index = Number(entry?.n) - 1;
      const key = String(entry?.key ?? '');
      if (!Number.isInteger(index) || index < 0 || index >= slice.length) continue;
      if (!allowed.has(key)) continue;
      out.push({
        id: slice[index].id,
        key: key as AnswerKey,
        reason: 'read from the question on the page',
      });
    }
    /* One mapping per field, first wins — a model that names the same field
       twice must not produce two fills for one input. */
    const seen = new Set<string>();
    return out.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  } catch {
    return [];
  }
}
