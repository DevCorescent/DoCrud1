/**
 * Poll option parsing and vote summarising.
 *
 * Client-safe: no server imports, so the feed card, the API routes and the
 * composer preview all derive option labels the same way.
 *
 * Poll options live in the publication's `directoryTags`/chips as the text the
 * author typed, sometimes carrying a stored percentage ("TypeScript · 38%").
 * The label is the part before that separator; the index of the option in the
 * list is the stable identity a vote is recorded against.
 */

export type PollSummary = {
  /** Option labels, in stored order. Index = vote value. */
  options: string[];
  /** Vote count per option, index-aligned with `options`. */
  counts: number[];
  total: number;
  /** The viewer's chosen index, or null when they have not voted. */
  viewerChoice: number | null;
};

/** Strips any stored "· 38%" suffix so the label is just the option text. */
export function pollOptionLabel(chip: string): string {
  return chip.split(/\s*·\s*/)[0].trim();
}

/** Option labels for a poll, from the chips already stored on the row. */
export function pollOptionsFrom(chips?: string[]): string[] {
  return (chips ?? []).map(pollOptionLabel).filter(Boolean);
}

/**
 * Real counts from stored votes. Votes pointing outside the current option
 * list are ignored rather than reshuffled, so editing a poll can never
 * silently reassign someone's vote to a different option.
 */
export function summarizePollVotes(
  chips: string[] | undefined,
  votes: Record<string, number> | undefined,
  viewerIdentifier: string | null,
): PollSummary {
  const options = pollOptionsFrom(chips);
  const counts = new Array(options.length).fill(0) as number[];
  let total = 0;
  let viewerChoice: number | null = null;

  for (const [identifier, choice] of Object.entries(votes ?? {})) {
    if (!Number.isInteger(choice) || choice < 0 || choice >= options.length) continue;
    counts[choice] += 1;
    total += 1;
    if (viewerIdentifier && identifier === viewerIdentifier) viewerChoice = choice;
  }

  return { options, counts, total, viewerChoice };
}

/** Whole-number percentage of the total. Returns 0 when nobody has voted. */
export function pollPercent(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}
