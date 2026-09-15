/**
 * Keyset cursors for the public job feed.
 *
 * ═══ WHY NOT `skip` ═══
 *
 * `$skip` walks every key it passes. Measured against the live corpus, page 500
 * examined 10,020 index keys to return 20 rows, against 20 keys for page 1. The
 * cost is linear in DEPTH and the corpus is the multiplier, so at 1M postings a
 * deep page stops being servable. A keyset seek reads 20 keys at any depth,
 * because it asks the index to resume rather than to count.
 *
 * ═══ THE DIRECTIONS ARE MIXED, AND THAT IS THE TRAP ═══
 *
 * The feed sorts `{ <sortKey>: -1, id: 1 }` — the key DESCENDING, the tie-break
 * ASCENDING. So the "everything after this row" predicate is NOT symmetric:
 *
 *     sortKey <  cursor.value                    (descending: later means smaller)
 *     sortKey == cursor.value AND id > cursor.id (ascending: later means larger)
 *
 * Using `id <` for the tie-break is the classic mistake, and it fails SILENTLY:
 * rows are skipped only where several postings share a sort value, which is
 * common here — `_skSalary` is 0 for thousands of postings and `_skRelevance`
 * repeats heavily. Nothing errors; the feed just quietly loses jobs.
 * scripts/public-jobs-cursor.selftest.ts mutation-proves both halves.
 *
 * ═══ THE CURSOR IS OPAQUE AND BOUND TO ITS QUERY ═══
 *
 * It carries a fingerprint of the sort and the filters it was produced for, so
 * a cursor from `sort=newest&country=IN` cannot silently continue a different
 * query — the page boundaries would be meaningless against another ordering.
 * A mismatch is REJECTED rather than honoured.
 *
 * Not a security boundary: it encodes only values already visible in the feed,
 * and it is signed by nothing. It is tamper-EVIDENT enough that a corrupted or
 * foreign cursor is refused, not trusted.
 */
import { createHash } from 'crypto';
import type { PublicJobQuery } from '@/lib/server/job-api/queries';

export const CURSOR_VERSION = 1;

export interface JobCursor {
  /** Bumped when the encoding changes, so an old cursor is refused, not misread. */
  v: number;
  /** The sort key's value on the last row of the previous page. */
  value: string | number;
  /** That row's `id` — the tie-break, and what makes the position unique. */
  id: string;
  /** Fingerprint of the sort + filters this cursor was produced for. */
  q: string;
}

/** Every filter that changes which rows exist, and therefore the page boundaries. */
const BINDING_FIELDS: Array<keyof PublicJobQuery> = [
  'sort', 'search', 'country', 'state', 'city', 'domain', 'subDomain',
  'workMode', 'employmentType', 'experienceLevel', 'minSalary',
];

/**
 * A stable fingerprint of the query dimensions a cursor is only valid for.
 *
 * `pageSize` is deliberately absent: changing how many rows are asked for does
 * not change the ORDER, so a cursor stays valid across it.
 */
export function cursorBinding(query: PublicJobQuery): string {
  const canonical = BINDING_FIELDS
    .map((k) => [k, query[k] === undefined || query[k] === null ? '' : String(query[k])])
    .filter(([, v]) => v !== '');
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 16);
}

export function encodeCursor(value: string | number, id: string, query: PublicJobQuery): string {
  const payload: JobCursor = { v: CURSOR_VERSION, value, id, q: cursorBinding(query) };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * The cursor, or `null` when it cannot be trusted for THIS query.
 *
 * Null covers every failure identically — malformed, wrong version, wrong
 * query — because the caller's response to all of them is the same: start from
 * the beginning rather than serve a page from an unknown position.
 */
export function decodeCursor(raw: string | undefined, query: PublicJobQuery): JobCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<JobCursor>;
    if (parsed?.v !== CURSOR_VERSION) return null;
    if (typeof parsed.id !== 'string' || !parsed.id) return null;
    if (typeof parsed.value !== 'string' && typeof parsed.value !== 'number') return null;
    if (parsed.q !== cursorBinding(query)) return null;
    return parsed as JobCursor;
  } catch {
    return null;
  }
}

/**
 * "Strictly after this row" for `{ sortKey: -1, id: 1 }`.
 *
 * Returned as a plain field predicate rather than an `$expr`, so the compound
 * index `{status, sortKey, id}` can serve it.
 */
export function cursorCondition(sortField: string, cursor: JobCursor): Record<string, unknown> {
  return {
    $or: [
      { [sortField]: { $lt: cursor.value } },
      { [sortField]: cursor.value, id: { $gt: cursor.id } },
    ],
  };
}
