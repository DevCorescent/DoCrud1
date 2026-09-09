/**
 * Where a posting sits on the board, when writes are per-document.
 *
 * ═══ THE PROBLEM THIS SOLVES ═══
 *
 * `_order` is currently a dense array index: 0, 1, 2, … n-1, re-stamped from
 * the corpus array on every save. `planIngest` PREPENDS a new posting
 * (`jobs.unshift`), so inserting one job shifts the index of every other job —
 * 5,276 updates to add one posting. The mirror absorbs that because it rewrites
 * the whole corpus anyway. A per-document writer cannot, and renumbering the
 * corpus to insert one row would spend exactly the cost Phase 2.7 exists to
 * remove.
 *
 * ═══ THE FIX: LEAVE GAPS ═══
 *
 * Positions are spaced STEP apart instead of one apart, so there is room to
 * insert between two neighbours without touching either of them:
 *
 *     existing:  …  1000000        2000000  …
 *     insert between        1500000
 *     existing:  …  1000000  1500000  2000000  …    ← neither neighbour written
 *
 * Ordering SEMANTICS are unchanged: ascending `_order` is still the board
 * order, a new posting still goes to the front, and relative order is
 * preserved. Only the numbers change, from consecutive to spaced.
 *
 * ═══ WHY NOT createdAt ═══
 *
 * Sorting by `createdAt` would be simpler and is deliberately NOT used. The
 * board's order is not "newest first" — it is whatever position planIngest and
 * the import path put a posting in, and an import PREPENDS a batch that may be
 * older than what it displaces. Substituting a timestamp would quietly redefine
 * what the feed shows, which is a product change wearing a refactor's clothing.
 *
 * ═══ GAPS RUN OUT, AND THAT MUST BE LOUD ═══
 *
 * Repeated insertion between the same two neighbours halves the gap each time.
 * After ~20 insertions at one point there is no integer left between them.
 * `orderBetween` then returns null — it does NOT silently renumber. A rebalance
 * rewrites every document and is O(corpus): it is a maintenance operation to be
 * scheduled deliberately, never something an ingestion run does by surprise
 * while a scraper is mid-batch.
 */

/**
 * Gap between adjacent positions. 2^20 allows 20 successive insertions at the
 * same point before the space is exhausted, and 5,276 postings span ~5.5e9 —
 * comfortably inside the 2^53 integer range, with room for a corpus 1,000×
 * larger.
 */
export const ORDER_STEP = 1_048_576;

/** The first posting in an empty collection. */
export const ORDER_ORIGIN = 0;

/**
 * A position before everything — where planIngest puts a newly ingested job.
 *
 * `min` is the smallest `_order` currently stored, or null when the collection
 * is empty. Values descend below zero as the board grows, which is intended:
 * negative positions sort correctly and cost nothing.
 */
export function orderBefore(min: number | null): number {
  if (min === null || !Number.isFinite(min)) return ORDER_ORIGIN;
  return min - ORDER_STEP;
}

/** A position after everything — used by an explicit append, never as a default. */
export function orderAfter(max: number | null): number {
  if (max === null || !Number.isFinite(max)) return ORDER_ORIGIN;
  return max + ORDER_STEP;
}

/**
 * A position strictly between two neighbours, or null when no integer fits.
 *
 * Null is the exhaustion signal and the caller MUST handle it — by scheduling a
 * rebalance, not by rounding, nudging a neighbour, or picking a value outside
 * the range. Any of those would reorder the board silently.
 */
export function orderBetween(before: number, after: number): number | null {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
  const lo = Math.min(before, after);
  const hi = Math.max(before, after);
  const mid = Math.floor((lo + hi) / 2);
  /* Strictly between: with adjacent integers there is nowhere left to go. */
  if (mid <= lo || mid >= hi) return null;
  return mid;
}

/** Whether two neighbours still have room between them. */
export function hasSpaceBetween(before: number, after: number): boolean {
  return orderBetween(before, after) !== null;
}

/**
 * Positions for a batch inserted at the FRONT, in the order planIngest would
 * place them.
 *
 * planIngest unshifts each new record in turn, so the LAST draft processed ends
 * up nearest the front. Positions descend accordingly, and the batch never
 * touches an existing document.
 */
export function ordersBefore(min: number | null, count: number): number[] {
  const out: number[] = [];
  let cursor = min;
  for (let i = 0; i < count; i += 1) {
    const next = orderBefore(cursor);
    out.push(next);
    cursor = next;
  }
  return out;
}

export interface RebalancePlan {
  /** Every document, with the position it must be given. O(corpus). */
  assignments: Array<{ id: string; order: number }>;
  /** True when the current spacing is already healthy and nothing is needed. */
  unnecessary: boolean;
}

/**
 * Re-space an entire collection. EXPLICIT MAINTENANCE, never automatic.
 *
 * Takes ids already in their current board order and re-stamps them STEP apart.
 * Relative order is preserved exactly — this changes the numbers, never the
 * sequence. It rewrites every document, so it is O(corpus) and is not to be
 * confused with the O(changed) ingestion path.
 */
export function planRebalance(idsInOrder: ReadonlyArray<string>): RebalancePlan {
  return {
    assignments: idsInOrder.map((id, i) => ({ id, order: i * ORDER_STEP })),
    unnecessary: idsInOrder.length === 0,
  };
}

/**
 * Adjacent pairs with no room left between them.
 *
 * Reported rather than repaired, so exhaustion is observable before it blocks
 * an ingestion run — a scheduled check can surface it while a rebalance is
 * still a calm decision rather than an incident.
 */
export function findExhaustedGaps(
  ordersInOrder: ReadonlyArray<number>,
): Array<{ index: number; before: number; after: number }> {
  const out: Array<{ index: number; before: number; after: number }> = [];
  for (let i = 0; i + 1 < ordersInOrder.length; i += 1) {
    const before = ordersInOrder[i];
    const after = ordersInOrder[i + 1];
    if (!hasSpaceBetween(before, after)) out.push({ index: i, before, after });
  }
  return out;
}
