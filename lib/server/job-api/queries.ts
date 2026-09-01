/**
 * Phase 9 — the query layer behind the job APIs.
 *
 * PURE FUNCTIONS OVER SUPPLIED DATA. Nothing here reads a database, opens a
 * session or touches the network; the route handlers fetch and persist. That
 * is what lets pagination, ranking, filtering and — most importantly — the
 * authorization rules be tested exhaustively without a Mongo instance.
 *
 * NOTHING HERE RECOMPUTES A SCORE. Applicant ranking reads the ATS score the
 * Phase 6 engine produced; job classification comes from Phase 4; active/expired
 * comes from Phase 8's `isJobActive`. A second implementation of any of those
 * would drift from the first within a release.
 */
import type { HiringJobPosting, HiringJobApplication } from '@/types/document';
import { isJobActive } from '@/lib/server/job-sources/lifecycle';
import { STATUS_API_NAME, statusCounts, type ApplicationStatus } from './status';

/* ── Pagination ───────────────────────────────────────────────────────────*/

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Slice a list into a page.
 *
 * The size is CLAMPED, not trusted: `?pageSize=100000` on a job with 200
 * applicants is the request that turns a listing endpoint into a memory
 * problem. Page numbers are 1-based to match the shape the API returns.
 */
export function paginate<T>(all: readonly T[], page?: unknown, pageSize?: unknown): Page<T> {
  const size = Math.max(1, Math.min(MAX_PAGE_SIZE, Number(pageSize) || DEFAULT_PAGE_SIZE));
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const start = (p - 1) * size;
  return { items: all.slice(start, start + size), page: p, pageSize: size, total: all.length };
}

const lower = (v: unknown): string => String(v ?? '').trim().toLowerCase();

/* ── Employer: posted jobs ────────────────────────────────────────────────*/

export interface EmployerJobRow {
  id: string;
  title: string;
  organizationName: string;
  location?: string;
  workMode?: string;
  employmentType?: string;
  status: string;
  isActive: boolean;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  applicantCount: number;
  /** Per-status counts, keyed by the API's status names. */
  counts: Record<string, number>;
}

export type EmployerJobSort = 'newest' | 'oldest' | 'applicants' | 'status' | 'updated';

export interface EmployerJobQuery {
  search?: string;
  status?: string;
  /** 'active' | 'closed' | undefined for both. */
  state?: string;
  sort?: EmployerJobSort;
  page?: unknown;
  pageSize?: unknown;
}

/**
 * The jobs this employer owns, with application counts.
 *
 * `ownedJobs` is supplied ALREADY SCOPED by the caller using the repository's
 * existing ownership helper — this function never decides who owns what, so
 * it cannot accidentally widen access.
 *
 * Counting is done from ONE pass over the applications rather than a query per
 * job: 60 jobs would otherwise mean 60 round trips for a single page.
 */
export function employerJobs(
  ownedJobs: readonly HiringJobPosting[],
  applications: readonly HiringJobApplication[],
  query: EmployerJobQuery = {},
): Page<EmployerJobRow> {
  const byJob = new Map<string, HiringJobApplication[]>();
  for (const a of applications) {
    if (!a?.jobId) continue;
    const list = byJob.get(a.jobId);
    if (list) list.push(a); else byJob.set(a.jobId, [a]);
  }

  let rows: EmployerJobRow[] = ownedJobs.map((job) => {
    const apps = byJob.get(job.id) ?? [];
    const counts = statusCounts(apps);
    return {
      id: job.id,
      title: job.title,
      organizationName: job.organizationName,
      location: job.location,
      workMode: job.workMode,
      employmentType: job.employmentType,
      status: job.status,
      isActive: isJobActive(job),
      expiresAt: job.expiresAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      applicantCount: apps.length,
      counts: Object.fromEntries(
        (Object.keys(counts) as ApplicationStatus[]).map((s) => [STATUS_API_NAME[s], counts[s]]),
      ),
    };
  });

  const search = lower(query.search);
  if (search) {
    rows = rows.filter((r) => lower(r.title).includes(search)
      || lower(r.organizationName).includes(search)
      || lower(r.location).includes(search));
  }
  if (query.status) rows = rows.filter((r) => lower(r.status) === lower(query.status));
  if (query.state === 'active') rows = rows.filter((r) => r.isActive);
  if (query.state === 'closed') rows = rows.filter((r) => !r.isActive);

  /* Every sort ends with an id tie-break, so a page boundary can never show
     the same job twice or skip one when two rows compare equal. */
  const byId = (a: EmployerJobRow, b: EmployerJobRow) => a.id.localeCompare(b.id);
  const sorters: Record<EmployerJobSort, (a: EmployerJobRow, b: EmployerJobRow) => number> = {
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt) || byId(a, b),
    oldest: (a, b) => a.createdAt.localeCompare(b.createdAt) || byId(a, b),
    applicants: (a, b) => b.applicantCount - a.applicantCount || byId(a, b),
    status: (a, b) => a.status.localeCompare(b.status) || byId(a, b),
    updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt) || byId(a, b),
  };
  rows.sort(sorters[query.sort ?? 'newest'] ?? sorters.newest);

  return paginate(rows, query.page, query.pageSize);
}

