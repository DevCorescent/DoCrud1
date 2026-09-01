/**
 * Phase 8 — the seven-day job lifecycle.
 *
 *   NEW -> ACTIVE -> (7 x 24h, or reliably gone from its source) -> EXPIRED
 *
 * EXPIRY IS A STATE CHANGE, NEVER A DELETE. An expired posting keeps its id,
 * its provenance, its classification, its ATS data and — above all — its
 * applications. Someone who applied on day three must still be able to see
 * what they applied to on day thirty. Nothing in this file removes a record.
 *
 * ═══ THE THREE RULES THAT MATTER MOST ═══
 *
 * 1. AGE IS MEASURED FROM `ingestedAt`, NEVER FROM `updatedAt`.
 *    A source refresh that rewrites a description is not a new job. Reading
 *    age from `updatedAt` would make every refreshed posting immortal and
 *    every quietly-unchanged one look ancient — Phase 3 deliberately does not
 *    touch `updatedAt` when content is unchanged, so it is not a heartbeat.
 *
 * 2. EMPLOYER-POSTED JOBS ARE NEVER AUTO-EXPIRED.
 *    The seven-day rule exists because an external board's listing goes stale
 *    without telling anyone. A job a member posted through /jobs/post is
 *    theirs; it ends when they end it. Identified by `source`/`sourceId`.
 *
 * 3. ABSENCE REQUIRES EVIDENCE, NOT SILENCE.
 *    "The scraper did not mention this job" and "the source no longer lists
 *    this job" are different facts. A failed, skipped, partial or empty run is
 *    not evidence, and treating it as such would expire an entire board the
 *    first time a provider returned a 503.
 *
 * PURE AND DETERMINISTIC. `now` is always a parameter. No clock is read, no
 * database is touched, nothing is mutated. The caller persists the result.
 */
import type { HiringJobPosting } from '@/types/document';

/* ── The rule ─────────────────────────────────────────────────────────────*/

/**
 * Seven days, as 7 x 24 hours of elapsed time.
 *
 * Not "seven calendar days": a calendar rule depends on a timezone, and a
 * server-side lifecycle that changes its answer depending on where it runs is
 * not a rule at all. Elapsed milliseconds between two UTC instants is the same
 * number everywhere.
 */
export const LIFECYCLE_MS = 7 * 24 * 60 * 60 * 1000;

/** How close to the threshold a posting must be to be worth re-examining. */
export const LIFECYCLE_WARN_MS = 6 * 24 * 60 * 60 * 1000;

export type LifecycleState = 'active' | 'expiring' | 'expired' | 'protected';

export type LifecycleReason =
  /** Inside the window. */
  | 'within_window'
  /** Past 7 x 24h since first seen. */
  | 'aged_out'
  /** A successful run proved the source no longer lists it. */
  | 'source_absent'
  /** Already expired. Nothing to do. */
  | 'already_expired'
  /** Not a sourced posting — the rule does not apply. */
  | 'employer_owned'
  /** A human set this state; the lifecycle does not overrule it. */
  | 'manual_state'
  /** No first-seen timestamp, so age is unknown. Never expired on a guess. */
  | 'age_unknown';

export interface LifecycleVerdict {
  state: LifecycleState;
  reason: LifecycleReason;
  /** Milliseconds since first seen, or null when that is unknown. */
  ageMs: number | null;
  /** True when the caller should persist `changes`. */
  changed: boolean;
  /** The FIELDS TO WRITE — never a whole record, so nothing else is touched. */
  changes: Partial<HiringJobPosting>;
}

/* ── Classification ───────────────────────────────────────────────────────*/

/**
 * Whether the seven-day rule applies to this posting at all.
 *
 * `source === 'scraper'` OR the presence of a `sourceId` marks an ingested
 * posting. Both are checked because the CSV importer stamps `source` while the
 * Phase 3 adapter path stamps `sourceId`, and a posting from either is
 * externally sourced.
 */
export function isSourcedJob(job: Partial<HiringJobPosting>): boolean {
  return job.source === 'scraper' || Boolean(job.sourceId);
}

/**
 * Whether a human has already decided this posting's state.
 *
 * A draft is something an owner unpublished; a closed posting is one someone
 * ended. Neither may be republished, re-opened or re-expired by a scheduled
 * task — Phase 3 established that source data must not overwrite operational
 * state, and a timer is no more entitled to than a scraper is.
 */
export function hasManualState(job: Partial<HiringJobPosting>): boolean {
  return job.status === 'draft' || job.status === 'closed';
}

/** Already expired: closed by the lifecycle, or explicitly marked inactive. */
function isAlreadyExpired(job: Partial<HiringJobPosting>): boolean {
  return Boolean(job.expiresAt) || job.isActive === false;
}

