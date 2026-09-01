/**
 * Phase 6 self-test: ATS matching and ranking.
 *
 * NAMING. This is `job-ats-match`, not `job-match`: `test:job-match` is
 * already taken by scripts/job-match-tone.selftest.ts, which tests the match
 * BADGE COLOURS. Two different things called the same name is how a suite gets
 * silently replaced, so this one is named for what it does.
 *
 * Behaviour only, through the public functions. No Mongo, no network, no
 * clock — `evaluateJobMatch` is pure.
 */
import type { HiringJobPosting } from '@/types/document';
import {
  buildCandidateResume, buildJobDescriptionText, domainScore, evaluateJobMatch,
  experienceScore, rankCandidates, skillCovers, type MatchCandidate,
} from '@/lib/server/job-sources/ats-match';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

function job(over: Partial<HiringJobPosting> = {}): HiringJobPosting {
  return {
    id: 'j1', organizationId: 'o', organizationName: 'Acme',
    createdByUserId: 'u', createdByEmail: 'e@x.c',
    title: 'Senior Frontend Engineer',
    description: 'Build and ship the customer web application.',
    requirements: ['React', 'TypeScript', 'Node.js'],
    responsibilities: ['Ship features end to end', 'Review pull requests'],
    preferredSkills: ['AWS', 'Docker'],
    targetRoleKeywords: [], minimumAtsScore: 0, status: 'published',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    domain: 'software', subDomain: 'Frontend', domainConfidence: 0.9,
    minExperienceYears: 3,
    ...over,
  } as HiringJobPosting;
}

function candidate(over: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    id: 'c1',
    profile: { headline: 'Frontend Engineer', domain: 'software', skills: ['React', 'TypeScript'] },
    subDomain: 'Frontend',
    experienceYears: 6,
    resume: {
      experience: [{
        title: 'Frontend Engineer', company: 'X', period: '2020-2026',
        desc: 'Built React and TypeScript applications and shipped Node.js services.',
      }],
    },
    ...over,
  };
}

