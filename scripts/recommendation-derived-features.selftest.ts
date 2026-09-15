/**
 * Derived recommendation features must be the scan, not an approximation of it.
 *
 *   npx tsx scripts/recommendation-derived-features.selftest.ts
 *
 * ═══ WHAT THIS BUYS, AND WHAT IT RISKS ═══
 *
 * `skillsInText(description)` is the most expensive step in ranking — 426 us
 * per posting against 13 us for the scoring loop that consumes it — and it was
 * paid on every ranking pass, for every viewer. Its answer depends only on the
 * text, so it is derived once per corpus version and handed to the scorer.
 *
 * Measured over the production corpus: 52.30 MB of descriptions reduce to
 * 0.27 MB of features, a 99.49% reduction, and ranking five profiles over
 * 12,659 postings falls from 27,865 ms to 592 ms.
 *
 * The risk is precise: a derived value that disagrees with what the live scan
 * would have produced changes scores silently, with no error anywhere. So the
 * derivation calls the SAME function the scorer falls back to, and this file
 * holds that identity.
 *
 * Pure. No database, no network.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { skillsInText } from '@/lib/server/ats/skills-in-text';
import { extractRequiredYears } from '@/lib/server/ats/text';
import { deriveRecFeatures, recFeaturesFor, clearRecFeatures, recFeaturesState } from '@/lib/server/recommendation-features';
import { buildRecProfile, recommendMatch, type RecJob } from '@/lib/server/job-recommend';

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const NOW = 1_760_000_000_000;
const profile = buildRecProfile({
  headline: 'Senior Backend Engineer', skills: ['python', 'django', 'kotlin', 'aws'],
  location: 'Bengaluru, India', experience: [{ title: 'Engineer', period: '2019 - 2026' }], interests: [],
});

/* The shapes that break a careless derivation. 41% of the production corpus
   has NO description at all (5,192 of 12,659), so the empty cases are the
   common path, not an exotic one. */
const TEXTS = [
  '', '   ', 'No skills named here at all.',
  'Requires python and django. 5+ years experience.',
  'PYTHON and Django and AWS.', 'python, python, python!',
  'C++ / C# / .NET and kotlin.', 'Uses aws.  Needs 7+ years.',
  'ünïcøde ✨ Ω requires kotlin and swift. 3+ years.',
  'a'.repeat(20_000) + ' python',
  'Go and R and C are ordinary English words here.',
];

function derivationIsTheScan() {
  console.log('\n── 1. The derivation IS the live function ──');
  for (const text of TEXTS) {
    const f = deriveRecFeatures(text);
    const expectSkills = text ? skillsInText(text) : [];
    const expectYears = text ? extractRequiredYears(text) : null;
    check(`skills match for ${JSON.stringify(text.slice(0, 28))}`,
      JSON.stringify(f.skills) === JSON.stringify(expectSkills),
      `${JSON.stringify(f.skills)} vs ${JSON.stringify(expectSkills)}`);
    check(`years match for ${JSON.stringify(text.slice(0, 28))}`, f.years === expectYears,
      `${f.years} vs ${expectYears}`);
  }
  check('a missing description derives empty, not a crash',
    JSON.stringify(deriveRecFeatures(undefined)) === JSON.stringify({ skills: [], years: null }));
  check('null behaves the same', JSON.stringify(deriveRecFeatures(null).skills) === '[]');
}

function scoringIsUnchanged() {
  console.log('\n── 2. Features and descriptions score identically ──');
  const base = {
    id: 'j1', title: 'Backend Engineer', organizationName: 'Acme', location: 'Bengaluru, India',
    employmentType: 'full-time', workMode: 'remote', experienceLevel: 'senior',
    preferredSkills: [] as string[], targetRoleKeywords: [] as string[],
    createdAt: new Date(NOW - 3_600_000).toISOString(),
  };
  for (const text of TEXTS) {
    const f = deriveRecFeatures(text);
    const withText = recommendMatch(profile, { ...base, description: text } as RecJob, NOW);
    const withFeat = recommendMatch(profile,
      { ...base, description: '', recSkills: f.skills, recYears: f.years } as RecJob, NOW);
    check(`identical match for ${JSON.stringify(text.slice(0, 24))}`,
      JSON.stringify(withText) === JSON.stringify(withFeat),
      `${withText.score} vs ${withFeat.score}`);
  }
}

