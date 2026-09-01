/**
 * Phase 3 self-test: normalization, identity and deduplication.
 *
 * Everything here tests BEHAVIOUR through the public functions - given these
 * source records, what does the store end up holding? None of it asserts on
 * internal structure, so the implementation can be rewritten without rewriting
 * the test.
 *
 * NO DATABASE. `planIngest` is pure: it takes drafts plus the current job list
 * and returns the next one. That is what lets the whole dedup contract be
 * proven here rather than against a live Mongo.
 */
import type { HiringJobPosting } from '@/types/document';
import type { NormalizedJob } from '@/lib/server/job-scraper/types';
import { canonicalizeJobUrl, jobIdentity } from '@/lib/server/job-sources/identity';
import {
  normalizeSourceJob, tidyDescription, tidyLocation, tidyPostedAt, tidyText,
} from '@/lib/server/job-sources/normalize';
import { planIngest, storedJobIdentity } from '@/lib/server/job-sources/ingest';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const NOW = Date.parse('2026-06-01T12:00:00.000Z');

/** A source record with sane defaults; every test overrides only what it means. */
function srcJob(over: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    source: 'lever:acme',
    provider: 'lever',
    externalId: 'ext-1',
    title: 'Senior Software Engineer',
    organizationName: 'Acme Corp',
    location: 'Bengaluru',
    department: 'Engineering',
    employmentType: 'Full Time',
    workMode: 'Remote',
    experienceLevel: 'Senior',
    description: 'Build things.',
    responsibilities: ['Ship features'],
    requirements: ['5 years'],
    preferredSkills: ['React'],
    targetRoleKeywords: [],
    salaryPresent: false,
    postedAt: '2026-05-20T00:00:00.000Z',
    jobUrl: 'https://jobs.lever.co/acme/abc-123',
    applyUrl: 'https://jobs.lever.co/acme/abc-123/apply',
    isActive: true,
    ...over,
  } as NormalizedJob;
}

const draft = (over: Partial<NormalizedJob> = {}, sourceId = 'lever:acme') =>
  normalizeSourceJob(srcJob(over), { sourceId, now: NOW });

