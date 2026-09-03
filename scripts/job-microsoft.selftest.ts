/**
 * Microsoft Careers provider self-test.
 *
 * Every fetch goes through the injected `fetchJson` seam, so nothing here
 * touches the network or a database. The fixtures mirror the SHAPE observed on
 * the live endpoints (see the provider header for how they were discovered),
 * not invented fields.
 */
import { readFileSync } from 'node:fs';
import type { ProviderDeps, ScrapeSource } from '@/lib/server/job-scraper/types';
import {
  MICROSOFT_HOST, PAGE_SIZE, fetchMicrosoftPaged, mapWithConcurrency,
  normalizeMicrosoftPosition, safeJobUrl,
} from '@/lib/server/job-scraper/providers/microsoft';
import { normalizeSourceJob } from '@/lib/server/job-sources/normalize';
import { planIngest } from '@/lib/server/job-sources/ingest';
import { SourceFetchError } from '@/lib/server/job-scraper/source-fetch';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const SOURCE: ScrapeSource = {
  name: 'microsoft:microsoft.com', label: 'Microsoft', provider: 'microsoft',
  board: 'microsoft.com', host: MICROSOFT_HOST, enabled: true,
} as ScrapeSource;

const NOW = Date.parse('2026-09-03T00:00:00.000Z');

/** A search row, shaped exactly like the live API's. */
const row = (n: number, over: Record<string, unknown> = {}) => ({
  id: 1970393556862000 + n,
  displayJobId: `2000${String(362 + n).padStart(5, '0')}`,
  name: `Software Engineer ${n}`,
  locations: ['Redmond, Washington, United States'],
  standardizedLocations: ['US'],
  postedTs: 1788401048,
  creationTs: 1777393427,
  department: 'Engineering',
  workLocationOption: 'onsite',
  atsJobId: `2000${String(362 + n).padStart(5, '0')}`,
  positionUrl: `/careers/job/${1970393556862000 + n}`,
  ...over,
});

const searchBody = (rows: unknown[], count: number) => ({ status: 200, data: { positions: rows, count } });
const detailBody = (over: Record<string, unknown> = {}) => ({
  status: 200,
  data: {
    jobDescription: '<b>Overview</b><br><p>Build distributed systems at scale.</p>',
    location: 'Redmond, Washington, United States',
    publicUrl: `https://${MICROSOFT_HOST}/careers/job/1970393556862001`,
    efcustomTextEmploymentType: ['Full-Time'],
    efcustomTextRoletype: ['Individual Contributor'],
    workLocationOption: 'onsite',
    ...over,
  },
});

/** Records every URL requested, so request COUNT and shape are assertable. */
function recorder(handler: (url: string) => unknown | null) {
  const urls: string[] = [];
  let inFlight = 0;
  let peak = 0;
  const deps: ProviderDeps = {
    fetchJson: async (url: string) => {
      urls.push(url);
      inFlight += 1; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return handler(url);
    },
  };
  return { deps, urls, peak: () => peak };
}

const isSearch = (u: string) => u.includes('/api/pcsx/search');