function absentFeaturesFallBack() {
  console.log('\n── 3. Without features the scan still runs ──');
  /* The fallback is what keeps every existing caller — tests, scripts, the
     row/recommended scopes — producing what it always did. */
  const job = {
    id: 'j2', title: 'Engineer', organizationName: 'Acme', location: 'Bengaluru, India',
    employmentType: 'full-time', workMode: 'remote', experienceLevel: 'senior',
    description: 'Requires python and django. 5+ years.',
    preferredSkills: [], targetRoleKeywords: [], createdAt: new Date(NOW).toISOString(),
  } as RecJob;
  const scanned = recommendMatch(profile, job, NOW);
  check('the description path still finds skills', scanned.matchedSkills.length > 0,
    scanned.matchedSkills.join(','));
  /* recYears absent (undefined) must mean "scan", while an explicit null means
     "the scan found nothing" — collapsing the two would drop an explanation. */
  const explicitNull = recommendMatch(profile, { ...job, description: '', recSkills: [], recYears: null } as RecJob, NOW);
  check('an explicit null year is honoured, not re-scanned',
    !JSON.stringify(explicitNull).includes('years asked'));
}

async function versionKeyingIsolates() {
  console.log('\n── 4. A corpus version can never borrow another\'s features ──');
  clearRecFeatures();
  const v1Jobs = [{ id: 'a', description: 'Requires python and django.' }];
  const v2Jobs = [{ id: 'a', description: 'Requires kotlin and swift.' }];

  const f1 = await recFeaturesFor('v1', v1Jobs);
  check('v1 derives from v1 descriptions',
    JSON.stringify(f1?.get('a')?.skills) === JSON.stringify(skillsInText(v1Jobs[0].description)));
  check('the held set reports v1', recFeaturesState().version === 'v1');

  /* THE staleness regression: serving v1 features for a v2 snapshot would score
     the new description against the old skills. */
  const f2 = await recFeaturesFor('v2', v2Jobs);
  check('v2 derives fresh rather than reusing v1',
    JSON.stringify(f2?.get('a')?.skills) === JSON.stringify(skillsInText(v2Jobs[0].description)));
  check('and v1 features are not what v2 got',
    JSON.stringify(f2?.get('a')?.skills) !== JSON.stringify(f1?.get('a')?.skills));
  check('the held set moved to v2', recFeaturesState().version === 'v2');

  check('an unknown version yields nothing rather than a guess',
    (await recFeaturesFor(null, v2Jobs)) === null);

  clearRecFeatures();
  check('clearing drops the set', recFeaturesState().size === 0);
}

function oneImplementationOnly() {
  console.log('\n── 5. The algorithm exists once ──');
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const shared = strip(readFileSync('lib/server/ats/skills-in-text.ts', 'utf8'));
  const feat = strip(readFileSync('lib/server/recommendation-features.ts', 'utf8'));
  const scorer = strip(readFileSync('lib/server/job-recommend.ts', 'utf8'));

  check('the derivation imports the shared scan', /import \{ skillsInText \}/.test(feat));
  check('the scorer imports it too', /import \{ skillsInText \}/.test(scorer));
  check('neither reimplements the surface loop',
    !/ALL_SURFACE_FORMS/.test(feat) && !/ALL_SURFACE_FORMS/.test(scorer));
  check('the derivation reuses extractRequiredYears', /import \{ extractRequiredYears \}/.test(feat));
  check('no skill memo survives anywhere',
    !/textSkillCache/.test(shared + feat + scorer));
  check('the feature set is registered for job-write invalidation',
    /registerRecommendationCache\(\{ clear: \(\) => clearRecFeatures\(\) \}\)/.test(feat));
  check('a failed derivation cannot install a partial set',
    /set && set\.version === version \? set\.byId : null/.test(feat));
}

async function main() {
  derivationIsTheScan();
  scoringIsUnchanged();
  absentFeaturesFallBack();
  await versionKeyingIsolates();
  oneImplementationOnly();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

main().catch((error) => {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
});
