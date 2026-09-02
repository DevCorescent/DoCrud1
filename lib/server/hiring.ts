import { HiringJobApplication, HiringJobPosting, User } from '@/types/document';
import { hiringApplicationsPath, hiringJobsPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import { getAllPublishedBusinessJobs, getBusinessPagesByOwner } from '@/lib/server/business-pages';
import {
  selectPublishedJobCompanyNames, selectPublishedJobListRows, selectPublishedJobRowById,
} from '@/lib/server/db/hiring-jobs-rows';
import { invalidateRecommendationCaches } from '@/lib/server/recommendation-cache';
import { invalidateHiringCompanies } from '@/lib/server/hiring-companies';
import {
  countPublishedJobs, mirrorPublishedJobs, readHiringCorpusVersion,
  selectPublishedCompanyNames, selectPublishedJobDocById, selectPublishedJobListDocs,
  type CorpusVersion,
} from '@/lib/server/db/hiring-jobs-collection';

function jobOwnerId(user: User) {
  if (user.role === 'client') return user.id;
  if (user.role === 'member' && user.organizationId) return user.organizationId;
  return user.id;
}

const BUSINESS_EXPERIENCE_MAP: Record<string, HiringJobPosting['experienceLevel']> = {
  entry: 'entry', associate: 'associate', mid: 'mid', senior: 'senior', lead: 'lead',
  fresher: 'entry', junior: 'associate', 'mid_level': 'mid', executive: 'lead',
};
const BUSINESS_EMPLOYMENT_MAP: Record<string, HiringJobPosting['employmentType']> = {
  full_time: 'full_time', part_time: 'part_time', contract: 'contract', internship: 'internship', freelance: 'freelance',
};

/**
 * Project a Business Page job into the HiringJobPosting shape used by the feed,
 * job-detail page, and application pipeline. The record is NOT copied into the
 * hiring store — this is a read-time view. The owning page is the "organization"
 * (organizationId = pageId), so page-scoped authorization stays intact.
 */
function mapBusinessJobToFeedJob(job: Awaited<ReturnType<typeof getAllPublishedBusinessJobs>>[number]): HiringJobPosting {
  return {
    id: job.id,
    organizationId: job.pageId,
    organizationName: job.pageName,
    createdByUserId: job.pageOwnerUserId,
    createdByEmail: '',
    title: job.title,
    location: job.location,
    employmentType: BUSINESS_EMPLOYMENT_MAP[job.jobType] || 'full_time',
    experienceLevel: job.experienceLevel ? (BUSINESS_EXPERIENCE_MAP[job.experienceLevel] || undefined) : undefined,
    description: job.description,
    responsibilities: [],
    requirements: [],
    preferredSkills: Array.isArray(job.skills) ? job.skills : [],
    targetRoleKeywords: Array.isArray(job.skills) ? job.skills : [],
    minimumAtsScore: 0,
    status: 'published',
    shareUrl: `/jobs/${job.id}`,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    source: 'business_page',
    pageId: job.pageId,
    applyUrl: job.applyUrl,
  };
}

/** All Business Page jobs projected into feed shape (best-effort; never blocks the hiring feed). */
async function getPublishedBusinessFeedJobs(): Promise<HiringJobPosting[]> {
  try {
    const jobs = await getAllPublishedBusinessJobs();
    return jobs.map(mapBusinessJobToFeedJob);
  } catch {
    return [];
  }
}

function jobOwnerName(user: User) {
  return user.organizationName || user.name || 'Business Workspace';
}

export async function getHiringJobs() {
  return readJsonFile<HiringJobPosting[]>(hiringJobsPath, []);
}

/* ─── raw-corpus cache ────────────────────────────────────────────────────
   getHiringJobs() re-reads and re-parses the whole ~2.7 MB hiring-jobs
   document on EVERY call, with no cache — while getPublishedHiringJobs()
   right below has had a version-probe cache all along. Measured against the
   real corpus, the public feed answered a 20-row page in ~33 s warm, and the
   recommendations feed answered from its cache in ~9 ms. Same data, same
   process; the only difference was the cache.

   So the raw corpus gets the same treatment, and getPublishedHiringJobs() now
   builds on it — one shared read instead of two independent ones.

   THIS IS NOT USED BY THE EMPLOYER ROUTES. An employer who edits a posting and
   reloads must see their own change with no window at all, so those routes
   keep the direct read. This serves the PUBLIC paths, which already tolerate
   exactly this staleness through the published cache. */
type RawCache = { value: HiringJobPosting[]; ts: number; version: CorpusVersion | null };
let rawCache: RawCache | null = null;
let rawInFlight: Promise<HiringJobPosting[]> | null = null;

/**
 * The full hiring-jobs corpus, cached behind a version probe.
 *
 * Same contract as getPublishedHiringJobs: trusted for PUBLISHED_PROBE_INTERVAL,
 * then revalidated with a ~50-byte version query, and rebuilt outright past
 * PUBLISHED_MAX_AGE. Every write path calls invalidatePublishedHiringJobs(),
 * which clears this too, so a posting created in this process is visible to the
 * next read immediately.
 */
export async function getHiringJobsCached(): Promise<HiringJobPosting[]> {
  const age = rawCache ? Date.now() - rawCache.ts : Infinity;
  if (rawCache && age < PUBLISHED_PROBE_INTERVAL) return rawCache.value;

  if (rawCache && age < PUBLISHED_MAX_AGE) {
    const current = await readHiringCorpusVersion().catch(() => null);
    if (sameVersion(current, rawCache.version)) {
      rawCache = { ...rawCache, ts: Date.now() };
      return rawCache.value;
    }
  }

  /* Concurrent cold callers share ONE read. */
  if (rawInFlight) return rawInFlight;
  rawInFlight = getHiringJobs()
    .then(async (value) => {
      const version = await readHiringCorpusVersion().catch(() => null);
      rawCache = { value, ts: Date.now(), version };
      rawInFlight = null;
      return value;
    })
    .catch((error) => {
      /* A failed load is never cached and never becomes an empty corpus. */
      rawInFlight = null;
      throw error;
    });
  return rawInFlight;
}

/* ─── published-jobs cache ────────────────────────────────────────────────
   The hiring-jobs document is ~2.7 MB (360 postings, 88% of it descriptions)
   and EVERY caller re-read and re-parsed the whole thing: one homepage load
   alone hit it three times — the recommendations count, the recommendations
   carousel and the trusted-companies marquee — for ~8 MB of reads that all
   returned identical data.

   So the merged published list is held for a few seconds and shared. This is
   NOT a correctness compromise: saveHiringJobs() — the only write path, used
   by both the Hiring Desk and the CSV importer — clears it, so a posting is
   visible immediately in the process that created it. Across several server
   instances a new posting can lag by at most TTL, which is the same window
   the feed already tolerated. */
type PublishedCache = { value: HiringJobPosting[]; ts: number; version: CorpusVersion | null };

/**
 * How long the corpus is trusted without asking whether it changed.
 *
 * Not a lifetime — a probe interval. Past it, a ~50-byte version query decides
 * whether to reuse or reload, so the corpus stays warm indefinitely while jobs
 * are unchanged and still picks up a job posted on ANOTHER instance within one
 * window. The previous 15 s value was a hard expiry, which re-read 2.7 MB every
 * 15 s even when nothing had changed.
 */
const PUBLISHED_PROBE_INTERVAL = 30_000;
/* Freshness ceiling. If the probe cannot answer (Mongo unreachable, an older
   deployment without the collection), the corpus is rebuilt rather than
   trusted indefinitely. */
const PUBLISHED_MAX_AGE = 10 * 60_000;
let publishedCache: PublishedCache | null = null;
/* Concurrent callers during a cold read share ONE read instead of each firing
   their own 2.7 MB fetch — the same coalescing the app_state reader uses. */
let publishedInFlight: Promise<HiringJobPosting[]> | null = null;

/** Called by every write path so the next read rebuilds from storage. */
export function invalidatePublishedHiringJobs() {
  publishedCache = null;
  publishedInFlight = null;
  rawCache = null;
  rawInFlight = null;
  listCache = null;
  namesCache = null;
}

/** The full list IF it is already cached. Never reads storage. */
function peekPublishedHiringJobs(): HiringJobPosting[] | null {
  return publishedCache && Date.now() - publishedCache.ts < PUBLISHED_PROBE_INTERVAL
    ? publishedCache.value
    : null;
}

async function readPublishedHiringJobs(): Promise<HiringJobPosting[]> {
  // The two stores are independent; they were being awaited one after the other.
  const [jobs, business] = await Promise.all([
    /* Shares the raw-corpus cache, so the published list and the public feed
       cost ONE read between them rather than one each. */
    getHiringJobsCached(),
    getPublishedBusinessFeedJobs(),
  ]);
  // Single source of truth per record: hiring jobs from the hiring store,
  // business jobs projected from the business-pages store. Merged only here.
  return [...jobs.filter((job) => job.status === 'published'), ...business];
}

const sameVersion = (a: CorpusVersion | null, b: CorpusVersion | null) =>
  a !== null && b !== null && a.count === b.count && a.maxUpdatedAt === b.maxUpdatedAt;

export async function getPublishedHiringJobs(): Promise<HiringJobPosting[]> {
  const age = publishedCache ? Date.now() - publishedCache.ts : Infinity;

  // Inside the probe interval the corpus is used as-is.
  if (publishedCache && age < PUBLISHED_PROBE_INTERVAL) return publishedCache.value;

  /* Past it, ask cheaply whether anything changed. Confirming an unchanged
     corpus costs ~50 bytes instead of re-reading 2.7 MB, so a warm process
     keeps serving from memory for as long as the job set is stable. */
  if (publishedCache && age < PUBLISHED_MAX_AGE) {
    const current = await readHiringCorpusVersion().catch(() => null);
    if (sameVersion(current, publishedCache.version)) {
      publishedCache = { ...publishedCache, ts: Date.now() };
      return publishedCache.value;
    }
  }

  /* Single-flight: concurrent callers on a cold process share ONE read rather
     than each firing their own 2.7 MB fetch. */
  if (publishedInFlight) return publishedInFlight;

  publishedInFlight = readPublishedHiringJobs()
    .then(async (value) => {
      /* The version is captured AFTER the read, so a write that lands during
         the read shows as a difference at the next probe rather than being
         silently absorbed. */
      const version = await readHiringCorpusVersion().catch(() => null);
      publishedCache = { value, ts: Date.now(), version };
      publishedInFlight = null;
      return value;
    })
    .catch((error) => {
      /* A failed load is never cached, and never becomes an empty corpus — the
         previous value (if any) stays and the next caller retries. */
      publishedInFlight = null;
      throw error;
    });
  return publishedInFlight;
}

/* ─── projected reads ─────────────────────────────────────────────────────
   Four callers need a slice of the jobs data, not the whole 2.7 MB of it. Each
   tries, in order:

     1. the `hiring_jobs` COLLECTION — one document per job, so Mongo projects
        per document (lib/server/db/hiring-jobs-collection.ts);
     2. a server-side projection of the app_state document, which reduces the
        array before sending it (lib/server/db/hiring-jobs-rows.ts);
     3. the full app_state read.

   Every step falls through on null, so an unavailable collection produces a
   slower read and never an empty one. Behaviour is identical at each level;
   only the bytes differ. Ranking is NOT in this list — it still takes the full
   read, because matchReasons genuinely needs description text.

   Business Page jobs are projected from a different store and are few, so they
   are merged in afterwards exactly as getPublishedHiringJobs() does. Order is
   preserved: hiring jobs first, then business jobs. */

type ListCache = { value: PublicHiringJobListItem[]; ts: number };
let listCache: ListCache | null = null;
type NamesCache = { value: string[]; ts: number };
let namesCache: NamesCache | null = null;

/** Every published posting as a listing card — see toPublicHiringJobListItem. */
export async function getPublishedHiringJobList(): Promise<PublicHiringJobListItem[]> {
  if (listCache && Date.now() - listCache.ts < PUBLISHED_PROBE_INTERVAL) return listCache.value;

  // If the full list is already in memory, projecting again would be wasted work.
  const warm = peekPublishedHiringJobs();
  if (warm) {
    const value = warm.map(toPublicHiringJobListItem);
    listCache = { value, ts: Date.now() };
    return value;
  }

  const [docs, business] = await Promise.all([
    selectPublishedJobListDocs(),
    getPublishedBusinessFeedJobs(),
  ]);

  let value: PublicHiringJobListItem[];
  if (docs) {
    value = [...docs.map(toPublicHiringJobListItem), ...business.map(toPublicHiringJobListItem)];
  } else {
    const rows = await selectPublishedJobListRows();
    value = rows
      ? [...rows.map((r) => r as PublicHiringJobListItem), ...business.map(toPublicHiringJobListItem)]
      : (await getPublishedHiringJobs()).map(toPublicHiringJobListItem);
  }

  listCache = { value, ts: Date.now() };
  return value;
}

/** The employer name of every published posting — the marquee's whole input. */
export async function getPublishedHiringJobCompanyNames(): Promise<string[]> {
  if (namesCache && Date.now() - namesCache.ts < PUBLISHED_PROBE_INTERVAL) return namesCache.value;

  const warm = peekPublishedHiringJobs();
  if (warm) {
    const value = warm.map((j) => j.organizationName ?? '');
    namesCache = { value, ts: Date.now() };
    return value;
  }

  const [fromCollection, business] = await Promise.all([
    selectPublishedCompanyNames(),
    getPublishedBusinessFeedJobs(),
  ]);
  const businessNames = business.map((j) => j.organizationName ?? '');

  let value: string[];
  if (fromCollection) {
    value = [...fromCollection, ...businessNames];
  } else {
    const projected = await selectPublishedJobCompanyNames();
    value = projected
      ? [...projected, ...businessNames]
      : (await getPublishedHiringJobs()).map((j) => j.organizationName ?? '');
  }

  namesCache = { value, ts: Date.now() };
  return value;
}

/**
 * How many published postings exist.
 *
 * `countDocuments` against the collection answers this without transferring a
 * single job. Falls back to counting the merged list, which is what the count
 * has always meant — hiring jobs plus Business Page jobs.
 */
export async function getPublishedHiringJobCount(): Promise<number> {
  const warm = peekPublishedHiringJobs();
  if (warm) return warm.length;

  const [count, business] = await Promise.all([
    countPublishedJobs(),
    getPublishedBusinessFeedJobs(),
  ]);
  if (count !== null) return count + business.length;

  return (await getPublishedHiringJobs()).length;
}

export async function getPublishedHiringJobById(id: string) {
  /* Already in memory — no query at all. */
  const warm = peekPublishedHiringJobs();
  if (warm) return warm.find((job) => job.id === id) || null;

  /* One indexed `_id` lookup against the collection — `_id` IS the job id. */
  const fromCollection = await selectPublishedJobDocById(id);
  if (fromCollection) {
    if (fromCollection.job) return fromCollection.job;
    const business = await getPublishedBusinessFeedJobs();
    return business.find((job) => job.id === id) || null;
  }

  /* Select the one matching element inside the array server-side rather than
     transferring all 360 postings to find one. */
  const projected = await selectPublishedJobRowById(id);
  if (projected) {
    if (projected.job) return projected.job;
    // Not a hiring job — it may still be a Business Page job.
    const business = await getPublishedBusinessFeedJobs();
    return business.find((job) => job.id === id) || null;
  }

  const jobs = await getPublishedHiringJobs();
  return jobs.find((job) => job.id === id) || null;
}

/**
 * Public-safe view of a job posting. Strips internal / PII fields that must never
 * reach an unauthenticated client — the poster's user id and email, the internal
 * organization id, and import metadata (source / pageId) — while preserving
 * everything a public listing or detail view needs (title, company name,
 * location, department, requirements, skills, ATS threshold, dates, apply link).
 * Use this in every PUBLIC (`/api/public/...`) job response. Server components
 * that need the full record (e.g. owner detection on the detail page) keep
 * calling the getters above directly and are unaffected.
 */
export type PublicHiringJob = Omit<HiringJobPosting, 'createdByUserId' | 'createdByEmail' | 'organizationId' | 'source' | 'pageId'>;
export function toPublicHiringJob(job: HiringJobPosting): PublicHiringJob {
  const { createdByUserId: _u, createdByEmail: _e, organizationId: _o, source: _s, pageId: _p, ...pub } = job;
  return pub;
}

/**
 * The LISTING view of a job: exactly the fields a card renders, and nothing
 * else. `description`, `responsibilities` and `requirements` are the bulk of a
 * posting and no list UI reads them, so they are dropped here rather than
 * shipped to the browser and ignored.
 *
 * Derived from PublicHiringJob, so it can never leak a field the public view
 * does not already allow.
 */
export type PublicHiringJobListItem = Pick<
  PublicHiringJob,
  'id' | 'title' | 'organizationName' | 'location' | 'department'
  | 'employmentType' | 'workMode' | 'experienceLevel'
  | 'preferredSkills' | 'applyUrl' | 'shareUrl' | 'createdAt' | 'updatedAt'
>;

export function toPublicHiringJobListItem(job: HiringJobPosting): PublicHiringJobListItem {
  return {
    id: job.id,
    title: job.title,
    organizationName: job.organizationName,
    location: job.location,
    department: job.department,
    employmentType: job.employmentType,
    workMode: job.workMode,
    experienceLevel: job.experienceLevel,
    preferredSkills: job.preferredSkills,
    applyUrl: job.applyUrl,
    shareUrl: job.shareUrl,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export async function saveHiringJobs(jobs: HiringJobPosting[]) {
  // app_state remains the source of truth and is written FIRST.
  await writeJsonFile(hiringJobsPath, jobs);

  /* The `hiring_jobs` collection is a read replica of what was just written.
     Re-pointing it here is what stops the switched read paths from serving a
     stale list after an import or an edit. It is best effort: the write above
     has already succeeded, so a mirror failure must not fail the save — it
     marks the replica untrusted instead, and every read falls back to
     app_state until the next successful mirror. */
  const mirror = await mirrorPublishedJobs(jobs as unknown as Array<Record<string, unknown>>);
  if (mirror.ok && (mirror.rewritten || mirror.removed)) {
    console.info(
      `[hiring_jobs] mirrored: ${mirror.rewritten} rewritten, `
      + `${mirror.reordered} reordered, ${mirror.removed} removed`,
    );
  }

  // Every write path funnels through here, so this is the one place the
  // job caches can go stale — and the one place they are cleared.
  invalidatePublishedHiringJobs();
  /* A new or changed posting can change anyone's matches and the marquee's
     employer list, so those derived caches are dropped too. Without this a job
     posted now stayed invisible to recommendations until the entry aged out. */
  invalidateRecommendationCaches();
  invalidateHiringCompanies();
}

export async function getHiringApplications() {
  return readJsonFile<HiringJobApplication[]>(hiringApplicationsPath, []);
}

export async function saveHiringApplications(applications: HiringJobApplication[]) {
  await writeJsonFile(hiringApplicationsPath, applications);
}

/**
 * Who may edit or delete an existing job.
 *
 * WHY THIS EXISTS: `upsertHiringJob` accepts `payload.id` and rewrites that
 * record with the caller as owner. Nothing checked that the caller owned it, so
 * anyone able to reach the endpoint could overwrite — and take ownership of —
 * any posting by guessing an id. That was survivable only because the route was
 * gated to business workspaces; it is not survivable now that individuals can
 * post, so the check lives here, applied to EVERY caller including the ones
 * that could already post.
 *
 * Ownership is whichever of the two existing fields matches:
 *   · `organizationId` — the workspace that owns it (business/client/member);
 *   · `createdByUserId` — the person who created it (individual posters).
 * Admins keep their existing moderation reach. Nothing is trusted from the
 * request body; the actor always comes from the session.
 */
export function userOwnsHiringJob(actor: User, job: HiringJobPosting): boolean {
  if (actor.role === 'admin') return true;
  if (job.createdByUserId && job.createdByUserId === actor.id) return true;
  return Boolean(job.organizationId) && job.organizationId === jobOwnerId(actor);
}

export type JobOwnershipResult =
  | { ok: true; job: HiringJobPosting }
  | { ok: false; status: 403 | 404; error: string };

/** Loads a job and confirms the actor may manage it. */
export async function assertCanManageHiringJob(
  actor: User,
  jobId: string,
): Promise<JobOwnershipResult> {
  const jobs = await getHiringJobs();
  const job = jobs.find((entry) => entry.id === jobId);
  /* A job the actor may not touch is reported as 403 rather than 404: the id
     came from them, so its existence is not a secret worth protecting, and a
     404 here would be misleading during debugging. */
  if (!job) return { ok: false, status: 404, error: 'Job not found.' };
  if (!userOwnsHiringJob(actor, job)) {
    return { ok: false, status: 403, error: 'You can only manage jobs you posted.' };
  }
  return { ok: true, job };
}

/** A positive, finite salary figure, or undefined. Never zero, never NaN. */
function normalizeSalary(value: unknown): number | undefined {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n);
}

const SALARY_PERIODS = new Set(['hour', 'day', 'week', 'month', 'year']);

/**
 * The compensation block, built only from values the payload actually stated.
 *
 * A min above a max is rejected rather than swapped: silently reordering
 * changes what the employer wrote, and a candidate would then read a range the
 * poster never entered. The pair is dropped and the poster is left to correct
 * it — the composer validates the same rule before it ever gets here.
 */
function salaryFields(payload: Partial<HiringJobPosting>): Partial<HiringJobPosting> {
  let salaryMin = normalizeSalary(payload.salaryMin);
  let salaryMax = normalizeSalary(payload.salaryMax);
  if (salaryMin !== undefined && salaryMax !== undefined && salaryMin > salaryMax) {
    salaryMin = undefined;
    salaryMax = undefined;
  }
  if (salaryMin === undefined && salaryMax === undefined) return {};

  const currency = String(payload.salaryCurrency ?? '').trim().toUpperCase();
  const period = String(payload.salaryPeriod ?? '').trim().toLowerCase();
  return {
    ...(salaryMin !== undefined ? { salaryMin } : {}),
    ...(salaryMax !== undefined ? { salaryMax } : {}),
    /* A currency is required to read a number as money, so it falls back to the
       marketplace's own default rather than rendering a bare figure. */
    salaryCurrency: /^[A-Z]{3}$/.test(currency) ? currency : 'INR',
    salaryPeriod: SALARY_PERIODS.has(period)
      ? (period as NonNullable<HiringJobPosting['salaryPeriod']>)
      : 'year',
  };
}

export async function upsertHiringJob(
  actor: User,
  payload: Partial<HiringJobPosting> & { title: string; description: string; minimumAtsScore: number },
) {
  const jobs = await getHiringJobs();
  const now = new Date().toISOString();
  const jobId = payload.id || `job-${Date.now()}`;

  /* EDITING: the caller must already own the record. Without this, passing an
     arbitrary `id` rewrote someone else's posting and transferred ownership to
     the caller. Throwing here covers every caller — the Hiring Desk and the
     marketplace composer alike — rather than trusting each route to remember. */
  const existing = payload.id ? jobs.find((entry) => entry.id === payload.id) : undefined;
  if (payload.id && !existing) throw new Error('Job not found.');
  if (existing && !userOwnsHiringJob(actor, existing)) {
    throw new Error('You can only manage jobs you posted.');
  }

  /* Ownership fields are always derived from the SESSION actor, never from the
     payload — and on an edit the original owner is preserved, so an admin
     moderating a posting cannot accidentally reassign it to themselves. */
  const ownerId = existing?.organizationId ?? jobOwnerId(actor);
  const ownerName = existing?.organizationName ?? jobOwnerName(actor);

  const nextJob: HiringJobPosting = {
    id: jobId,
    organizationId: ownerId,
    organizationName: ownerName,
    createdByUserId: existing?.createdByUserId ?? actor.id,
    createdByEmail: existing?.createdByEmail ?? actor.email,
    title: payload.title.trim(),
    department: payload.department?.trim() || undefined,
    location: payload.location?.trim() || undefined,
    employmentType: payload.employmentType || 'full_time',
    workMode: payload.workMode || 'hybrid',
    experienceLevel: payload.experienceLevel || 'associate',
    description: payload.description.trim(),
    responsibilities: Array.isArray(payload.responsibilities) ? payload.responsibilities.map((item) => item.trim()).filter(Boolean) : [],
    requirements: Array.isArray(payload.requirements) ? payload.requirements.map((item) => item.trim()).filter(Boolean) : [],
    preferredSkills: Array.isArray(payload.preferredSkills) ? payload.preferredSkills.map((item) => item.trim()).filter(Boolean) : [],
    targetRoleKeywords: Array.isArray(payload.targetRoleKeywords) ? payload.targetRoleKeywords.map((item) => item.trim()).filter(Boolean) : [],
    requiredDocuments: Array.isArray(payload.requiredDocuments)
      ? payload.requiredDocuments.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
      : [],
    minimumAtsScore: Math.max(0, Math.min(100, Math.round(Number(payload.minimumAtsScore) || 0))),
    /* COMPENSATION — optional, and absent stays absent.
       These four fields have existed on HiringJobPosting since the canonical
       job model landed, but nothing wrote them: this function builds the record
       from an explicit list, so a salary in the payload was silently dropped.
       They are read here so the composer's Compensation step actually persists.

       `normalizeSalary` returns undefined for anything that is not a real
       number, which is the whole point — a posting that did not state a salary
       must never be stored as ₹0, because a zero renders as a fact. On an edit,
       clearing the field clears the stored value rather than resurrecting the
       old one. */
    ...salaryFields(payload),
    status: payload.status || 'draft',
    shareUrl: `/jobs/${jobId}`,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  const nextJobs = payload.id
    ? jobs.map((job) => (job.id === payload.id ? nextJob : job))
    : [nextJob, ...jobs];

  await saveHiringJobs(nextJobs);
  return nextJob;
}

/**
 * Removes a job the actor owns, or takes it out of the feed.
 *
 * `unpublish` flips status to 'draft' so the posting survives for its owner and
 * its applications keep resolving; `delete` removes the record entirely. Both
 * go through the same ownership gate, and both write via saveHiringJobs so
 * every job cache is invalidated exactly as a create would.
 */
export async function removeHiringJob(
  actor: User,
  jobId: string,
  mode: 'unpublish' | 'delete',
): Promise<JobOwnershipResult> {
  const permission = await assertCanManageHiringJob(actor, jobId);
  if (!permission.ok) return permission;

  const jobs = await getHiringJobs();
  const next = mode === 'delete'
    ? jobs.filter((job) => job.id !== jobId)
    : jobs.map((job) => (
      job.id === jobId ? { ...job, status: 'draft' as const, updatedAt: new Date().toISOString() } : job
    ));

  await saveHiringJobs(next);
  return { ok: true, job: permission.job };
}

export async function getVisibleHiringJobsForUser(user: User) {
  const jobs = await getHiringJobs();
  if (user.role === 'admin') return jobs;
  if (user.accountType === 'business' || user.role === 'client' || user.role === 'member') {
    return jobs.filter((job) => job.organizationId === jobOwnerId(user));
  }
  /* An individual sees every published job PLUS their own, whatever its status —
     otherwise someone who posted a draft could never find it again. Only their
     own unpublished rows are added; nobody else's drafts become visible. */
  return jobs.filter((job) => job.status === 'published' || job.createdByUserId === user.id);
}

/** Just the jobs this user posted — what a "My Jobs" surface lists. */
export async function getHiringJobsPostedByUser(user: User) {
  const jobs = await getHiringJobs();
  return jobs.filter((job) => userOwnsHiringJob(user, job) && job.createdByUserId === user.id);
}

/** Business Page ids the user owns — used to authorize access to applications on their page jobs. */
async function ownedBusinessPageIds(userId: string): Promise<Set<string>> {
  try {
    const pages = await getBusinessPagesByOwner(userId);
    return new Set(pages.map((page) => page.id));
  } catch {
    return new Set();
  }
}

export async function getVisibleHiringApplicationsForUser(user: User) {
  const applications = await getHiringApplications();
  if (user.role === 'admin') return applications;
  if (user.accountType === 'business' || user.role === 'client' || user.role === 'member') {
    const ownerId = jobOwnerId(user);
    const pageIds = await ownedBusinessPageIds(user.id);
    // Apps on the workspace's own hiring jobs (organizationId === ownerId)
    // OR apps on a Business Page the user owns (organizationId === that page id).
    return applications.filter(
      (application) => application.organizationId === ownerId || pageIds.has(application.organizationId),
    );
  }
  /* An individual sees the applications they submitted AND the applications
     made to jobs they posted — otherwise posting a job would give them no way
     to read its responses. Scoped by the jobs they actually own, so no other
     poster's applications are exposed. */
  const myJobIds = new Set(
    (await getHiringJobs())
      .filter((job) => job.createdByUserId === user.id)
      .map((job) => job.id),
  );
  return applications.filter(
    (application) => application.candidateUserId === user.id || myJobIds.has(application.jobId),
  );
}

/** True when the user is authorized to review/act on a specific application (own hiring job or own page job). */
export async function canUserManageApplication(user: User, application: HiringJobApplication): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (application.organizationId === jobOwnerId(user)) return true;
  const pageIds = await ownedBusinessPageIds(user.id);
  return pageIds.has(application.organizationId);
}

export async function createHiringApplication(payload: HiringJobApplication) {
  const applications = await getHiringApplications();
  const exists = applications.find((entry) => entry.jobId === payload.jobId && entry.candidateUserId === payload.candidateUserId);
  if (exists) {
    throw new Error('You have already applied to this job.');
  }
  const next = [payload, ...applications];
  await saveHiringApplications(next);
  return payload;
}

export async function updateHiringApplicationStatus(applicationId: string, status: HiringJobApplication['status']) {
  const applications = await getHiringApplications();
  const now = new Date().toISOString();
  const next = applications.map((application) => application.id === applicationId ? { ...application, status, updatedAt: now } : application);
  await saveHiringApplications(next);
  return next.find((application) => application.id === applicationId) || null;
}

/**
 * Every organization id this user acts for.
 *
 * Their own workspace owner id plus any Business Page they own. Exported for
 * the Phase 9 APIs so authorization is derived from ONE place — a route that
 * built this list itself would eventually build it differently from
 * `canUserManageApplication`, and the two would disagree about who may read a
 * candidate's resume.
 */
export async function viewerOrganizationIds(user: User): Promise<string[]> {
  const ids = new Set<string>([jobOwnerId(user)]);
  (await ownedBusinessPageIds(user.id)).forEach((id) => ids.add(id));
  return Array.from(ids);
}