async function main() {
  console.log('\n── 1. A valid listing ──');
  {
    const r = recorder((u) => (isSearch(u) ? searchBody([row(1)], 1) : detailBody()));
    const out = await fetchMicrosoftPaged(SOURCE, r.deps, { maxPages: 5, intervalMs: 0 });
    check('one page of results yields one job', out.jobs.length === 1, String(out.jobs.length));
    check('the API total is reported', out.total === 1, String(out.total));
    check('every request went to the permitted host',
      r.urls.every((u) => new URL(u).hostname === MICROSOFT_HOST));
    check('every request used https', r.urls.every((u) => u.startsWith('https://')));
    const j = out.jobs[0];
    check('the external id is the MICROSOFT requisition, not the Eightfold row id',
      j.externalId === row(1).displayJobId && j.externalId !== String(row(1).id), j.externalId);
    check('the title is carried through', j.title === 'Software Engineer 1');
    check('the provider is recorded', j.provider === 'microsoft');
    check('the description comes from the detail endpoint',
      j.description.includes('Build distributed systems'));
    check('employmentType is read from the source', j.employmentType === 'full_time');
    check('workMode is read, not inferred', j.workMode === 'onsite');
    check('postedAt is a real ISO date', j.postedAt.startsWith('2026-'), j.postedAt);
    check('no salary is claimed', j.salaryPresent === false);
  }

  console.log('\n── 2. Experience level is never invented ──');
  {
    const r = recorder((u) => (isSearch(u)
      ? searchBody([row(1, { name: 'Principal Software Engineer' }),
                    row(2, { name: 'Senior Data Scientist' }),
                    row(3, { name: 'Software Engineering Intern' }),
                    row(4, { name: 'Software Engineer' })], 4)
      : detailBody()));
    const out = await fetchMicrosoftPaged(SOURCE, r.deps, { maxPages: 1, intervalMs: 0 });
    check('the provider never sets an experience level itself',
      out.jobs.every((j) => j.experienceLevel === ''));
    /* The shared rule decides, from the title the employer wrote. */
    const level = (i: number) => normalizeSourceJob(out.jobs[i], { sourceId: SOURCE.name, now: NOW }).experienceLevel;
    check('Principal → lead', level(0) === 'lead', String(level(0)));
    check('Senior → senior', level(1) === 'senior', String(level(1)));
    check('Intern → entry', level(2) === 'entry', String(level(2)));
    check('an ambiguous title stays unset', level(3) === undefined, String(level(3)));
    /* "Individual Contributor" is a ROLE TYPE. It must not leak in as a band. */
    check('roleType is never read as seniority',
      !JSON.stringify(out.jobs).includes('Individual Contributor'));
  }

  console.log('\n── 3. Pagination ──');
  {
    const r = recorder((u) => {
      if (!isSearch(u)) return detailBody();
      const start = Number(new URL(u).searchParams.get('start'));
      const page = start / PAGE_SIZE;
      if (page >= 3) return searchBody([], 30);
      return searchBody(Array.from({ length: PAGE_SIZE }, (_, k) => row(page * PAGE_SIZE + k + 1)), 30);
    });
    const out = await fetchMicrosoftPaged(SOURCE, r.deps, { maxPages: 10, intervalMs: 0, detailLimit: 0 });
    check('multiple pages are walked', out.pagesFetched >= 3, String(out.pagesFetched));
    check('every job across pages is collected', out.jobs.length === 30, String(out.jobs.length));
    check('start advances by the server page size',
      r.urls.filter(isSearch).map((u) => new URL(u).searchParams.get('start')).slice(0, 3).join(',') === '0,10,20');
    check('reaching the end reports no resume page', out.nextPage === null, String(out.nextPage));
  }

  console.log('\n── 4. Bounds: page cap, repeats, duplicates ──');
  {
    /* OVERLAPPING pages: rows 1-10, then rows 6-15. Full-size pages, so
       pagination genuinely continues and the overlap must be caught by the
       requisition-id filter rather than by the walk stopping early. */
    const r = recorder((u) => {
      if (!isSearch(u)) return detailBody();
      const page = Number(new URL(u).searchParams.get('start')) / PAGE_SIZE;
      if (page >= 2) return searchBody([], 15);
      const offset = page === 0 ? 1 : 6;          // five rows appear on both pages
      return searchBody(Array.from({ length: PAGE_SIZE }, (_, k) => row(offset + k)), 15);
    });
    const out = await fetchMicrosoftPaged(SOURCE, r.deps, { maxPages: 5, intervalMs: 0, detailLimit: 0 });
    check('both overlapping pages are walked', out.pagesFetched >= 2, String(out.pagesFetched));
    check('a requisition id seen on an earlier page is not emitted twice',
      out.jobs.length === 15, String(out.jobs.length));
    check('and every emitted id is unique',
      new Set(out.jobs.map((j) => j.externalId)).size === out.jobs.length);
  }
  {
    /* A server that ignores `start`: the SAME positions every page, but with
       rotating requisition ids. The id filter cannot see this — only the page
       fingerprint can — so this isolates the repeated-page guard. */
    let call = 0;
    const r = recorder((u) => {
      if (!isSearch(u)) return detailBody();
      call += 1;
      return searchBody(
        Array.from({ length: PAGE_SIZE }, (_, k) => row(k + 1, {
          displayJobId: `ROTATE-${call}-${k}`, atsJobId: `ROTATE-${call}-${k}`,
        })), 99999);
    });
    const out = await fetchMicrosoftPaged(SOURCE, r.deps, { maxPages: 50, intervalMs: 0, detailLimit: 0 });
    check('a repeated page stops the walk instead of looping to the cap',
      out.pagesFetched === 2, String(out.pagesFetched));
    check('and only the first copy is kept', out.jobs.length === PAGE_SIZE, String(out.jobs.length));
  }
  {
    const r = recorder((u) => (isSearch(u)
      ? searchBody(Array.from({ length: PAGE_SIZE }, (_, k) => row(k + 1)), 99999)
      : detailBody()));
    const out = await fetchMicrosoftPaged(SOURCE, r.deps, { maxPages: 3, intervalMs: 0, detailLimit: 0 });
    check('the page cap is enforced', out.pagesFetched <= 3, String(out.pagesFetched));
  }

  console.log('\n── 5. Resume across bounded runs ──');
  {
    const serve = (u: string) => {
      if (!isSearch(u)) return detailBody();
      const start = Number(new URL(u).searchParams.get('start'));
      const page = start / PAGE_SIZE;
      if (page >= 5) return searchBody([], 50);
      return searchBody(Array.from({ length: PAGE_SIZE }, (_, k) => row(page * PAGE_SIZE + k + 1)), 50);
    };
    const a = await fetchMicrosoftPaged(SOURCE, recorder(serve).deps,
      { maxPages: 2, intervalMs: 0, detailLimit: 0 });
    check('a bounded run stops at its cap', a.pagesFetched === 2);
    check('and hands back the page to resume at', a.nextPage === 2, String(a.nextPage));

    const b = await fetchMicrosoftPaged(SOURCE, recorder(serve).deps,
      { startPage: a.nextPage ?? 0, maxPages: 2, intervalMs: 0, detailLimit: 0 });
    check('the next run continues where it stopped, not from the top',
      b.jobs[0]?.externalId !== a.jobs[0]?.externalId, `${b.jobs[0]?.externalId} vs ${a.jobs[0]?.externalId}`);
    const seen = new Set([...a.jobs, ...b.jobs].map((j) => j.externalId));
    check('the two runs overlap not at all', seen.size === a.jobs.length + b.jobs.length);

    const c = await fetchMicrosoftPaged(SOURCE, recorder(serve).deps,
      { startPage: 4, maxPages: 5, intervalMs: 0, detailLimit: 0 });
    check('finishing the corpus clears the resume point', c.nextPage === null, String(c.nextPage));
  }

  console.log('\n── 6. Concurrency is bounded ──');
  {
    const r = recorder((u) => (isSearch(u)
      ? searchBody(Array.from({ length: PAGE_SIZE }, (_, k) => row(k + 1)), PAGE_SIZE)
      : detailBody()));
    await fetchMicrosoftPaged(SOURCE, r.deps, { maxPages: 1, intervalMs: 0, concurrency: 2 });
    check('never more than the configured requests are in flight', r.peak() <= 2, String(r.peak()));
  }
  {
    const order: number[] = [];
    let live = 0, peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 3, async (n) => {
      live += 1; peak = Math.max(peak, live);
      await new Promise((res) => setTimeout(res, 5));
      live -= 1; order.push(n); return n;
    });
    check('the concurrency helper honours its limit', peak <= 3, String(peak));
    check('and still processes every item', order.length === 6);
    const out = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom');
      return n;
    });
    check('one failing item does not fail the batch', out[0] === 1 && out[1] === null && out[2] === 3);
  }

  console.log('\n── 7. Missing, empty and malformed responses ──');
  {
    const empty = await fetchMicrosoftPaged(SOURCE, recorder(() => searchBody([], 0)).deps,
      { maxPages: 3, intervalMs: 0 });
    check('an empty board yields no jobs and no error', empty.jobs.length === 0);
    check('and is reported as exhausted, not as more to come', empty.nextPage === null);
  }
  {
    const junk = await fetchMicrosoftPaged(SOURCE,
      recorder((u) => (isSearch(u) ? { nonsense: true } : detailBody())).deps,
      { maxPages: 3, intervalMs: 0 });
    check('a malformed body yields no jobs rather than throwing', junk.jobs.length === 0);
  }
  {
    const r = recorder((u) => (isSearch(u)
      ? searchBody([row(1, { name: '' }), row(2, { displayJobId: '', atsJobId: '', id: '' }), row(3)], 3)
      : detailBody()));
    const out = await fetchMicrosoftPaged(SOURCE, r.deps, { maxPages: 1, intervalMs: 0 });
    check('a row with no title is dropped, not invented',
      out.jobs.every((j) => j.title));
    check('a row with no identifier is dropped', out.jobs.length === 1, String(out.jobs.length));
  }
  {
    /* Detail unavailable: the job is still stored, just without a description. */
    const r = recorder((u) => (isSearch(u) ? searchBody([row(1)], 1) : null));
    const out = await fetchMicrosoftPaged(SOURCE, r.deps, { maxPages: 1, intervalMs: 0 });
    check('a job whose detail is missing is still ingested', out.jobs.length === 1);
    check('with an empty description rather than a fabricated one', out.jobs[0].description === '');
    check('and the miss is counted', out.detailsFailed === 1, String(out.detailsFailed));
  }
  {
    const missing = normalizeMicrosoftPosition(SOURCE, row(1, { postedTs: 0, creationTs: 0 }), {});
    check('an absent timestamp stays absent — never "now"', missing?.postedAt === '', String(missing?.postedAt));
    const bogus = normalizeMicrosoftPosition(SOURCE, row(1, { postedTs: 99999999999999, creationTs: 0 }), {});
    check('an out-of-range timestamp is refused', bogus?.postedAt === '', String(bogus?.postedAt));
  }

  console.log('\n── 8. HTTP failure and timeout ──');
  {
    /* fetchJsonOrThrow turns a null fetch into a SourceFetchError. */
    let threw: unknown = null;
    try {
      await fetchMicrosoftPaged(SOURCE, { fetchJson: async () => null }, { maxPages: 1, intervalMs: 0 });
    } catch (e) { threw = e; }
    check('a failed search throws rather than reporting an empty board',
      threw instanceof SourceFetchError, String(threw));
  }
  {
    /* Failure on page TWO must not return page one as the whole corpus. */
    let n = 0;
    const deps: ProviderDeps = {
      fetchJson: async (u: string) => {
        if (!isSearch(u)) return detailBody();
        n += 1;
        return n === 1 ? searchBody(Array.from({ length: PAGE_SIZE }, (_, k) => row(k + 1)), 100) : null;
      },
    };
    let threw = false;
    try { await fetchMicrosoftPaged(SOURCE, deps, { maxPages: 5, intervalMs: 0, detailLimit: 0 }); }
    catch { threw = true; }
    check('a mid-pagination failure throws — a partial board is never passed off as complete', threw);
  }
  {
    let threw = false;
    try {
      await fetchMicrosoftPaged({ ...SOURCE, board: '' } as ScrapeSource, { fetchJson: async () => null },
        { maxPages: 1, intervalMs: 0 });
    } catch { threw = true; }
    check('a source with no domain is a configuration error, not a fetch', threw);
  }

  console.log('\n── 9. SSRF: the host cannot be moved ──');
  {
    const src = readFileSync('lib/server/job-scraper/providers/microsoft.ts', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    check('the host is a literal constant', /const MICROSOFT_HOST = 'apply\.careers\.microsoft\.com'/.test(code));
    check('every request URL is built from that constant', /\$\{BASE\}\/api\/pcsx\//.test(code));
    check('no URL is taken from configuration', !/source\.(host|listingUrl|sitemapUrl)/.test(code));
    check('the domain is a QUERY parameter and is encoded',
      /domain=\$\{encodeURIComponent\(domain\)\}/.test(code));
    check('the position id is encoded too',
      /position_id=\$\{encodeURIComponent\(item\.positionId\)\}/.test(code));
  }
  {
    /* A URL from the response BODY is untrusted. */
    for (const hostile of [
      'http://localhost/careers/job/1', 'https://127.0.0.1/careers/job/1',
      'https://169.254.169.254/latest/meta-data/', 'https://10.0.0.5/careers/job/1',
      'https://192.168.1.10/x', 'https://evil.example.com/careers/job/1',
      'https://apply.careers.microsoft.com.evil.com/x', 'file:///etc/passwd', 'not a url',
    ]) {
      check(`a hostile publicUrl is refused: ${hostile.slice(0, 44)}`,
        safeJobUrl(hostile, '123') === `https://${MICROSOFT_HOST}/careers/job/123`,
        safeJobUrl(hostile, '123'));
    }
    check('a legitimate publicUrl on the permitted host is kept',
      safeJobUrl(`https://${MICROSOFT_HOST}/careers/job/999`, '123')
        === `https://${MICROSOFT_HOST}/careers/job/999`);
    check('with no usable url and no id, none is invented', safeJobUrl('', '') === '');
  }

  console.log('\n── 10. Through the shared pipeline: identity, dedupe, ingestion ──');
  {
    const r = recorder((u) => (isSearch(u) ? searchBody([row(1), row(2)], 2) : detailBody()));
    const out = await fetchMicrosoftPaged(SOURCE, r.deps, { maxPages: 1, intervalMs: 0 });
    const drafts = out.jobs.map((j) => normalizeSourceJob(j, { sourceId: SOURCE.name, now: NOW }));
    check('identity is resolved by the shared engine, not the provider',
      drafts.every((d) => d.identity && d.identity.basis));
    check('identity is anchored on the requisition id, never the title',
      drafts[0].identity.basis === 'external_id', drafts[0].identity.basis);

    const first = planIngest(drafts, [], { now: new Date(NOW).toISOString() });
    check('a first run inserts', first.report.created === 2, String(first.report.created));

    const second = planIngest(drafts, first.jobs, { now: new Date(NOW).toISOString() });
    check('re-ingesting the SAME jobs updates nothing and duplicates nothing',
      second.report.created === 0 && second.report.unchanged === 2,
      `created=${second.report.created} unchanged=${second.report.unchanged}`);
    check('and the store does not grow', second.jobs.length === 2, String(second.jobs.length));

    /* A changed description must UPDATE the existing record, not add one. */
    const changed = out.jobs.map((j) => normalizeSourceJob(
      { ...j, description: `${j.description} Now with Rust.` }, { sourceId: SOURCE.name, now: NOW }));
    const third = planIngest(changed, second.jobs, { now: new Date(NOW).toISOString() });
    check('changed content updates in place', third.report.updated === 2, String(third.report.updated));
    check('and still does not duplicate', third.jobs.length === 2, String(third.jobs.length));

    /* A re-listed job keeps its stored id — applications must not be orphaned. */
    check('the record id survives an update',
      third.jobs.map((j) => j.id).sort().join() === second.jobs.map((j) => j.id).sort().join());
  }

  console.log('\n── 11. Registration through the existing abstraction ──');
  {
    const reg = readFileSync('lib/server/job-sources/registry.ts', 'utf8');
    const srcs = readFileSync('lib/server/job-scraper/sources.ts', 'utf8');
    check('microsoft is registered as a normal source',
      /MICROSOFT_CAREERS.*provider: 'microsoft'/.test(srcs));
    check('with the permitted host pinned in the registry',
      /host: 'apply\.careers\.microsoft\.com'/.test(srcs));
    check('and a declared access type', /microsoft: 'public_ats'/.test(reg));
    check('the adapter is dispatched through the shared registry',
      /provider === 'microsoft'/.test(reg));
    /* Comments stripped: the header NAMES these functions to explain that it
       defers to them, and an assertion satisfied by prose proves nothing. */
    const provCode = readFileSync('lib/server/job-scraper/providers/microsoft.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    check('the provider does not re-implement normalization, identity or dedupe',
      !/jobContentHash|jobIdentity|planIngest|normalizeSourceJob/.test(provCode));
    check('it uses the cursor half of the existing contract',
      /nextCursor: out\.nextPage === null \? null : String\(out\.nextPage\)/.test(reg));
  }

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) { console.error('FAILED'); process.exit(1); }
}

main();
