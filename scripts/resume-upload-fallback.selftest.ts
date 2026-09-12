/**
 * Resume-upload parser fallback — regression self-test.
 *
 * THE BUG THIS EXISTS FOR. The resume-upload route's only parser was Groq.
 * When `GROQ_MODEL` was decommissioned every call threw `model_not_found`, the
 * catch left the parsed object empty, and `computeAts({})` returned exactly
 * `{ score: 0, grade: 'F' }` — stored on the profile and shown to the member as
 * "0%". The 492 checks in the seven ATS self-tests all passed throughout,
 * because every one of them exercises lib/server/ats (the deterministic MATCH
 * engine) and none of them touched this path.
 *
 * Case B below reproduces that exact failure and asserts it cannot recur.
 *
 * No network, no session, no HTTP: `resolveParsedResume` takes the AI call as
 * an argument, so each way the model has actually failed in production is
 * reproduced with a stub.
 */
import {
  resolveParsedResume, computeAts, hasUsableParse, parseResumeDeterministic,
  extractJsonObject, EMPTY_PARSED_RESUME,
} from '@/lib/server/resume-upload-parse';
import { readFileSync } from 'fs';
import path from 'path';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

/* A resume in the shape the extractor actually emits: headings on their own
   lines, contact details in the header, bullets under a dated role. */
const RESUME_TEXT = `GAURANSH AGARWAL
Backend & Full-Stack Software Engineer
Ghaziabad, India
+91-63944-43659 | someone@example.com | https://linkedin.com/in/example | https://github.com/example

SUMMARY
Backend-leaning full-stack engineer building production systems end to end, including multi-tenant SaaS,
large-scale ingestion pipelines and RAG services delivered against real production traffic and real users.

TECHNICAL SKILLS
Languages: TypeScript, JavaScript, Python, SQL
Backend: Node.js, Express.js, REST APIs, WebSockets, BullMQ
Data: PostgreSQL, MongoDB, Redis, Prisma
Cloud: AWS EC2, Vercel, Docker, Cloudflare R2

EXPERIENCE
Software Engineer Intern — Corescent Technologies — Jul 2024 - Sep 2024
• Developed a multi-source ingestion pipeline across 10+ ATS providers, validated on 100K+ records.
• Reduced upload latency 5.8x by moving embedding work to asynchronous workers.

EDUCATION
B.Tech, Computer Science and Engineering — Ajay Kumar Garg Engineering College — 2023

ACHIEVEMENTS
CodeChef 2-Star, peak rating 1409
Participant, Smart India Hackathon
`;

/** What a healthy model returns. */
const GOOD_AI = JSON.stringify({
  headline: 'Backend Engineer at Corescent Technologies',
  bio: 'I build backend systems end to end, from ingestion pipelines to RAG services, and I care about the reliability of what I ship to production every single week.',
  location: 'Ghaziabad, India',
  website: 'https://example.com',
  skills: ['TypeScript', 'Node.js', 'MongoDB', 'Redis', 'AWS'],
  experience: [{ title: 'Software Engineer Intern', company: 'Corescent', period: 'Jul 2024 – Sep 2024', desc: 'Built an ingestion pipeline.' }],
  education: [{ degree: 'B.Tech CSE', school: 'AKGEC', year: '2027' }],
  achievements: [{ title: 'CodeChef 2-Star', desc: null }],
  socialLinks: { linkedin: 'https://linkedin.com/in/example', github: null, twitter: null },
});

const fail = (message: string) => async () => { throw new Error(message); };

