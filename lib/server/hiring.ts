import { HiringJobApplication, HiringJobPosting, User } from '@/types/document';
import { hiringApplicationsPath, hiringJobsPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';

function jobOwnerId(user: User) {
  if (user.role === 'client') return user.id;
  if (user.role === 'member' && user.organizationId) return user.organizationId;
  return user.id;
}

function jobOwnerName(user: User) {
  return user.organizationName || user.name || 'Business Workspace';
}

export async function getHiringJobs() {
  return readJsonFile<HiringJobPosting[]>(hiringJobsPath, []);
}

export async function getPublishedHiringJobs() {
  const jobs = await getHiringJobs();
  return jobs.filter((job) => job.status === 'published');
}

export async function getPublishedHiringJobById(id: string) {
  const jobs = await getPublishedHiringJobs();
  return jobs.find((job) => job.id === id) || null;
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

export async function getVisibleHiringApplicationsForUser(user: User) {
  const applications = await getHiringApplications();
  if (user.role === 'admin') return applications;
  if (user.accountType === 'business' || user.role === 'client' || user.role === 'member') {
    return applications.filter((application) => application.organizationId === jobOwnerId(user));
  }
  return applications.filter((application) => application.candidateUserId === user.id);
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
