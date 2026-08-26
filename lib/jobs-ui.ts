/**
 * Jobs presentation helpers — the Jobs-side mirror of lib/projects-ui.ts.
 *
 * Labels and small formatters only. No data fetching, no business logic. Used
 * by the /jobs discovery page and JobSummaryCard so the Jobs grid reads in the
 * same language as the Projects grid.
 */

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
