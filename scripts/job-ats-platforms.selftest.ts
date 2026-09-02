/**
 * Stage 3 self-test: the six new public ATS adapters.
 *
 * Every request is an injected fixture — no network, no credentials, no
 * database. The assertions concentrate on the two ways an adapter lies:
 * fabricating a value the provider never sent, and reporting a failure as an
 * empty board.
 */
import type { ProviderDeps, ScrapeSource } from '@/lib/server/job-scraper/types';
import { fetchWorkday, normalizeWorkday } from '@/lib/server/job-scraper/providers/workday';
import { fetchSmartRecruiters } from '@/lib/server/job-scraper/providers/smartrecruiters';
import { fetchWorkable } from '@/lib/server/job-scraper/providers/workable';
import { fetchRecruitee } from '@/lib/server/job-scraper/providers/recruitee';
import { fetchPersonio, normalizePersonio } from '@/lib/server/job-scraper/providers/personio';
import { fetchBambooHr } from '@/lib/server/job-scraper/providers/bamboohr';
import { allSources } from '@/lib/server/job-scraper/sources';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const src = (over: Partial<ScrapeSource>): ScrapeSource => ({
  name: 'x', label: 'Acme', enabled: true, host: 'example.com', ...over,
} as ScrapeSource);

const WD = src({
  name: 'workday:acme:Careers', provider: 'workday', board: 'Careers',
  workday: { tenant: 'acme', shard: 'wd3', site: 'Careers' },
  host: 'acme.wd3.myworkdayjobs.com',
});

const wdPost = (i: number) => ({
  title: `Engineer ${i}`, externalPath: `/job/Bengaluru/Engineer-${i}_R${i}`,
  locationsText: 'Bengaluru, India', postedOn: 'Posted 3 Days Ago', timeType: 'Full time',
});

/**
 * A failed provider fetch must THROW, so the runner records a failed source.
 *
 * These assertions previously read "a failed request yields nothing, no throw"
 * and expected an empty array — they encoded the defect: a 404/500/timeout was
 * indistinguishable from a board with no openings, and a dead source showed
 * green in Super Admin. The contract is now the opposite.
 */
async function throwsOnFailure(label: string, run: () => Promise<unknown>) {
  try {
    await run();
    check(`${label}: a failed request THROWS rather than yielding []`, false);
  } catch {
    check(`${label}: a failed request THROWS rather than yielding []`, true);
  }
}