/* ── Employer: applicants ─────────────────────────────────────────────────*/

export interface ApplicantRow {
  applicationId: string;
  candidateUserId: string;
  candidateName: string;
  /** Present only where the existing privacy rules already expose it. */
  candidateEmail?: string;
  headline?: string;
  location?: string;
  skills?: string[];
  atsScore: number;
  atsBand?: string;
  status: string;
  appliedAt: string;
  updatedAt: string;
  /** True when a resume is attached — never the URL itself. */
  hasResume: boolean;
  resumeFileName?: string;
}

export interface ApplicantQuery {
  search?: string;
  status?: string;
  minAts?: unknown;
  maxAts?: unknown;
  sort?: 'ats' | 'newest' | 'oldest' | 'name';
  page?: unknown;
  pageSize?: unknown;
}

/**
 * Rank and page a job's applicants.
 *
 * DEFAULT ORDER IS ATS DESC, THEN CANDIDATE ID ASC. The tie-break is the
 * point: two candidates on 93 must appear in the same order on every request,
 * or paging through 200 applicants silently repeats and skips people.
 * Insertion order is never relied on.
 *
 * The ATS score is READ from the stored application (Phase 6 produced it at
 * submit time); it is never recomputed here. Recomputing per request would be
 * both slow and capable of disagreeing with what the candidate was told.
 *
 * NO RESUME IS FETCHED. The row carries `hasResume` and a filename, never a
 * URL or file contents — a 200-applicant listing must not touch storage.
 */
export function rankApplicants(
  applications: readonly HiringJobApplication[],
  query: ApplicantQuery = {},
  profiles?: ReadonlyMap<string, { headline?: string; location?: string; skills?: string[] }>,
): Page<ApplicantRow> {
  let rows: ApplicantRow[] = applications.map((a) => {
    const profile = profiles?.get(a.candidateUserId);
    return {
      applicationId: a.id,
      candidateUserId: a.candidateUserId,
      candidateName: a.candidateName,
      candidateEmail: a.candidateEmail,
      headline: profile?.headline,
      location: profile?.location,
      skills: profile?.skills,
      atsScore: Number.isFinite(a.atsScore) ? a.atsScore : 0,
      status: STATUS_API_NAME[a.status] ?? a.status,
      appliedAt: a.appliedAt,
      updatedAt: a.updatedAt,
      hasResume: Boolean(a.resumeRef?.url || a.resumeFileName || a.resumeText),
      resumeFileName: a.resumeRef?.fileName ?? a.resumeFileName,
    };
  });

  const search = lower(query.search);
  if (search) {
    rows = rows.filter((r) => lower(r.candidateName).includes(search)
      || lower(r.headline).includes(search)
      || (r.skills ?? []).some((s) => lower(s).includes(search)));
  }
  if (query.status) {
    const want = lower(query.status);
    rows = rows.filter((r) => lower(r.status) === want);
  }
  const min = Number(query.minAts);
  if (Number.isFinite(min)) rows = rows.filter((r) => r.atsScore >= min);
  const max = Number(query.maxAts);
  if (Number.isFinite(max)) rows = rows.filter((r) => r.atsScore <= max);

  const byCandidate = (a: ApplicantRow, b: ApplicantRow) =>
    a.candidateUserId.localeCompare(b.candidateUserId);
  const sorters = {
    ats: (a: ApplicantRow, b: ApplicantRow) => b.atsScore - a.atsScore || byCandidate(a, b),
    newest: (a: ApplicantRow, b: ApplicantRow) => b.appliedAt.localeCompare(a.appliedAt) || byCandidate(a, b),
    oldest: (a: ApplicantRow, b: ApplicantRow) => a.appliedAt.localeCompare(b.appliedAt) || byCandidate(a, b),
    name: (a: ApplicantRow, b: ApplicantRow) => a.candidateName.localeCompare(b.candidateName) || byCandidate(a, b),
  };
  rows.sort(sorters[query.sort ?? 'ats'] ?? sorters.ats);

  return paginate(rows, query.page, query.pageSize);
}

