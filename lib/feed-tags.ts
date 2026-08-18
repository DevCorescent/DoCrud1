/**
 * Canonical derivation of feed chips from a publication's `directoryTags`.
 *
 * The first tag is the badge; the remainder are the display chips. Extracted
 * here so the feed payload and poll voting agree on the option list — a poll
 * vote is recorded against a chip index, so any disagreement about which
 * chips exist would record the vote against the wrong option.
 */

const FILENAME_EXT_RE = /\.\w{2,5}$/;
const NOISE_WORD_RE = /^[a-z]{12,}$/;
const USERNAME_LIKE_RE = /^[a-z]+\d{5,}\w*$/i;

/** Tags that are storage artefacts (filenames, usernames) rather than content. */
export function isNoisyFeedTag(tag: string): boolean {
  const t = tag.trim();
  return FILENAME_EXT_RE.test(t) || NOISE_WORD_RE.test(t) || USERNAME_LIKE_RE.test(t);
}

/**
 * Display chips, in stored order. Index here is the identity a poll vote is
 * recorded against, so the order must stay stable.
 */
export function feedChips(tags: string[] | undefined): string[] {
  return (tags ?? []).slice(1).filter((t) => t.trim().length > 0 && !isNoisyFeedTag(t));
}
