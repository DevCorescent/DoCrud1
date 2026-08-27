/**
 * Jobs presentation helpers — the Jobs-side mirror of lib/projects-ui.ts.
 *
 * Labels and small formatters only. No data fetching, no business logic. Used
 * by the /jobs discovery page and JobSummaryCard so the Jobs grid reads in the
 * same language as the Projects grid.
 */
import { isIndiaRelevant, indiaCity } from '@/lib/server/job-scraper/india';

export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
  freelance: 'Freelance',
};

export const WORK_MODE_LABELS: Record<string, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
};

export const EXPERIENCE_LABELS: Record<string, string> = {
  entry: 'Entry',
  associate: 'Associate',
  mid: 'Mid',
  senior: 'Senior',
  lead: 'Lead',
};

export const JOB_STATUS_LABELS: Record<string, string> = {
  published: 'Open',
  draft: 'Draft',
  closed: 'Closed',
};

export function jobDetailHref(id: string): string {
  return `/jobs/${id}`;
}

/** True when a string is a usable external application URL (http/https only). */
export function isValidApplyUrl(url?: string | null): boolean {
  return /^https?:\/\/\S+$/i.test((url || '').trim());
}

/**
 * Honest source attribution derived from the REAL application URL's host — no
 * data-model change, no fabrication. Known public ATS hosts map to their brand;
 * anything else falls back to the bare domain. '' when there is no usable URL.
 */
export function jobSourceLabel(applyUrl?: string | null): string {
  if (!isValidApplyUrl(applyUrl)) return '';
  let host = '';
  try { host = new URL((applyUrl as string).trim()).host.toLowerCase(); } catch { return ''; }
  if (host.endsWith('ashbyhq.com')) return 'Ashby';
  if (host.endsWith('lever.co')) return 'Lever';
  if (host.endsWith('greenhouse.io')) return 'Greenhouse';
  if (host.endsWith('workable.com')) return 'Workable';
  if (host.endsWith('smartrecruiters.com')) return 'SmartRecruiters';
  const parts = host.replace(/^www\./, '').split('.');
  return parts.length >= 2 ? parts[parts.length - 2].replace(/^\w/, (c) => c.toUpperCase()) : host;
}

/**
 * India-aware location label, e.g. "Bengaluru · India · Hybrid". Uses the shared
 * india.ts normalization — India is appended ONLY when the location data actually
 * indicates it, never fabricated. Global locations are shown as-is.
 */
export function formatJobLocation(location?: string | null, workMode?: string | null): string {
  const loc = (location || '').trim();
  const parts: string[] = [];
  if (loc) {
    const city = indiaCity(loc);
    if (city) { parts.push(city, 'India'); }
    else if (/^india$/i.test(loc)) { parts.push('India'); }
    else { parts.push(loc); if (isIndiaRelevant(loc) && !/india/i.test(loc)) parts.push('India'); }
  }
  // Append the work mode only when the location text doesn't already say it —
  // avoids "Remote, Canada · Remote" style duplication.
  const wm = workMode ? WORK_MODE_LABELS[workMode] ?? workMode : '';
  if (wm && !loc.toLowerCase().includes(wm.toLowerCase())) parts.push(wm);
  return parts.join(' · ');
}

/** "Posted 2d ago"-style relative label. Empty when the date is missing/bad. */
export function formatPosted(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1mo ago' : `${months}mo ago`;
}

/** Deterministic hue for a company's monogram tile, so a company always reads the same. */
export function companyHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}
