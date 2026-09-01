/**
 * Stage 1 self-test: adapter pagination and truthful ingestion metrics.
 *
 * Everything runs against injected fixtures — `ProviderDeps.fetchJson` — so no
 * network, no credentials and no database are involved.
 *
 * The assertion that matters most is the one the dashboard got wrong: a run
 * that discovers 149 jobs and writes none is NOT a failure, and the numbers
 * must say which of "already current", "changed but not updated", "duplicate"
 * and "invalid" actually happened.
 */
import type { ProviderDeps, ScrapeSource } from '@/lib/server/job-scraper/types';
import { fetchLever } from '@/lib/server/job-scraper/providers/lever';
import { fetchAshby } from '@/lib/server/job-scraper/providers/ashby';
import { fetchGreenhouse } from '@/lib/server/job-scraper/providers/greenhouse';
import { runApprovedScrape } from '@/lib/server/job-scraper';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const leverSource: ScrapeSource = {
  name: 'lever:acme', label: 'Acme', provider: 'lever', board: 'acme',
  host: 'api.lever.co', enabled: true,
} as ScrapeSource;

/** A Lever posting fixture. */
const post = (i: number) => ({
  id: `L${i}`, text: `Engineer ${i}`,
  categories: { location: 'Bengaluru, India', team: 'Eng', commitment: 'Full-time' },
  descriptionPlain: 'Build things.', hostedUrl: `https://jobs.lever.co/acme/L${i}`,
  applyUrl: `https://jobs.lever.co/acme/L${i}/apply`, createdAt: 1_760_000_000_000,
});

/** Parse `skip` / `limit` out of a requested URL. */
function paging(url: string) {
  const u = new URL(url);
  return { skip: Number(u.searchParams.get('skip') ?? '0'), limit: Number(u.searchParams.get('limit') ?? '0') };
}

