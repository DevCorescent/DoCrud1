/**
 * Job source adapters — the contract every ingestion source implements.
 *
 * The existing scraper already fetches Ashby, Lever and Greenhouse correctly.
 * This phase does NOT rewrite that work: an adapter DELEGATES to the provider
 * function that already exists. What the contract adds is everything the
 * current pipeline has no place to put — a cursor, a rate limit, a health
 * record, a run history — so that adding source number one hundred is a
 * registration rather than an edit to the pipeline.
 *
 * The design rule that matters most: ONE SOURCE MUST NEVER STOP ANOTHER. Every
 * adapter call is isolated, its failure is recorded against that source alone,
 * and the run continues. A single 500 from one company's job board cannot be
 * allowed to cost the whole ingestion.
 */
import type { NormalizedJob, ScrapeSource, SourceProvider } from '@/lib/server/job-scraper/types';

/** How a source is reached. Drives what is legally and technically allowed. */
export type SourceAccessType =
  /** A documented public API the provider intends to be consumed. */
  | 'public_api'
  /** A public ATS board endpoint (Ashby, Lever, Greenhouse…). */
  | 'public_ats'
  /** An official API needing a key the operator supplies. */
  | 'official_api'
  /** RSS or Atom feed. */
  | 'feed'
  /** Sitemap + JSON-LD JobPosting on a company's own careers site. */
  | 'sitemap_jsonld'
  /**
   * Access requires a partnership or a commercial API agreement.
   *
   * Registered so the platform can SHOW that the source exists and is not
   * available, and refuse to run it. It is never fetched. This is how
   * LinkedIn, Naukri, Indeed, Glassdoor, Internshala and Instahyre are
   * represented: visible, documented, and never scraped.
   */
  | 'requires_partnership';

/** Operational configuration. Data, not code — a new source needs no edit. */
export interface SourceConfig {
  /** Stable identity, e.g. 'lever:acme'. Never a raw URL. */
  sourceId: string;
  name: string;
  accessType: SourceAccessType;
  enabled: boolean;
  /** Minimum gap between requests to this source, in milliseconds. */
  minIntervalMs: number;
  /** How many requests this source may have in flight at once. */
  concurrency: number;
  /** Abandon a single fetch after this long. */
  timeoutMs: number;
  /** How many times one fetch may be retried before the source is failed. */
  maxAttempts: number;
  /**
   * Consecutive failures after which the source stops being scheduled.
   *
   * A source that has failed twenty times in a row is not going to succeed on
   * the twenty-first, and continuing to call it wastes the run's budget and
   * hammers someone else's server.
   */
  disableAfterConsecutiveFailures: number;
  /** ISO country tag, presentation only. */
  country?: string;
}

/** What one fetch returned, plus where to resume. */
export interface SourceFetchResult {
  jobs: NormalizedJob[];
  /**
   * Opaque resume token for the NEXT call, or null when the source is
   * exhausted. Meaning is the adapter's alone; the runner only stores it.
   */
  nextCursor: string | null;
}

export interface SourceHealthReport {
  ok: boolean;
  /** Safe to show an admin. Never a credential or an internal path. */
  detail?: string;
}

/**
 * The adapter contract.
 *
 * `fetch` receives the cursor the runner last stored. An adapter that cannot
 * paginate simply ignores it and returns `nextCursor: null`.
 */
export interface JobSourceAdapter {
  readonly sourceId: string;
  readonly name: string;
  readonly accessType: SourceAccessType;
  /** The single host this adapter is permitted to contact. SSRF guard. */
  readonly host: string;
  fetch(cursor: string | null): Promise<SourceFetchResult>;
  healthCheck(): Promise<SourceHealthReport>;
}

/* ── Health and history ───────────────────────────────────────────────────
   Persisted, because "has this source worked recently?" cannot be answered
   from an in-process value that dies with the request. */

export interface SourceHealthState {
  sourceId: string;
  /** Last time a fetch completed without throwing. */
  lastSuccessAt?: string;
  lastFailureAt?: string;
  /** Safe message from the most recent failure. */
  lastError?: string;
  consecutiveFailures: number;
  /** Where the next fetch should resume. */
  cursor?: string | null;
  /** Set when `disableAfterConsecutiveFailures` was reached. */
  autoDisabledAt?: string;
  lastLatencyMs?: number;
  lastJobCount?: number;
}

export type IngestionRunStatus = 'running' | 'completed' | 'failed';

/** One pass over the enabled sources. */
export interface IngestionRun {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  status: IngestionRunStatus;
  /** Sources actually attempted in this run. */
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  jobsFound: number;
  /** Per-source outcomes. Bounded; a run over 500 sources stays readable. */
  sources: IngestionSourceResult[];
  /** Set only when the RUN itself failed, not when a source did. */
  error?: string;
}

export interface IngestionSourceResult {
  sourceId: string;
  ok: boolean;
  jobsFound: number;
  latencyMs: number;
  attempts: number;
  /** Safe message. Never a stack trace, never a credential. */
  error?: string;
  /** True when the source was skipped rather than attempted. */
  skipped?: boolean;
  skipReason?: 'disabled' | 'auto_disabled' | 'requires_partnership' | 'rate_limited';
}

/** Bounds the run document. */
export const MAX_RUN_SOURCE_RESULTS = 500;

/** Defaults a source gets when its configuration says nothing. */
export const DEFAULT_SOURCE_CONFIG: Omit<SourceConfig, 'sourceId' | 'name' | 'accessType'> = {
  enabled: true,
  /* One request per second per source. Deliberately conservative: these are
     other people's servers, and the platform's throughput comes from running
     many sources, not from hammering one. */
  minIntervalMs: 1_000,
  concurrency: 1,
  timeoutMs: 20_000,
  maxAttempts: 3,
  disableAfterConsecutiveFailures: 10,
};

export type { NormalizedJob, ScrapeSource, SourceProvider };
