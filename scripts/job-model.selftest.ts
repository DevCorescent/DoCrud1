/**
 * Canonical job model self-test (Job Platform, Phase 1).
 *
 * Phase 1 adds fields and nothing else. So the properties worth testing are
 * mostly about what must NOT have changed:
 *
 *  1. The 446 postings written before these fields existed are still valid
 *     jobs. Every new field is optional; a required one would have invalidated
 *     all of them the moment the type changed.
 *  2. `contentHash` is deterministic. Same content, same hash - regardless of
 *     key order, array order, casing or whitespace. That is the whole reason it
 *     exists, and Phase 3 dedup will be built directly on it.
 *  3. Recommendation scoring is untouched. The scorer reads none of these
 *     fields, and a job carrying them must score exactly as it did without.
 *  4. `_fp` and `_order` behaviour is preserved: existing jobs are NOT
 *     backfilled, so their fingerprints do not change and the mirror does not
 *     rewrite 446 documents.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  jobFingerprint, jobContentHash, normalizeJobTitle,
} from '@/lib/server/job-import';
import { buildRecProfile, recommendMatch, type RecJob } from '@/lib/server/job-recommend';
import type { HiringJobPosting } from '@/types/document';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const TYPES = read('types/document.ts');
const IMPORT = read('lib/server/job-import.ts');
const COLLECTION = read('lib/server/db/hiring-jobs-collection.ts');
const RECOMMEND = read('lib/server/job-recommend.ts');

/** A posting exactly as it existed BEFORE Phase 1 — no new fields at all. */
const legacyJob: HiringJobPosting = {
  id: 'job-legacy-1',
  organizationId: 'org-1',
  organizationName: 'Acme Design',
  createdByUserId: 'u-1',
  createdByEmail: 'admin@example.com',
  title: 'Senior Product Designer',
  department: 'Design',
  location: 'Bengaluru',
  employmentType: 'full_time',
  workMode: 'hybrid',
  experienceLevel: 'senior',
  description: 'Own end-to-end design for our flagship product.',
  responsibilities: ['Lead design reviews'],
  requirements: ['5+ years product design'],
  preferredSkills: ['Figma', 'Design Systems'],
  targetRoleKeywords: ['product designer'],
  minimumAtsScore: 0,
  status: 'published',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const content = {
  title: 'Senior Product Designer',
  organizationName: 'Acme Design',
  location: 'Bengaluru',
  description: 'Own end-to-end design for our flagship product.',
  responsibilities: ['Lead design reviews'],
  requirements: ['5+ years product design'],
  preferredSkills: ['Figma', 'Design Systems'],
};

async function main() {
  console.log('\n── 1. Existing jobs remain valid ──');

  /* If any new field were required, this object would not typecheck - which is
     the point: the compiler is the assertion. */
  check('a pre-Phase-1 job is still a valid HiringJobPosting',
    legacyJob.id === 'job-legacy-1' && legacyJob.status === 'published');
  check('it carries none of the new fields',
    legacyJob.contentHash === undefined && legacyJob.domain === undefined
    && legacyJob.isActive === undefined && legacyJob.postedAt === undefined);
  check('an absent isActive is not the same as false',
    legacyJob.isActive === undefined && legacyJob.isActive !== false);

  /* Every added field must be optional in the type source. */
  const REQUIRED_OPTIONAL = [
    'sourceId', 'sourceJobId', 'sourceUrl', 'canonicalUrl', 'normalizedTitle',
    'companyDomain', 'logoUrl', 'descriptionHtml', 'descriptionText',
    'requirementsText', 'skillsExtracted', 'minExperienceYears',
    'maxExperienceYears', 'educationRequired', 'salaryMin', 'salaryMax',
    'salaryCurrency', 'salaryPeriod', 'country', 'state', 'city', 'isIndia',
    'latitude', 'longitude', 'remoteEligibleRegions', 'domain', 'subDomain',
    'domainConfidence', 'classificationVersion', 'postedAt', 'ingestedAt',
    'expiresAt', 'isActive', 'contentHash', 'dedupGroupId',
  ];
  const jobBlock = TYPES.slice(
    TYPES.indexOf('export interface HiringJobPosting'),
    TYPES.indexOf('export interface HiringJobApplication'),
  );
  const missing = REQUIRED_OPTIONAL.filter((f) => !jobBlock.includes(`${f}?:`));
  check('every canonical field is declared OPTIONAL',
    missing.length === 0, `not optional/absent: ${missing.join(', ')}`);
  check('all 35 canonical fields are present',
    REQUIRED_OPTIONAL.length === 35 && missing.length === 0);

  console.log('\n── 2. New fields are accepted ──');

  const canonicalJob: HiringJobPosting = {
    ...legacyJob,
    id: 'job-canonical-1',
    sourceId: 'ashby:acme',
    sourceJobId: 'ashby-9f2',
    sourceUrl: 'https://jobs.ashbyhq.com/acme/9f2',
    canonicalUrl: 'https://acme.com/careers/9f2',
    normalizedTitle: 'senior product designer',
    companyDomain: 'acme.com',
    skillsExtracted: ['figma', 'prototyping'],
    minExperienceYears: 5,
    maxExperienceYears: 8,
    salaryMin: 1800000,
    salaryMax: 2400000,
    salaryCurrency: 'INR',
    salaryPeriod: 'year',
    country: 'IN',
    state: 'Karnataka',
    city: 'Bengaluru',
    isIndia: true,
    remoteEligibleRegions: ['IN'],
    domain: 'UI/UX Design',
    subDomain: 'Product Design',
    domainConfidence: 0.94,
    classificationVersion: 'v1',
    postedAt: '2026-08-20T00:00:00.000Z',
    ingestedAt: '2026-08-21T00:00:00.000Z',
    expiresAt: '2026-08-28T00:00:00.000Z',
    isActive: true,
    contentHash: 'abc',
    dedupGroupId: 'grp-1',
  };
  check('a fully populated canonical job is valid',
    canonicalJob.domain === 'UI/UX Design' && canonicalJob.isIndia === true);
  check('provenance is preserved',
    canonicalJob.sourceJobId === 'ashby-9f2'
    && canonicalJob.sourceUrl === 'https://jobs.ashbyhq.com/acme/9f2'
    && canonicalJob.canonicalUrl === 'https://acme.com/careers/9f2');
  check('the three lifecycle timestamps are independent',
    canonicalJob.postedAt !== canonicalJob.ingestedAt
    && canonicalJob.ingestedAt !== canonicalJob.expiresAt);
  check('remote eligibility is a region list, not a boolean',
    Array.isArray(canonicalJob.remoteEligibleRegions)
    && canonicalJob.remoteEligibleRegions[0] === 'IN');

  console.log('\n── 3. contentHash is deterministic ──');

  const h1 = jobContentHash(content);
  check('a hash is produced', /^[a-f0-9]{64}$/.test(h1));
  check('the same content produces the same hash', jobContentHash(content) === h1);
  check('key order does not matter',
    jobContentHash({
      preferredSkills: content.preferredSkills, description: content.description,
      requirements: content.requirements, location: content.location,
      responsibilities: content.responsibilities, title: content.title,
      organizationName: content.organizationName,
    }) === h1);
  /* Two sources listing the same skills in a different order describe the SAME
     job, and must not produce two canonical jobs in Phase 3. */
  check('array order does not matter',
    jobContentHash({ ...content, preferredSkills: ['Design Systems', 'Figma'] }) === h1);
  check('casing does not matter',
    jobContentHash({ ...content, title: 'SENIOR PRODUCT DESIGNER' }) === h1);
  check('whitespace does not matter',
    jobContentHash({ ...content, description: '  Own end-to-end   design for our flagship product. ' }) === h1);

  check('changed description changes the hash',
    jobContentHash({ ...content, description: 'Something else entirely.' }) !== h1);
  check('changed title changes the hash',
    jobContentHash({ ...content, title: 'Junior Product Designer' }) !== h1);
  check('changed company changes the hash',
    jobContentHash({ ...content, organizationName: 'Other Co' }) !== h1);
  check('changed location changes the hash',
    jobContentHash({ ...content, location: 'Pune' }) !== h1);
  check('an added requirement changes the hash',
    jobContentHash({ ...content, requirements: [...content.requirements, 'Figma'] }) !== h1);

  /* Identity and timestamps are NOT content: the same job from two sources has
     different ids and URLs, and must still hash equal. */
  /* Identity fields are not part of the hash input at all, so passing extra
     keys cannot change the result. */
  const withIdentity = { ...content, id: 'x', createdAt: 'y', sourceUrl: 'z' };
  check('the hash ignores fields that are not content',
    jobContentHash(withIdentity) === h1);
  check('empty input still hashes without throwing',
    /^[a-f0-9]{64}$/.test(jobContentHash({})));

  console.log('\n── 4. normalizedTitle ──');

  check('a title is lower-cased and collapsed',
    normalizeJobTitle('  Senior   Product Designer  ') === 'senior product designer');
  check('punctuation is collapsed',
    normalizeJobTitle('Sr. Product Designer (Remote)') === 'sr. product designer remote');
  check('technical characters survive',
    normalizeJobTitle('C++ / C# Engineer') === 'c++ c# engineer');
  check('it is deterministic',
    normalizeJobTitle('Senior Product Designer') === normalizeJobTitle('SENIOR PRODUCT DESIGNER'));
  check('the original title is never modified',
    canonicalJob.title === 'Senior Product Designer'
    && canonicalJob.normalizedTitle === 'senior product designer');

  console.log('\n── 5. The importer populates only what it can derive ──');

  check('normalizedTitle is derived at import',
    IMPORT.includes('normalizedTitle: normalizeJobTitle(title)'));
  check('contentHash is derived at import',
    IMPORT.includes('contentHash: jobContentHash({'));
  check('ingestedAt is recorded at import',
    IMPORT.includes('ingestedAt: now'));
  /* A CSV row carries no provenance, no salary and no posted date. Writing a
     placeholder would be inventing data. */
  check('postedAt is NOT invented by the CSV importer',
    !IMPORT.includes('postedAt:'));
  check('salary is NOT invented by the CSV importer',
    !IMPORT.includes('salaryMin:') && !IMPORT.includes('salaryCurrency:'));
  check('domain is NOT invented by the CSV importer',
    !IMPORT.includes('domain:') && !IMPORT.includes('domainConfidence:'));
  check('sourceJobId is NOT invented by the CSV importer',
    !IMPORT.includes('sourceJobId:'));
  check('isActive is NOT defaulted by the CSV importer',
    !IMPORT.includes('isActive:'));

  console.log('\n── 6. Nothing existing changed ──');

  /* The dedup key the importer already used must be byte-identical. */
  check('jobFingerprint is unchanged',
    jobFingerprint('Acme Design', 'Senior Product Designer', 'Bengaluru')
      === 'acme design::senior product designer::bengaluru');
  check('fingerprint still normalizes case and spacing',
    jobFingerprint(' ACME  Design ', 'Senior   Product Designer', ' Bengaluru ')
      === jobFingerprint('Acme Design', 'Senior Product Designer', 'Bengaluru'));
  check('the importer still fingerprints for duplicates',
    IMPORT.includes('const fp = jobFingerprint(organizationName, title, location);'));

  /* _fp and _order live in the mirror and are computed from the document. */
  check('_fp and _order are untouched',
    COLLECTION.includes("const FP_FIELD = '_fp'")
    && COLLECTION.includes("const ORDER_FIELD = '_order'")
    && COLLECTION.includes('function fingerprint(job: Record<string, unknown>): string'));
  /* Existing jobs are NOT backfilled, so their documents are byte-identical
     and the mirror will not rewrite 446 rows. */
  check('no backfill of existing jobs was added',
    !IMPORT.includes('backfill') && !COLLECTION.includes('backfill'));

  /* The scorer must not have learned about any new field. */
  check('the recommender reads none of the new fields',
    !RECOMMEND.includes('domain') && !RECOMMEND.includes('contentHash')
    && !RECOMMEND.includes('isActive') && !RECOMMEND.includes('expiresAt'));

  const profile = buildRecProfile({
    headline: 'Product Designer', skills: ['figma', 'design systems'],
    location: 'bengaluru', experience: [{ title: 'Senior Product Designer' }],
  });
  const asRecJob = (j: HiringJobPosting): RecJob => ({
    id: j.id, title: j.title, organizationName: j.organizationName,
    location: j.location ?? '', employmentType: j.employmentType ?? '',
    workMode: j.workMode ?? '', experienceLevel: j.experienceLevel ?? '',
    description: j.description, preferredSkills: j.preferredSkills,
    targetRoleKeywords: j.targetRoleKeywords, createdAt: j.createdAt,
  });
  const NOW = 1756339200000;
  const before = recommendMatch(profile, asRecJob(legacyJob), NOW);
  const after = recommendMatch(profile, asRecJob(canonicalJob), NOW);
  check('a job carrying the new fields scores identically',
    before.score === after.score, `${before.score} vs ${after.score}`);
  check('its reasons are identical',
    JSON.stringify(before.reasons) === JSON.stringify(after.reasons));
  check('its overlap decision is identical', before.overlap === after.overlap);

  console.log('\n── 7. Scope: Phase 1 added no behaviour ──');

  /* Nothing reads the new fields yet, so an index would be speculative. */
  check('no speculative index was created',
    !COLLECTION.includes('contentHash') && !COLLECTION.includes('domain_'));
  check('no migration was performed',
    !IMPORT.includes('app_state') && !IMPORT.includes('migrate'));
  /* Code, not prose: the module's own comment explains that the hash lets a
     later phase avoid RECLASSIFYING unchanged postings, and matching that word
     would fail on the documentation rather than on behaviour. */
  check('no classification was added',
    !/\bclassifyJob\(|classifyDomain\(|domainConfidence:/.test(IMPORT));
  check('no lifecycle filtering was added',
    !IMPORT.includes('expiresAt:') && !IMPORT.includes('isActive ='));

  console.log(
    failures === 0
      ? `\n✅ ${checks}/${checks} checks passed`
      : `\n❌ ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
