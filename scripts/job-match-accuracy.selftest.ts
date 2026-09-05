/**
 * Job ↔ profile matching — the accuracy properties, executed for real.
 *
 * Run: npm run test:job-match-accuracy
 *
 * The scorer is called with real profiles and real postings. Nothing here
 * asserts an exact number: a weighting is a judgement and it will be tuned. What
 * must not regress is the ORDERING and the HONESTY — that a closer match ranks
 * above a weaker one, that a spelling difference is not a mismatch, and that a
 * job with nothing in common cannot be dressed up as a recommendation by being
 * nearby and recent.
 */
import { buildRecProfile, recommendMatch, type RecJob } from '../lib/server/job-recommend';

let passed = 0, failed = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); return; }
  failed += 1;
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const NOW = Date.parse('2026-09-05T00:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const job = (over: Partial<RecJob> = {}): RecJob => ({
  id: 'j', title: 'Engineer', location: 'Bengaluru', workMode: 'onsite',
  experienceLevel: 'senior', description: '', preferredSkills: [],
  targetRoleKeywords: [], createdAt: daysAgo(3), ...over,
});

const frontend = buildRecProfile({
  headline: 'Senior Frontend Engineer',
  skills: ['reactjs', 'TypeScript', 'Next.js', 'tailwind css', 'GraphQL'],
  location: 'Bengaluru',
  experience: [
    { title: 'Senior Frontend Engineer', period: '2021 - Present' },
    { title: 'Frontend Developer', period: '2019 - 2021' },
  ],
});

console.log('\n── 1. A spelling difference is not a mismatch ──');
{
  const m = recommendMatch(frontend, job({ preferredSkills: ['React', 'TypeScript', 'GraphQL'] }), NOW);
  check('"reactjs" on a profile satisfies a "React" requirement', m.matchedSkills.includes('React'));
  check('every declared requirement is credited', m.matchedSkills.length === 3, m.matchedSkills.join(','));
  const plain = buildRecProfile({ headline: 'Engineer', skills: ['node'], location: '' });
  check('"node" satisfies "Node.js"',
    recommendMatch(plain, job({ preferredSkills: ['Node.js'] }), NOW).matchedSkills.includes('Node.js'));
}

console.log('\n── 2. Knowing a narrower member is evidence for the broader one ──');
{
  const nextOnly = buildRecProfile({ headline: 'Engineer', skills: ['Next.js'], location: '' });
  const m = recommendMatch(nextOnly, job({ preferredSkills: ['React'] }), NOW);
  check('Next.js counts towards a React requirement', m.matchedSkills.includes('React'));
  const exact = buildRecProfile({ headline: 'Engineer', skills: ['React'], location: '' });
  check('but it is worth LESS than knowing React itself',
    recommendMatch(exact, job({ preferredSkills: ['React'] }), NOW).score
      > recommendMatch(nextOnly, job({ preferredSkills: ['React'] }), NOW).score);
}

console.log('\n── 3. A skill the taxonomy has never heard of still counts ──');
{
  const niche = buildRecProfile({ headline: 'Engineer', skills: ['Docrud Internal Ledger'], location: '' });
  check('an in-house technology matches itself',
    recommendMatch(niche, job({ preferredSkills: ['Docrud Internal Ledger'] }), NOW).matchedSkills.length === 1);
}

console.log('\n── 4. The posting decides what matters ──');
{
  /* Same number of matched skills, but one is what the job IS. */
  const inTitle = recommendMatch(frontend, job({ title: 'React Engineer', preferredSkills: ['React', 'Jira', 'Slack'] }), NOW);
  const notInTitle = recommendMatch(frontend, job({ title: 'Engineer', preferredSkills: ['React', 'Jira', 'Slack'] }), NOW);
  check('a requirement named in the title outweighs an incidental one',
    inTitle.score > notInTitle.score, `${inTitle.score} vs ${notInTitle.score}`);
}

