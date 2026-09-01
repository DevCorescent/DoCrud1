/**
 * Idempotent ingestion of normalized source jobs into the canonical store.
 *
 * This is the last link of the Phase 3 pipeline:
 *
 *   adapter -> NormalizedJob -> normalizeSourceJob -> identity -> INGEST -> store
 *
 * THE GUARANTEE. Running the same source ten times produces one record per
 * posting. That is the entire point: every run re-fetches a provider's whole
 * board, so without identity-based upsert the store would grow by the size of
 * the board on every single run.
 *
 * TWO SAFETY RULES THAT ARE NOT NEGOTIABLE:
 *
 *   1. A source may only ever update a record that CAME FROM A SOURCE. A job a
 *      member posted through /jobs/post has no `sourceId`, is never a match
 *      candidate, and therefore can never be overwritten, restyled or
 *      unpublished by a scraper run.
 *
 *   2. A source may only state CONTENT. Ownership, status, the ATS cutoff and
 *      the record's id and creation time are the platform's; they are carried
 *      forward from the existing record on every update. An admin who
 *      unpublished a scraped posting must not find it republished by the next
 *      run.
 *
 * NOTHING IS DISCARDED SILENTLY. Every input lands in exactly one bucket of
 * the returned report - created, updated, unchanged, duplicate or rejected -
 * and the counts always sum to the number of drafts supplied.
 */
import { randomUUID } from 'crypto';
import type { HiringJobPosting } from '@/types/document';
import type { NormalizedJob } from '@/lib/server/job-scraper/types';
import { getHiringJobs, saveHiringJobs } from '@/lib/server/hiring';
import { jobIdentity, type IdentityBasis } from './identity';
import { classificationFields, classifyJob } from './classify';
import { draftIsUsable, normalizeSourceJob, type CanonicalJobDraft } from './normalize';

/** Where a scraped posting is filed. Mirrors the CSV importer exactly. */
function scraperIdentity() {
  return {
    organizationId: process.env.SCRAPER_ORG_ID || 'scraper-import',
    createdByUserId: process.env.SCRAPER_USER_ID || 'scraper-system',
    createdByEmail: (process.env.SCRAPER_USER_EMAIL || 'scraper@system.docrud').toLowerCase(),
  };
}

export interface IngestRejection {
  /** Index within the supplied batch, so an operator can find the record. */
  index: number;
  reason: 'missing_title_or_company' | 'inactive';
  title: string;
}

export interface IngestReport {
  created: number;
  updated: number;
  /** Matched an existing record whose content hash was identical. */
  unchanged: number;
  /** Collapsed against an earlier draft in the SAME batch. */
  duplicatesInBatch: number;
  rejected: IngestRejection[];
  /** How identity was resolved, for auditing. Sums to the drafts considered. */
  basisCounts: Record<IdentityBasis, number>;
  /**
   * Canonical ids the run actually matched — created, updated or unchanged.
   *
   * This is the evidence Phase 8 needs: a job the source still lists is
   * "seen", and a job absent from a TRUSTWORTHY run is a candidate for
   * expiry. Counts alone cannot express that, because they do not say WHICH
   * postings were confirmed.
   */
  matchedJobIds: string[];
}

const emptyReport = (): IngestReport => ({
  created: 0, updated: 0, unchanged: 0, duplicatesInBatch: 0, rejected: [],
  basisCounts: { external_id: 0, canonical_url: 0, fingerprint: 0 },
  matchedJobIds: [],
});

/**
 * The identity of a record ALREADY in the store, or null when it did not come
 * from a source.
 *
 * Returning null for a member-posted job is rule 1 above, enforced in one
 * place: a record with no `sourceId` cannot produce a key, so it can never be
 * matched by an incoming draft.
 */
export function storedJobIdentity(job: HiringJobPosting): string | null {
  if (!job.sourceId) return null;
  return jobIdentity({
    sourceId: job.sourceId,
    sourceJobId: job.sourceJobId,
    canonicalUrl: job.canonicalUrl ?? job.sourceUrl,
    organizationName: job.organizationName,
    title: job.title,
    location: job.location,
  }).key;
}

/**
 * Fold a draft onto an existing record.
 *
 * Content is replaced; everything the platform owns is carried forward. The
 * explicit field list is the safety mechanism - a spread of the draft over the
 * record would silently adopt any field a future adapter started returning.
 */