/* ── Candidate: my applications ───────────────────────────────────────────*/

export interface CandidateApplicationRow {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  organizationName: string;
  location?: string;
  status: string;
  appliedAt: string;
  updatedAt: string;
  atsScore: number;
  /** Oldest first, as recorded. Absent history is an empty list, not null. */
  statusHistory: Array<{ from: string | null; to: string; changedAt: string }>;
}

export interface CandidateQuery {
  status?: string;
  since?: string;
  sort?: 'newest' | 'oldest' | 'updated';
  page?: unknown;
  pageSize?: unknown;
}

/**
 * One candidate's applications.
 *
 * `applications` MUST already be scoped to this candidate by the caller. As a
 * defence in depth the candidate id is passed and re-filtered here, so a
 * caller that forgets cannot leak another person's applications through this
 * function.
 *
 * The ATS score is exposed as a MATCH SCORE only. Nothing here converts it
 * into a probability of being hired, and no such field is returned.
 */
export function candidateApplications(
  applications: readonly HiringJobApplication[],
  candidateUserId: string,
  query: CandidateQuery = {},
): Page<CandidateApplicationRow> {
  let rows: CandidateApplicationRow[] = applications
    .filter((a) => a?.candidateUserId === candidateUserId)
    .map((a) => ({
      applicationId: a.id,
      jobId: a.jobId,
      jobTitle: a.jobTitle,
      organizationName: a.organizationName,
      status: STATUS_API_NAME[a.status] ?? a.status,
      appliedAt: a.appliedAt,
      updatedAt: a.updatedAt,
      atsScore: Number.isFinite(a.atsScore) ? a.atsScore : 0,
      statusHistory: (a.statusHistory ?? []).map((h) => ({
        from: h.from ? (STATUS_API_NAME[h.from] ?? h.from) : null,
        to: STATUS_API_NAME[h.to] ?? h.to,
        changedAt: h.changedAt,
      })),
    }));

  if (query.status) {
    const want = lower(query.status);
    rows = rows.filter((r) => lower(r.status) === want);
  }
  if (query.since) {
    const since = Date.parse(String(query.since));
    if (Number.isFinite(since)) {
      rows = rows.filter((r) => Date.parse(r.appliedAt) >= since);
    }
  }

  const byId = (a: CandidateApplicationRow, b: CandidateApplicationRow) =>
    a.applicationId.localeCompare(b.applicationId);
  const sorters = {
    newest: (a: CandidateApplicationRow, b: CandidateApplicationRow) => b.appliedAt.localeCompare(a.appliedAt) || byId(a, b),
    oldest: (a: CandidateApplicationRow, b: CandidateApplicationRow) => a.appliedAt.localeCompare(b.appliedAt) || byId(a, b),
    updated: (a: CandidateApplicationRow, b: CandidateApplicationRow) => b.updatedAt.localeCompare(a.updatedAt) || byId(a, b),
  };
  rows.sort(sorters[query.sort ?? 'newest'] ?? sorters.newest);

  return paginate(rows, query.page, query.pageSize);
}

/* ── Public discovery ─────────────────────────────────────────────────────*/

export interface PublicJobQuery {
  search?: string;
  country?: string;
  state?: string;
  city?: string;
  domain?: string;
  subDomain?: string;
  workMode?: string;
  employmentType?: string;
  experienceLevel?: string;
  minSalary?: unknown;
  sort?: 'newest' | 'relevance' | 'salary';
  page?: unknown;
  pageSize?: unknown;
}

/**
 * The public job feed.
 *
 * EXPIRED AND CLOSED POSTINGS ARE EXCLUDED FIRST, using Phase 8's single
 * definition of active — so a job that lapsed cannot reappear in search
 * because a filter happened not to exclude it.
 *
 * Only fields a candidate may see are returned; ingestion metadata
 * (`contentHash`, `sourceJobId`, `dedupGroupId`, ATS cutoffs, owner ids) is
 * omitted rather than filtered out downstream.
 */
