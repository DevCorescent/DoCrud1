/**
 * The publication body limit — one definition shared by every composer and by
 * every API route that creates or updates a publication.
 *
 * Docrud stores a publication's body in `notes`, and the composer flattens the
 * whole category form into that one string: a block of structured fields
 * ("Company: Acme"), the author's body, then supplementary fields under their
 * own heading ("Requirements:"). The 500-character rule covers only the body —
 * never the title, the structured fields, or the supplementary sections — so
 * both sides of the wire measure through `publicationBodyText()` and always
 * arrive at the same number.
 *
 * Most categories write the body as plain prose between the structured block
 * and the first supplementary heading. Three do not, and `BODY_LABEL` below
 * names them: their body is serialised under a label, so reading them as prose
 * would silently exclude them from the limit.
 *
 * Categories with no free-form body at all — chart (comma-separated labels and
 * values), tutorial (a repeated step list) and resume (an uploaded or pasted
 * document) — are deliberately absent. They have no single main body field to
 * limit, and inventing one would be a new field, not a limit.
 */

export const PUBLICATION_BODY_MAX = 500;

/** The single wording used by the composers and the API for this failure. */
export const PUBLICATION_BODY_ERROR =
  `Publication body must be ${PUBLICATION_BODY_MAX} characters or fewer.`;

/**
 * Categories whose composer serialises the main body under a label instead of
 * as free prose, and the label it uses. Keep in step with `buildTextBody()` in
 * components/PublishAnythingDialog.tsx.
 *
 *   poll      → `Question: <pollQuestion>`
 *   survey    → `About: <surveyDesc>`
 *   hackathon → `Problem Statement:` followed by `<hackProblem>`
 */
const BODY_LABEL: Record<string, string> = {
  poll: 'Question',
  survey: 'About',
  hackathon: 'Problem Statement',
};

/* "Company: Acme" — a structured field carrying its value on the same line. */
const FIELD_LINE_RE = /^[A-Z][A-Za-z0-9][A-Za-z0-9 /()&.'’-]{0,28}:\s+\S.*$/;

/* "Requirements:" — the heading the composer emits above a supplementary
   field, with the value on the lines that follow. */
const SECTION_HEADING_RE = /^[A-Z][A-Za-z0-9][A-Za-z0-9 /()&.'’-]{0,28}:\s*$/;

const isStructuralLine = (line: string) => FIELD_LINE_RE.test(line) || SECTION_HEADING_RE.test(line);

/**
 * Characters as a reader counts them: one emoji is one character, not the two
 * UTF-16 units `String.length` reports. Spaces, punctuation and newlines all
 * count normally.
 */
export function publicationBodyLength(text: string): number {
  return Array.from(text ?? '').length;
}

/** The first `max` characters, never splitting a surrogate pair. */
export function clampPublicationBody(text: string, max = PUBLICATION_BODY_MAX): string {
  const value = text ?? '';
  const chars = Array.from(value);
  return chars.length <= max ? value : chars.slice(0, max).join('');
}

/** The prose between the structured block and the first supplementary heading. */
function proseBody(lines: string[]): string {
  let start = 0;
  while (start < lines.length && (lines[start].trim() === '' || FIELD_LINE_RE.test(lines[start]))) {
    start += 1;
  }
  let end = start;
  while (end < lines.length && !SECTION_HEADING_RE.test(lines[end])) {
    end += 1;
  }
  return lines.slice(start, end).join('\n').trim();
}

/**
 * The value written under `label`, whether it sits on the label's own line
 * ("Question: …") or on the lines beneath it ("Problem Statement:" then the
 * text). It runs until the next structured field or heading, so a multi-line
 * body is read whole.
 */
function labelledBody(lines: string[], label: string): string {
  const head = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(.*)$`);
  const at = lines.findIndex((line) => head.test(line));
  if (at === -1) return '';

  const parts = [lines[at].match(head)?.[1] ?? ''];
  for (let i = at + 1; i < lines.length; i += 1) {
    if (isStructuralLine(lines[i])) break;
    parts.push(lines[i]);
  }
  return parts.join('\n').trim();
}

/**
 * The prose the author wrote, extracted from a stored `notes` value.
 *
 * `category` selects how to read it. It is optional so a caller that does not
 * know the category still gets the prose reading, and a labelled category whose
 * payload carries no such label falls back to the same reading rather than
 * measuring nothing.
 */
export function publicationBodyText(notes: string, category?: string | null): string {
  const lines = (notes ?? '').split('\n');
  const label = category ? BODY_LABEL[category.trim().toLowerCase()] : undefined;
  if (label) {
    const labelled = labelledBody(lines, label);
    if (labelled) return labelled;
  }
  return proseBody(lines);
}

/** Whether a stored `notes` value carries more body than the limit allows. */
export function isPublicationBodyOverLimit(
  notes: string | undefined | null,
  category?: string | null,
): boolean {
  if (!notes) return false;
  return publicationBodyLength(publicationBodyText(notes, category)) > PUBLICATION_BODY_MAX;
}
