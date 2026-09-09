/**
 * Reconciliation planning for the canonical `hiring_jobs` collection.
 *
 * ═══ WHAT THIS REPLACES ═══
 *
 * `mirrorPublishedJobs()` finishes by removing anything the source no longer
 * has:
 *
 *     deleteMany({ _id: { $nin: [ ...every id... ] } })
 *
 * That is correct and it does not scale. The filter carries ONE ENTRY PER JOB,
 * so at today's 5,276 postings it ships a 5,276-element array on every save,
 * and at the 100k this migration exists to enable it would ship 100,000. The
 * document is capped at 16 MB and a query is a document.
 *
 * ═══ WHAT THIS DOES INSTEAD ═══
 *
 * Planning is separated from writing. `planReconciliation` is a PURE FUNCTION
 * over two id/fingerprint maps: it takes what the source has and what the
 * collection has, and returns what would change. It performs no I/O, so the
 * decision can be tested exhaustively without a database and inspected as a
 * dry-run before anything is written.
 *
 * Removals are computed by SET DIFFERENCE on the target side — the ids the
 * collection holds that the source no longer lists — which is a bounded list of
 * the things actually being removed, rather than an unbounded list of the
 * things being kept. On a steady board it is empty.
 *
 * ═══ IDENTITY AND FINGERPRINT ARE REUSED, NOT REINVENTED ═══
 *
 * `job.id → _id` is the existing canonical identity and is not changed here.
 * The change decision uses the same fingerprint the mirror already stamps as
 * `_fp`, so "unchanged" means exactly what it has always meant. This module
 * introduces no second notion of identity, sameness, or lifecycle.
 *
 * NOTHING HERE WRITES. The executor is deliberately not in this file.
 */

/** The canonical document's own metadata, as already written by the mirror. */
export const ID_FIELD = '_id';
export const ORDER_FIELD = '_order';
export const FP_FIELD = '_fp';

export interface ReconcileEntry {
  id: string;
  /** Position in the source ordering — preserved so list order survives. */
  order: number;
  fp: string;
}

export interface ReconcilePlan {
  /** Present in source, absent from the collection. */
  inserts: ReconcileEntry[];
  /** Present in both, fingerprint differs — the document is rewritten. */
  updates: ReconcileEntry[];
  /** Present in both, same fingerprint, but the position moved. */
  reorders: ReconcileEntry[];
  /** Identical in every respect. Written back untouched. */
  unchanged: string[];
  /** In the collection, no longer in source. A BOUNDED list. */
  removals: string[];
  /** Totals, so a dry-run can be read at a glance. */
  counts: {
    source: number; target: number;
    inserts: number; updates: number; reorders: number;
    unchanged: number; removals: number;
  };
}

/**
 * Decide what would change. Pure: no database, no clock, no randomness.
 *
 * `source` is the ordered list the run produced; `target` is what the
 * collection currently holds, as id → fingerprint (+ order). Both are plain
 * maps so the caller decides how cheaply to obtain them — the collection side
 * is a projection of three small fields, never whole documents.
 */
export function planReconciliation(
  source: readonly ReconcileEntry[],
  target: ReadonlyMap<string, { fp?: string; order?: number }>,
): ReconcilePlan {
  const inserts: ReconcileEntry[] = [];
  const updates: ReconcileEntry[] = [];
  const reorders: ReconcileEntry[] = [];
  const unchanged: string[] = [];
  const seen = new Set<string>();

  for (const entry of source) {
    /* A duplicate id in the source is a source bug, not a reconciliation
       decision. The FIRST occurrence wins and the rest are ignored, so a plan
       can never contain two writes to one document. */
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);

    const prior = target.get(entry.id);
    if (!prior) { inserts.push(entry); continue; }
    if (prior.fp !== entry.fp) { updates.push(entry); continue; }
    if (prior.order !== entry.order) { reorders.push(entry); continue; }
    unchanged.push(entry.id);
  }

  /* Bounded by what is actually being removed, not by what is being kept. */
  /* forEach, not for..of over keys(): the compile target is ES5 and a Map
     iterator cannot be spread or iterated there without downlevelIteration. */
  const removals: string[] = [];
  target.forEach((_value, id) => { if (!seen.has(id)) removals.push(id); });

  return {
    inserts, updates, reorders, unchanged, removals,
    counts: {
      source: source.length,
      target: target.size,
      inserts: inserts.length,
      updates: updates.length,
      reorders: reorders.length,
      unchanged: unchanged.length,
      removals: removals.length,
    },
  };
}

/**
 * Is this plan safe to apply?
 *
 * A reconciliation that would empty or gut the collection is far more likely to
 * be a FAILED SOURCE READ than a real change — a run that fetched nothing must
 * never be allowed to delete the job board. The executor is expected to refuse
 * such a plan and leave the collection alone; app_state remains authoritative
 * either way, so refusing costs staleness, while applying costs the data.
 *
 * `maxRemovalRatio` is a share of the CURRENT collection, not of the source, so
 * an empty source read is caught by the same rule.
 */
export function isPlanSafe(
  plan: ReconcilePlan,
  opts: { maxRemovalRatio?: number } = {},
): { safe: boolean; reason?: string } {
  const maxRatio = opts.maxRemovalRatio ?? 0.10;

  if (plan.counts.target > 0 && plan.counts.source === 0) {
    return { safe: false, reason: 'source is empty but the collection is not — refusing to delete every job' };
  }
  if (plan.counts.target > 0) {
    const ratio = plan.counts.removals / plan.counts.target;
    if (ratio > maxRatio) {
      return {
        safe: false,
        reason: `removals ${plan.counts.removals}/${plan.counts.target} `
          + `(${(ratio * 100).toFixed(1)}%) exceed the ${(maxRatio * 100).toFixed(0)}% ceiling`,
      };
    }
  }
  return { safe: true };
}
