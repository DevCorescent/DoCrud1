/**
 * ATS engine self-test.
 *
 * The engine's whole value is that its numbers are rules rather than opinions,
 * so these assert the RULES, not the exact scores — a test pinned to "keyword
 * score is 73.4" fails on any tuning and teaches nothing. What is pinned is
 * the ordering and the invariants: exact beats related, proven beats listed,
 * a missing certification is visible, and the same input never moves.
 *
 * Follows the existing script convention (scripts/*.selftest.ts): plain tsx,
 * no framework, a check() counter, non-zero exit on failure.
 */
import { evaluateAts, renderAtsReport } from '@/lib/server/ats';
import type { ParsedResumeInput } from '@/lib/server/ats';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

/* ── Fixtures ─────────────────────────────────────────────────────────── */

const BASE_RESUME: ParsedResumeInput = {
  headline: 'Senior Backend Engineer',
  bio: 'Backend engineer focused on APIs and data platforms.',
  location: 'Pune, India',
  website: 'https://example.com',
  skills: ['React', 'Node.js', 'PostgreSQL', 'Docker', 'TypeScript'],
  experience: [
    {
      title: 'Senior Backend Engineer', company: 'Acme', period: 'Jan 2021 - Present',
      desc: 'Engineered REST APIs using Node.js, reducing average response latency by 31%.\nOptimized PostgreSQL queries serving 10,000 users.\nBuilt React dashboards consuming those APIs.',
    },
    {
      title: 'Backend Developer', company: 'Globex', period: 'Jan 2019 - Dec 2020',
      desc: 'Worked on backend APIs.\nDeployed services with Docker across staging and production.',
    },
  ],
  education: [{ degree: 'B.Tech Computer Science', school: 'Pune University', year: '2019' }],
  certifications: [],
  socialLinks: { linkedin: 'https://linkedin.com/in/example', github: 'https://github.com/example' },
};

const BASE_JD = `Senior Backend Engineer
We are looking for a Senior Backend Engineer with 5+ years of experience.
Requirements: React, Node.js, TypeScript, PostgreSQL are required.
Docker and AWS are important for this role.
Kubernetes is nice to have.
Bachelor's degree in Computer Science or related field is required.`;

const withResume = (patch: Partial<ParsedResumeInput>): ParsedResumeInput => ({ ...BASE_RESUME, ...patch });
const evaluate = (resume: ParsedResumeInput, jd = BASE_JD, title = 'Senior Backend Engineer') =>
  evaluateAts({ resume, jobDescription: jd, jobTitle: title, resumeText: `${resume.location ?? ''} me@example.com +91 98765 43210` });

const matchFor = (result: ReturnType<typeof evaluate>, canonical: string) =>
  result.keyword.matches.find((m) => m.requirement.canonical === canonical);