async function main() {
  console.log('\n── 1. Lever pagination (documented skip/limit) ──');

  {
    /* Exactly one short page: must stop after one request. */
    const urls: string[] = [];
    const deps: ProviderDeps = { fetchJson: async (url) => { urls.push(url); return [post(1), post(2)]; } };
    const jobs = await fetchLever(leverSource, deps);
    check('a single short page returns its jobs', jobs.length === 2);
    check('and makes exactly one request', urls.length === 1, String(urls.length));
    check('the request carries documented skip and limit',
      paging(urls[0]).limit > 0 && paging(urls[0]).skip === 0, urls[0]);
  }

  {
    /* 250 postings over pages of 100 -> 3 requests, offsets 0/100/200. */
    const TOTAL = 250;
    const urls: string[] = [];
    const deps: ProviderDeps = {
      fetchJson: async (url) => {
        urls.push(url);
        const { skip, limit } = paging(url);
        return Array.from({ length: Math.max(0, Math.min(limit, TOTAL - skip)) }, (_, k) => post(skip + k));
      },
    };
    const jobs = await fetchLever(leverSource, deps);
    check('every page is followed to the end', jobs.length === TOTAL, String(jobs.length));
    check('no posting is lost', new Set(jobs.map((j) => j.externalId)).size === TOTAL);
    check('offsets progress correctly',
      urls.map((u) => paging(u).skip).join(',') === '0,100,200', urls.map((u) => paging(u).skip).join(','));
    check('it stops at the short page — no extra request', urls.length === 3, String(urls.length));
  }

  {
    /* A page boundary landing exactly on the page size still terminates. */
    const TOTAL = 200;
    let calls = 0;
    const deps: ProviderDeps = {
      fetchJson: async (url) => {
        calls += 1;
        const { skip, limit } = paging(url);
        return Array.from({ length: Math.max(0, Math.min(limit, TOTAL - skip)) }, (_, k) => post(skip + k));
      },
    };
    const jobs = await fetchLever(leverSource, deps);
    check('an exact multiple of the page size terminates on the empty page',
      jobs.length === TOTAL && calls === 3, `${jobs.length} jobs / ${calls} calls`);
  }

  {
    /* A provider that IGNORES skip would loop forever. It must not. */
    let calls = 0;
    const deps: ProviderDeps = {
      fetchJson: async () => { calls += 1; return Array.from({ length: 100 }, (_, k) => post(k)); },
    };
    const jobs = await fetchLever(leverSource, deps);
    check('a provider ignoring skip does NOT loop forever', calls <= 3, `${calls} calls`);
    check('and the repeated page is not double-counted', jobs.length === 100, String(jobs.length));
  }

  {
    /* Hard page ceiling, even with always-new full pages. */
    let calls = 0;
    const deps: ProviderDeps = {
      fetchJson: async (url) => {
        calls += 1;
        const { skip, limit } = paging(url);
        return Array.from({ length: limit }, (_, k) => post(skip + k));
      },
    };
    const jobs = await fetchLever(leverSource, deps);
    check('an endless board is stopped by the page cap', calls <= 50, `${calls} calls`);
    check('and still returns what it read', jobs.length > 0);
  }

  {
    const deps: ProviderDeps = { fetchJson: async () => [] };
    check('an empty first page yields no jobs and no error',
      (await fetchLever(leverSource, deps)).length === 0);
  }
  {
    const deps: ProviderDeps = { fetchJson: async () => null };
    check('a failed request yields no jobs rather than throwing',
      (await fetchLever(leverSource, deps)).length === 0);
  }
  {
    /* Failure midway keeps what was already read. */
    let n = 0;
    const deps: ProviderDeps = {
      fetchJson: async (url) => {
        n += 1;
        if (n > 1) return null;
        const { skip, limit } = paging(url);
        return Array.from({ length: limit }, (_, k) => post(skip + k));
      },
    };
    check('a mid-pagination failure keeps the pages already fetched',
      (await fetchLever(leverSource, deps)).length === 100);
  }
  check('a source with no board slug fetches nothing',
    (await fetchLever({ ...leverSource, board: '' }, { fetchJson: async () => [post(1)] })).length === 0);

  console.log('\n── 2. Ashby and Greenhouse do not paginate (documented) ──');

  {
    const urls: string[] = [];
    const deps: ProviderDeps = {
      fetchJson: async (url) => { urls.push(url); return { jobs: [{ id: 'a1', title: 'Eng', location: 'Pune, India', isListed: true, descriptionHtml: '<p>x</p>', jobUrl: 'https://jobs.ashbyhq.com/a/a1', applyUrl: 'https://jobs.ashbyhq.com/a/a1/application' }] }; },
    };
    const jobs = await fetchAshby({ ...leverSource, provider: 'ashby', host: 'api.ashbyhq.com' } as ScrapeSource, deps);
    check('Ashby makes exactly one request — no invented paging', urls.length === 1);
    check('and no page/cursor parameter is fabricated',
      !/[?&](page|cursor|skip|offset)=/.test(urls[0]), urls[0]);
    check('Ashby still returns its jobs', jobs.length === 1);
  }
  {
    const urls: string[] = [];
    const deps: ProviderDeps = {
      fetchJson: async (url) => { urls.push(url); return { jobs: [{ id: 1, title: 'Eng', location: { name: 'Pune, India' }, absolute_url: 'https://boards.greenhouse.io/g/jobs/1', content: '&lt;p&gt;x&lt;/p&gt;' }] }; },
    };
    const jobs = await fetchGreenhouse({ ...leverSource, provider: 'greenhouse', host: 'boards-api.greenhouse.io' } as ScrapeSource, deps);
    check('Greenhouse makes exactly one request', urls.length === 1);
    check('and no paging parameter is fabricated',
      !/[?&](page|cursor|skip|offset)=/.test(urls[0]), urls[0]);
    check('Greenhouse still returns its jobs', jobs.length === 1);
  }

  console.log('\n── 3. Truncation is visible, never silent ──');

  process.env.LEVER_COMPANIES = 'acme|Acme|IN';
  delete process.env.ASHBY_JOB_BOARDS;
  delete process.env.GREENHOUSE_BOARDS;

  {
    /* 40 distinct jobs, run capped at 10. */
    const deps: ProviderDeps = {
      fetchJson: async (url) => {
        const { skip, limit } = paging(url);
        return Array.from({ length: Math.max(0, Math.min(limit, 40 - skip)) }, (_, k) => ({
          ...post(skip + k), text: `Role ${skip + k}`,
        }));
      },
    };
    const out = await runApprovedScrape({ deps, totalLimit: 10 });
    check('the run fetches everything the source offered', out.fetched === 40, String(out.fetched));
    check('the CSV is capped at the limit', out.jobs.length === 10, String(out.jobs.length));
    check('the dropped jobs are COUNTED, not silently lost',
      out.truncated === 30, String(out.truncated));
    check('fetched + truncated accounting is consistent',
      out.jobs.length + out.truncated + out.duplicates === out.active,
      `${out.jobs.length}+${out.truncated}+${out.duplicates} vs ${out.active}`);
  }
  {
    /* Under the cap, nothing is truncated. */
    const deps: ProviderDeps = {
      fetchJson: async (url) => {
        const { skip, limit } = paging(url);
        return Array.from({ length: Math.max(0, Math.min(limit, 5 - skip)) }, (_, k) => ({ ...post(skip + k), text: `Role ${skip + k}` }));
      },
    };
    const out = await runApprovedScrape({ deps, totalLimit: 100 });
    check('a run inside its limit truncates nothing', out.truncated === 0);
    check('and carries every job forward', out.jobs.length === 5);
  }
  {
    /* Duplicates are counted even when the cap bites — the old code checked
       the cap first and undercounted them. */
    const deps: ProviderDeps = {
      fetchJson: async (url) => {
        const { skip, limit } = paging(url);
        /* Every posting carries the SAME title/company/location, so all but
           the first are fingerprint duplicates — while keeping distinct
           provider ids so pagination still advances. */
        return Array.from({ length: Math.max(0, Math.min(limit, 20 - skip)) }, (_, k) => ({
          ...post(skip + k), text: 'Identical Role',
        }));
      },
    };
    const out = await runApprovedScrape({ deps, totalLimit: 2 });
    check('within-run duplicates are counted regardless of the cap',
      out.duplicates === 19, String(out.duplicates));
    check('only the unique job survives', out.jobs.length === 1, String(out.jobs.length));
    check('nothing is truncated when duplicates absorbed the excess',
      out.truncated === 0, String(out.truncated));
  }

  console.log('\n── 4. Source failure is distinguishable from an empty source ──');

  {
    const deps: ProviderDeps = { fetchJson: async () => [] };
    const out = await runApprovedScrape({ deps, totalLimit: 50 });
    check('a SUCCESSFUL empty source reports discovered 0 and failed 0',
      out.active === 0 && out.failed === 0, `active=${out.active} failed=${out.failed}`);
    check('and the source is not marked failed',
      out.perSource.every((s) => !s.failed));
  }
  {
    const deps: ProviderDeps = { fetchJson: async () => { throw new Error('provider down'); } };
    const out = await runApprovedScrape({ deps, totalLimit: 50 });
    check('a FAILED source reports failed >= 1', out.failed >= 1, String(out.failed));
    check('and is flagged per source', out.perSource.some((s) => s.failed));
    check('no error detail leaks into the summary',
      out.perSource.every((s) => !s.error || !/stack|at \s/i.test(String(s.error))));
    /* This is the distinction Phase 8 relies on for absence evidence. */
    check('an empty run and a failed run are NOT the same shape',
      out.failed !== 0);
  }
  {
    /* One source fails, another succeeds — isolation. */
    process.env.LEVER_COMPANIES = 'acme|Acme|IN';
    process.env.GREENHOUSE_BOARDS = 'beta|Beta|IN';
    const deps: ProviderDeps = {
      fetchJson: async (url) => {
        if (url.includes('lever')) throw new Error('down');
        return { jobs: [{ id: 7, title: 'Platform Engineer', location: { name: 'Pune, India' }, absolute_url: 'https://boards.greenhouse.io/beta/jobs/7', content: '&lt;p&gt;x&lt;/p&gt;' }] };
      },
    };
    const out = await runApprovedScrape({ deps, totalLimit: 50 });
    check('one broken source does not stop the others', out.jobs.length === 1, String(out.jobs.length));
    check('the failure is still reported', out.failed === 1, String(out.failed));
    check('per-source status shows exactly one failure',
      out.perSource.filter((s) => s.failed).length === 1);
    delete process.env.GREENHOUSE_BOARDS;
  }

  console.log('\n── 5. Metric definitions are mutually exclusive ──');

  {
    process.env.LEVER_COMPANIES = 'acme|Acme|IN';
    const deps: ProviderDeps = {
      fetchJson: async (url) => {
        const { skip, limit } = paging(url);
        return Array.from({ length: Math.max(0, Math.min(limit, 6 - skip)) }, (_, k) => ({ ...post(skip + k), text: `Role ${skip + k}` }));
      },
    };
    const out = await runApprovedScrape({ deps, totalLimit: 50 });
    check('discovered equals the jobs that passed validation', out.active === 6, String(out.active));
    check('the CSV row count equals what will be offered to the importer',
      out.csv.trim().split('\n').length - 1 === out.jobs.length);
    check('rejected counts only jobs the fetch stage refused', out.rejected === 0);
    check('a truncated run never reports its dropped jobs as failures',
      (await runApprovedScrape({ deps, totalLimit: 2 })).failed === 0);
  }

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
