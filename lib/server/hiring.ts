import { HiringJobApplication, HiringJobPosting, User } from '@/types/document';
import { hiringApplicationsPath, hiringJobsPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import { getAllPublishedBusinessJobs, getBusinessPagesByOwner } from '@/lib/server/business-pages';

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

export async function getPublishedHiringJobs() {
  const jobs = await getHiringJobs();
  const hiring = jobs.filter((job) => job.status === 'published');
  const business = await getPublishedBusinessFeedJobs();
  // Single source of truth per record: hiring jobs from the hiring store,
  // business jobs projected from the business-pages store. Merged only here.
  return [...hiring, ...business];
}

export async function getPublishedHiringJobById(id: string) {
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

export async function saveHiringJobs(jobs: HiringJobPosting[]) {
  await writeJsonFile(hiringJobsPath, jobs);
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
