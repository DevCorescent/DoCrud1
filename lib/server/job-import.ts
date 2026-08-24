/**
 * Super Admin bulk job import.
 *
 * Turns scraper-produced CSV into native `HiringJobPosting` records that flow
 * through the EXISTING Main Jobs Feed. No new job model, no schema change: the
 * client supplies job CONTENT only; every ownership/system field is assigned
 * server-side here. Imported valid rows are published so they appear in the feed.
 *
 * Storage note: hiring jobs are persisted as a single JSON blob
 * (getHiringJobs/saveHiringJobs), so a commit performs ONE read + ONE write for
 * the whole batch — never one write per row.
 */
import { randomUUID } from 'crypto';
import { HiringJobPosting } from '@/types/document';
import { getHiringJobs, saveHiringJobs } from '@/lib/server/hiring';
import { parseCsv } from '@/lib/server/csv';

// Enums are the source of truth from HiringJobPosting (types/document.ts).
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'freelance'] as const;
export const WORK_MODES = ['remote', 'hybrid', 'onsite'] as const;
export const EXPERIENCE_LEVELS = ['entry', 'associate', 'mid', 'senior', 'lead'] as const;

const DEFAULT_EMPLOYMENT: HiringJobPosting['employmentType'] = 'full_time';
const DEFAULT_WORK_MODE: HiringJobPosting['workMode'] = 'hybrid';
const DEFAULT_EXPERIENCE: HiringJobPosting['experienceLevel'] = 'associate';

// Reasonable ceilings — generous enough for real scraper batches, low enough to
// bound memory/abuse. Not tunable by the client.
export const LIMITS = {
  maxRows: 5000,
  title: 300,
  organizationName: 300,
  location: 300,
  department: 200,
  description: 20000,
  arrayItems: 50,
  arrayItemLen: 300,
  applyUrl: 2000,
};

// The exact scraper CSV contract.
export const CSV_HEADER = [
  'title', 'organizationName', 'location', 'department', 'employmentType',
  'workMode', 'experienceLevel', 'description', 'responsibilities',
  'requirements', 'preferredSkills', 'targetRoleKeywords', 'applyUrl',
] as const;

export interface RowError { row: number; errors: string[] }
export interface RowDuplicate { row: number; reason: string; fingerprint: string }
export interface ImportSummary {
  totalRows: number;
  valid: number;
  invalid: number;
  duplicates: number;
  imported: number;              // rows actually written (commit only; 0 on preview)
  committed: boolean;
  invalidRows: RowError[];
  duplicateRows: RowDuplicate[];
  preview: Array<{ title: string; organizationName: string; location: string; employmentType: string; workMode: string; experienceLevel: string }>;
}

/** Server-assigned identity for scraped jobs. Configurable via env; safe non-secret defaults. */
function scraperIdentity(adminEmail: string) {
  return {
    organizationId: process.env.SCRAPER_ORG_ID || 'scraper-import',
    createdByUserId: process.env.SCRAPER_USER_ID || 'scraper-system',
    createdByEmail: (process.env.SCRAPER_USER_EMAIL || adminEmail || 'scraper@system.docrud').toLowerCase(),
  };
}

