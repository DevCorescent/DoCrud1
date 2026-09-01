/**
 * Personio public XML feed provider.
 *
 *   GET https://{slug}.jobs.personio.de/xml
 *
 * NOT PAGINATED — the feed is the company's whole board. This is the only
 * XML provider here, and the only one where an unknown slug is dangerous:
 * Personio answers a bad slug with a REDIRECT to personio.com, which returns
 * 200 and a page of marketing HTML. Followed blindly that parses as "zero
 * jobs", which is a confident wrong answer rather than the failure it is.
 *
 * So this uses `fetchTextStrict`: redirects are refused, and the response must
 * actually look like XML before it is parsed.
 */
import { NormalizedJob, ProviderDeps, ScrapeSource } from '../types';
import { fetchTextStrict } from '../fetcher';
import { decodeEntities } from '../html';
import { htmlToText, deriveKeywords } from '../normalize';
import { normalizeIndiaLocation } from '../india';

const EMPLOYMENT: Record<string, string> = {
  permanent: 'full_time', full_time: 'full_time', 'full-time': 'full_time',
  part_time: 'part_time', 'part-time': 'part_time', intern: 'internship',
  internship: 'internship', trainee: 'internship', temporary: 'contract', contract: 'contract',
};

/** Every `<tag>` value inside one block. CDATA is unwrapped, entities decoded. */
function tagValues(block: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi');
  const out: string[] = [];
  let m = re.exec(block);
  while (m) {
    const inner = m[1] ?? '';
    const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(inner);
    out.push(decodeEntities(cdata ? cdata[1] : inner).trim());
    m = re.exec(block);
  }
  return out;
}

const firstTag = (block: string, tag: string): string => tagValues(block, tag)[0] ?? '';

export function normalizePersonio(source: ScrapeSource, xml: string): NormalizedJob[] {
  const text = String(xml ?? '');
  /* A document that is not a Personio feed yields nothing rather than being
     coerced. A redirect page reaching this far would land here. */
  if (!/<position[\s>]/i.test(text)) return [];

  const blocks = text.match(/<position[\s>][\s\S]*?<\/position>/gi) ?? [];
  const company = source.label || '';

  return blocks.map((block) => {
    const title = firstTag(block, 'name');
    const id = firstTag(block, 'id');

    /* A posting may list several offices; every one is preserved. Collapsing
       to the first would silently drop real locations. */
    const offices = Array.from(new Set([
      ...tagValues(block, 'office'),
      ...tagValues(block, 'city'),
    ].filter(Boolean)));
    const location = offices.length
      ? offices.map((o) => normalizeIndiaLocation(o)).join(' / ')
      : '';

    const description = [
      ...tagValues(block, 'jobDescription'),
      ...tagValues(block, 'description'),
    ].filter(Boolean).join('\n\n');

    const schedule = firstTag(block, 'employmentType') || firstTag(block, 'schedule');

    return {
      source: source.name,
      provider: 'personio',
      externalId: id,
      title,
      organizationName: company,
      location,
      department: firstTag(block, 'department'),
      employmentType: EMPLOYMENT[schedule.toLowerCase().replace(/[\s-]+/g, '_')] ?? '',
      workMode: /remote/i.test(location) ? 'remote' : '',
      experienceLevel: '',
      description: htmlToText(description),
      responsibilities: [],
      requirements: [],
      preferredSkills: [],
      targetRoleKeywords: deriveKeywords(title, []),
      salaryPresent: false,
      /* `createdAt` when the feed states it; never derived from anything else. */
      postedAt: firstTag(block, 'createdAt'),
      jobUrl: firstTag(block, 'jobUrl') || firstTag(block, 'url'),
      applyUrl: firstTag(block, 'jobUrl') || firstTag(block, 'url'),
      isActive: Boolean(title && id),
    } satisfies NormalizedJob;
  });
}

export async function fetchPersonio(source: ScrapeSource, deps: ProviderDeps = {}): Promise<NormalizedJob[]> {
  const slug = (source.board ?? '').trim();
  if (!slug || !/^[a-z0-9][a-z0-9-]{0,62}$/i.test(slug)) return [];
  const get = deps.fetchTextStrict
    ?? ((url: string) => fetchTextStrict(url, { expectContentType: /xml|text\/plain/i }));
  const res = await get(`https://${slug}.jobs.personio.de/xml`);
  if (!res || res.status !== 200) return [];
  return normalizePersonio(source, res.text);
}