function applyDraft(existing: HiringJobPosting, draft: CanonicalJobDraft, now: string): HiringJobPosting {
  return {
    ...existing,

    /* Content the source owns. */
    title: draft.title,
    organizationName: draft.organizationName,
    location: draft.location || undefined,
    department: draft.department || undefined,
    description: draft.description,
    responsibilities: draft.responsibilities,
    requirements: draft.requirements,
    preferredSkills: draft.preferredSkills,
    targetRoleKeywords: draft.targetRoleKeywords,
    employmentType: draft.employmentType,
    workMode: draft.workMode,
    experienceLevel: draft.experienceLevel,
    applyUrl: draft.applyUrl || existing.applyUrl,

    /* Provenance. */
    sourceId: draft.sourceId,
    sourceJobId: draft.sourceJobId ?? existing.sourceJobId,
    sourceUrl: draft.sourceUrl ?? existing.sourceUrl,
    canonicalUrl: draft.canonicalUrl ?? existing.canonicalUrl,
    normalizedTitle: draft.normalizedTitle,
    contentHash: draft.contentHash,
    /* A source that stops stating a date must not erase the one it gave
       before, so an absent postedAt keeps the stored value. */
    postedAt: draft.postedAt ?? existing.postedAt,
    isActive: draft.isActive,
    updatedAt: now,

    /* Re-classified on every content update, because the classification is
       derived from content that just changed. An `unchanged` record never
       reaches here, so a steady posting keeps its labels byte-identical. */
    ...classificationFields(classifyJob(draft)),

    /* Deliberately NOT touched, and listed so the omission reads as a
       decision rather than an oversight:
         id, organizationId, organizationName ownership, createdByUserId,
         createdByEmail, createdAt, shareUrl, status, minimumAtsScore,
         requiredDocuments, ingestedAt, salary*, dedupGroupId.
       Note latitude/longitude are also untouched: this phase has no geocoder
       and must not zero out coordinates a later one may have written. */
  };
}

/** Build a brand-new record from a draft. */
function createRecord(draft: CanonicalJobDraft, now: string): HiringJobPosting {
  const id = `job-${randomUUID()}`;
  const identity = scraperIdentity();
  return {
    id,
    organizationId: identity.organizationId,
    organizationName: draft.organizationName,
    createdByUserId: identity.createdByUserId,
    createdByEmail: identity.createdByEmail,
    title: draft.title,
    department: draft.department || undefined,
    location: draft.location || undefined,
    employmentType: draft.employmentType,
    workMode: draft.workMode,
    experienceLevel: draft.experienceLevel,
    description: draft.description,
    responsibilities: draft.responsibilities,
    requirements: draft.requirements,
    preferredSkills: draft.preferredSkills,
    targetRoleKeywords: draft.targetRoleKeywords,
    /* Matches the CSV importer: a scraped posting gates nothing on ATS. */
    minimumAtsScore: 0,
    status: 'published',
    shareUrl: `/jobs/${id}`,
    createdAt: now,
    updatedAt: now,
    source: 'scraper',
    applyUrl: draft.applyUrl,

    sourceId: draft.sourceId,
    sourceJobId: draft.sourceJobId,
    sourceUrl: draft.sourceUrl,
    canonicalUrl: draft.canonicalUrl,
    normalizedTitle: draft.normalizedTitle,
    contentHash: draft.contentHash,
    postedAt: draft.postedAt,
    isActive: draft.isActive,
    /* When THIS application first stored it. Distinct from postedAt, which is
       what the source claims. */
    ingestedAt: now,

    /* Phase 4 classification. Applied AFTER identity, deliberately: the
       classifier reads content, and content changes, so letting it influence
       the dedup key would make a re-worded posting look like a new one.
       Only fields the canonical model already declares are spread in. */
    ...classificationFields(classifyJob(draft)),
  };
}

export interface IngestPlan {
  /** The full job list to persist. Existing order is preserved. */
  jobs: HiringJobPosting[];
  report: IngestReport;
}

/**
 * Decide what the store should look like after ingesting `drafts`.
 *
 * PURE. It reads no database and writes nothing, which is what lets the whole
 * dedup contract be tested without a Mongo instance or a fixture file.
 */
