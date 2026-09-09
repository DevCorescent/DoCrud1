/**
 * The canonical job write path: per-document, sparsely ordered, non-destructive.
 *
 * ═══ WHAT REPLACES WHAT ═══
 *
 *   OLD  saveHiringJobs(entireCorpus)
 *          → rewrite 12.28 MB of app_state
 *          → mirror, re-stamping dense _order on every document
 *          → deleteMany({_id: {$nin: corpus}})
 *
 *   NEW  writeHiringJobs(changed)      create/update only, O(changed)
 *        retireHiringJobById(id)       remove ONE named posting
 *
 * ═══ THE SAFETY BOUNDARY, RESTATED ═══
 *
 * `upsertHiringJobs` can create and update. It cannot delete, and no code here
 * gives it a way to. Removal goes through `retireHiringJobById`, which names
 * one document and is reached only from an authorised employer action.
 *
 * ═══ CACHES ARE CLEARED ONLY AFTER A WRITE ACTUALLY SUCCEEDED ═══
 *
 * The old funnel invalidated unconditionally because its app_state write had
 * already thrown on failure. This path returns failure instead of throwing, so
 * invalidation is explicitly gated: clearing caches after a failed write would
 * advertise a change that did not happen.
 */
import {
  upsertHiringJobs, retireHiringJob, minJobOrder,
  type UpsertJobInput, type RetireResult,
} from '@/lib/server/db/hiring-jobs-collection';
import { orderBefore } from '@/lib/server/db/job-order';
import { invalidatePublishedHiringJobs } from '@/lib/server/hiring';
import { invalidateHiringCompanies } from '@/lib/server/hiring-companies';
import { invalidateNamespaces } from '@/lib/server/cache';
import { invalidateRecommendationCaches } from '@/lib/server/recommendation-cache';

/**
 * Exactly the invalidation `saveHiringJobs` performs, and for the same reasons:
 * without it an employer's edit stays invisible to other lambdas until the TTL
 * expires, and a new posting stays invisible to recommendations.
 *
 * The distributed bump stays fire-and-forget with a caught rejection — the
 * database write has already succeeded and must not be failed by a cache that
 * is unreachable. That is the established behaviour, preserved deliberately.
 */
export function invalidateJobCaches(): void {
  invalidatePublishedHiringJobs();
  void invalidateNamespaces(['jobs:public', 'jobs:recs', 'jobs:personalized'])
    .catch(() => { /* a cache that cannot be cleared must not fail a write */ });
  invalidateRecommendationCaches();
  invalidateHiringCompanies();
}

export interface WriteResult {
  ok: boolean;
  written: number;
  unchanged: number;
  error?: string;
}

/**
 * Create and update postings, and nothing else.
 *
 * `created` names the postings that are NEW. They are positioned at the front,
 * descending, which is where `planIngest` (`jobs.unshift`) and the employer
 * create path (`[nextJob, ...jobs]`) both put them — the same board order,
 * expressed as sparse positions instead of dense indices, so no existing
 * document is renumbered.
 *
 * Everything else is an update and keeps whatever position it already has.
 */
export async function writeHiringJobs(
  jobs: ReadonlyArray<Record<string, unknown>>,
  created: ReadonlySet<string> = new Set(),
): Promise<WriteResult> {
  if (jobs.length === 0) return { ok: true, written: 0, unchanged: 0 };

  const newOnes = jobs.filter((j) => created.has(String(j.id ?? '')));
  const inputs: UpsertJobInput[] = [];

  if (newOnes.length > 0) {
    /* One small read to learn where the front of the board is. Positions then
       descend so the batch keeps its own order once sorted ascending. */
    let cursor = await minJobOrder();
    /* Reversed: the LAST new posting processed ends up nearest the front, which
       is what a sequence of unshifts produces. */
    for (const job of [...newOnes].reverse()) {
      const order = orderBefore(cursor);
      cursor = order;
      inputs.push({ job, order });
    }
  }
  for (const job of jobs) {
    if (created.has(String(job.id ?? ''))) continue;
    inputs.push({ job }); // existing: position untouched
  }

  try {
    const res = await upsertHiringJobs(inputs);
    /* Caches are cleared ONLY on a successful write. */
    if (res.ok) invalidateJobCaches();
    return { ok: res.ok, written: res.written, unchanged: res.unchanged, error: res.error };
  } catch (error) {
    return {
      ok: false, written: 0, unchanged: 0,
      error: error instanceof Error ? error.message : 'write failed',
    };
  }
}

/**
 * Retire one posting the caller has already authorised removing.
 *
 * Caches are cleared for a genuine removal only. A `not_found` clears nothing —
 * nothing changed — and a failure clears nothing either, because advertising a
 * removal that did not happen is worse than a stale entry that did not change.
 */
export async function retireHiringJobById(id: string): Promise<RetireResult> {
  const result = await retireHiringJob(id);
  if (result.outcome === 'retired') invalidateJobCaches();
  return result;
}