/**
 * Age in milliseconds since the posting was FIRST seen.
 *
 * `ingestedAt` is the platform's own record of when it first stored the job
 * and is preferred. `createdAt` is the fallback for the postings that predate
 * it. `postedAt` — what the source claims — is deliberately NOT used: a board
 * that reports a six-month-old origin date would have its listing expire the
 * instant it was ingested.
 *
 * Returns null when neither timestamp is usable. A future timestamp yields 0,
 * not a negative age.
 */
export function jobAgeMs(job: Partial<HiringJobPosting>, now: number): number | null {
  const raw = job.ingestedAt || job.createdAt;
  if (!raw) return null;
  const at = Date.parse(String(raw));
  if (!Number.isFinite(at)) return null;
  return Math.max(0, now - at);
}

/* ── Evaluation ───────────────────────────────────────────────────────────*/

export interface LifecycleOptions {
  /**
   * Reliable evidence that the source no longer lists this posting.
   *
   * Set ONLY by a caller that ran a source successfully and saw a non-empty
   * result that did not include this job — see `sourceRunIsTrustworthy`.
   * Defaults to false, so silence never expires anything.
   */
  absentFromSource?: boolean;
}

/**
 * Decide one posting's lifecycle state. Pure.
 *
 * The order of the guards is the policy: protection and human decisions are
 * checked BEFORE age, so an employer's posting and an admin's unpublish can
 * never be overridden by the clock.
 */
export function evaluateLifecycle(
  job: Partial<HiringJobPosting>,
  now: number,
  options: LifecycleOptions = {},
): LifecycleVerdict {
  const ageMs = jobAgeMs(job, now);
  const none = { changed: false, changes: {} as Partial<HiringJobPosting> };

  /* 1. Already expired — a strict no-op, so repeated runs never churn. */
  if (isAlreadyExpired(job)) {
    return { state: 'expired', reason: 'already_expired', ageMs, ...none };
  }

  /* 2. Employer-posted. The rule simply does not apply. */
  if (!isSourcedJob(job)) {
    return { state: 'protected', reason: 'employer_owned', ageMs, ...none };
  }

  /* 3. A human already set this state. */
  if (hasManualState(job)) {
    return { state: 'protected', reason: 'manual_state', ageMs, ...none };
  }

  /* 4. Reliable absence from the source expires it regardless of age — a
        posting that has been taken down is gone whether it is one day old or
        six. */
  if (options.absentFromSource === true) {
    return {
      state: 'expired', reason: 'source_absent', ageMs, changed: true,
      changes: expireFields(now),
    };
  }

  /* 5. Age. Unknown age is never expired: a posting with no timestamp is a
        gap in the data, not an old job. */
  if (ageMs === null) {
    return { state: 'active', reason: 'age_unknown', ageMs, ...none };
  }

  if (ageMs >= LIFECYCLE_MS) {
    return {
      state: 'expired', reason: 'aged_out', ageMs, changed: true,
      changes: expireFields(now),
    };
  }

  /* `expiring` is advisory only — it changes nothing and exists so an operator
     or a bounded query can find what is about to lapse. */
  return {
    state: ageMs >= LIFECYCLE_WARN_MS ? 'expiring' : 'active',
    reason: 'within_window', ageMs, ...none,
  };
}

/**
 * Exactly the fields expiry writes. Nothing else on the record is touched.
 *
 * `status: 'closed'` is what removes it from the published feed, which already
 * filters on status — no new filter, and no second notion of "active". The
 * explicit `isActive: false` records the same fact on the canonical field, and
 * `expiresAt` is the audit trail of when it happened.
 */
function expireFields(now: number): Partial<HiringJobPosting> {
  const at = new Date(now).toISOString();
  return { status: 'closed', isActive: false, expiresAt: at, updatedAt: at };
}

/* ── Source-absence evidence ──────────────────────────────────────────────*/

/** The subset of a Phase 2 run result this phase needs. */
export interface SourceRunEvidence {
  sourceId: string;
  /** The run completed without error. */
  ok: boolean;
  /** The source was skipped rather than attempted. */
  skipped?: boolean;
  /** How many postings the run returned. */
  jobsFound: number;
}

/**
 * Whether a run may be used as proof that a missing job is gone.
 *
 * ALL THREE must hold. A failed run proves nothing; a skipped source was never
 * asked; and a successful run returning ZERO jobs is indistinguishable from a
 * provider serving an empty page during a deploy — expiring a whole board on
 * that would be the single most destructive thing this phase could do.
 */
export function sourceRunIsTrustworthy(run: SourceRunEvidence): boolean {
  return run.ok === true && run.skipped !== true && run.jobsFound > 0;
}

/* ── Batch ────────────────────────────────────────────────────────────────*/

export interface LifecycleSweepResult {
  /** The records to persist, with only lifecycle fields changed. */
  updates: Array<{ job: HiringJobPosting; changes: Partial<HiringJobPosting> }>;
  expired: number;
  examined: number;
  /** Postings inside the window that a caller may want to re-check soon. */
  expiringSoon: string[];
  skippedProtected: number;
}