console.log('\n── 5. Context alone is not a match ──');
{
  const unrelated = job({ title: 'Registered Nurse', preferredSkills: ['Patient care'], workMode: 'remote', createdAt: daysAgo(1) });
  const m = recommendMatch(frontend, unrelated, NOW);
  check('a job with no skill and no role overlap is not recommended', m.overlap === false);
  check('and it cannot score like one', m.score <= 12, String(m.score));
  check('nor claim to suit the person', m.summary === '', m.summary);
  const related = recommendMatch(frontend, job({ title: 'React Engineer', preferredSkills: ['React'] }), NOW);
  check('a real match outranks it by a wide margin',
    related.score - m.score >= 40, `${related.score} vs ${m.score}`);
}

console.log('\n── 6. More overlap ranks higher ──');
{
  const three = recommendMatch(frontend, job({ preferredSkills: ['React', 'TypeScript', 'GraphQL'] }), NOW).score;
  const one = recommendMatch(frontend, job({ preferredSkills: ['React', 'Kubernetes', 'Terraform'] }), NOW).score;
  check('covering every requirement beats covering one', three > one, `${three} vs ${one}`);
}

console.log('\n── 7. Seniority is stated in both directions ──');
{
  const junior = recommendMatch(frontend, job({ title: 'React Engineer', preferredSkills: ['React'], experienceLevel: 'entry' }), NOW);
  const level = recommendMatch(frontend, job({ title: 'React Engineer', preferredSkills: ['React'], experienceLevel: 'senior' }), NOW);
  check('a role at your level outranks one far below it', level.score > junior.score, `${level.score} vs ${junior.score}`);
  check('and the gap is explained, not hidden',
    junior.factors.some((f) => f.kind === 'seniority' && /below your level/.test(f.detail)));
}

console.log('\n── 8. Every sentence names its evidence ──');
{
  const m = recommendMatch(frontend, job({ title: 'React Engineer', preferredSkills: ['React', 'TypeScript'] }), NOW);
  check('the summary names the skills it is talking about',
    m.summary.includes('React') && m.summary.includes('TypeScript'), m.summary);
  check('the skills factor counts matched against total',
    m.factors.some((f) => f.kind === 'skills' && /\d+ of the \d+ skills/.test(f.detail)));
  check('the location factor names the place',
    m.factors.some((f) => f.kind === 'location' && f.detail.includes('Bengaluru')));
  check('a factor never claims more than its dimension is worth',
    m.factors.every((f) => f.points <= f.max || f.max === 0));
  check('the score never exceeds 100', m.score <= 100 && m.score >= 0, String(m.score));
}

console.log('\n── 9. A missing requirement is named, as a gap in the posting ──');
{
  const m = recommendMatch(frontend, job({ title: 'React Engineer', preferredSkills: ['React', 'Kubernetes'] }), NOW);
  check('what the posting asks for and the profile lacks is listed',
    m.missingSkills.includes('Kubernetes'), m.missingSkills.join(','));
  check('and what it has is not listed as missing', !m.missingSkills.includes('React'));
}

console.log('\n── 10. An empty profile invents nothing ──');
{
  const blank = buildRecProfile({ headline: '', skills: [], location: '' });
  const m = recommendMatch(blank, job({ preferredSkills: ['React'] }), NOW);
  check('no overlap is claimed', m.overlap === false);
  check('no skills are reported as matched', m.matchedSkills.length === 0);
  check('and no summary is invented', m.summary === '');
}

console.log('\n── 11. Prose is read, but not credulously ──');
{
  const m = recommendMatch(frontend, job({
    title: 'Engineer',
    preferredSkills: [],
    description: 'You will work across our React and TypeScript codebase alongside the design team.',
  }), NOW);
  check('skills named only in the description are found', m.matchedSkills.length >= 2, m.matchedSkills.join(','));
  const inner = recommendMatch(
    buildRecProfile({ headline: 'Engineer', skills: ['Go'], location: '' }),
    job({ title: 'Engineer', preferredSkills: [], description: 'A good opportunity to go far in your career.' }),
    NOW,
  );
  check('a skill name inside an ordinary sentence is not a requirement',
    !inner.matchedSkills.includes('Go'), inner.matchedSkills.join(','));
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
