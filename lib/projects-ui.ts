/**
 * Shared presentation tokens for projects.
 *
 * The category palette is imported from services-ui rather than copied, so the
 * opportunity network speaks one visual language and a category added to
 * Services appears here too. Nothing in services-ui is modified.
 */

import { SERVICE_CATEGORIES, currencySymbol } from '@/lib/services-ui';
import type { Project } from '@/lib/server/projects';

export const PROJECT_CATEGORIES = SERVICE_CATEGORIES;

export function projectCategory(key: string) {
  return PROJECT_CATEGORIES[key] ?? PROJECT_CATEGORIES.other;
}

export const BUDGET_TYPE_LABELS: Record<string, string> = {
  fixed: 'Fixed budget',
  hourly: 'Hourly rate',
  negotiable: 'Negotiable',
};

export const PROJECT_TYPE_LABELS: Record<string, string> = {
  one_time: 'One-time project',
  ongoing: 'Ongoing work',
  contract: 'Contract',
  collaboration: 'Collaboration',
};

export const WORK_MODE_LABELS: Record<string, string> = {
  remote: 'Remote',
  onsite: 'On-site',
  hybrid: 'Hybrid',
};

export const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  closed: 'Closed',
};

/**
 * The budget, worded the way it was entered. A negotiable budget has no
 * number to show, so it never renders a misleading zero.
 */
export function formatBudget(p: Pick<Project, 'budgetType' | 'budgetMin' | 'budgetMax' | 'currency'>): string {
  if (p.budgetType === 'negotiable') return 'Negotiable';
  const sym = currencySymbol(p.currency);
  const suffix = p.budgetType === 'hourly' ? '/hr' : '';
  if (p.budgetMax && p.budgetMax > p.budgetMin) {
    return `${sym}${p.budgetMin.toLocaleString()} – ${sym}${p.budgetMax.toLocaleString()}${suffix}`;
  }
  return `${sym}${p.budgetMin.toLocaleString()}${suffix}`;
}

/** "in 6 days" / "3 days ago" / null when the poster set no deadline. */
export function formatDeadline(deadline?: string | null): { label: string; overdue: boolean } | null {
  if (!deadline) return null;
  const then = Date.parse(`${deadline}T00:00:00`);
  if (Number.isNaN(then)) return null;
  const today = new Date();
  const midnight = Date.parse(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}T00:00:00`,
  );
  const days = Math.round((then - midnight) / 86_400_000);
  if (days === 0) return { label: 'Due today', overdue: false };
  if (days > 0) return { label: `Due in ${days} day${days === 1 ? '' : 's'}`, overdue: false };
  return { label: `Closed ${-days} day${days === -1 ? '' : 's'} ago`, overdue: true };
}

/** Canonical project-detail URL. */
export function projectDetailHref(projectId: string): string {
  return `/projects/${projectId}`;
}