export interface SweepOptions {
  now: number;
  /**
   * A trustworthy run and the ids it returned.
   *
   * Absence is only ever concluded for jobs belonging to `run.sourceId`, and
   * only when `sourceRunIsTrustworthy(run)`. Omit it and the sweep is
   * age-only, which is the safe default.
   */
  presence?: { run: SourceRunEvidence; seenJobIds: ReadonlySet<string> };
  /** Safety ceiling on how many records one sweep will change. */
  maxUpdates?: number;
}

/**
 * Evaluate a BOUNDED set of postings and return what to write.
 *
 * Takes a candidate list; it never queries. The caller is expected to pass the
 * postings worth examining — active, sourced, old enough to matter — so this
 * stays O(candidates) and can be fed by an index later without changing here.
 * It returns changes rather than applying them, so persistence, ordering and
 * batching remain the caller's decisions.
 */
export function sweepLifecycle(
  jobs: readonly HiringJobPosting[],
  options: SweepOptions,
): LifecycleSweepResult {
  const { now } = options;
  const maxUpdates = Math.max(0, options.maxUpdates ?? 500);
  const trustworthy = options.presence
    ? sourceRunIsTrustworthy(options.presence.run)
    : false;

  const result: LifecycleSweepResult = {
    updates: [], expired: 0, examined: 0, expiringSoon: [], skippedProtected: 0,
  };

  for (const job of jobs) {
    if (!job?.id) continue;
    result.examined += 1;

    /* Absence is concluded ONLY for the source the run actually covered.
       A run of `lever:acme` says nothing about `greenhouse:beta`. */
    const coversThisJob = trustworthy
      && options.presence!.run.sourceId === job.sourceId;
    const absentFromSource = coversThisJob
      && !options.presence!.seenJobIds.has(job.id);

    const verdict = evaluateLifecycle(job, now, { absentFromSource });

    if (verdict.state === 'protected') result.skippedProtected += 1;
    if (verdict.state === 'expiring') result.expiringSoon.push(job.id);

    if (verdict.changed && result.updates.length < maxUpdates) {
      result.updates.push({ job, changes: verdict.changes });
      result.expired += 1;
    }
  }

  /* Deterministic order, so two runs over the same data produce the same
     write list regardless of how the candidates arrived. */
  result.updates.sort((a, b) => a.job.id.localeCompare(b.job.id));
  result.expiringSoon.sort();
  return result;
}

/**
 * Apply a sweep's changes to a job list, returning a NEW list.
 *
 * Pure — the input array and its records are not mutated. Records with no
 * changes are returned by reference, so an unchanged sweep produces an
 * identical list and a caller can skip the write entirely.
 */
export function applyLifecycleUpdates(
  jobs: readonly HiringJobPosting[],
  updates: LifecycleSweepResult['updates'],
): HiringJobPosting[] {
  if (!updates.length) return jobs as HiringJobPosting[];
  const byId = new Map(updates.map((u) => [u.job.id, u.changes]));
  return jobs.map((job) => {
    const changes = byId.get(job.id);
    return changes ? { ...job, ...changes } : job;
  });
}

/* ── Active-job predicate ─────────────────────────────────────────────────*/

/**
 * Whether a posting still counts as live.
 *
 * The ONE definition, so recommendation, discovery and any later API agree.
 * `isActive === undefined` is NOT false — the postings that predate the field
 * are governed by `status`, exactly as the canonical model's own note says.
 */
export function isJobActive(job: Partial<HiringJobPosting>): boolean {
  if (job.status !== 'published') return false;
  if (job.isActive === false) return false;
  if (job.expiresAt) return false;
  return true;
}

/**
 * Record that a source run just saw these postings.
 *
 * Returns only the ids whose stamp actually moves, so a run does not rewrite
 * every record every few minutes: a posting seen again within the same hour is
 * left alone. Write amplification is what makes a heartbeat expensive, and the
 * lifecycle needs day resolution, not minute resolution.
 */
export const LAST_SEEN_RESOLUTION_MS = 60 * 60 * 1000;

export function markSeen(
  jobs: readonly HiringJobPosting[],
  seenJobIds: ReadonlySet<string>,
  now: number,
): Array<{ id: string; lastSeenAt: string }> {
  const at = new Date(now).toISOString();
  const out: Array<{ id: string; lastSeenAt: string }> = [];
  for (const job of jobs) {
    if (!job?.id || !seenJobIds.has(job.id)) continue;
    const prev = job.lastSeenAt ? Date.parse(job.lastSeenAt) : NaN;
    if (Number.isFinite(prev) && now - prev < LAST_SEEN_RESOLUTION_MS) continue;
    out.push({ id: job.id, lastSeenAt: at });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
