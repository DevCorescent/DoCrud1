/**
 * The public job feed: database-side query ≡ publicJobs().
 *
 * Run: npm run test:public-jobs-equivalence
 *
 * ═══ WHY THIS FILE EXISTS ═══
 *
 * The feed now has TWO implementations. `publicJobs()` filters, sorts and pages
 * in JavaScript over the whole corpus; `buildPublicJobsPipeline()` asks MongoDB
 * to do the same work inside the document so a page of 20 does not cost 12 MB.
 * Two implementations of one contract drift, and this one is a PUBLIC endpoint —
 * drift here means a visitor sees the wrong jobs, or sees a job that lapsed.
 *
 * So this file INTERPRETS the real pipeline — imported, never retyped — and
 * requires byte-identical output from both paths across a fixture corpus and
 * every query shape the API accepts.
 *
 * The interpreter implements ONLY the operators the pipeline actually uses, and
 * THROWS on anything else. That is deliberate: if someone rewrites the pipeline
 * with a new operator, this fails loudly rather than silently evaluating it
 * wrong and reporting equivalence that was never checked.
 *
 * WHAT IT CANNOT PROVE: that MongoDB's own implementation of these operators
 * matches the interpreter's. That is covered separately by a live parity run
 * against the real cluster (see the PERFORMANCE/PARITY notes in the report);
 * this file covers the translation logic, which is where the mistakes are.
 */
import { readFileSync } from 'node:fs';
import { buildPublicJobsPipeline, PUBLIC_JOB_VIEW_FIELDS } from '../lib/server/db/public-jobs-query';
import { publicJobs, publicJobView, type PublicJobQuery } from '../lib/server/job-api/queries';
import type { HiringJobPosting } from '../types/document';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const read = (p: string) => readFileSync(p, 'utf8');

/* ═══ A minimal aggregation interpreter ═════════════════════════════════ */

type Vars = Record<string, unknown>;
const MISSING = undefined;