function main() {
  console.log('\n── 1. Skills: exact, alias, missing ──');

  const base = evaluateJobMatch(job(), candidate());
  check('exact skills are matched',
    base.matchedSkills.includes('React') && base.matchedSkills.includes('TypeScript'));
  /* The base fixture's resume text names Node.js, so evidence in experience —
     not just a skills list — is what satisfies the requirement. */
  check('a requirement proven in experience text counts as matched',
    base.matchedSkills.includes('Node.js'), JSON.stringify(base.matchedSkills));
  check('and it is therefore NOT reported as missing',
    !base.missingRequiredSkills.includes('Node.js'), JSON.stringify(base.missingRequiredSkills));
  const noNode = evaluateJobMatch(job(), candidate({
    profile: { headline: 'Frontend Engineer', domain: 'software', skills: ['React', 'TypeScript'] },
    resume: { experience: [{ title: 'Frontend Engineer', desc: 'Built React and TypeScript apps.' }] },
  }));
  check('a required skill the candidate lacks appears in missingRequiredSkills',
    noNode.missingRequiredSkills.includes('Node.js'), JSON.stringify(noNode.missingRequiredSkills));
  check('missing PREFERRED skills are listed separately',
    noNode.missingPreferredSkills.includes('AWS') && noNode.missingPreferredSkills.includes('Docker'));
  check('required and preferred lists never overlap',
    noNode.missingRequiredSkills.every((s) => !noNode.missingPreferredSkills.includes(s)));

  const aliased = evaluateJobMatch(job(), candidate({
    profile: { domain: 'software', skills: ['React.js', 'Type Script', 'NodeJS'] },
    resume: { experience: [{ title: 'Engineer', desc: 'Worked with React.js and NodeJS daily.' }] },
  }));
  check('React.js is recognised as React', aliased.matchedSkills.includes('React'));
  check('NodeJS is recognised as Node.js', aliased.matchedSkills.includes('Node.js'));

  const allSkills = evaluateJobMatch(job(), candidate({
    profile: { domain: 'software', skills: ['React', 'TypeScript', 'Node.js', 'AWS', 'Docker'] },
    resume: {
      experience: [{
        title: 'Senior Frontend Engineer',
        desc: 'Built React and TypeScript apps, Node.js APIs, deployed on AWS with Docker.',
      }],
    },
  }));
  check('a candidate covering every requirement has no missing required skills',
    allSkills.missingRequiredSkills.length === 0, JSON.stringify(allSkills.missingRequiredSkills));
  check('covering everything outscores missing Node.js', allSkills.score > noNode.score);
  check('a candidate with NO skills does not crash and scores low', (() => {
    const r = evaluateJobMatch(job(), { id: 'empty' });
    return typeof r.score === 'number' && r.score >= 0 && r.score <= 100;
  })());

  console.log('\n── 2. Skill false positives ──');

  check('Java does NOT satisfy JavaScript', !skillCovers('Java', 'JavaScript'));
  check('JavaScript does NOT satisfy Java', !skillCovers('JavaScript', 'Java'));
  check('C does NOT satisfy C++', !skillCovers('C', 'C++'));
  check('C++ does NOT satisfy C', !skillCovers('C++', 'C'));
  check('React.js DOES satisfy React', skillCovers('React.js', 'React'));
  check('Golang DOES satisfy Go', skillCovers('Golang', 'Go'));
  /* End to end: a Java job must not be matched by a JavaScript CV. */
  const javaJob = job({ title: 'Java Backend Engineer', requirements: ['Java', 'Spring Boot'], preferredSkills: [] });
  const jsCand = candidate({
    id: 'js', profile: { domain: 'software', skills: ['JavaScript'] },
    resume: { experience: [{ title: 'JS Dev', desc: 'Wrote JavaScript for years.' }] },
  });
  check('a JavaScript candidate does not match Java as a skill',
    !evaluateJobMatch(javaJob, jsCand).matchedSkills.includes('Java'));

  console.log('\n── 3. Domain ──');

  check('exact domain and sub-domain is a full match',
    domainScore(job(), candidate()) === 100);
  check('same domain, different sub-domain is a partial match', (() => {
    const s = domainScore(job({ subDomain: 'Backend' }), candidate({ subDomain: 'Frontend' }));
    return s !== null && s > 0 && s < 100;
  })());
  check('same domain, sub-domain unstated still scores well', (() => {
    const s = domainScore(job({ subDomain: undefined }), candidate());
    return s !== null && s >= 80;
  })());
  check('a different domain scores zero',
    domainScore(job(), candidate({ profile: { domain: 'marketing' } })) === 0);
  check('an unclassified job yields no domain score, not a zero',
    domainScore(job({ domain: undefined }), candidate()) === null);
  check('a candidate with no domain yields no domain score',
    domainScore(job(), candidate({ profile: { skills: ['React'] } })) === null);
  check('a LOW-confidence classification is not ranked on',
    domainScore(job({ domainConfidence: 0.2 }), candidate()) === null);
  check('a domain mismatch lowers the overall score', (() => {
    const same = evaluateJobMatch(job(), candidate());
    const diff = evaluateJobMatch(job(), candidate({
      profile: { headline: 'Frontend Engineer', domain: 'marketing', skills: ['React', 'TypeScript'] },
    }));
    return diff.score < same.score;
  })());

  console.log('\n── 4. Experience ──');

  check('experience above the minimum scores full',
    experienceScore(job({ minExperienceYears: 3 }), candidate({ experienceYears: 6 })) === 100);
  check('exactly meeting the minimum scores full',
    experienceScore(job({ minExperienceYears: 5 }), candidate({ experienceYears: 5 })) === 100);
  check('below the minimum degrades but does not zero out', (() => {
    const s = experienceScore(job({ minExperienceYears: 6 }), candidate({ experienceYears: 3 }));
    return s !== null && s > 0 && s < 100;
  })());
  check('a job stating no minimum yields no experience score',
    experienceScore(job({ minExperienceYears: undefined }), candidate({ experienceYears: 5 })) === null);
  check('a candidate with no years yields no experience score, NOT zero',
    experienceScore(job(), candidate({ experienceYears: undefined })) === null);
  /* The explicit prohibition. */
  check('a "Senior" title alone creates no experience requirement',
    experienceScore(job({ title: 'Senior Staff Engineer', minExperienceYears: undefined }),
      candidate({ experienceYears: 1 })) === null);
  check('missing experience does not zero the overall score', (() => {
    const r = evaluateJobMatch(job({ minExperienceYears: undefined }),
      candidate({ experienceYears: undefined }));
    return r.score > 0;
  })());

  console.log('\n── 5. Education ──');

  const eduJob = job({ requirements: ['React', "Bachelor's degree in Computer Science"] });
  const eduCand = candidate({
    resume: {
      experience: [{ title: 'Engineer', desc: 'Built React apps.' }],
      education: [{ degree: "Bachelor's degree in Computer Science", school: 'IIT', year: '2019' }],
    },
  });
  check('education is scored when both sides state it', (() => {
    const r = evaluateJobMatch(eduJob, eduCand);
    return r.breakdown.education === null || typeof r.breakdown.education === 'number';
  })());
  check('a candidate with no education is NOT penalised as a failure', (() => {
    const r = evaluateJobMatch(eduJob, candidate({ resume: { experience: [], education: [] } }));
    return r.breakdown.education === null;
  })());
  check('a job asking for no education yields no education score',
    evaluateJobMatch(job(), eduCand).breakdown.education === null);

  console.log('\n── 6. Responsibilities and requirements ──');

  check('responsibilities produce an alignment score',
    typeof evaluateJobMatch(job(), candidate()).breakdown.responsibilities === 'number');
  check('a job with no requirements at all yields null, not zero', (() => {
    const r = evaluateJobMatch(
      job({ requirements: [], preferredSkills: [], responsibilities: [], description: '' }),
      candidate());
    return r.breakdown.skills === null;
  })());
  check('matched requirements are reported for explanation',
    evaluateJobMatch(job(), candidate()).matchedRequirements.length > 0);
  check('the JD text marks requirements and preferences distinctly', (() => {
    const text = buildJobDescriptionText(job());
    return text.includes('React (required)') && text.includes('AWS (preferred)');
  })());

  console.log('\n── 7. Strong vs weak candidates ──');

  const strong = evaluateJobMatch(job(), candidate({
    id: 'strong',
    profile: { headline: 'Senior Frontend Engineer', domain: 'software',
      skills: ['React', 'TypeScript', 'Node.js', 'AWS', 'Docker'] },
    resume: {
      experience: [{ title: 'Senior Frontend Engineer', company: 'X', period: '2019-2026',
        desc: 'Led React and TypeScript development, built Node.js APIs, deployed with Docker on AWS.' }],
    },
  }));
  const weak = evaluateJobMatch(job(), {
    id: 'weak',
    profile: { headline: 'Accountant', domain: 'finance', skills: ['Excel', 'Tally'] },
    experienceYears: 1,
    resume: { experience: [{ title: 'Accountant', desc: 'Reconciled ledgers and filed returns.' }] },
  });
  check('a strong candidate scores high', strong.score >= 70, String(strong.score));
  check('a weak candidate scores low', weak.score < 40, String(weak.score));
  check('the strong candidate outscores the weak one', strong.score > weak.score);
  check('the band label reflects the score', typeof strong.band === 'string' && strong.band.length > 0);

  console.log('\n── 8. Eligibility stays SEPARATE from the score ──');

  const eligible = evaluateJobMatch(job(), candidate({ eligibility: {} }));
  check('eligibility is reported on the result', eligible.eligibility.status === 'eligible');

  const unknown = evaluateJobMatch(job({ location: undefined }),
    candidate({ eligibility: { cities: ['bengaluru'] } }));
  check('eligibility "unknown" is preserved, not turned into ineligible',
    unknown.eligibility.status === 'unknown');

  const ineligible = evaluateJobMatch(job({ workMode: 'onsite' }),
    candidate({ eligibility: { workModes: ['remote'] } }));
  check('eligibility "ineligible" is preserved', ineligible.eligibility.status === 'ineligible');
  /* The core separation: a gate failure must not silently become a low score. */
  check('an INELIGIBLE candidate can still hold a high ATS score',
    ineligible.score === eligible.score, `${ineligible.score} vs ${eligible.score}`);
  check('the score carries no eligibility penalty at all',
    evaluateJobMatch(job({ workMode: 'onsite' }), candidate({ eligibility: { workModes: ['remote'] } })).score
    === evaluateJobMatch(job({ workMode: 'onsite' }), candidate({})).score);
  check('the result never claims a hiring probability', (() => {
    const r = evaluateJobMatch(job(), candidate()) as unknown as Record<string, unknown>;
    return !('probability' in r) && !('chance' in r) && !('selectionChance' in r);
  })());
  check('ranking does NOT reorder on eligibility', (() => {
    const ranked = rankCandidates(job({ workMode: 'onsite' }), [
      { ...candidate({ id: 'a' }), eligibility: { workModes: ['remote'] } },
      { ...candidate({ id: 'b' }), eligibility: {} },
    ]);
    /* Identical profiles score identically, so the tie-break decides — not the gate. */
    return ranked[0].candidateId === 'a' && ranked[0].score === ranked[1].score;
  })());

  console.log('\n── 9. Score bounds ──');

  const jobs = [job(), job({ requirements: [], preferredSkills: [], responsibilities: [], description: '' }),
    job({ minExperienceYears: 40 }), job({ domain: undefined })];
  const cands = [candidate(), { id: 'bare' } as MatchCandidate,
    candidate({ experienceYears: 0, profile: {} }), candidate({ profile: { domain: 'legal' } })];
  let bounded = true; let integral = true;
  for (const j of jobs) for (const c of cands) {
    const s = evaluateJobMatch(j, c).score;
    if (!(s >= 0 && s <= 100)) bounded = false;
    if (!Number.isInteger(s)) integral = false;
  }
  check('every score across 16 combinations is within 0..100', bounded);
  check('every score is an integer — never 0.873 or 1.42', integral);

  console.log('\n── 10. Determinism and purity ──');

  const j = job(); const c = candidate();
  const first = JSON.stringify(evaluateJobMatch(j, c));
  let stable = true;
  for (let i = 0; i < 15; i += 1) {
    if (JSON.stringify(evaluateJobMatch(j, c)) !== first) stable = false;
  }
  check('fifteen evaluations produce an identical result', stable);
  const jBefore = JSON.stringify(j); const cBefore = JSON.stringify(c);
  evaluateJobMatch(j, c);
  check('the job is not mutated', JSON.stringify(j) === jBefore);
  check('the candidate is not mutated', JSON.stringify(c) === cBefore);

  console.log('\n── 11. Ranking ──');

  const ranked = rankCandidates(job(), [weakCand('z'), strongCand('a'), midCand('m')]);
  check('ranking is highest score first',
    ranked[0].score >= ranked[1].score && ranked[1].score >= ranked[2].score,
    ranked.map((r) => `${r.candidateId}:${r.score}`).join(' '));
  check('the strong candidate ranks first', ranked[0].candidateId === 'a');
  check('the weak candidate ranks last', ranked[2].candidateId === 'z');

  /* Ties break on id, so an identical set always ranks identically. */
  const tied = rankCandidates(job(), [strongCand('c'), strongCand('a'), strongCand('b')]);
  check('tied scores break deterministically on candidate id',
    tied.map((r) => r.candidateId).join(',') === 'a,b,c',
    tied.map((r) => `${r.candidateId}:${r.score}`).join(' '));
  check('shuffling the input does not change the ranking', (() => {
    const one = rankCandidates(job(), [strongCand('a'), midCand('m'), weakCand('z')]);
    const two = rankCandidates(job(), [weakCand('z'), strongCand('a'), midCand('m')]);
    return JSON.stringify(one.map((r) => r.candidateId)) === JSON.stringify(two.map((r) => r.candidateId));
  })());

  /* Hundreds of applicants must stay stable and ordered. */
  const many: MatchCandidate[] = [];
  for (let i = 0; i < 300; i += 1) {
    const id = `cand-${String(i).padStart(3, '0')}`;
    many.push(i % 3 === 0 ? strongCand(id) : i % 3 === 1 ? midCand(id) : weakCand(id));
  }
  const bigA = rankCandidates(job(), many).map((r) => `${r.candidateId}:${r.score}`);
  const bigB = rankCandidates(job(), many.slice().reverse()).map((r) => `${r.candidateId}:${r.score}`);
  check('300 applicants rank identically regardless of input order',
    JSON.stringify(bigA) === JSON.stringify(bigB));
  check('300 applicants come back fully sorted', (() => {
    const ranks = rankCandidates(job(), many);
    for (let i = 1; i < ranks.length; i += 1) {
      if (ranks[i - 1].score < ranks[i].score) return false;
      if (ranks[i - 1].score === ranks[i].score
        && ranks[i - 1].candidateId.localeCompare(ranks[i].candidateId) > 0) return false;
    }
    return true;
  })());

  console.log('\n── 12. Missing and malformed input never crashes ──');

  const survives = (label: string, fn: () => unknown) => {
    try { fn(); check(label, true); } catch (e) { check(label, false, String(e).slice(0, 80)); }
  };
  survives('a candidate with no profile and no resume', () => evaluateJobMatch(job(), { id: 'x' }));
  survives('a candidate with an empty resume', () => evaluateJobMatch(job(), { id: 'x', resume: {} }));
  survives('a job with every optional field empty', () => evaluateJobMatch(
    job({ description: '', requirements: [], responsibilities: [], preferredSkills: [],
      domain: undefined, subDomain: undefined, minExperienceYears: undefined }), candidate()));
  survives('null-ish profile values', () => evaluateJobMatch(job(), {
    id: 'x', profile: { headline: null as unknown as string, skills: undefined },
  }));
  survives('an empty candidate list', () => rankCandidates(job(), []));
  check('an empty candidate list returns an empty ranking', rankCandidates(job(), []).length === 0);
  check('the adapter tolerates a candidate with nothing', (() => {
    const r = buildCandidateResume({ id: 'x' });
    return Array.isArray(r.skills) && r.skills.length === 0;
  })());

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

/* Fixture candidates at three strengths, parameterised by id so ties are real. */
function strongCand(id: string): MatchCandidate {
  return {
    id,
    profile: { headline: 'Senior Frontend Engineer', domain: 'software',
      skills: ['React', 'TypeScript', 'Node.js', 'AWS', 'Docker'] },
    subDomain: 'Frontend', experienceYears: 8,
    resume: { experience: [{ title: 'Senior Frontend Engineer', company: 'X', period: '2018-2026',
      desc: 'Led React and TypeScript work, built Node.js services, shipped with Docker on AWS.' }] },
  };
}
function midCand(id: string): MatchCandidate {
  return {
    id, profile: { headline: 'Frontend Developer', domain: 'software', skills: ['React'] },
    subDomain: 'Frontend', experienceYears: 2,
    resume: { experience: [{ title: 'Frontend Developer', desc: 'Built React interfaces.' }] },
  };
}
function weakCand(id: string): MatchCandidate {
  return {
    id, profile: { headline: 'Accountant', domain: 'finance', skills: ['Excel'] },
    experienceYears: 1,
    resume: { experience: [{ title: 'Accountant', desc: 'Reconciled ledgers.' }] },
  };
}

main();