async function main() {
  console.log('\n── A. AI succeeds → the AI result is used ──');

  const a = await resolveParsedResume(RESUME_TEXT, async () => GOOD_AI);
  check('source is "ai"', a.source === 'ai', a.source);
  check('the AI headline survives', a.parsed.headline === 'Backend Engineer at Corescent Technologies');
  check('a score is produced', a.atsScore !== null && a.atsScore.score > 0, String(a.atsScore?.score));
  check('the deterministic parser did not run', !a.notes.includes('deterministic-fallback-used'));

  console.log('\n── B. THE HISTORICAL FAILURE: model_not_found → 0/F ──');

  const b = await resolveParsedResume(RESUME_TEXT, fail('The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.'));
  check('the deterministic parser runs', b.source === 'deterministic', b.source);
  check('THE REGRESSION: the score is NOT 0', b.atsScore !== null && b.atsScore.score > 0, `score=${b.atsScore?.score}`);
  check('THE REGRESSION: the grade is NOT F', b.atsScore?.grade !== 'F', String(b.atsScore?.grade));
  check('real skills were recovered', b.parsed.skills.length > 0, `${b.parsed.skills.length} skills`);
  check('real experience was recovered', b.parsed.experience.length > 0);
  check('real education was recovered', b.parsed.education.length > 0);
  check('the AI failure is recorded for triage', b.notes.some((n) => n.startsWith('ai-request-failed')));

  console.log('\n── C. AI timeout / network error → deterministic parser ──');

  const timeout = Object.assign(new Error('aborted'), { name: 'AbortError' });
  const c = await resolveParsedResume(RESUME_TEXT, async () => { throw timeout; });
  check('the deterministic parser runs', c.source === 'deterministic', c.source);
  check('a real score is produced', (c.atsScore?.score ?? 0) > 0);
  check('the abort is named in the notes', c.notes.some((n) => n.includes('AbortError')));

  console.log('\n── D. AI returns invalid JSON → deterministic parser ──');

  const d = await resolveParsedResume(RESUME_TEXT, async () => 'Sure! Here is the resume you asked about, but not as JSON.');
  check('the deterministic parser runs', d.source === 'deterministic', d.source);
  check('a real score is produced', (d.atsScore?.score ?? 0) > 0);
  check('the parse failure is recorded', d.notes.includes('ai-unparseable-json'));

  const fenced = await resolveParsedResume(RESUME_TEXT, async () => '```json\n' + GOOD_AI + '\n```');
  check('a fenced JSON response is still accepted as AI', fenced.source === 'ai', fenced.source);

  console.log('\n── E. AI returns well-formed but empty data → deterministic parser ──');

  const e = await resolveParsedResume(RESUME_TEXT, async () => JSON.stringify({
    headline: null, bio: null, location: null, website: null,
    skills: [], experience: [], education: [], achievements: [],
    socialLinks: { linkedin: null, github: null, twitter: null },
  }));
  check('an empty AI parse does not win', e.source === 'deterministic', e.source);
  check('the empty AI parse is recorded', e.notes.includes('ai-empty-parse'));
  check('a real score is produced', (e.atsScore?.score ?? 0) > 0);

  const blank = await resolveParsedResume(RESUME_TEXT, async () => '');
  check('an empty AI response falls back too', blank.source === 'deterministic', blank.source);
  check('the empty response is recorded', blank.notes.includes('ai-empty-response'));

  console.log('\n── F. AI not configured at all → deterministic parser ──');

  const f = await resolveParsedResume(RESUME_TEXT, null);
  check('the deterministic parser runs', f.source === 'deterministic', f.source);
  check('a real score is produced', (f.atsScore?.score ?? 0) > 0, `score=${f.atsScore?.score}`);
  check('the missing configuration is recorded', f.notes.includes('ai-not-configured'));
  check('profile fields are populated: headline', Boolean(f.parsed.headline));
  check('profile fields are populated: location', Boolean(f.parsed.location), String(f.parsed.location));
  check('profile fields are populated: bio', Boolean(f.parsed.bio));
  check('profile fields are populated: skills', f.parsed.skills.length >= 5, `${f.parsed.skills.length}`);
  check('profile fields are populated: experience', f.parsed.experience.length >= 1);
  check('profile fields are populated: education', f.parsed.education.length >= 1);

  console.log('\n── G. BOTH parsers fail → no score, no invented data ──');

  const g = await resolveParsedResume('', fail('model_not_found'));
  check('source is "none"', g.source === 'none', g.source);
  check('THE RULE: atsScore is null, not 0', g.atsScore === null, JSON.stringify(g.atsScore));
  check('no skills are invented', g.parsed.skills.length === 0);
  check('no experience is invented', g.parsed.experience.length === 0);
  check('no headline is invented', g.parsed.headline === null);
  check('the total failure is recorded', g.notes.includes('all-parsers-empty'));

  const garbage = await resolveParsedResume('%PDF-1.4   endstream endobj xref', null);
  check('binary garbage also yields no score', garbage.atsScore === null, JSON.stringify(garbage.atsScore));
  check('binary garbage invents no experience', garbage.parsed.experience.length === 0);

  console.log('\n── H. A genuine 0/F is still reachable — semantics unchanged ──');

  const genuineZero = computeAts(EMPTY_PARSED_RESUME);
  check('computeAts on an empty resume is still exactly 0', genuineZero.score === 0, String(genuineZero.score));
  check('computeAts on an empty resume is still grade F', genuineZero.grade === 'F');
  check('a genuine 0 is distinguishable from a parse failure by source, not by score',
    genuineZero.score === 0 && g.atsScore === null);

  /* The published bands and weights are the route's own, and this test must
     notice if a later edit moves them. */
  const graded = computeAts({
    ...EMPTY_PARSED_RESUME,
    headline: 'x', location: 'x', website: 'x',
    bio: 'y'.repeat(200),
    skills: Array.from({ length: 15 }, (_, i) => `s${i}`),
    experience: [
      { title: 'a', company: 'b', period: 'Jan 2020 - Jan 2021', desc: 'd' },
      { title: 'c', company: 'd', period: 'Jan 2021 - Jan 2022', desc: 'd' },
      { title: 'e', company: 'f', period: 'Jan 2022 - Jan 2023', desc: 'd' },
      { title: 'g', company: 'h', period: 'Jan 2023 - Jan 2024', desc: 'd' },
    ],
    education: [{ degree: 'B.Tech', school: 'X', year: '2020' }],
    achievements: [{ title: 'a', desc: null }, { title: 'b', desc: null }, { title: 'c', desc: null }],
    socialLinks: { linkedin: 'https://linkedin.com/in/x', github: null, twitter: null },
  });
  check('a complete resume still scores 100/A', graded.score === 100 && graded.grade === 'A', `${graded.score}/${graded.grade}`);
  check('the breakdown still sums the six documented buckets',
    graded.breakdown.contact === 25 && graded.breakdown.summary === 15 && graded.breakdown.skills === 20
    && graded.breakdown.experience === 25 && graded.breakdown.education === 10 && graded.breakdown.achievements === 5,
    JSON.stringify(graded.breakdown));

  console.log('\n── I. Helper contracts ──');

  check('hasUsableParse rejects the empty parse', !hasUsableParse(EMPTY_PARSED_RESUME));
  check('a lone social link is not "usable" — a regex finds those in garbage',
    !hasUsableParse({ ...EMPTY_PARSED_RESUME, socialLinks: { linkedin: 'https://linkedin.com/in/x', github: null, twitter: null } }));
  check('a lone headline is not "usable" — it is just the first line of the file',
    !hasUsableParse({ ...EMPTY_PARSED_RESUME, headline: '%PDF-1.4' }));
  check('a lone location is not "usable" — any "Word, Word" pair matches',
    !hasUsableParse({ ...EMPTY_PARSED_RESUME, location: 'endstream, endobj' }));
  check('one real skill is usable', hasUsableParse({ ...EMPTY_PARSED_RESUME, skills: ['Node.js'] }));
  check('extractJsonObject rejects a bare array', extractJsonObject('[1,2,3]') === null);
  check('extractJsonObject rejects prose', extractJsonObject('no json here') === null);
  check('extractJsonObject finds an object wrapped in prose',
    extractJsonObject('Here you go: {"a":1} — hope that helps')?.a === 1);
  check('the deterministic parser is sanitised to the stored limits',
    parseResumeDeterministic(RESUME_TEXT).skills.length <= 25);

  console.log('\n── J. The route is actually wired to all of this ──');

  const ROUTE = readFileSync(path.join(process.cwd(), 'app/api/profile/upload-resume/route.ts'), 'utf8');
  check('the route calls resolveParsedResume', ROUTE.includes('await resolveParsedResume('));
  check('the route no longer holds its own copy of computeAts', !ROUTE.includes('function computeAts'));
  check('the route reports the parse source to the client', ROUTE.includes('parseSource,'));
  check('the route exposes an explicit parseFailed flag', ROUTE.includes("parseFailed:   parseSource === 'none'"));
  check('the route passes null when AI is unavailable', ROUTE.includes('aiAvailable ? runAi : null'));
  check('a total parse failure is logged at error level',
    /console\.error\(`\[upload-resume\] BOTH parsers returned nothing/.test(ROUTE));
  check('the resume text — not the AI-trimmed slice — feeds the fallback',
    ROUTE.includes('resolveParsedResume(cleaned,'));

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