function resolvePath(path: string, root: unknown, vars: Vars): unknown {
  if (path.startsWith('$$')) {
    const [name, ...rest] = path.slice(2).split('.');
    let cur = vars[name];
    for (const seg of rest) {
      if (cur === null || cur === undefined || typeof cur !== 'object') return MISSING;
      cur = (cur as Record<string, unknown>)[seg];
    }
    return cur;
  }
  const [name, ...rest] = path.slice(1).split('.');
  let cur = (root as Record<string, unknown>)?.[name];
  for (const seg of rest) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return MISSING;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Mongo's null/missing equivalence for $eq / $ifNull. */
const nullish = (v: unknown) => v === null || v === undefined;

function bsonCompare(a: unknown, b: unknown): number {
  /* Missing and null sort below everything else, and equal to each other. */
  if (nullish(a) && nullish(b)) return 0;
  if (nullish(a)) return -1;
  if (nullish(b)) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = String(a), sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function evaluate(expr: unknown, root: unknown, vars: Vars): unknown {
  if (typeof expr === 'string') {
    return expr.startsWith('$') ? resolvePath(expr, root, vars) : expr;
  }
  if (expr === null || typeof expr !== 'object') return expr;
  if (Array.isArray(expr)) return expr.map((e) => evaluate(e, root, vars));

  const entries = Object.entries(expr as Record<string, unknown>);
  /* A plain document literal (the $map allow-list projection). */
  if (entries.length !== 1 || !entries[0][0].startsWith('$')) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) {
      const val = evaluate(v, root, vars);
      /* Mongo omits a key whose expression resolves to missing. */
      if (val !== MISSING) out[k] = val;
    }
    return out;
  }

  const [op, raw] = entries[0];
  const spec = raw as Record<string, unknown>;
  const args = () => (Array.isArray(raw) ? raw.map((e) => evaluate(e, root, vars)) : [evaluate(raw, root, vars)]);

  switch (op) {
    case '$and': return (args() as unknown[]).every((v) => v !== false && !nullish(v) && v !== 0);
    case '$or': return (args() as unknown[]).some((v) => v !== false && !nullish(v) && v !== 0);
    case '$eq': { const [a, b] = args(); return nullish(a) && nullish(b) ? true : a === b; }
    case '$ne': { const [a, b] = args(); return !(nullish(a) && nullish(b) ? true : a === b); }
    case '$gte': { const [a, b] = args(); return bsonCompare(a, b) >= 0; }
    case '$ifNull': { const [a, b] = args(); return nullish(a) ? b : a; }
    /* Returns its argument UNEVALUATED — the whole point of $literal. */
    case '$literal': return raw;
    case '$toString': { const [a] = args(); return nullish(a) ? MISSING : String(a); }
    case '$toLower': { const [a] = args(); return nullish(a) ? '' : String(a).toLowerCase(); }
    case '$trim': return String(evaluate(spec.input, root, vars) ?? '').trim();
    case '$size': return (evaluate(raw, root, vars) as unknown[]).length;
    case '$indexOfCP': {
      const [hay, needle] = args();
      return Array.from(String(hay ?? '')).join('').indexOf(String(needle ?? ''));
    }
    case '$anyElementTrue': {
      const arr = evaluate(Array.isArray(raw) ? raw[0] : raw, root, vars) as unknown[];
      return arr.some((v) => v !== false && !nullish(v) && v !== 0);
    }
    case '$let': {
      const inner: Vars = { ...vars };
      for (const [k, v] of Object.entries(spec.vars as Record<string, unknown>)) {
        inner[k] = evaluate(v, root, vars);
      }
      return evaluate(spec.in, root, inner);
    }
    case '$filter': {
      const input = evaluate(spec.input, root, vars) as unknown[];
      const as = String(spec.as);
      return input.filter((el) => {
        const v = evaluate(spec.cond, root, { ...vars, [as]: el });
        return v !== false && !nullish(v) && v !== 0;
      });
    }
    case '$map': {
      const input = evaluate(spec.input, root, vars) as unknown[];
      const as = String(spec.as);
      return input.map((el) => evaluate(spec.in, root, { ...vars, [as]: el }));
    }
    case '$mergeObjects': {
      const parts = args() as Record<string, unknown>[];
      return Object.assign({}, ...parts);
    }
    case '$sortArray': {
      const input = [...(evaluate(spec.input, root, vars) as Record<string, unknown>[])];
      const by = Object.entries(spec.sortBy as Record<string, number>);
      return input.sort((a, b) => {
        for (const [field, dir] of by) {
          const c = bsonCompare(a?.[field], b?.[field]);
          if (c !== 0) return c * dir;
        }
        return 0;
      });
    }
    case '$slice': {
      const [arr, skip, limit] = args() as [unknown[], number, number];
      return arr.slice(skip, skip + limit);
    }
    default:
      throw new Error(`unsupported operator ${op} — extend this interpreter deliberately`);
  }
}

/** Run the built pipeline over an in-memory corpus. */
function runPipeline(corpus: readonly HiringJobPosting[], query: PublicJobQuery) {
  const pipeline = buildPublicJobsPipeline(query);
  check(`pipeline for ${JSON.stringify(query)} starts with a _id $match`,
    Boolean((pipeline[0] as Record<string, unknown>).$match));
  const project = (pipeline[1] as { $project: Record<string, unknown> }).$project;
  const doc = { _id: 'json:data/hiring-jobs.json', value: corpus };
  const out = evaluate({ total: project.total, items: project.items }, doc, {});
  return out as { total: number; items: Record<string, unknown>[] };
}

/* ═══ Fixtures ═══════════════════════════════════════════════════════════
   Deliberately awkward: absent fields, empty strings, mixed case, padding,
   missing salaries, ties on every sort key. */

const job = (over: Partial<HiringJobPosting>): HiringJobPosting => ({
  id: 'j', title: 'Engineer', organizationName: 'Acme', status: 'published',
  description: 'Build things', createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z', ...over,
} as HiringJobPosting);

