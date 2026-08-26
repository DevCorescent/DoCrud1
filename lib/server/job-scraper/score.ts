/**
 * Deterministic job-quality score (0–100) over fields that actually exist.
 * Missing information contributes 0 for that criterion — nothing is invented.
 * Used to rank jobs before import so the best jobs are persisted first.
 */
import { NormalizedJob } from './types';

const TECH_KEYWORDS = [
  'engineer', 'developer', 'software', 'backend', 'frontend', 'full stack', 'fullstack',
  'data', 'machine learning', 'ml', 'ai', 'devops', 'platform', 'infrastructure', 'security',
  'mobile', 'ios', 'android', 'sre', 'cloud', 'python', 'typescript', 'javascript', 'react',
  'node', 'golang', 'java', 'rust',
];

export function scoreJob(job: NormalizedJob, now: number = Date.now()): number {
  let s = 0;

  // +25 — a real, substantive title.
  if (job.title && job.title.trim().length > 3) s += 25;

  // +20 — engineering / technology relevance (title or description).
  const hay = `${job.title} ${job.description}`.toLowerCase();
  if (TECH_KEYWORDS.some((k) => hay.includes(k))) s += 20;

  // +15 — remote / hybrid availability.
  if (job.workMode === 'remote' || job.workMode === 'hybrid') s += 15;

  // +15 — compensation present.
  if (job.salaryPresent) s += 15;

  // +10 — recently posted (within 30 days).
  if (job.postedAt) {
    const t = Date.parse(job.postedAt);
    if (Number.isFinite(t) && now - t <= 30 * 86_400_000) s += 10;
  }

  // +10 — a complete description.
  if (job.description && job.description.length >= 200) s += 10;

  // +5 — a clear http(s) application URL.
  if (/^https?:\/\/\S+$/i.test(job.applyUrl || '')) s += 5;

  return s;
}
