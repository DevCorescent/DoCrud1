/**
 * Talent metrics for the business onboarding preview.
 *
 * ═══ THE SOURCE ═══
 *
 * /api/public/people — the existing public people directory. It reads no
 * session, returns no email or phone, and is already what the public directory
 * renders. Nothing new is exposed: this reads it, counts, and throws the
 * records away. No individual is ever displayed on this screen.
 *
 * ═══ WHAT IS BEING COUNTED, EXACTLY ═══
 *
 * entity: a PROFESSIONAL — one non-business account in the public directory
 *         whose own public profile lists that skill.
 *
 * They are NOT applicants. Nobody counted here has applied to anything, and
 * the word "applicant" must never be attached to this number. They are also
 * not derived from job postings: this counts people, from people records.
 *
 * ═══ PER SKILL, NEVER SUMMED ═══
 *
 * Each selected skill gets its own count. They are deliberately not added
 * together: one person listing both Python and SQL would be counted twice, and
 * the directory offers no unique-union query. A combined figure would be
 * wrong, so none is shown.
 *
 * ═══ MATCHING ═══
 *
 * Directory skills are free text ("python", "Python 3", "React.js"). They are
 * resolved through `resolveSurface` from Docrud's ATS skill taxonomy — the
 * app's own normalisation — so no new matching rule is invented here. A skill
 * the taxonomy does not recognise falls back to a trimmed case-insensitive
 * comparison rather than being dropped.
 */

import { resolveSurface } from '@/lib/server/ats/skill-taxonomy';
import { getCompanyJobDisplayCount } from '@/lib/company-explorer';

export type TalentMetric = {
  skillId: string;
  label: string;
  /** The true count. Never rounded, never persisted anywhere. */
  actualCount: number;
  /** What the UI prints. See the rounding note below. */
  displayCount: string;
  entityType: 'professional';
};

/**
 * The displayed figure: rounded DOWN to the nearest five, so the screen can
 * never promise more people than exist. The arithmetic is Docrud's existing
 * rule (getCompanyJobDisplayCount), not a second implementation of it.
 */
export function formatTalentCount(actualCount: number): string {
  return `${getCompanyJobDisplayCount(actualCount)}+`;
}

/** One person's skills, reduced to canonical form for comparison. */
function canonicalSkills(raw: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(raw)) return out;
  for (const entry of raw) {
    const text = String(entry ?? '').trim();
    if (!text) continue;
    out.add((resolveSurface(text) ?? text).toLowerCase());
  }
  return out;
}

type DirectoryPerson = {
  accountType?: string;
  profile?: { skills?: unknown };
};

/**
 * Counts, per selected skill, how many professionals in the public directory
 * list it. Throws on a failed response so the caller shows an error rather
 * than a page of zeroes.
 */
export async function fetchTalentMetrics(
  skills: readonly { id: string; label: string }[],
): Promise<TalentMetric[]> {
  const res = await fetch('/api/public/people');
  if (!res.ok) throw new Error(`People directory responded ${res.status}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.people)) throw new Error('People directory returned no list');

  /* Business accounts are excluded: this is a count of professionals. */
  const professionals: Set<string>[] = (data.people as DirectoryPerson[])
    .filter(person => person.accountType !== 'business')
    .map(person => canonicalSkills(person.profile?.skills));

  return skills.map(skill => {
    const wanted = (resolveSurface(skill.label) ?? skill.label).toLowerCase();
    const actualCount = professionals.reduce(
      (total, owned) => total + (owned.has(wanted) ? 1 : 0),
      0,
    );
    return {
      skillId: skill.id,
      label: skill.label,
      actualCount,
      displayCount: formatTalentCount(actualCount),
      entityType: 'professional' as const,
    };
  });
}