const CORPUS: HiringJobPosting[] = [
  job({ id: 'a1', title: 'Senior Backend Engineer', organizationName: 'Razorpay',
    description: 'Go and Kubernetes', preferredSkills: ['Go', 'Kubernetes'],
    country: 'India', state: 'Karnataka', city: 'Bengaluru', location: 'Bengaluru, India',
    workMode: 'remote', employmentType: 'full_time', experienceLevel: 'senior',
    domain: 'engineering', subDomain: 'backend', domainConfidence: 0.9,
    salaryMin: 2000000, salaryMax: 3000000, postedAt: '2024-06-01T00:00:00.000Z' }),
  job({ id: 'a2', title: 'Frontend Developer', organizationName: 'Atlan',
    description: 'React and TypeScript', preferredSkills: ['React', 'TypeScript'],
    country: 'India', state: 'Delhi', city: 'New Delhi', location: 'New Delhi, India',
    workMode: 'hybrid', employmentType: 'full_time', experienceLevel: 'mid',
    domain: 'engineering', subDomain: 'frontend', domainConfidence: 0.7,
    salaryMin: 1200000, postedAt: '2024-05-01T00:00:00.000Z' }),
  /* No salary at all — must survive a minSalary filter. */
  job({ id: 'a3', title: 'Data Analyst', organizationName: 'Groww',
    description: 'SQL and dashboards', preferredSkills: ['SQL'],
    country: 'India', city: 'Mumbai', location: 'Mumbai, India',
    domain: 'data', domainConfidence: 0.5, postedAt: '2024-04-01T00:00:00.000Z' }),
  /* Multi-location: `city` deliberately absent, city findable via location. */
  job({ id: 'a4', title: 'Support Engineer', organizationName: 'Nagarro',
    description: 'Customer facing', location: 'Pune, Bengaluru, India',
    country: 'India', salaryMax: 900000, postedAt: '2024-03-01T00:00:00.000Z' }),
  /* Case and padding on every comparable field. The typed unions say these
     values cannot occur, but `lower()` trims and lowercases before comparing —
     it defends against exactly this, so the fixture exercises that defence.
     Cast, because the point is data the types do not describe. */
  job({ id: 'a5', title: '  PRINCIPAL ENGINEER  ', organizationName: '  MindTickle  ',
    description: '  Distributed SYSTEMS  ', preferredSkills: ['  Rust  ', 'gRPC'],
    country: '  india  ', state: '  KARNATAKA  ', city: '  BENGALURU  ',
    location: '  Bengaluru, India  ', workMode: '  REMOTE  ',
    employmentType: '  Full_Time  ', experienceLevel: '  LEAD  ',
    domain: '  Engineering  ', subDomain: '  BACKEND  ',
    salaryMax: 5000000, postedAt: '2024-07-01T00:00:00.000Z' } as unknown as Partial<HiringJobPosting>),
  /* Excluded: not published. */
  job({ id: 'b1', title: 'Draft Role', status: 'draft', postedAt: '2024-08-01T00:00:00.000Z' }),
  /* Excluded: isActive false. */
  job({ id: 'b2', title: 'Paused Role', isActive: false, postedAt: '2024-08-02T00:00:00.000Z' }),
  /* Excluded: expired. */
  job({ id: 'b3', title: 'Lapsed Role', expiresAt: '2024-01-01T00:00:00.000Z' }),
  /* INCLUDED: empty-string expiry is falsy in JS. The Mongo-truthiness trap. */
  job({ id: 'b4', title: 'Empty Expiry Role', expiresAt: '', postedAt: '2024-02-01T00:00:00.000Z' }),
  /* Ties on postedAt, domainConfidence and salary — exercises the id tie-break. */
  job({ id: 'c2', title: 'Tie Role Two', postedAt: '2024-09-01T00:00:00.000Z', domainConfidence: 0.5, salaryMax: 1000000 }),
  job({ id: 'c1', title: 'Tie Role One', postedAt: '2024-09-01T00:00:00.000Z', domainConfidence: 0.5, salaryMax: 1000000 }),
  job({ id: 'c3', title: 'Tie Role Three', postedAt: '2024-09-01T00:00:00.000Z', domainConfidence: 0.5, salaryMax: 1000000 }),
  /* No postedAt — falls back to createdAt. */
  job({ id: 'd1', title: 'Legacy Role', createdAt: '2023-01-01T00:00:00.000Z' }),
  /* Skills-only search hit; the term appears in NO other field. */
  job({ id: 'e1', title: 'Platform Role', organizationName: 'Zeta', description: 'General work',
    preferredSkills: ['Terraform'], postedAt: '2024-01-15T00:00:00.000Z' }),
];

