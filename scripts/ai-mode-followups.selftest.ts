/**
 * The conversation only asks what it can use.
 *
 * Run: npx tsx scripts/ai-mode-followups.selftest.ts
 */
import {
  narrow, nextQuestion, refineQuery, rank, summarise,
  type Understanding, type ResultFacts, type FacetId,
} from '../lib/ai-mode/followups';

let passed = 0; let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}`); }
}

const facts = (over: Partial<ResultFacts> = {}): ResultFacts => ({
  locations: ['Bengaluru', 'Pune', 'Mumbai'],
  skills: ['React', 'TypeScript', 'Go', 'Figma'],
  counts: { person: 4, job: 2, post: 1 },
  ...over,
});
const none = new Set<FacetId>();

console.log('\n── it asks the useful question first ──');
check('intent comes first when both people and jobs matched',
  nextQuestion({}, facts(), none)?.id === 'intent');
check('and it is skipped when the phrasing already said "hiring"',
  nextQuestion({ intent: 'find_provider' }, facts(), none)?.id !== 'intent');
check('…or "looking for work"',
  nextQuestion({ intent: 'find_work' }, facts(), none)?.id !== 'intent');
check('intent is not asked when only one kind of thing matched',
  nextQuestion({}, facts({ counts: { person: 4, job: 0, post: 0 } }), none)?.id !== 'intent');

console.log('\n── it does not ask what the query already said ──');
const answeredIntent = new Set<FacetId>(['intent']);
check('location is asked when the query named none',
  nextQuestion({}, facts(), answeredIntent)?.id === 'location');
check('and never when the query named one',
  nextQuestion({ locations: ['bengaluru'] }, facts(), answeredIntent)?.id !== 'location');
check('experience is not asked when the query stated it',
  nextQuestion({ locations: ['pune'], experience: 'senior' }, facts(), answeredIntent)?.id !== 'experience');

console.log('\n── every option offered exists in the results ──');
const q = nextQuestion({}, facts(), answeredIntent)!;
check('the places offered are the places the results are in',
  q.options.filter(o => o.label !== 'Remote').every(o => facts().locations.some(l => o.append.includes(l))));
check('one location in the data is not a choice, so it is not asked',
  nextQuestion({}, facts({ locations: ['Bengaluru'] }), answeredIntent)?.id !== 'location');
const skillQ = nextQuestion({ locations: ['x'], experience: 'senior' }, facts(), answeredIntent)!;
check('the skills offered are skills the results actually list',
  skillQ.id === 'skill' && skillQ.options.every(o => facts().skills.some(s => s.toLowerCase() === o.append.toLowerCase())));
check('a skill the query already named is not offered back',
  !nextQuestion({ locations: ['x'], experience: 'senior', skills: ['react'] }, facts(), answeredIntent)!
    .options.some(o => o.append.toLowerCase() === 'react'));
check('fewer than three distinct skills is not a real choice',
  nextQuestion({ locations: ['x'], experience: 'senior' }, facts({ skills: ['React', 'Go'] }), answeredIntent) === null);

console.log('\n── silence is a valid turn ──');
check('nothing left to ask returns null',
  nextQuestion({ intent: 'find_provider', locations: ['pune'], experience: 'senior', skills: ['react'] },
    facts({ skills: ['React'] }), none) === null);
check('seniority is never asked about posts alone',
  nextQuestion({ locations: ['x'] }, facts({ counts: { person: 0, job: 0, post: 6 } }), answeredIntent)?.id !== 'experience');

console.log('\n── refining narrows, it does not restate ──');
check('the original sentence is kept', refineQuery('react developer', ['senior']).startsWith('react developer'));
check('the answer is appended', refineQuery('react developer', ['senior']) === 'react developer senior');
check('answering the same thing twice cannot stack it',
  refineQuery('senior react developer', ['senior']) === 'senior react developer');
check('a word already in the query is not repeated',
  refineQuery('react developer in Bengaluru', ['in Bengaluru']) === 'react developer in Bengaluru');
check('multiple answers accumulate', refineQuery('developer', ['senior', 'in Pune']) === 'developer senior in Pune');

console.log('\n── ranking and wording ──');
check('most common first', rank(['a', 'b', 'b', 'c', 'b', 'a'])[0] === 'b');
check('case-insensitive dedupe', rank(['React', 'react', 'REACT']).length === 1);
check('blank values are dropped', rank(['', '  ', 'Go']).length === 1);
check('the summary counts what is really there',
  summarise({ person: 2, job: 1, post: 0 }, 3) === "Here's what I found — 2 people, 1 job.".replace('people, 1 job.', 'people and 1 job.'));
check('nothing found says so plainly',
  summarise({ person: 0, job: 0, post: 0 }, 0).includes('could not find'));
check('singular reads correctly', summarise({ person: 1, job: 0, post: 0 }, 1).includes('1 person'));

console.log('\n── answering narrows, and can never widen ──');
const rows = [
  { type: 'person', location: 'Bengaluru', meta: { skills: ['React', 'TypeScript'] } },
  { type: 'person', location: 'Pune',      meta: { skills: ['React'] } },
  { type: 'job',    location: 'Bengaluru', meta: { skills: ['React'] } },
  { type: 'post',   location: null,        meta: null },
];
check('a location answer drops the other cities',
  narrow(rows, { location: 'Bengaluru' }).filter(r => r.type !== 'post').length === 2);
check('a skill answer drops those who do not list it',
  narrow(rows, { skill: 'TypeScript' }).filter(r => r.type === 'person').length === 1);
check('posts survive a location filter — they have none to fail',
  narrow(rows, { location: 'Bengaluru' }).some(r => r.type === 'post'));
check('posts survive a skill filter too',
  narrow(rows, { skill: 'TypeScript' }).some(r => r.type === 'post'));
check('two answers compose',
  narrow(rows, { location: 'Bengaluru', skill: 'TypeScript' }).filter(r => r.type !== 'post').length === 1);
check('the set never grows', narrow(rows, { location: 'Bengaluru', skill: 'React' }).length <= rows.length);
check('a filter that would empty the screen is not applied',
  narrow(rows, { skill: 'Cobol' }).length === rows.length);
check('"remote" is a ranking hint, not a place to match against',
  narrow(rows, { location: 'remote' }).length === rows.length);
check('matching is case-insensitive',
  narrow(rows, { location: 'bengaluru' }).filter(r => r.type !== 'post').length === 2);

console.log(`\n${passed} checks passed, ${failed} failed.`);
if (failed) { console.log('FAILED'); process.exit(1); }
console.log('ALL CHECKS PASSED');
