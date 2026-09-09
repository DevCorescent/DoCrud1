/**
 * Which store answers the public jobs feed — and proving the two agree.
 *
 * ═══ THE FLAG ═══
 *
 *     hiring_jobs is now the ONLY source. JOB_READ_FROM_HIRING_JOBS is ignored:
 *     app_state stopped receiving job writes at the Phase 2.6+2.7E cutover, so
 *     selecting it would serve a frozen corpus.
 *
 * Server-side only, and read from the environment rather than from a request:
 * no query parameter, header or body can select a store. That is deliberate —
 * a client-selectable data source is a client-selectable query surface, and the
 * value here decides which collection an aggregation runs against.
 *
 * Anything that is not exactly the string "true" is OFF, so a malformed,
 * empty, or missing value fails to the path that has been serving production
 * all along. There is no third state.
 *
 * ROLLBACK IS THE FLAG. Setting it back to false restores the previous read
 * path on the next request — no deploy, no migration, no data movement, because
 * app_state is still written and still complete.
 *
 * ═══ WHAT THIS FILE DOES NOT DO ═══
 *
 * It selects a SOURCE. It does not filter, sort, page, search or project —
 * those live in public-jobs-query.ts and are shared by both stores, so the two
 * cannot drift into answering the same question differently.
 */
import type { PublicJobQuery } from '@/lib/server/job-api/queries';
import {
  selectPublicJobsPage, selectPublicJobsPageFromCollection, type PublicJobsPage,
} from '@/lib/server/db/public-jobs-query';

export type JobReadSource = 'app_state' | 'hiring_jobs';

/** Exactly "true" enables it. Everything else, including absence, is OFF. */
export function jobReadSource(): JobReadSource {
  /* ═══ THE FLAG IS OVER ═══
     Phase 2.6+2.7E made hiring_jobs canonical and REMOVED the app_state job
     write. app_state still holds a ~12 MB job document in production, but it is
     frozen at the moment of cutover: no create, edit, unpublish or deletion has
     reached it since.
     Reading it would therefore serve a corpus that silently stopped changing —
     a public feed that looks healthy and is months out of date. That is a worse
     failure than an error, because nothing surfaces it.
     So the source is no longer selectable. The environment variable is ignored
     rather than honoured, because honouring `false` now means serving stale
     data, and a rollback switch that points at a dead store is not a rollback.
     Rolling back requires re-materialising app_state first — see
     scripts/db-rebalance-job-order.mjs and the 2.7D rollback contract. */
  return 'hiring_jobs';
}

/** Sampling rate for dual-read verification. 0 disables it entirely. */
export function verifySampleRate(): number {
  const raw = Number(process.env.JOB_READ_VERIFY_SAMPLE);
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 0;
}

/** Read one page from the selected source. Null means "this source could not
    answer" — never an empty page. */
export function readPublicJobsPage(
  query: PublicJobQuery,
  source: JobReadSource = jobReadSource(),
): Promise<PublicJobsPage | null> {
  return source === 'hiring_jobs'
    ? selectPublicJobsPageFromCollection(query)
    : selectPublicJobsPage(query);
}

/* ── Dual-read verification ───────────────────────────────────────────────*/

export type MismatchKind = 'total' | 'page' | 'pageSize' | 'itemCount' | 'order' | 'fields' | 'availability';

export interface VerificationResult {
  match: boolean;
  kinds: MismatchKind[];
  /** Safe to log: query shape and counts only, never job or user content. */
  detail: Record<string, unknown>;
}

/**
 * Compare two answers to the SAME query.
 *
 * Serialised comparison, not an id check: two sources can return the same
 * postings in the same order and still disagree about a salary, a location or
 * a null, and that would reach a visitor as a wrong job card. `items` is
 * compared as JSON so every field publicJobView exposes is covered, including
 * how absent values serialise.
 */
export function comparePages(
  a: PublicJobsPage | null,
  b: PublicJobsPage | null,
): VerificationResult {
  const kinds: MismatchKind[] = [];

  if (!a || !b) {
    return {
      match: false,
      kinds: ['availability'],
      detail: { appState: a ? 'ok' : 'unavailable', hiringJobs: b ? 'ok' : 'unavailable' },
    };
  }

  if (a.total !== b.total) kinds.push('total');
  if (a.page !== b.page) kinds.push('page');
  if (a.pageSize !== b.pageSize) kinds.push('pageSize');
  if (a.items.length !== b.items.length) kinds.push('itemCount');

  const idsA = a.items.map((i) => String(i.id));
  const idsB = b.items.map((i) => String(i.id));
  if (JSON.stringify(idsA) !== JSON.stringify(idsB)) kinds.push('order');
  else if (JSON.stringify(a.items) !== JSON.stringify(b.items)) kinds.push('fields');

  return {
    match: kinds.length === 0,
    kinds,
    detail: {
      totalA: a.total, totalB: b.total,
      itemsA: a.items.length, itemsB: b.items.length,
      page: a.page, pageSize: a.pageSize,
    },
  };
}

/** The query shape, with VALUES reduced to presence. Safe for logs: a search
    term can carry personal information and is never recorded. */
export function describeQuery(query: PublicJobQuery): Record<string, unknown> {
  const shape: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    shape[k] = k === 'page' || k === 'pageSize' || k === 'sort' ? v : 'set';
  }
  return shape;
}