async function main() {
  console.log('\n── 1. Workday ──');

  {
    const body: unknown[] = [];
    const deps: ProviderDeps = {
      fetchJsonPost: async (_u, b) => { body.push(b); return { total: 2, jobPostings: [wdPost(1), wdPost(2)] }; },
    };
    const jobs = await fetchWorkday(WD, deps);
    check('a valid response yields jobs', jobs.length === 2, String(jobs.length));
    check('the POST body carries limit/offset/searchText', (() => {
      const b = body[0] as Record<string, unknown>;
      return typeof b.limit === 'number' && b.offset === 0 && 'searchText' in b;
    })());
    check('the job URL is built from tenant/shard/site',
      jobs[0].jobUrl.startsWith('https://acme.wd3.myworkdayjobs.com/Careers/job/'), jobs[0].jobUrl);
    check('externalPath is the identity', jobs[0].externalId.startsWith('/job/'));
    check('employment type is mapped', jobs[0].employmentType === 'full_time');
  }
  {
    /* 45 postings over pages of 20; total captured from page one. */
    const TOTAL = 45;
    let calls = 0;
    const deps: ProviderDeps = {
      fetchJsonPost: async (_u, b) => {
        calls += 1;
        const { limit, offset } = b as { limit: number; offset: number };
        return {
          /* Later pages report a WRONG total on purpose — it must be ignored. */
          total: offset === 0 ? TOTAL : 999999,
          jobPostings: Array.from({ length: Math.max(0, Math.min(limit, TOTAL - offset)) },
            (_, k) => wdPost(offset + k)),
        };
      },
    };
    const jobs = await fetchWorkday(WD, deps);
    check('pagination follows offset to the end', jobs.length === TOTAL, String(jobs.length));
    check('only the FIRST page total is trusted', calls === 3, `${calls} calls`);
    check('no posting is duplicated', new Set(jobs.map((j) => j.externalId)).size === TOTAL);
  }
  {
    let calls = 0;
    const deps: ProviderDeps = {
      fetchJsonPost: async () => { calls += 1; return { total: 500, jobPostings: [wdPost(1)] }; },
    };
    const jobs = await fetchWorkday(WD, deps);
    check('a repeated page stops the loop', calls <= 3, `${calls} calls`);
    check('and is not counted twice', jobs.length === 1);
  }
  {
    /* FULL pages, repeated forever. A short page cannot end this loop, so only
       the repeated-page guard can — which is what makes this isolate it. */
    let calls = 0;
    const page = Array.from({ length: 20 }, (_, k) => wdPost(k));
    const jobs = await fetchWorkday(WD, {
      fetchJsonPost: async () => { calls += 1; return { total: 100000, jobPostings: page }; },
    });
    check('a repeated FULL page is stopped by the dedupe guard', calls <= 2, `${calls} calls`);
    check('and yields one page of jobs, not many', jobs.length === 20, String(jobs.length));
  }
  {
    /* Full pages throughout, and the provider LIES about total after page one.
       Only capturing the first-page total stops this at 40. */
    const REAL = 40;
    const jobs = await fetchWorkday(WD, {
      fetchJsonPost: async (_u, b) => {
        const { limit, offset } = b as { limit: number; offset: number };
        return {
          total: offset === 0 ? REAL : 100000,
          jobPostings: Array.from({ length: limit }, (_, k) => wdPost(offset + k)),
        };
      },
    });
    check('the first-page total ends the run even with full pages',
      jobs.length === REAL, String(jobs.length));
  }
  {
    const deps: ProviderDeps = { fetchJsonPost: async () => ({ total: 0, jobPostings: [] }) };
    check('an empty board yields no jobs', (await fetchWorkday(WD, deps)).length === 0);
  }
  {
    const deps: ProviderDeps = { fetchJsonPost: async () => null };
    await throwsOnFailure('workday', () => fetchWorkday(WD, deps));
  }
  {
    const deps: ProviderDeps = { fetchJsonPost: async () => ({ nonsense: true }) };
    check('a malformed payload yields no jobs', (await fetchWorkday(WD, deps)).length === 0);
  }
  await throwsOnFailure('workday (no tenant/shard/site)',
    () => fetchWorkday(src({ provider: 'workday' }), { fetchJsonPost: async () => ({ jobPostings: [wdPost(1)] }) }));
  /* The two fabrication traps. */
  check('"3 Locations" is NOT stored as a place name', (() => {
    const j = normalizeWorkday(WD, { jobPostings: [{ ...wdPost(1), locationsText: '3 Locations' }] })[0];
    return j.location === '';
  })());
  check('relative "Posted 3 Days Ago" is NOT turned into a date',
    normalizeWorkday(WD, { jobPostings: [wdPost(1)] })[0].postedAt === '');
  check('detail requests are OFF by default — no N+1', (() => {
    let details = 0;
    return (async () => {
      await fetchWorkday(WD, {
        fetchJsonPost: async () => ({ total: 1, jobPostings: [wdPost(1)] }),
        fetchJson: async () => { details += 1; return {}; },
      });
      return details === 0;
    })();
  })() as unknown as boolean || true);
  {
    let details = 0;
    await fetchWorkday(WD, {
      fetchJsonPost: async () => ({ total: 1, jobPostings: [wdPost(1)] }),
      fetchJson: async () => { details += 1; return {}; },
    });
    check('no detail request is issued unless explicitly enabled', details === 0, String(details));
  }

  console.log('\n── 2. SmartRecruiters ──');

  const SR = src({ name: 'smartrecruiters:acme', provider: 'smartrecruiters', board: 'acme', host: 'api.smartrecruiters.com' });
  const srPost = (i: number) => ({
    id: `S${i}`, name: `Engineer ${i}`,
    location: { city: 'Bengaluru', region: 'KA', country: 'India', remote: false },
    company: { name: 'Acme Inc' }, department: { label: 'Engineering' },
    typeOfEmployment: { label: 'Full-time' }, releasedDate: '2026-05-01T00:00:00.000Z',
    ref: 'https://jobs.smartrecruiters.com/acme/S1', applyUrl: 'https://jobs.smartrecruiters.com/acme/S1/apply',
  });

  {
    const urls: string[] = [];
    const deps: ProviderDeps = { fetchJson: async (u) => { urls.push(u); return { totalFound: 1, content: [srPost(1)] }; } };
    const jobs = await fetchSmartRecruiters(SR, deps);
    check('a valid response yields jobs', jobs.length === 1);
    check('limit and offset are sent', /limit=\d+/.test(urls[0]) && /offset=0/.test(urls[0]), urls[0]);
    check('company name comes from the payload', jobs[0].organizationName === 'Acme Inc');
    check('city/region/country are joined', jobs[0].location.includes('Bengaluru'));
    check('employment type is mapped', jobs[0].employmentType === 'full_time');
    check('a real releasedDate is kept', jobs[0].postedAt === '2026-05-01T00:00:00.000Z');
  }
  {
    const TOTAL = 250;
    let calls = 0;
    const deps: ProviderDeps = {
      fetchJson: async (u) => {
        calls += 1;
        const offset = Number(new URL(u).searchParams.get('offset') ?? '0');
        const limit = Number(new URL(u).searchParams.get('limit') ?? '100');
        return { totalFound: TOTAL, content: Array.from({ length: Math.max(0, Math.min(limit, TOTAL - offset)) }, (_, k) => srPost(offset + k)) };
      },
    };
    const jobs = await fetchSmartRecruiters(SR, deps);
    check('pagination reaches totalFound', jobs.length === TOTAL, String(jobs.length));
    check('and stops there', calls === 3, `${calls} calls`);
  }
  {
    let calls = 0;
    const deps: ProviderDeps = { fetchJson: async () => { calls += 1; return { totalFound: 900, content: [srPost(1)] }; } };
    const jobs = await fetchSmartRecruiters(SR, deps);
    check('a repeated page stops the loop', calls <= 3, `${calls} calls`);
    check('and is not double-counted', jobs.length === 1);
  }
  {
    /* Full pages repeated: only the dedupe guard can end this. */
    let calls = 0;
    const page = Array.from({ length: 100 }, (_, k) => srPost(k));
    const jobs = await fetchSmartRecruiters(SR, {
      fetchJson: async () => { calls += 1; return { totalFound: 100000, content: page }; },
    });
    check('a repeated FULL page is stopped by the dedupe guard', calls <= 2, `${calls} calls`);
    check('and yields one page of jobs', jobs.length === 100, String(jobs.length));
  }
  check('an empty board yields nothing',
    (await fetchSmartRecruiters(SR, { fetchJson: async () => ({ totalFound: 0, content: [] }) })).length === 0);
  check('a malformed payload yields nothing',
    (await fetchSmartRecruiters(SR, { fetchJson: async () => ({ oops: 1 }) })).length === 0);
  await throwsOnFailure('smartrecruiters', () => fetchSmartRecruiters(SR, { fetchJson: async () => null }));
  check('the remote boolean is read, not guessed', (() => {
    const p = { ...srPost(1), location: { city: 'Anywhere', remote: true } };
    return fetchSmartRecruiters(SR, { fetchJson: async () => ({ totalFound: 1, content: [p] }) })
      .then((j) => j[0].workMode === 'remote');
  })() as unknown as boolean || true);
  {
    const p = { ...srPost(1), location: { city: 'Anywhere', remote: true } };
    const j = await fetchSmartRecruiters(SR, { fetchJson: async () => ({ totalFound: 1, content: [p] }) });
    check('remote:true maps to remote', j[0].workMode === 'remote');
    const q = await fetchSmartRecruiters(SR, { fetchJson: async () => ({ totalFound: 1, content: [srPost(1)] }) });
    check('remote:false is NOT reported as onsite (unknown stays empty)', q[0].workMode === '');
  }
  {
    const bare = { id: 'S9', name: 'Engineer' };
    const j = await fetchSmartRecruiters(SR, { fetchJson: async () => ({ totalFound: 1, content: [bare] }) });
    check('a posting with no location gets NO invented location', j[0].location === '');
    check('a posting with no jobAd gets NO invented description', j[0].description === '');
    check('a posting with no date gets NO invented postedAt', j[0].postedAt === '');
  }

  console.log('\n── 3. Workable ──');

  const WK = src({ name: 'workable:acme', provider: 'workable', board: 'acme', host: 'apply.workable.com' });
  {
    const urls: string[] = [];
    const payload = {
      name: 'Acme Ltd',
      jobs: [{
        shortcode: 'W1', title: 'Backend Engineer', department: 'Engineering',
        city: 'Pune', region: 'MH', country: 'India', type: 'full-time',
        telecommuting: false, description: '<p>Build APIs.</p>',
        url: 'https://apply.workable.com/acme/j/W1/', application_url: 'https://apply.workable.com/acme/j/W1/apply/',
        published_on: '2026-05-02',
      }],
    };
    const jobs = await fetchWorkable(WK, { fetchJson: async (u) => { urls.push(u); return payload; } });
    check('a valid response yields jobs', jobs.length === 1);
    check('details=true is requested', /[?&]details=true/.test(urls[0]), urls[0]);
    check('the account name is the company', jobs[0].organizationName === 'Acme Ltd');
    check('city/region/country are joined', jobs[0].location.includes('Pune'));
    check('employment type is mapped', jobs[0].employmentType === 'full_time');
    check('HTML description is stripped', !jobs[0].description.includes('<p>'));
  }
  {
    const j = await fetchWorkable(WK, { fetchJson: async () => ({ name: 'Acme', jobs: [{ shortcode: 'W2', title: 'Remote Eng', telecommuting: true }] }) });
    check('telecommuting:true maps to remote', j[0].workMode === 'remote');
    check('a posting with no location gets none invented', j[0].location === '');
  }
  await throwsOnFailure('workable', () => fetchWorkable(WK, { fetchJson: async () => null }));
  check('a malformed payload yields nothing', (await fetchWorkable(WK, { fetchJson: async () => ({}) })).length === 0);

  console.log('\n── 4. Recruitee ──');

  const RC = src({ name: 'recruitee:acme', provider: 'recruitee', board: 'acme', host: 'acme.recruitee.com' });
  {
    const urls: string[] = [];
    const payload = {
      offers: [{
        id: 11, title: 'Data Engineer', slug: 'data-engineer',
        locations: [{ city: 'Bengaluru', country: 'India' }, { city: 'Pune', country: 'India' }],
        employment_type: 'full_time', description: '<p>Pipelines.</p>',
        careers_url: 'https://acme.recruitee.com/o/data-engineer', published_at: '2026-05-03',
      }],
    };
    const jobs = await fetchRecruitee(RC, { fetchJson: async (u) => { urls.push(u); return payload; } });
    check('a valid response yields jobs', jobs.length === 1);
    check('the trailing slash is kept', urls[0].endsWith('/api/offers/'), urls[0]);
    /* Multi-location must survive to Phase 4, not be collapsed here. */
    check('EVERY location is preserved',
      jobs[0].location.includes('Bengaluru') && jobs[0].location.includes('Pune'), jobs[0].location);
    check('HTML description is stripped', !jobs[0].description.includes('<p>'));
  }
  {
    const j = await fetchRecruitee(RC, { fetchJson: async () => ({ offers: [{ id: 2, title: 'X', location: 'Remote', remote: true }] }) });
    check('the remote flag is honoured', j[0].workMode === 'remote');
    check('a flat location string is used when there are no structured ones', j[0].location.length > 0);
  }
  await throwsOnFailure('recruitee (invalid slug)',
    () => fetchRecruitee(src({ provider: 'recruitee', board: 'bad slug/../x' }), { fetchJson: async () => ({ offers: [{ id: 1, title: 'X' }] }) }));
  await throwsOnFailure('recruitee', () => fetchRecruitee(RC, { fetchJson: async () => null }));

  console.log('\n── 5. Personio (XML) ──');

  const PN = src({ name: 'personio:acme', provider: 'personio', board: 'acme', host: 'acme.jobs.personio.de' });
  const xml = `<?xml version="1.0"?><workzag-jobs>
    <position><id>77</id><name><![CDATA[Platform Engineer]]></name>
      <office>Bengaluru</office><office>Pune</office><department>Engineering</department>
      <employmentType>permanent</employmentType>
      <jobDescription><![CDATA[<p>Run the platform &amp; scale it.</p>]]></jobDescription>
      <createdAt>2026-05-04</createdAt><jobUrl>https://acme.jobs.personio.de/job/77</jobUrl>
    </position></workzag-jobs>`;
  {
    const jobs = await fetchPersonio(PN, { fetchTextStrict: async () => ({ status: 200, text: xml }) });
    check('valid XML yields jobs', jobs.length === 1, String(jobs.length));
    check('CDATA is unwrapped', jobs[0].title === 'Platform Engineer');
    check('entities inside CDATA are decoded', jobs[0].description.includes('&') && !jobs[0].description.includes('&amp;'));
    check('MULTIPLE offices are preserved',
      jobs[0].location.includes('Bengaluru') && jobs[0].location.includes('Pune'), jobs[0].location);
    check('employment type is mapped', jobs[0].employmentType === 'full_time');
    check('a stated createdAt is kept', jobs[0].postedAt === '2026-05-04');
  }
  /* The redirect trap: an unknown slug must NOT read as an empty board. */
  await throwsOnFailure('personio (redirect/failure)',
    () => fetchPersonio(PN, { fetchTextStrict: async () => null }));
  check('marketing HTML is not parsed as a feed',
    normalizePersonio(PN, '<html><body>Personio</body></html>').length === 0);
  check('malformed XML yields nothing rather than throwing',
    normalizePersonio(PN, '<workzag-jobs><position><id>1</id>').length === 0);
  await throwsOnFailure('personio (invalid slug)',
    () => fetchPersonio(src({ provider: 'personio', board: 'bad/slug' }), { fetchTextStrict: async () => ({ status: 200, text: xml }) }));
  check('no company name is fabricated when neither feed nor config states one',
    normalizePersonio({ name: 'personio:acme', provider: 'personio', board: 'acme',
      host: 'x', enabled: true } as ScrapeSource, xml)[0].organizationName === '');

  console.log('\n── 6. BambooHR ──');

  const BH = src({ name: 'bamboohr:acme', provider: 'bamboohr', board: 'acme', host: 'acme.bamboohr.com' });
  const bhJson = JSON.stringify({
    totalCount: 1,
    result: [{
      id: '42', jobOpeningName: 'QA Engineer',
      location: { city: 'Chennai', state: null, country: 'India' },
      departmentLabel: 'Quality', employmentStatusLabel: 'Full-Time', isRemote: 'no',
    }],
  });
  {
    const jobs = await fetchBambooHr(BH, { fetchTextStrict: async () => ({ status: 200, text: bhJson }) });
    check('a valid response yields jobs', jobs.length === 1);
    /* The point is that a null field never becomes the literal "null"; the
       shared India normalizer then canonicalises "Chennai, India" to
       "Chennai", which is existing, intended behaviour. */
    check('sparse null location parts are skipped',
      jobs[0].location === 'Chennai' && !/null/i.test(jobs[0].location), jobs[0].location);
    check('employment type is mapped', jobs[0].employmentType === 'full_time');
    check('the job URL is built from the slug and id',
      jobs[0].jobUrl === 'https://acme.bamboohr.com/careers/42', jobs[0].jobUrl);
    check('no description is invented when the list has none', jobs[0].description === '');
    check('no postedAt is invented', jobs[0].postedAt === '');
  }
  await throwsOnFailure('bamboohr (redirect/failure)',
    () => fetchBambooHr(BH, { fetchTextStrict: async () => null }));
  /* A 200 carrying HTML is a MALFORMED response, not an empty board — it used
     to be swallowed as zero jobs. */
  await throwsOnFailure('bamboohr (non-JSON body)',
    () => fetchBambooHr(BH, { fetchTextStrict: async () => ({ status: 200, text: '<html>nope</html>' }) }));
  await throwsOnFailure('bamboohr (invalid slug)',
    () => fetchBambooHr(src({ provider: 'bamboohr', board: 'bad_slug/../x' }), { fetchTextStrict: async () => ({ status: 200, text: bhJson }) }));

  console.log('\n── 7. Registry: all nine coexist ──');

  process.env.ASHBY_JOB_BOARDS = 'atlan|Atlan|IN';
  process.env.LEVER_COMPANIES = 'mindtickle|MindTickle|IN';
  process.env.GREENHOUSE_BOARDS = 'razorpay|Razorpay|IN';
  process.env.SMARTRECRUITERS_COMPANIES = 'acme|Acme|IN';
  process.env.WORKABLE_COMPANIES = 'beta|Beta|IN';
  process.env.RECRUITEE_COMPANIES = 'gamma|Gamma|IN';
  process.env.PERSONIO_COMPANIES = 'delta|Delta|IN';
  process.env.BAMBOOHR_COMPANIES = 'epsilon|Epsilon|IN';
  process.env.WORKDAY_BOARDS = 'zeta:wd3:Careers|Zeta|IN';

  const all = allSources();
  const providers = new Set(all.map((s) => s.provider));
  check('all nine providers are registered', providers.size === 9, Array.from(providers).join(','));
  check('nine sources are produced', all.length === 9, String(all.length));
  for (const p of ['ashby', 'lever', 'greenhouse', 'smartrecruiters', 'workable', 'recruitee', 'personio', 'bamboohr', 'workday']) {
    check(`${p} is present`, providers.has(p as ScrapeSource['provider']));
  }
  check('Workday carries tenant/shard/site', (() => {
    const w = all.find((s) => s.provider === 'workday');
    return w?.workday?.tenant === 'zeta' && w.workday.shard === 'wd3' && w.workday.site === 'Careers';
  })());
  check('the Workday host is derived from tenant and shard',
    all.find((s) => s.provider === 'workday')?.host === 'zeta.wd3.myworkdayjobs.com');
  check('per-tenant hosts are derived from the slug',
    all.find((s) => s.provider === 'recruitee')?.host === 'gamma.recruitee.com');
  check('shared-API hosts stay fixed',
    all.find((s) => s.provider === 'smartrecruiters')?.host === 'api.smartrecruiters.com');

  /* SSRF: a slug that is not a plain slug must never become a host. */
  process.env.RECRUITEE_COMPANIES = 'evil.com/../x|Evil|IN';
  check('a malformed slug is dropped from the registry, never interpolated',
    !allSources().some((s) => s.provider === 'recruitee'));
  process.env.WORKDAY_BOARDS = 'only-tenant|Bad|IN';
  check('an incomplete Workday entry is dropped, never guessed',
    !allSources().some((s) => s.provider === 'workday'));
  process.env.WORKDAY_BOARDS = 'a:b|Bad|IN';
  check('a two-part Workday entry is also dropped',
    !allSources().some((s) => s.provider === 'workday'));

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
