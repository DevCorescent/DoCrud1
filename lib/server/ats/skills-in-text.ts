/**
 * Taxonomy skills named in a block of prose.
 *
 * ═══ WHY THIS IS ITS OWN MODULE ═══
 *
 * This scan is the most expensive step in the whole recommendation path —
 * measured at 426 µs per posting against 13 µs for the scoring loop that
 * consumes it, because it tests every surface form in the taxonomy against the
 * full description text.
 *
 * It now has TWO callers: the live scorer, and the corpus-version feature
 * derivation that lets ranking skip it. Those must never drift, so the
 * algorithm lives here once and both import it. Copying it into a derivation
 * step would create exactly the failure mode the derivation exists to avoid —
 * a stored feature that disagrees with what the live path would have computed.
 *
 * ═══ NO MEMO HERE, DELIBERATELY ═══
 *
 * This used to memoise on `${text.length}:${text.slice(0, 120)}`, which is a
 * fingerprint rather than an identity: two descriptions of equal length sharing
 * their first 120 characters collided and the second silently received the
 * first's skills. Measured over production, 219 keys covered 261 mis-served
 * descriptions, and those skills FEED THE SCORE.
 *
 * That key was fixed to the full text, and the memo is now gone entirely: the
 * derived feature representation IS the cache for this computation, held once
 * per corpus version. Two caches for one algorithm is one more than can be kept
 * consistent, so there is one.
 *
 * PURE. Same text in, same array out, in the same order, every time.
 */
import {
  ALL_SURFACE_FORMS, canonicalize, canonicalizeSynonym,
} from '@/lib/server/ats/skill-taxonomy';
import { containsStandalonePhrase } from '@/lib/server/ats/text';

/**
 * The surface forms worth scanning prose for.
 *
 * Single letters and two-character forms are excluded: "go", "r" and "c" appear
 * in ordinary English constantly, and a false requirement is worse than a
 * missed one — it dilutes the coverage every real requirement is measured
 * against.
 */
const SCANNABLE_SURFACES: string[] = ALL_SURFACE_FORMS.filter((s) => s.length >= 3);

export function skillsInText(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  const seen = new Set<string>();
  for (const surface of SCANNABLE_SURFACES) {
    if (!lower.includes(surface)) continue;                 // cheap reject first
    if (!containsStandalonePhrase(lower, surface)) continue; // then the honest test
    const canon = canonicalize(surface) ?? canonicalizeSynonym(surface) ?? surface;
    if (seen.has(canon)) continue;
    seen.add(canon);
    found.push(surface);
  }
  return found;
}