export function publicJobs(
  jobs: readonly HiringJobPosting[],
  query: PublicJobQuery = {},
): Page<Record<string, unknown>> {
  let rows = jobs.filter(isJobActive);

  const search = lower(query.search);
  if (search) {
    rows = rows.filter((j) => lower(j.title).includes(search)
      || lower(j.organizationName).includes(search)
      || lower(j.description).includes(search)
      || (j.preferredSkills ?? []).some((s) => lower(s).includes(search)));
  }

  const eq = (value: unknown, want: string | undefined) =>
    !want || lower(value) === lower(want);
  rows = rows.filter((j) => eq(j.country, query.country)
    && eq(j.state, query.state)
    && eq(j.domain, query.domain)
    && eq(j.subDomain, query.subDomain)
    && eq(j.workMode, query.workMode)
    && eq(j.employmentType, query.employmentType)
    && eq(j.experienceLevel, query.experienceLevel));

  /* City matches the RAW location too, so a multi-location posting is still
     findable by each of its cities — `job.city` is deliberately absent on
     those (Phase 4). */
  if (query.city) {
    const want = lower(query.city);
    rows = rows.filter((j) => lower(j.city) === want || lower(j.location).includes(want));
  }

  const minSalary = Number(query.minSalary);
  if (Number.isFinite(minSalary) && minSalary > 0) {
    /* A posting that states NO salary is kept, not dropped: absence is not
       evidence that it pays less than the filter. */
    rows = rows.filter((j) => {
      const ceiling = j.salaryMax ?? j.salaryMin;
      return ceiling === undefined || ceiling >= minSalary;
    });
  }

  const byId = (a: HiringJobPosting, b: HiringJobPosting) => a.id.localeCompare(b.id);
  const sorters = {
    newest: (a: HiringJobPosting, b: HiringJobPosting) =>
      String(b.postedAt ?? b.createdAt).localeCompare(String(a.postedAt ?? a.createdAt)) || byId(a, b),
    relevance: (a: HiringJobPosting, b: HiringJobPosting) =>
      (b.domainConfidence ?? 0) - (a.domainConfidence ?? 0) || byId(a, b),
    salary: (a: HiringJobPosting, b: HiringJobPosting) =>
      (b.salaryMax ?? b.salaryMin ?? 0) - (a.salaryMax ?? a.salaryMin ?? 0) || byId(a, b),
  };
  const sorted = [...rows].sort(sorters[query.sort ?? 'newest'] ?? sorters.newest);

  return paginate(sorted.map(publicJobView), query.page, query.pageSize);
}

/**
 * One posting, as the public may see it.
 *
 * An explicit ALLOW-list. A spread-then-delete would silently publish any
 * field a later phase adds to the model — including the next ingestion or
 * scoring field nobody remembered to exclude.
 */
export function publicJobView(job: HiringJobPosting): Record<string, unknown> {
  return {
    id: job.id,
    title: job.title,
    organizationName: job.organizationName,
    location: job.location,
    city: job.city,
    state: job.state,
    country: job.country,
    isIndia: job.isIndia,
    workMode: job.workMode,
    employmentType: job.employmentType,
    experienceLevel: job.experienceLevel,
    department: job.department,
    description: job.description,
    responsibilities: job.responsibilities,
    requirements: job.requirements,
    preferredSkills: job.preferredSkills,
    domain: job.domain,
    subDomain: job.subDomain,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    salaryPeriod: job.salaryPeriod,
    postedAt: job.postedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    applyUrl: job.applyUrl,
    shareUrl: job.shareUrl,
    /* Deliberately omitted: contentHash, sourceId, sourceJobId, canonicalUrl,
       dedupGroupId, ingestedAt, lastSeenAt, minimumAtsScore, organizationId,
       createdByUserId, createdByEmail, classificationVersion. */
  };
}

/* ── Employer job editing ─────────────────────────────────────────────────*/

/**
 * Fields an employer may edit.
 *
 * An allow-list, so a request body can never reach ownership, provenance or
 * scoring. Everything absent from this list is ignored rather than rejected,
 * which keeps a client that sends extra fields working.
 */
export const EMPLOYER_EDITABLE = [
  'title', 'department', 'location', 'employmentType', 'workMode', 'experienceLevel',
  'description', 'responsibilities', 'requirements', 'preferredSkills',
  'requiredDocuments', 'minimumAtsScore', 'status',
  'salaryMin', 'salaryMax', 'salaryCurrency', 'salaryPeriod',
] as const;

/** Fields no request may ever set, whatever it claims. */
export const NEVER_EDITABLE = [
  'id', 'organizationId', 'organizationName', 'createdByUserId', 'createdByEmail',
  'createdAt', 'source', 'sourceId', 'sourceJobId', 'sourceUrl', 'canonicalUrl',
  'contentHash', 'dedupGroupId', 'ingestedAt', 'lastSeenAt', 'shareUrl',
] as const;

/** The patch an employer's request is allowed to become. */
export function employerJobPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of EMPLOYER_EDITABLE) {
    if (key in body && body[key] !== undefined) patch[key] = body[key];
  }
  return patch;
}