export function planIngest(
  drafts: CanonicalJobDraft[],
  existing: HiringJobPosting[],
  options: { now?: string } = {},
): IngestPlan {
  const now = options.now ?? new Date().toISOString();
  const report = emptyReport();

  /* Index the store once. A per-draft scan would be O(drafts x store), which
     on a 500-job board against 450 stored postings is 225,000 comparisons per
     run. */
  const byIdentity = new Map<string, number>();
  existing.forEach((job, i) => {
    const key = storedJobIdentity(job);
    /* First writer wins: if the store somehow already holds two records with
       one identity, the earlier is the one kept and updated, and the later is
       left untouched rather than being deleted here. Repairing historic
       duplicates is not this function's job. */
    if (key && !byIdentity.has(key)) byIdentity.set(key, i);
  });

  const jobs = existing.slice();
  /* Identities already handled in THIS batch, so a board listing the same
     posting twice in one response collapses instead of racing itself. */
  const seenInBatch = new Set<string>();

  drafts.forEach((draft, index) => {
    if (!draftIsUsable(draft)) {
      report.rejected.push({ index, reason: 'missing_title_or_company', title: draft.title });
      return;
    }
    /* A posting the board has taken down is not ingested as a new record. An
       EXISTING record is still updated below, because isActive going false is
       exactly the change the store needs to hear about. */
    const key = draft.identity.key;
    report.basisCounts[draft.identity.basis] += 1;

    if (seenInBatch.has(key)) { report.duplicatesInBatch += 1; return; }
    seenInBatch.add(key);

    const at = byIdentity.get(key);
    if (at === undefined) {
      if (!draft.isActive) {
        report.rejected.push({ index, reason: 'inactive', title: draft.title });
        return;
      }
      const record = createRecord(draft, now);
      report.matchedJobIds.push(record.id);
      jobs.unshift(record);
      /* Every index after the unshift moved by one. Rebuilding the map would
         be O(n) per create; shifting the stored offsets is O(n) once per
         create too, so instead the map holds identities and we re-point only
         what changed. */
      byIdentity.forEach((value, mapKey) => byIdentity.set(mapKey, value + 1));
      byIdentity.set(key, 0);
      report.created += 1;
      return;
    }

    const current = jobs[at];
    /* The Phase 1 content hash answers "did anything a candidate reads
       change?". When it has not, the record is left byte-identical - which
       keeps `updatedAt` stable and stops every run from looking like an edit
       to anything downstream that watches it. */
    report.matchedJobIds.push(current.id);
    if (current.contentHash && current.contentHash === draft.contentHash
        && current.isActive === draft.isActive) {
      report.unchanged += 1;
      return;
    }
    jobs[at] = applyDraft(current, draft, now);
    report.updated += 1;
  });

  return { jobs, report };
}

/**
 * Normalize, dedupe and persist a batch of adapter results.
 *
 * The single entry point a caller needs. Reads the store, plans, and writes
 * through `saveHiringJobs` - the project's one write funnel, which also
 * invalidates the published-jobs cache and re-points the read replica.
 */
export async function ingestSourceJobs(
  sourceId: string,
  jobs: NormalizedJob[],
  options: { now?: number } = {},
): Promise<IngestReport> {
  if (!Array.isArray(jobs) || jobs.length === 0) return emptyReport();

  const nowMs = options.now ?? Date.now();
  const drafts = jobs.map((job) => normalizeSourceJob(job, { sourceId, now: nowMs }));
  const existing = await getHiringJobs();
  const { jobs: next, report } = planIngest(drafts, existing, {
    now: new Date(nowMs).toISOString(),
  });

  /* Only write when something actually changed. A run where every posting was
     unchanged - the common case once a board is steady - rewrites nothing and
     leaves the read caches warm. */
  if (report.created || report.updated) await saveHiringJobs(next);
  return report;
}

/**
 * An `onJobs` sink for the Phase 2 runner.
 *
 * The runner already exposes this seam and is left untouched; a caller wires
 * ingestion in by passing `createIngestSink()`. Reports accumulate per source
 * so a completed drain can be summarised without the runner knowing anything
 * about normalization.
 */
export function createIngestSink() {
  const reports = new Map<string, IngestReport>();
  return {
    onJobs: async (sourceId: string, jobs: NormalizedJob[]) => {
      const report = await ingestSourceJobs(sourceId, jobs);
      reports.set(sourceId, report);
    },
    reports,
  };
}