/* ═══ Query shapes ══════════════════════════════════════════════════════ */

const QUERIES: PublicJobQuery[] = [
  {},
  { pageSize: 1 },
  { pageSize: 1, page: 2 },
  { pageSize: 3 },
  { pageSize: 3, page: 2 },
  { pageSize: 3, page: 99 },            // past the end → empty page, real total
  { pageSize: 100000 },                  // clamped to MAX_PAGE_SIZE
  { pageSize: 0 },                       // falsy → default
  { pageSize: -5 },                      // clamped up to 1
  { page: 0 }, { page: -3 }, { page: 1.9 },
  { sort: 'newest' }, { sort: 'relevance' }, { sort: 'salary' },
  { sort: 'newest', pageSize: 2, page: 3 },
  { sort: 'salary', pageSize: 4 },
  { sort: 'relevance', pageSize: 4 },
  { search: 'engineer' },                // title
  { search: 'ENGINEER' },                // case-insensitive
  { search: '  engineer  ' },            // trimmed
  { search: 'razorpay' },                // organizationName
  { search: 'kubernetes' },              // description
  { search: 'terraform' },               // preferredSkills ONLY
  { search: 'grpc' },                    // preferredSkills, lowercase form
  { search: 'zzzznothing' },             // empty result
  { search: '' },                        // no-op
  { search: '.*' },                      // regex metacharacters are literal
  /* FIELD-PATH INJECTION. In an aggregation a leading '$' means "field path",
     so an unwrapped value here would be resolved against the document instead
     of compared against it. These must behave as ordinary text that matches
     nothing. */
  { search: '$value' },
  { search: '$$j.title' },
  { search: '$$ROOT' },
  { search: '$organizationId' },
  { country: '$$j.country' },
  { city: '$$j.city' },
  { workMode: '$value' },
  { domain: '$$ROOT' },
  { search: 'a' },                       // broad
  { country: 'India' }, { country: 'india' }, { country: 'INDIA' },
  { country: 'Nowhere' },
  { state: 'Karnataka' }, { city: 'Bengaluru' }, { city: 'bengaluru' },
  { city: 'Pune' },                      // matches via raw location only
  { workMode: 'remote' }, { employmentType: 'full_time' },
  { experienceLevel: 'lead' }, { domain: 'engineering' }, { subDomain: 'backend' },
  { minSalary: '1000000' }, { minSalary: 1000000 },
  { minSalary: 99999999 },               // everything with a stated salary drops
  { minSalary: 0 }, { minSalary: -1 }, { minSalary: 'abc' },
  { country: 'India', workMode: 'remote', sort: 'salary' },
  { search: 'engineer', country: 'India', pageSize: 2 },
  { search: 'engineer', country: 'India', state: 'Karnataka', city: 'Bengaluru',
    workMode: 'remote', employmentType: 'full_time', experienceLevel: 'senior',
    domain: 'engineering', subDomain: 'backend', minSalary: 1000000,
    sort: 'salary', page: 1, pageSize: 5 },
];

/* ═══ The comparison ════════════════════════════════════════════════════ */

/* JSON round-trip: `undefined` values are dropped by NextResponse.json exactly
   as a missing field is omitted by the aggregation, so this compares what the
   client actually receives. */
const wire = (v: unknown) => JSON.stringify(v);

for (const query of QUERIES) {
  const js = publicJobs(CORPUS, query);
  const db = runPipeline(CORPUS, query);
  const label = JSON.stringify(query);

  check(`${label} — total matches (${js.total})`, db.total === js.total);
  check(`${label} — item count matches (${js.items.length})`, db.items.length === js.items.length);
  check(`${label} — item ids and order match`,
    wire(db.items.map((i) => i.id)) === wire(js.items.map((i) => i.id)));
  check(`${label} — every field of every item matches`, wire(db.items) === wire(js.items));
}