function main() {
  console.log('\n── 1. Whitespace and capitalization normalization ──');

  check('leading/trailing whitespace is trimmed', draft({ title: '  Senior Software Engineer  ' }).title === 'Senior Software Engineer');
  check('runs of spaces collapse', draft({ title: 'Senior   Software    Engineer' }).title === 'Senior Software Engineer');
  check('tabs and newlines collapse to one space', draft({ title: 'Senior\tSoftware\nEngineer' }).title === 'Senior Software Engineer');
  check('a non-breaking space becomes an ordinary space', tidyText('Senior Engineer') === 'Senior Engineer');
  check('zero-width characters are removed', tidyText('Sen​ior') === 'Senior');
  /* The three spellings the brief calls out must reach one normalized title. */
  const spellings = ['Senior Software Engineer', ' senior software engineer ', 'Senior   Software   Engineer']
    .map((t) => draft({ title: t }).normalizedTitle);
  check('the three title spellings normalize to one value', new Set(spellings).size === 1, JSON.stringify(spellings));
  check('but the DISPLAY title keeps the source capitalization',
    draft({ title: ' senior software engineer ' }).title === 'senior software engineer');
  check('capitalization alone does not change identity',
    draft({ title: 'SENIOR SOFTWARE ENGINEER' }).identity.key === draft().identity.key);
  check('a company name keeps its legal suffix (not over-normalized)',
    draft({ organizationName: '  Acme   Corp Inc.  ' }).organizationName === 'Acme Corp Inc.');
  check('a recognized Indian city alias canonicalizes', tidyLocation('bangalore') === 'Bengaluru');
  check('an unrecognized location is left as written', tidyLocation('  Zurich, CH ') === 'Zurich, CH');
  check('HTML in a description becomes plain text',
    !tidyDescription('<p>Build <b>things</b>.</p>').includes('<'));
  check('an HTML entity is decoded, not left raw',
    !tidyDescription('R&amp;D team').includes('&amp;'));

  console.log('\n── 2. URL canonicalization ──');

  const base = 'https://jobs.lever.co/acme/abc-123';
  check('tracking parameters are removed',
    canonicalizeJobUrl(`${base}?utm_source=x&utm_medium=y&gclid=z&fbclid=w`) === base);
  check('a fragment is removed', canonicalizeJobUrl(`${base}#apply`) === base);
  check('a trailing slash is removed', canonicalizeJobUrl(`${base}/`) === base);
  check('the host is lower-cased', canonicalizeJobUrl('https://JOBS.LEVER.CO/acme/abc-123') === base);
  check('www is dropped', canonicalizeJobUrl('https://www.jobs.lever.co/acme/abc-123') === base);
  check('http and https reach one key', canonicalizeJobUrl(`http://${base.slice(8)}`) === base);
  check('a default port is dropped', canonicalizeJobUrl('https://jobs.lever.co:443/acme/abc-123') === base);
  /* The critical non-destructive rule: an identifying parameter must survive. */
  check('an IDENTIFYING query parameter is kept',
    canonicalizeJobUrl('https://boards.greenhouse.io/acme?gh_jid=99') === 'https://boards.greenhouse.io/acme?gh_jid=99');
  check('two jobs on the same path with different ids stay different',
    canonicalizeJobUrl('https://b.io/x?jobId=1') !== canonicalizeJobUrl('https://b.io/x?jobId=2'));
  check('parameter ORDER does not change the result',
    canonicalizeJobUrl('https://b.io/x?a=1&b=2') === canonicalizeJobUrl('https://b.io/x?b=2&a=1'));
  check('an identifying parameter survives alongside tracking noise',
    canonicalizeJobUrl('https://b.io/x?utm_source=q&jobId=7') === 'https://b.io/x?jobId=7');
  check('a malformed URL yields no key rather than a bad one', canonicalizeJobUrl('not a url') === '');
  check('an empty URL yields no key', canonicalizeJobUrl('') === '');
  check('a non-http scheme is refused', canonicalizeJobUrl('javascript:alert(1)') === '');
  check('a relative URL is refused', canonicalizeJobUrl('/jobs/abc') === '');

  console.log('\n── 3. Identity precedence and stability ──');

  check('an external id is preferred over a URL', draft().identity.basis === 'external_id');
  check('with no external id the canonical URL is used',
    draft({ externalId: '' }).identity.basis === 'canonical_url');
  check('with neither, a fingerprint is the last resort',
    draft({ externalId: '', jobUrl: '', applyUrl: '' }).identity.basis === 'fingerprint');
  check('identity is stable across repeated calls', draft().identity.key === draft().identity.key);
  check('identity is unaffected by tracking noise on the URL',
    draft({ externalId: '', jobUrl: `${base}?utm_source=news` }).identity.key
      === draft({ externalId: '' }).identity.key);
  check('identity is unaffected by a description edit',
    draft({ description: 'Completely rewritten.' }).identity.key === draft().identity.key);
  check('identity is unaffected by a salary or location edit',
    draft({ location: 'Pune' }).identity.key === draft().identity.key);
  check('a different external id is a different job',
    draft({ externalId: 'ext-2' }).identity.key !== draft().identity.key);
  check('the SAME external id on a DIFFERENT source is a different job',
    draft({}, 'lever:other').identity.key !== draft({}, 'lever:acme').identity.key);
  check('title alone is never the identity',
    jobIdentity({ sourceId: 's', title: 'X' }).key !== jobIdentity({ sourceId: 's', title: 'X', location: 'Pune' }).key);
  check('an unusual character in an external id is handled',
    typeof draft({ externalId: 'a/b cé#1' }).identity.key === 'string'
      && draft({ externalId: 'a/b cé#1' }).identity.key === draft({ externalId: 'a/b cé#1' }).identity.key);
  check('two ids that would collide under naive concatenation do not',
    draft({ externalId: 'a b' }).identity.key !== draft({ externalId: 'a  b' }).identity.key);

  console.log('\n── 4. Deduplication: what IS a duplicate ──');

  const empty: HiringJobPosting[] = [];
  const first = planIngest([draft()], empty, { now: '2026-06-01T12:00:00.000Z' });
  check('a new job is created', first.report.created === 1 && first.jobs.length === 1);

  const again = planIngest([draft()], first.jobs, { now: '2026-06-02T12:00:00.000Z' });
  check('the SAME external id is recognised as the same job', again.report.created === 0);
  check('identical content is reported unchanged', again.report.unchanged === 1);
  check('an unchanged run does not grow the store', again.jobs.length === 1);
  check('an unchanged run does not touch updatedAt',
    again.jobs[0].updatedAt === first.jobs[0].updatedAt);

  const byUrl = planIngest([draft({ externalId: '' })], empty);
  const byUrlAgain = planIngest(
    [draft({ externalId: '', jobUrl: `${base}?utm_campaign=spring#apply` })], byUrl.jobs);
  check('the same canonical URL is recognised as the same job',
    byUrlAgain.report.created === 0 && byUrlAgain.jobs.length === 1);

  const dupBatch = planIngest([draft(), draft(), draft()], empty);
  check('a board listing one posting three times stores it once',
    dupBatch.report.created === 1 && dupBatch.jobs.length === 1);
  check('the in-batch duplicates are reported, not hidden', dupBatch.report.duplicatesInBatch === 2);

  console.log('\n── 5. Deduplication: what is NOT a duplicate ──');

  const twoTitles = planIngest([
    draft({ externalId: 'a', title: 'Software Engineer' }),
    draft({ externalId: 'b', title: 'Software Engineer' }),
  ], empty);
  check('the same title with different ids stays TWO jobs', twoTitles.jobs.length === 2);

  const twoCities = planIngest([
    draft({ externalId: 'a', location: 'Pune' }),
    draft({ externalId: 'b', location: 'Bengaluru' }),
  ], empty);
  check('same company + title, different cities and ids stays TWO jobs', twoCities.jobs.length === 2);

  /* Without ids or URLs the fingerprint is all there is - location must still
     separate two postings. */
  const fpCities = planIngest([
    draft({ externalId: '', jobUrl: '', applyUrl: '', location: 'Pune' }),
    draft({ externalId: '', jobUrl: '', applyUrl: '', location: 'Chennai' }),
  ], empty);
  check('under fingerprint identity, different cities stay TWO jobs', fpCities.jobs.length === 2);

  const crossSource = planIngest([
    draft({}, 'lever:acme'),
    draft({}, 'greenhouse:acme'),
  ], empty);
  check('the same vacancy from TWO sources is kept separate, not merged',
    crossSource.jobs.length === 2);

  console.log('\n── 6. Updates: changed source data ──');

  const changed = planIngest(
    [draft({ description: 'Now with more detail.', location: 'Pune' })],
    first.jobs, { now: '2026-06-03T12:00:00.000Z' });
  check('changed content updates rather than duplicating',
    changed.report.updated === 1 && changed.jobs.length === 1);
  check('the update is applied', changed.jobs[0].description === 'Now with more detail.');
  check('the update refreshes updatedAt', changed.jobs[0].updatedAt === '2026-06-03T12:00:00.000Z');
  check('the record keeps its original id', changed.jobs[0].id === first.jobs[0].id);
  check('the record keeps its original createdAt', changed.jobs[0].createdAt === first.jobs[0].createdAt);
  check('a taken-down posting updates the existing record',
    planIngest([draft({ isActive: false })], first.jobs).report.updated === 1);
  check('a taken-down posting is NOT created as a new record',
    planIngest([draft({ isActive: false })], empty).report.created === 0);

  console.log('\n── 7. Idempotence over repeated runs ──');

  let store: HiringJobPosting[] = [];
  for (let i = 0; i < 10; i += 1) {
    store = planIngest([draft({ externalId: 'a' }), draft({ externalId: 'b' })], store).jobs;
  }
  check('ten identical runs leave exactly two jobs', store.length === 2, `got ${store.length}`);
  const tenth = planIngest([draft({ externalId: 'a' }), draft({ externalId: 'b' })], store);
  check('the tenth run reports everything unchanged', tenth.report.unchanged === 2 && tenth.report.created === 0);

  console.log('\n── 8. Member-posted jobs are untouchable ──');

  const memberJob: HiringJobPosting = {
    id: 'job-member', organizationId: 'u-1', organizationName: 'Acme Corp',
    createdByUserId: 'u-1', createdByEmail: 'a@b.c',
    title: 'Senior Software Engineer', location: 'Bengaluru',
    description: 'Written by a person.', responsibilities: [], requirements: [],
    preferredSkills: [], targetRoleKeywords: [], minimumAtsScore: 72,
    status: 'published', createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  check('a member-posted job has no source identity', storedJobIdentity(memberJob) === null);
  const withMember = planIngest([draft()], [memberJob]);
  check('a scraper run never matches a member-posted job', withMember.report.created === 1);
  check('the member job survives untouched',
    withMember.jobs.find((j) => j.id === 'job-member')?.description === 'Written by a person.');
  check('the member job keeps its ATS cutoff',
    withMember.jobs.find((j) => j.id === 'job-member')?.minimumAtsScore === 72);

  console.log('\n── 9. Platform-owned fields survive ingestion ──');

  const unpublished: HiringJobPosting[] = [{ ...first.jobs[0], status: 'draft', minimumAtsScore: 55 }];
  const rerun = planIngest([draft({ description: 'Edited.' })], unpublished);
  check('an admin-unpublished posting is NOT republished by a run',
    rerun.jobs[0].status === 'draft');
  check('an admin-set ATS cutoff is not reset by a run', rerun.jobs[0].minimumAtsScore === 55);
  check('ownership is not rewritten by a run',
    rerun.jobs[0].organizationId === first.jobs[0].organizationId);

  console.log('\n── 10. Missing, empty and malformed input ──');

  check('a job with no title is rejected, not stored',
    planIngest([draft({ title: '   ' })], empty).jobs.length === 0);
  check('the rejection is reported with a reason',
    planIngest([draft({ title: '' })], empty).report.rejected[0]?.reason === 'missing_title_or_company');
  check('a job with no company is rejected',
    planIngest([draft({ organizationName: '' })], empty).jobs.length === 0);
  check('a job with no external id still ingests via its URL',
    planIngest([draft({ externalId: '' })], empty).report.created === 1);
  check('a job with no URL still ingests via its fingerprint',
    planIngest([draft({ jobUrl: '', applyUrl: '' })], empty).report.created === 1);
  check('a job with neither id nor URL still ingests',
    planIngest([draft({ externalId: '', jobUrl: '', applyUrl: '' })], empty).report.created === 1);
  check('null and undefined fields do not throw', (() => {
    try {
      const d = normalizeSourceJob({
        ...srcJob(),
        location: undefined as unknown as string,
        description: null as unknown as string,
        responsibilities: undefined as unknown as string[],
        department: null as unknown as string,
      }, { now: NOW });
      return d.title === 'Senior Software Engineer' && Array.isArray(d.responsibilities);
    } catch { return false; }
  })());
  check('an empty batch is a no-op', planIngest([], empty).jobs.length === 0);
  check('an unparseable postedAt becomes absent, not epoch zero',
    tidyPostedAt('not a date') === undefined);
  check('a future postedAt is refused', tidyPostedAt('2999-01-01T00:00:00.000Z', NOW) === undefined);
  check('an absurd past postedAt is refused', tidyPostedAt('1970-01-01T00:00:00.000Z', NOW) === undefined);
  check('a valid postedAt survives as ISO',
    tidyPostedAt('2026-05-20', NOW) === '2026-05-20T00:00:00.000Z');
  check('an unrecognized employment type falls back rather than dropping the job',
    draft({ employmentType: 'Full-time (Permanent)' }).employmentType === 'full_time');
  check('a known alias maps through the SHARED table',
    draft({ employmentType: 'FULL_TIME' }).employmentType === 'full_time'
      && draft({ workMode: 'wfh' }).workMode === 'remote'
      && draft({ experienceLevel: 'sr' }).experienceLevel === 'senior');

  console.log('\n── 11. Nothing is invented ──');

  const d = draft();
  check('salary is never fabricated — the source states none',
    !('salaryMin' in d) && !('salaryMax' in d));
  check('a created record carries no salary either',
    planIngest([draft()], empty).jobs[0].salaryMin === undefined);
  check('an absent location is undefined, not an empty string',
    planIngest([draft({ location: '' })], empty).jobs[0].location === undefined);
  check('provenance is recorded on the stored record', (() => {
    const j = planIngest([draft()], empty).jobs[0];
    return j.sourceId === 'lever:acme' && j.sourceJobId === 'ext-1'
      && Boolean(j.canonicalUrl) && Boolean(j.contentHash) && Boolean(j.ingestedAt);
  })());
  check('the stored record is marked as scraper-sourced',
    planIngest([draft()], empty).jobs[0].source === 'scraper');

  console.log('\n── 12. Determinism ──');

  const a = normalizeSourceJob(srcJob(), { now: NOW });
  const b = normalizeSourceJob(srcJob(), { now: NOW });
  check('normalization is byte-identical across calls', JSON.stringify(a) === JSON.stringify(b));
  check('the content hash is stable', a.contentHash === b.contentHash);
  check('list ORDER differences do not change the content hash',
    normalizeSourceJob(srcJob({ requirements: ['x', 'y'] }), { now: NOW }).contentHash
      === normalizeSourceJob(srcJob({ requirements: ['y', 'x'] }), { now: NOW }).contentHash);
  check('a real content change DOES change the hash',
    normalizeSourceJob(srcJob({ description: 'Different.' }), { now: NOW }).contentHash !== a.contentHash);
  check('two adapters emitting equivalent data agree on content', (() => {
    const ashby = normalizeSourceJob(srcJob({
      source: 'ashby:acme', provider: 'ashby',
      title: '  Senior   Software Engineer ', location: 'bangalore',
      employmentType: 'FullTime', workMode: 'WFH',
    }), { sourceId: 's', now: NOW });
    const lever = normalizeSourceJob(srcJob({
      source: 'lever:acme', provider: 'lever',
      title: 'Senior Software Engineer', location: 'Bengaluru',
      employmentType: 'full-time', workMode: 'remote',
    }), { sourceId: 's', now: NOW });
    return ashby.contentHash === lever.contentHash
      && ashby.employmentType === lever.employmentType
      && ashby.workMode === lever.workMode;
  })());
  check('every input is accounted for in the report', (() => {
    const r = planIngest([
      draft({ externalId: 'a' }), draft({ externalId: 'a' }),
      draft({ externalId: 'b' }), draft({ title: '' }),
    ], empty).report;
    return r.created + r.updated + r.unchanged + r.duplicatesInBatch + r.rejected.length === 4;
  })());

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
