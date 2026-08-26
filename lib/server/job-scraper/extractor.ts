/**
 * Extraction: page HTML -> RawJob.
 *
 * Primary: schema.org JobPosting JSON-LD (<script type="application/ld+json">).
 * Fallback: per-source CSS selectors, ONLY when a page has no JobPosting JSON-LD.
 * Never invents data — a page without title+organization yields null.
 */
import { RawJob, ScrapeSource } from './types';
import { parseHtml, selectText, selectTexts } from './html';

function emptyRaw(url: string): RawJob {
  return {
    sourceUrl: url, title: '', organizationName: '', location: '', department: '',
    employmentType: '', workMode: '', experienceLevel: '', description: '',
    responsibilities: [], requirements: [], preferredSkills: [], targetRoleKeywords: [], applyUrl: '',
  };
}

// --------------------------------------------------------------------------- //
// JSON-LD
// --------------------------------------------------------------------------- //
function collectJsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    let data: unknown;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const stack: unknown[] = [data];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) stack.push(...node);
      else if (node && typeof node === 'object') {
        const obj = node as Record<string, unknown>;
        if (Array.isArray(obj['@graph'])) stack.push(...(obj['@graph'] as unknown[]));
        out.push(obj);
      }
    }
  }
  return out;
}

function isJobPosting(obj: Record<string, unknown>): boolean {
  const t = obj['@type'];
  const types = Array.isArray(t) ? t : [t];
  return types.some((x) => String(x).toLowerCase() === 'jobposting');
}

function asText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return asText(o.name ?? o.value ?? '');
  }
  return '';
}

function asList(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(asText).filter(Boolean);
  if (typeof v === 'string') return [v];
  return [asText(v)].filter(Boolean);
}

function locationOf(obj: Record<string, unknown>): string {
  const loc = obj.jobLocation;
  const entries = Array.isArray(loc) ? loc : [loc];
  for (const e of entries) {
    if (e && typeof e === 'object') {
      const addr = (e as Record<string, unknown>).address;
      if (addr && typeof addr === 'object') {
        const a = addr as Record<string, unknown>;
        const parts = ['addressLocality', 'addressRegion', 'addressCountry'].map((k) => asText(a[k])).filter(Boolean);
        if (parts.length) return parts.join(', ');
      } else if (addr) {
        return asText(addr);
      } else if ((e as Record<string, unknown>).name) {
        return asText((e as Record<string, unknown>).name);
      }
    } else if (e) {
      return asText(e);
    }
  }
  return '';
}

function workModeOf(obj: Record<string, unknown>): string {
  if (String(obj.jobLocationType || '').toUpperCase() === 'TELECOMMUTE') return 'remote';
  if (obj.applicantLocationRequirements && !obj.jobLocation) return 'remote';
  return '';
}

function applyUrlOf(obj: Record<string, unknown>, pageUrl: string): string {
  for (const key of ['url', 'applyUrl']) {
    const u = asText(obj[key]);
    if (/^https?:\/\//i.test(u)) return u;
  }
  return pageUrl;
}

export function extractFromJsonLd(html: string, pageUrl: string): RawJob | null {
  for (const obj of collectJsonLd(html)) {
    if (!isJobPosting(obj)) continue;
    const rj = emptyRaw(pageUrl);
    rj.title = asText(obj.title);
    rj.organizationName = asText(obj.hiringOrganization);
    rj.location = locationOf(obj);
    rj.department = asText(obj.department ?? obj.occupationalCategory);
    rj.employmentType = asText(obj.employmentType);         // raw; importer canonicalizes
    rj.workMode = workModeOf(obj);
    rj.experienceLevel = asText(obj.experienceLevel);        // non-standard; usually empty
    rj.description = asText(obj.description);                // may be HTML
    rj.responsibilities = asList(obj.responsibilities);
    rj.requirements = asList(obj.qualifications).length
      ? asList(obj.qualifications)
      : (asList(obj.experienceRequirements).length ? asList(obj.experienceRequirements) : asList(obj.educationRequirements));
    rj.preferredSkills = asList(obj.skills);
    rj.applyUrl = applyUrlOf(obj, pageUrl);
    if (rj.title && rj.organizationName) return rj;
  }
  return null;
}

// --------------------------------------------------------------------------- //
// CSS fallback (only when configured + no JSON-LD)
// --------------------------------------------------------------------------- //
export function extractFromCss(html: string, pageUrl: string, selectors: ScrapeSource['cssFallback']): RawJob | null {
  if (!selectors) return null;
  const root = parseHtml(html);
  const rj = emptyRaw(pageUrl);
  rj.title = selectors.title ? selectText(root, selectors.title) : '';
  rj.organizationName = selectors.organizationName ? selectText(root, selectors.organizationName) : '';
  rj.location = selectors.location ? selectText(root, selectors.location) : '';
  rj.department = selectors.department ? selectText(root, selectors.department) : '';
  rj.description = selectors.description ? selectText(root, selectors.description) : '';
  rj.responsibilities = selectors.responsibilities ? selectTexts(root, selectors.responsibilities) : [];
  rj.requirements = selectors.requirements ? selectTexts(root, selectors.requirements) : [];
  rj.preferredSkills = selectors.preferredSkills ? selectTexts(root, selectors.preferredSkills) : [];
  rj.applyUrl = selectors.applyUrl ? selectText(root, selectors.applyUrl) || pageUrl : pageUrl;
  if (rj.title && rj.organizationName) return rj;
  return null;
}

export function extract(html: string, pageUrl: string, cssFallback?: ScrapeSource['cssFallback']): RawJob | null {
  return extractFromJsonLd(html, pageUrl) ?? extractFromCss(html, pageUrl, cssFallback);
}
