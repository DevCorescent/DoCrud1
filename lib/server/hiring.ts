import { HiringJobApplication, HiringJobPosting, User } from '@/types/document';
import { hiringApplicationsPath, hiringJobsPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import { getAllPublishedBusinessJobs, getBusinessPagesByOwner } from '@/lib/server/business-pages';
import {
  selectPublishedJobCompanyNames, selectPublishedJobListRows, selectPublishedJobRowById,
} from '@/lib/server/db/hiring-jobs-rows';
import {
  countPublishedJobs, mirrorPublishedJobs, selectPublishedCompanyNames,
  selectPublishedJobDocById, selectPublishedJobListDocs,
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
type PublishedCache = { value: HiringJobPosting[]; ts: number };
const PUBLISHED_TTL = 15_000;
let publishedCache: PublishedCache | null = null;
/* Concurrent callers during a cold read share ONE read instead of each firing
   their own 2.7 MB fetch — the same coalescing the app_state reader uses. */
let publishedInFlight: Promise<HiringJobPosting[]> | null = null;

/** Called by every write path so the next read rebuilds from storage. */
export function invalidatePublishedHiringJobs() {
  publishedCache = null;
  publishedInFlight = null;
  listCache = null;
  namesCache = null;
}

/** The full list IF it is already cached. Never reads storage. */
function peekPublishedHiringJobs(): HiringJobPosting[] | null {
  return publishedCache && Date.now() - publishedCache.ts < PUBLISHED_TTL ? publishedCache.value : null;
}

async function readPublishedHiringJobs(): Promise<HiringJobPosting[]> {
  // The two stores are independent; they were being awaited one after the other.
  const [jobs, business] = await Promise.all([
    getHiringJobs(),
    getPublishedBusinessFeedJobs(),
  ]);
  // Single source of truth per record: hiring jobs from the hiring store,
  // business jobs projected from the business-pages store. Merged only here.
  return [...jobs.filter((job) => job.status === 'published'), ...business];
}

export async function getPublishedHiringJobs(): Promise<HiringJobPosting[]> {
  if (publishedCache && Date.now() - publishedCache.ts < PUBLISHED_TTL) {
    return publishedCache.value;
  }
  if (publishedInFlight) return publishedInFlight;

  publishedInFlight = readPublishedHiringJobs()
    .then((value) => {
      publishedCache = { value, ts: Date.now() };
      publishedInFlight = null;
      return value;
    })
    .catch((error) => {
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
  if (listCache && Date.now() - listCache.ts < PUBLISHED_TTL) return listCache.value;

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
  if (namesCache && Date.now() - namesCache.ts < PUBLISHED_TTL) return namesCache.value;

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
  // published cache can go stale — and the one place it is cleared.
  invalidatePublishedHiringJobs();
}

export async function getHiringApplications() {
  return readJsonFile<HiringJobApplication[]>(hiringApplicationsPath, []);
}

export async function saveHiringApplications(applications: HiringJobApplication[]) {
  await writeJsonFile(hiringApplicationsPath, applications);
}

export async function upsertHiringJob(
  actor: User,
  payload: Partial<HiringJobPosting> & { title: string; description: string; minimumAtsScore: number },
) {
  const jobs = await getHiringJobs();
  const now = new Date().toISOString();
  const ownerId = jobOwnerId(actor);
  const ownerName = jobOwnerName(actor);
  const jobId = payload.id || `job-${Date.now()}`;

  const nextJob: HiringJobPosting = {
    id: jobId,
    organizationId: ownerId,
    organizationName: ownerName,
    createdByUserId: actor.id,
    createdByEmail: actor.email,
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
    status: payload.status || 'draft',
    shareUrl: `/jobs/${jobId}`,
    createdAt: payload.id ? jobs.find((entry) => entry.id === payload.id)?.createdAt || now : now,
    updatedAt: now,
  };

  const nextJobs = payload.id
    ? jobs.map((job) => (job.id === payload.id ? nextJob : job))
    : [nextJob, ...jobs];

  await saveHiringJobs(nextJobs);
  return nextJob;
}

export async function getVisibleHiringJobsForUser(user: User) {
  const jobs = await getHiringJobs();
  if (user.role === 'admin') return jobs;
  if (user.accountType === 'business' || user.role === 'client' || user.role === 'member') {
    return jobs.filter((job) => job.organizationId === jobOwnerId(user));
  }
  return jobs.filter((job) => job.status === 'published');
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
  return applications.filter((application) => application.candidateUserId === user.id);
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
