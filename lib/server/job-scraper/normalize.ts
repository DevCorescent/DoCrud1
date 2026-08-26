/**
 * Content normalization for scraped jobs.
 *
 * Enum CANONICALIZATION is intentionally NOT done here — the existing importer
 * (lib/server/job-import.ts) owns it ("Full Time"→full_time, "Senior"→senior,
 * unknown→rejected/defaulted). The scraper passes raw employmentType/
 * experienceLevel text through and derives only `workMode` (from schema signals).
 * This module handles HTML→text, list splitting, keyword derivation, and URLs.
 */
import { htmlToText, htmlToList } from './html';

export { htmlToText };

export function splitList(value: string): string[] {
  if (!value) return [];
  let items = htmlToList(value);
  if (!items.length) {
    const text = htmlToText(value);
    items = text.split(/[\n;|•·]+|(?:^|\s)[-*]\s+/).map((s) => s.replace(/\s+/g, ' ').trim().replace(/^[-*•·\s]+/, ''));
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const t = it.trim();
    if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
  }
  return out;
}

const STOP = new Set([
  'and', 'or', 'the', 'for', 'with', 'you', 'your', 'our', 'are', 'will', 'a', 'an',
  'to', 'of', 'in', 'on', 'at', 'is', 'we', 'as', 'by', 'be', 'job', 'role', 'position',
  'opening', 'opportunity',
]);

/** Matching keywords from real title + skills only. Never fabricated. */
export function deriveKeywords(title: string, skills: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (tok: string) => {
    const t = tok.trim().toLowerCase();
    if (t.length > 1 && !STOP.has(t) && !seen.has(t)) { seen.add(t); out.push(t); }
  };
  for (const w of (title || '').toLowerCase().split(/[^a-z0-9+#.]+/)) add(w);
  for (const s of skills || []) add(s);
  return out;
}

export function safeUrl(raw: string): string {
  const v = (raw || '').trim();
  if (!v || v.length > 2048) return '';
  return /^https?:\/\/\S+$/i.test(v) ? v : '';
}

export function clip(value: string, max: number): string {
  const v = (value || '').trim();
  return max ? v.slice(0, max) : v;
}

export function clipList(items: string[], maxItems = 50, maxLen = 300): string[] {
  return (items || []).slice(0, maxItems).map((it) => it.trim().slice(0, maxLen)).filter(Boolean);
}
