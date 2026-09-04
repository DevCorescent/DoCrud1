/**
 * Career directions for the onboarding Role step.
 *
 * ═══ THE TAXONOMY IS NOT NEW ═══
 *
 * These are Docrud's own job domains, from lib/server/job-sources/taxonomy.ts —
 * the same list the ingestion classifier assigns to every posting. Reusing it
 * means a direction chosen here is a value the job corpus actually understands,
 * so a later phase can filter jobs by it without a translation table. Inventing
 * a second list would have guaranteed the two drifted.
 *
 * That file is under lib/server/ but imports nothing and holds only constants
 * and regexes, so importing the labels into a client component is safe.
 *
 * `other` is excluded. It is the classifier's explicit "did not match" bucket,
 * not a direction anybody sets out to work in.
 *
 * ═══ NO ROLE RECOMMENDATION EXISTS YET ═══
 *
 * `recommended` is on the type because the design has a place for it, and it is
 * never set today. Docrud has no role-recommendation source: job-recommend.ts
 * ranks JOBS against a stored profile, needs a session and profile signals, and
 * answers a different question. Marking a direction "Recommended for you" now
 * would mean inventing the recommendation, so nothing is marked. Wire this to a
 * real source, or leave it unset.
 */

import type { ComponentType, SVGProps } from 'react';
import { JOB_DOMAIN_LABELS, type JobDomain } from '@/lib/server/job-sources/taxonomy';

export type RoleOption = {
  /** A JobDomain key, so the choice is meaningful to the job corpus. */
  id: string;
  label: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** Set only from an authoritative source. Never hardcoded. */
  recommended?: boolean;
};

/** Every domain a person can work in, in the taxonomy's own order. */
export const DEFAULT_ROLE_OPTIONS: readonly RoleOption[] = (
  Object.keys(JOB_DOMAIN_LABELS) as JobDomain[]
)
  .filter(domain => domain !== 'other')
  .map(domain => ({ id: domain, label: JOB_DOMAIN_LABELS[domain] }));


/* ── Live availability ─────────────────────────────────────────────────── */

/**
 * How many active jobs each direction actually has right now.
 *
 * One `pageSize=1` request per domain against the existing public feed: the
 * response's `total` is the real count for that filter, and asking for a single
 * row keeps each response tiny. No new endpoint, and no count is derived,
 * blended or guessed — a direction shows the number the job feed reports for it,
 * or nothing at all.
 *
 * A direction whose request fails is simply left without a count rather than
 * being shown as zero, because "we could not ask" and "there are none" are
 * different statements.
 */
export type RoleAvailability = Record<string, number>;

export async function fetchRoleAvailability(
  options: readonly RoleOption[] = DEFAULT_ROLE_OPTIONS,
): Promise<RoleAvailability> {
  const entries = await Promise.all(options.map(async (option) => {
    try {
      const res = await fetch(`/api/jobs/public?domain=${encodeURIComponent(option.id)}&pageSize=1`);
      if (!res.ok) return null;
      const data = await res.json();
      const total = Number(data?.total);
      return Number.isFinite(total) ? ([option.id, total] as const) : null;
    } catch {
      return null;
    }
  }));
  return Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, number]>);
}

/**
 * The directions to offer, most-available first.
 *
 * Ordering by real availability is what makes this page dynamic: the list
 * reflects where the work actually is today, not a fixed editorial order. A
 * direction with no live jobs still appears — it is a real direction, and
 * hiding it would tell the person their field does not exist here — but it
 * sorts last and carries no count.
 */
export function roleOptionsByAvailability(
  options: readonly RoleOption[],
  availability: RoleAvailability,
): RoleOption[] {
  return [...options].sort((a, b) => (availability[b.id] ?? -1) - (availability[a.id] ?? -1));
}