/* An empty corpus must be an honest empty page, not a crash. */
{
  const js = publicJobs([], {});
  const db = runPipeline([], {});
  check('empty corpus — total 0', db.total === 0 && js.total === 0);
  check('empty corpus — no items', db.items.length === 0);
}

/* ═══ The allow-list may not drift from publicJobView ════════════════════ */

const sample = publicJobView(CORPUS[0]);
check('the projection exposes exactly publicJobView\'s keys',
  wire(Object.keys(sample).sort()) === wire([...PUBLIC_JOB_VIEW_FIELDS].sort()));

/* The fields publicJobView deliberately withholds must not appear. */
for (const secret of ['organizationId', 'createdByUserId', 'createdByEmail',
  'contentHash', 'sourceId', 'sourceJobId', 'canonicalUrl', 'dedupGroupId',
  'ingestedAt', 'lastSeenAt', 'minimumAtsScore', 'classificationVersion', 'status']) {
  check(`the projection never exposes ${secret}`,
    !(PUBLIC_JOB_VIEW_FIELDS as readonly string[]).includes(secret));
}
/* Proven on real output too, not just on the list. */
{
  const leaky = job({ id: 'leak', organizationId: 'org-secret', createdByEmail: 'a@b.c',
    contentHash: 'HASH', minimumAtsScore: 77 } as Partial<HiringJobPosting>);
  const db = runPipeline([leaky], {});
  const text = wire(db.items);
  check('a posting carrying owner/ingestion fields leaks none of them',
    !text.includes('org-secret') && !text.includes('a@b.c')
    && !text.includes('HASH') && !text.includes('77'));
}

/* ═══ Search must not become a regex ════════════════════════════════════ */

const src = read('lib/server/db/public-jobs-query.ts');
/* Comments are stripped first: the file's own prose EXPLAINS why $regexMatch is
   avoided, and matching that explanation would fail the check it documents. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
check('substring search uses $indexOfCP, never $regexMatch',
  /\$indexOfCP/.test(code) && !/\$regexMatch|\$regexFind/.test(code));
check('and no user value is interpolated into a $regex operator',
  !/\$regex/.test(code));

/* Every request-derived string must be wrapped, not just behave correctly on
   the fixtures above — a future filter added without `literal()` would reopen
   this. */
check('user values are wrapped in $literal', /\$literal/.test(code));
check('and the raw needle is never passed straight to $indexOfCP',
  !/\$indexOfCP: \[lowerExpr\(path\), needle\]/.test(code));
{
  /* The injected value must select NOTHING, rather than resolving to a field. */
  const injected = runPipeline(CORPUS, { search: '$value' });
  check('a $-prefixed search matches no postings', injected.items.length === 0);
  const asField = runPipeline(CORPUS, { country: '$$j.country' });
  check('a $-prefixed filter does not become a field-to-field comparison',
    asField.total === 0);
}

/* ═══ Fallback contract ═════════════════════════════════════════════════ */

check('selectPublicJobsPage returns null, never an empty page, when unavailable',
  /Promise<PublicJobsPage \| null>/.test(src)
  && /if \(!db\) return null;/.test(src));
check('a malformed aggregation result is rejected rather than served',
  /typeof row\.total !== 'number'\) return null/.test(src));
check('both implementations clamp pages with the same helper',
  /pageParams/.test(src) && /pageParams/.test(read('lib/server/job-api/queries.ts')));

/* ═══ The sort key never escapes ════════════════════════════════════════ */

check('the merged sort key is not part of the public allow-list',
  !(PUBLIC_JOB_VIEW_FIELDS as readonly string[]).includes('__k'));
{
  const db = runPipeline(CORPUS, { pageSize: 5 });
  check('and no returned item carries it', !wire(db.items).includes('__k'));
}

console.log(`\n${passed} checks passed, ${failed} failed.`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
console.log('ALL CHECKS PASSED');
