/**
 * The public feed's sort keys, persisted so MongoDB can index them.
 *
 * ═══ THE PROBLEM ═══
 *
 * Every public sort mode coalesces:
 *
 *     newest     postedAt ?? createdAt ?? ''
 *     salary     salaryMax ?? salaryMin ?? 0
 *     relevance  domainConfidence ?? 0
 *
 * The listing pipeline computed those with `$addFields` and sorted on the
 * result. No index can serve a sort on a computed expression, so MongoDB
 * computed a key for EVERY matching document and sorted them all in memory to
 * return twenty rows: 24 ms at 5,000 postings, 1,493 ms at 100,000. The
 * `published_newest` / `published_salary` / `published_relevance` indexes were
 * built for exactly these sorts and sat unused.
 *
 * ═══ THE FIX, AND WHY IT IS EXACT ═══
 *
 * Store the SAME coalesced value on the document and sort on that. The
 * derivation below is the single definition — the writer stamps it, the
 * backfill uses it, and the completeness gate compares against it — so the
 * stored value cannot drift from what the old expression produced.
 *
 * Ordering is unchanged BY CONSTRUCTION: identical value, identical direction,
 * identical `id` tie-break. This is not a new ranking; it is the same ranking,
 * precomputed.
 *
 * ═══ THE DEPLOY ORDER MATTERS ═══
 *
 * A document without these fields sorts FIRST under a descending sort, which
 * would silently move stale postings to the top of the board. The backfill must
 * therefore complete BEFORE the query cuts over — see
 * scripts/db-backfill-sort-keys.mjs and the completeness gate. Shipping the
 * query first is the one sequence that breaks the feed quietly.
 */

/** Field names. Prefixed like `_order`/`_fp`: bookkeeping, never business data. */
export const SK_NEWEST = '_skNewest';
export const SK_SALARY = '_skSalary';
export const SK_RELEVANCE = '_skRelevance';
export const SORT_KEY_FIELDS = [SK_NEWEST, SK_SALARY, SK_RELEVANCE] as const;

export interface PublicSortKeys {
  [SK_NEWEST]: string;
  [SK_SALARY]: number;
  [SK_RELEVANCE]: number;
}

/**
 * `$ifNull` semantics, exactly: a value is "absent" ONLY when it is null or
 * missing.
 *
 * This is the subtlety the parity harness caught. An empty string is NOT
 * absent to `$ifNull` — it returns `''`, which sorts last under a descending
 * sort. Treating `''` as absent made the key fall through to `createdAt`,
 * moving that posting up the board. Same for a zero, or a non-numeric string:
 * `$ifNull` passes them through untouched, so this must too.
 */
function present<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

/**
 * THE derivation. Every producer of these fields calls this one function.
 *
 * Each expression mirrors `sortKeyExpr` in public-jobs-query.ts exactly,
 * including the final fallback, so a document's stored key equals what the old
 * `$addFields` would have computed for it.
 */
export function derivePublicSortKeys(job: Record<string, unknown>): PublicSortKeys {
  return {
    /* postedAt ?? createdAt ?? '' — ISO-8601 strings order identically under
       BSON string comparison, which is why the old expression compared them
       as strings and why this one stores them that way. */
    [SK_NEWEST]: (present(job.postedAt) ? job.postedAt
      : present(job.createdAt) ? job.createdAt : '') as string,
    /* salaryMax ?? salaryMin ?? 0 */
    [SK_SALARY]: (present(job.salaryMax) ? job.salaryMax
      : present(job.salaryMin) ? job.salaryMin : 0) as number,
    /* domainConfidence ?? 0 */
    [SK_RELEVANCE]: (present(job.domainConfidence) ? job.domainConfidence : 0) as number,
  };
}

/** True when the stored keys match what the sources say they should be. */
export function sortKeysAreCurrent(doc: Record<string, unknown>): boolean {
  const expected = derivePublicSortKeys(doc);
  return doc[SK_NEWEST] === expected[SK_NEWEST]
    && doc[SK_SALARY] === expected[SK_SALARY]
    && doc[SK_RELEVANCE] === expected[SK_RELEVANCE];
}