/** Deterministic dedup key: normalized company + title + location. */
export function jobFingerprint(organizationName: string, title: string, location: string): string {
  const norm = (v: string) => (v || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return `${norm(organizationName)}::${norm(title)}::${norm(location)}`;
}

function splitArray(raw: string): { values: string[]; error?: string } {
  if (!raw || !raw.trim()) return { values: [] };
  const values = raw.split('|').map((s) => s.trim()).filter(Boolean);
  if (values.length > LIMITS.arrayItems) return { values, error: `exceeds ${LIMITS.arrayItems} items` };
  const tooLong = values.find((v) => v.length > LIMITS.arrayItemLen);
  if (tooLong) return { values, error: `an item exceeds ${LIMITS.arrayItemLen} chars` };
  return { values };
}

/**
 * Parse + validate a CSV. When `commit` is true and there is at least one valid
 * row, the valid rows are appended to the hiring store in a single write.
 * `adminEmail` (from the Super Admin session) is recorded as createdByEmail.
 */
export async function importJobsFromCsv(
  csvText: string,
  opts: { commit: boolean; adminEmail: string },
): Promise<ImportSummary> {
  const rows = parseCsv(csvText || '');
  if (rows.length === 0) {
    throw new Error('CSV is empty.');
  }

  // Header — must contain title/description/organizationName at minimum.
  const header = rows[0].map((h) => h.trim());
  const idx: Record<string, number> = {};
  header.forEach((h, i) => { if (!(h in idx)) idx[h] = i; });
  for (const required of ['title', 'description', 'organizationName']) {
    if (!(required in idx)) throw new Error(`CSV header is missing required column "${required}".`);
  }

  const dataRows = rows.slice(1);
  if (dataRows.length > LIMITS.maxRows) {
    throw new Error(`Too many rows: ${dataRows.length}. Maximum is ${LIMITS.maxRows} per import.`);
  }

  const identity = scraperIdentity(opts.adminEmail);
  const now = new Date().toISOString();

  // Existing fingerprints (any status) so re-imports are skipped.
  const existing = await getHiringJobs();
  const seen = new Set<string>(existing.map((j) => jobFingerprint(j.organizationName, j.title, j.location || '')));

  const invalidRows: RowError[] = [];
  const duplicateRows: RowDuplicate[] = [];
  const valid: HiringJobPosting[] = [];

  const cell = (r: string[], name: string) => (idx[name] !== undefined ? (r[idx[name]] ?? '').trim() : '');

  dataRows.forEach((r, i) => {
    const rowNum = i + 2; // 1-based + header
    const errors: string[] = [];

    const title = cell(r, 'title');
    const organizationName = cell(r, 'organizationName');
    const description = cell(r, 'description');
    const location = cell(r, 'location');
    const department = cell(r, 'department');
    const employmentRaw = cell(r, 'employmentType').toLowerCase();
    const workModeRaw = cell(r, 'workMode').toLowerCase();
    const experienceRaw = cell(r, 'experienceLevel').toLowerCase();
    const applyUrl = cell(r, 'applyUrl');

    if (!title) errors.push('title is required');
    else if (title.length > LIMITS.title) errors.push(`title exceeds ${LIMITS.title} chars`);
    if (!organizationName) errors.push('organizationName is required');
    else if (organizationName.length > LIMITS.organizationName) errors.push(`organizationName exceeds ${LIMITS.organizationName} chars`);
    if (!description) errors.push('description is required');
    else if (description.length > LIMITS.description) errors.push(`description exceeds ${LIMITS.description} chars`);
    if (location.length > LIMITS.location) errors.push(`location exceeds ${LIMITS.location} chars`);
    if (department.length > LIMITS.department) errors.push(`department exceeds ${LIMITS.department} chars`);

    const employmentType = employmentRaw
      ? (EMPLOYMENT_TYPES.includes(employmentRaw as never) ? employmentRaw as HiringJobPosting['employmentType'] : (errors.push(`employmentType "${employmentRaw}" is invalid`), undefined))
      : DEFAULT_EMPLOYMENT;
    const workMode = workModeRaw
      ? (WORK_MODES.includes(workModeRaw as never) ? workModeRaw as HiringJobPosting['workMode'] : (errors.push(`workMode "${workModeRaw}" is invalid`), undefined))
      : DEFAULT_WORK_MODE;
    const experienceLevel = experienceRaw
      ? (EXPERIENCE_LEVELS.includes(experienceRaw as never) ? experienceRaw as HiringJobPosting['experienceLevel'] : (errors.push(`experienceLevel "${experienceRaw}" is invalid`), undefined))
      : DEFAULT_EXPERIENCE;

    const responsibilities = splitArray(cell(r, 'responsibilities'));
    const requirements = splitArray(cell(r, 'requirements'));
    const preferredSkills = splitArray(cell(r, 'preferredSkills'));
    const targetRoleKeywords = splitArray(cell(r, 'targetRoleKeywords'));
    for (const [name, res] of [['responsibilities', responsibilities], ['requirements', requirements], ['preferredSkills', preferredSkills], ['targetRoleKeywords', targetRoleKeywords]] as const) {
      if (res.error) errors.push(`${name} ${res.error}`);
    }

    let safeApplyUrl: string | undefined;
    if (applyUrl) {
      if (applyUrl.length > LIMITS.applyUrl) errors.push(`applyUrl exceeds ${LIMITS.applyUrl} chars`);
      else if (!/^https?:\/\/\S+$/i.test(applyUrl)) errors.push('applyUrl must be a valid http(s) URL');
      else safeApplyUrl = applyUrl;
    }

    if (errors.length > 0) { invalidRows.push({ row: rowNum, errors }); return; }

    const fp = jobFingerprint(organizationName, title, location);
    if (seen.has(fp)) { duplicateRows.push({ row: rowNum, reason: 'duplicate of an existing or already-imported job', fingerprint: fp }); return; }
    seen.add(fp);

    const id = `job-${randomUUID()}`;
    valid.push({
      id,
      organizationId: identity.organizationId,
      organizationName,
      createdByUserId: identity.createdByUserId,
      createdByEmail: identity.createdByEmail,
      title,
      department: department || undefined,
      location: location || undefined,
      employmentType,
      workMode,
      experienceLevel,
      description,
      responsibilities: responsibilities.values,
      requirements: requirements.values,
      preferredSkills: preferredSkills.values,
      targetRoleKeywords: targetRoleKeywords.values,
      minimumAtsScore: 0,
      status: 'published',
      shareUrl: `/jobs/${id}`,
      createdAt: now,
      updatedAt: now,
      source: 'scraper',
      applyUrl: safeApplyUrl,
    });
  });

  let imported = 0;
  if (opts.commit && valid.length > 0) {
    // Single bulk write for the whole batch.
    const current = await getHiringJobs();
    await saveHiringJobs([...valid, ...current]);
    imported = valid.length;
  }

  return {
    totalRows: dataRows.length,
    valid: valid.length,
    invalid: invalidRows.length,
    duplicates: duplicateRows.length,
    imported,
    committed: Boolean(opts.commit),
    invalidRows: invalidRows.slice(0, 200),
    duplicateRows: duplicateRows.slice(0, 200),
    preview: valid.slice(0, 50).map((j) => ({
      title: j.title, organizationName: j.organizationName, location: j.location || '',
      employmentType: j.employmentType || '', workMode: j.workMode || '', experienceLevel: j.experienceLevel || '',
    })),
  };
}

/** Aggregate stats for the Super Admin Jobs tab. */
export async function getJobAdminOverview(query?: string) {
  const jobs = await getHiringJobs();
  const q = (query || '').toLowerCase().trim();
  const filtered = q
    ? jobs.filter((j) => `${j.title} ${j.organizationName} ${j.location || ''} ${j.department || ''}`.toLowerCase().includes(q))
    : jobs;
  return {
    stats: {
      total: jobs.length,
      published: jobs.filter((j) => j.status === 'published').length,
      draft: jobs.filter((j) => j.status === 'draft').length,
      closed: jobs.filter((j) => j.status === 'closed').length,
      scraped: jobs.filter((j) => j.source === 'scraper').length,
    },
    jobs: filtered
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 500)
      .map((j) => ({
        id: j.id, title: j.title, organizationName: j.organizationName, location: j.location || '',
        employmentType: j.employmentType || '', workMode: j.workMode || '', experienceLevel: j.experienceLevel || '',
        status: j.status, source: j.source || 'hiring', applyUrl: j.applyUrl || '', createdAt: j.createdAt,
      })),
  };
}