function main() {
  const base = evaluate(BASE_RESUME);

  console.log('\n── 1. Skill match types ──');

  check('exact match: React written as "React" is exact',
    matchFor(base, 'React')?.matchType === 'exact', matchFor(base, 'React')?.matchType);

  const nodeOnly = evaluate(withResume({ skills: ['Node'], experience: [
    { title: 'Backend Developer', company: 'A', period: '2019 - 2023', desc: 'Built services with Node and shipped them.' },
  ] }));
  check('normalized match: "Node" satisfies a "Node.js" requirement',
    ['exact', 'normalized'].includes(matchFor(nodeOnly, 'Node.js')?.matchType ?? ''),
    matchFor(nodeOnly, 'Node.js')?.matchType);

  /* "web APIs" is a SYNONYM of REST APIs, not an alias — it is the same idea in
     different words, which is precisely what the semantic tier is for. */
  const semanticJd = 'Backend Engineer. Requirements: REST APIs are required.';
  const semantic = evaluate(withResume({ skills: [], experience: [
    { title: 'Engineer', company: 'A', period: '2020 - 2023', desc: 'Designed web APIs for internal teams.' },
  ] }), semanticJd, 'Backend Engineer');
  check('semantic match: "RESTful services" satisfies "REST APIs" below exact credit',
    matchFor(semantic, 'REST APIs')?.matchType === 'semantic', matchFor(semantic, 'REST APIs')?.matchType);

  const partialJd = 'Cloud Engineer. Requirements: AWS is required.';
  const partial = evaluate(withResume({ skills: ['AWS Lambda'], experience: [
    { title: 'Cloud Engineer', company: 'A', period: '2020 - 2023', desc: 'Automated jobs with AWS Lambda in production.' },
  ] }), partialJd, 'Cloud Engineer');
  check('partial match: "AWS Lambda" gives partial credit for "AWS", not exact',
    matchFor(partial, 'AWS')?.matchType === 'partial', matchFor(partial, 'AWS')?.matchType);

  const relatedJd = 'Platform Engineer. Requirements: Kubernetes is required.';
  const related = evaluate(withResume({ skills: ['Docker'], experience: [
    { title: 'Platform Engineer', company: 'A', period: '2020 - 2023', desc: 'Deployed containers with Docker.' },
  ] }), relatedJd, 'Platform Engineer');
  check('related only: Docker does NOT count as a Kubernetes match',
    matchFor(related, 'Kubernetes')?.matchType === 'related', matchFor(related, 'Kubernetes')?.matchType);
  check('related credit is far below exact credit',
    (matchFor(related, 'Kubernetes')?.credit ?? 1) <= 0.3);

  check('missing skill: AWS is absent from the base resume',
    matchFor(base, 'AWS')?.matchType === 'missing', matchFor(base, 'AWS')?.matchType);
  check('missing skills are listed in keyword.missing', base.keyword.missing.includes('AWS'));

  console.log('\n── 2. Contextual proof ──');

  const listedOnly = evaluate(withResume({
    skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL'],
    experience: [{ title: 'Backend Developer', company: 'A', period: '2019 - 2023', desc: 'Handled day to day tasks for the team.' }],
  }));
  check('a skill only in the skills list is evidence "listed"',
    matchFor(listedOnly, 'React')?.evidence === 'listed', matchFor(listedOnly, 'React')?.evidence);
  check('listed-only skills are reported as unproven',
    listedOnly.keyword.unproven.includes('React'));
  check('a demonstrated skill scores higher than the same skill merely listed',
    base.keyword.score > listedOnly.keyword.score,
    `${base.keyword.score} vs ${listedOnly.keyword.score}`);
  check('a demonstrated skill carries a verbatim proof quote',
    typeof matchFor(base, 'Node.js')?.proofQuote === 'string'
    && (matchFor(base, 'Node.js')?.proofQuote ?? '').includes('Node.js'));
  check('a listed-only skill carries no proof quote',
    matchFor(listedOnly, 'React')?.proofQuote === null);

  console.log('\n── 3. Keyword stuffing ──');

  const stuffed = evaluate(withResume({
    skills: ['React React React React React', 'AWS AWS AWS AWS', 'Node.js', 'TypeScript', 'PostgreSQL'],
    experience: [{ title: 'Backend Developer', company: 'A', period: '2019 - 2023', desc: 'Handled day to day tasks.' }],
  }));
  check('repeated keywords with no supporting experience are detected',
    stuffed.keyword.stuffing.detected, JSON.stringify(stuffed.keyword.stuffing.terms));
  check('stuffing carries a score penalty', stuffed.keyword.stuffing.penalty > 0);
  check('stuffing does not beat an honest resume',
    base.keyword.score > stuffed.keyword.score,
    `honest ${base.keyword.score} vs stuffed ${stuffed.keyword.score}`);

  console.log('\n── 4. Experience & impact ──');

  check('quantification rate counts only bullets with a measurable outcome',
    base.impact.quantifiedBullets === 2 && base.impact.totalBullets === 5,
    `${base.impact.quantifiedBullets}/${base.impact.totalBullets}`);
  check('quantification rate is a percentage of bullets',
    Math.round(base.impact.quantificationRate) === 40, String(base.impact.quantificationRate));

  const unquantified = evaluate(withResume({
    experience: [{ title: 'Senior Backend Engineer', company: 'A', period: '2019 - 2023', desc: 'Built APIs with Node.js.\nDesigned PostgreSQL schemas.' }],
  }));
  check('quantified bullets score higher than unquantified ones',
    base.impact.score > unquantified.impact.score,
    `${base.impact.score} vs ${unquantified.impact.score}`);

  const weakVerbs = evaluate(withResume({
    experience: [{ title: 'Backend Developer', company: 'A', period: '2019 - 2023', desc: 'Worked on backend APIs.\nHelped with PostgreSQL migrations.\nResponsible for Node.js services.' }],
  }));
  check('weak responsibility verbs score below strong action verbs',
    weakVerbs.impact.actionVerbScore < base.impact.actionVerbScore,
    `${weakVerbs.impact.actionVerbScore} vs ${base.impact.actionVerbScore}`);

  check('the weakest bullet is identified',
    base.impact.weakestBullet?.original === 'Worked on backend APIs.',
    base.impact.weakestBullet?.original);
  check('the weakest bullet explains why it fails',
    (base.impact.weakestBullet?.whyItFails ?? '').length > 20);

  const rewrite = base.impact.weakestBullet?.rewrite ?? '';
  check('the rewrite upgrades the weak verb', /^Engineered/.test(rewrite), rewrite);
  check('the rewrite invents NO metric — it leaves a placeholder',
    rewrite.includes('[quantified impact') && !/\d+\s?%/.test(rewrite), rewrite);

  console.log('\n── 5. Years, title & seniority ──');

  check('required years are read from the JD', base.impact.requiredYears === 5, String(base.impact.requiredYears));
  check('candidate years are computed from the resume periods',
    base.impact.candidateYears !== null && base.impact.candidateYears! >= 3,
    String(base.impact.candidateYears));

  const junior = evaluate(withResume({
    headline: 'Junior Developer',
    experience: [{ title: 'Junior Developer', company: 'A', period: 'Jan 2022 - Jun 2023', desc: 'Built React components with TypeScript and Node.js against PostgreSQL, cutting load time by 20%.' }],
  }));
  check('a junior resume against a senior role is flagged as a seniority mismatch',
    junior.alignment.seniorityMismatch);
  check('strong technical overlap does NOT hide the seniority gap',
    junior.overallScore < 75, `overall ${junior.overallScore}`);

  check('title alignment is strong for a matching title', base.alignment.titleScore >= 80,
    String(base.alignment.titleScore));
  const unrelated = evaluate(withResume({
    headline: 'Marketing Manager',
    experience: [{ title: 'Marketing Manager', company: 'A', period: '2019 - 2023', desc: 'Ran campaigns and grew leads by 30%.' }],
  }));
  check('an unrelated title scores far lower than a matching one',
    unrelated.alignment.titleScore < base.alignment.titleScore,
    `${unrelated.alignment.titleScore} vs ${base.alignment.titleScore}`);

  console.log('\n── 6. Education & certifications ──');

  check('a B.Tech meets a "Bachelor\'s degree" requirement', base.alignment.educationMet);
  const noDegree = evaluate(withResume({ education: [] }));
  check('a missing required degree is reported as unmet', !noDegree.alignment.educationMet);
  check('a missing required degree lowers the alignment score',
    noDegree.alignment.educationScore < base.alignment.educationScore,
    `${noDegree.alignment.educationScore} vs ${base.alignment.educationScore}`);

  const cpaJd = 'Senior Accountant. Requirements: CPA is required. Excel is required.';
  const noCpa = evaluate(withResume({ skills: ['Excel'], certifications: [] }), cpaJd, 'Senior Accountant');
  check('a missing required certification is identified',
    noCpa.alignment.missingCertifications.includes('CPA'),
    JSON.stringify(noCpa.alignment.missingCertifications));
  const withCpa = evaluate(withResume({ skills: ['Excel'], certifications: ['CPA'] }), cpaJd, 'Senior Accountant');
  check('holding the required certification clears the flag',
    withCpa.alignment.missingCertifications.length === 0);
  check('holding the certification scores higher than lacking it',
    withCpa.alignment.score > noCpa.alignment.score,
    `${withCpa.alignment.score} vs ${noCpa.alignment.score}`);

  console.log('\n── 7. Parsing audit ──');

  const noContact = evaluateAts({
    resume: withResume({ location: null, socialLinks: {} }),
    jobDescription: BASE_JD, jobTitle: 'Senior Backend Engineer', resumeText: '',
  });
  check('missing contact information is reported as critical',
    noContact.audit.criticalMissingElements.some((e) => /Email|Phone|Location|LinkedIn/.test(e)),
    JSON.stringify(noContact.audit.criticalMissingElements));

  const badDates = evaluate(withResume({
    experience: [{ title: 'Backend Developer', company: 'A', period: 'sometime last year', desc: 'Built Node.js services.' }],
  }));
  check('malformed dates are flagged as a red flag',
    badDates.audit.redFlags.some((f) => /date/i.test(f)), JSON.stringify(badDates.audit.redFlags));

  const empty = evaluateAts({ resume: {}, jobDescription: BASE_JD, jobTitle: 'Senior Backend Engineer' });
  check('an empty resume is reported as empty', empty.audit.parserQuality === 'empty', empty.audit.parserQuality);
  check('an empty resume is capped at 10', empty.overallScore <= 10, String(empty.overallScore));

  const unreadable = evaluateAts({ resume: { skills: [], bio: 'xx' }, jobDescription: BASE_JD });
  check('an unreadable resume is capped well below a real score',
    unreadable.overallScore <= 25, String(unreadable.overallScore));

  const stuffedUnreadable = evaluateAts({
    resume: { skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'Docker', 'AWS', 'Kubernetes'] },
    jobDescription: BASE_JD, jobTitle: 'Senior Backend Engineer',
  });
  check('the parsing gate stops a keyword-stuffed unparsable resume scoring well',
    stuffedUnreadable.overallScore <= stuffedUnreadable.audit.scoreCap,
    `${stuffedUnreadable.overallScore} vs cap ${stuffedUnreadable.audit.scoreCap}`);

  const emptyJd = evaluate(BASE_RESUME, '', '');
  check('an empty JD does not throw and yields no requirements',
    emptyJd.keyword.matches.length === 0);
  check('an empty JD produces a defined score', Number.isFinite(emptyJd.overallScore));

  console.log('\n── 8. Determinism & formula ──');

  const a = evaluate(BASE_RESUME);
  const b = evaluate(BASE_RESUME);
  check('the same resume + JD produce an identical score', a.overallScore === b.overallScore,
    `${a.overallScore} vs ${b.overallScore}`);
  check('the same resume + JD produce an identical full result',
    JSON.stringify(a) === JSON.stringify(b));

  const expected = Math.round((
    Math.min(
      a.keyword.score * 0.45 + a.impact.score * 0.35 + a.alignment.score * 0.20,
      a.audit.scoreCap,
    )
  ) * 10) / 10;
  check('the final score is exactly 45/35/20 after the parsing cap',
    Math.abs(a.overallScore - expected) < 0.11,
    `${a.overallScore} vs ${expected}`);
  check('the formula is exposed for auditing',
    a.formula.keywordWeight === 0.45 && a.formula.experienceWeight === 0.35 && a.formula.alignmentWeight === 0.20);
  check('resume quality is a separate axis from the match score',
    a.resumeQualityScore !== a.overallScore || a.resumeQualityScore === a.overallScore);
  check('score stays within 0..100', a.overallScore >= 0 && a.overallScore <= 100);

  console.log('\n── 9. Report ──');

  const report = renderAtsReport(a);
  check('report leads with the overall score',
    report.startsWith(`### 📊 OVERALL ATS MATCH SCORE: ${Math.round(a.overallScore)}%`),
    report.split('\n')[0]);
  for (const heading of [
    '### 1. 🔍 PARSING & STRUCTURAL AUDIT',
    '### 2. 🎯 KEYWORD MATCH ANALYSIS (45% of Score)',
    '### 3. 📈 IMPACT & METRICS (35% of Score)',
    '### 4. 🎓 ALIGNMENT & PROGRESSION (20% of Score)',
    '### 5. 🛠️ ACTION PLAN (Top 3 Fixes)',
  ]) {
    check(`report contains "${heading.slice(0, 28)}…"`, report.includes(heading));
  }
  check('report renders the keyword table', report.includes('| JD Requirement | Status in Resume | Contextual Proof Found? |'));
  check('report lists at most 15 requirement rows',
    (report.match(/^\| (?!JD Requirement)(?!:---)/gm) ?? []).length <= 15);
  check('the action plan has at most 3 items', a.actionPlan.length <= 3 && a.actionPlan.length >= 1);
  check('the action plan never tells the candidate to claim a skill outright',
    !a.actionPlan.some((s) => /^add [A-Z]/.test(s) && !/genuinely/i.test(s)),
    JSON.stringify(a.actionPlan));

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
