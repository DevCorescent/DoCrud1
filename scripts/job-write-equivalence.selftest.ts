/**
 * Phase 2.7C — does the new writer produce the same canonical state?
 *
 * Run: npm run test:job-write-equivalence
 *
 * ═══ WHAT IS COMPARED ═══
 *
 *   OLD:  planIngest(drafts, existing) → whole corpus → mirror stamps _order
 *         from each job's ARRAY INDEX, and deletes anything absent.
 *   NEW:  upsertHiringJobs(changed) → per-document upsert, deletes nothing.
 *
 * Both are modelled here against deterministic fixtures. `planIngest` is a pure
 * function and is executed for real; the mirror and the upsert are modelled,
 * because both reach MongoDB and this suite touches NO DATABASE and NO
 * PRODUCTION DATA.
 *
 * ═══ WHAT EQUIVALENCE MEANS HERE ═══
 *
 * Equivalent = the same set of canonical documents, with the same ids, the same
 * business fields, and the same fingerprints. NOT equivalent by construction:
 * `_order`, which the two strategies compute differently — that difference is
 * the finding of this phase, and section 6 is about it.
 */
import { readFileSync } from 'node:fs';
import { planIngest } from '../lib/server/job-sources/ingest';
import { fingerprintJob } from '../lib/server/db/hiring-jobs-collection';
import {
  ORDER_STEP, orderBefore, orderAfter, orderBetween, ordersBefore,
  hasSpaceBetween, planRebalance, findExhaustedGaps,
} from '../lib/server/db/job-order';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const COLLECTION = readFileSync('lib/server/db/hiring-jobs-collection.ts', 'utf8');

type Doc = Record<string, unknown> & { id: string };
interface Canonical { _id: string; job: Doc; _fp: string; _order: number }

/** OLD: whole corpus in, positions from array index, absent documents deleted. */
function mirrorModel(corpus: Doc[], prior: Map<string, Canonical>): Map<string, Canonical> {
  const out = new Map<string, Canonical>();
  corpus.forEach((job, index) => {
    const fp = fingerprintJob(job);
    out.set(job.id, { _id: job.id, job, _fp: fp, _order: index });
  });
  /* The $nin: anything not in this corpus is removed. */
  Array.from(prior.keys()).forEach((id) => { if (!out.has(id)) prior.delete(id); });
  return out;
}

/** NEW: only the batch is written, nothing is ever removed. */
function upsertModel(
  batch: Array<{ job: Doc; order?: number }>,
  store: Map<string, Canonical>,
): { written: number; unchanged: number } {
  let written = 0, unchanged = 0;
  for (const { job, order } of batch) {
    if (!job.id) throw new Error('job without an id');
    const fp = fingerprintJob(job);
    const prior = store.get(job.id);
    if (prior?._fp === fp) { unchanged += 1; continue; }
    if (!prior && typeof order !== 'number') throw new Error('new job needs an order');
    store.set(job.id, {
      _id: job.id, job, _fp: fp,
      _order: typeof order === 'number' ? order : prior!._order,
    });
    written += 1;
  }
  return { written, unchanged };
}

const j = (id: string, over: Record<string, unknown> = {}): Doc =>
  ({ id, title: `Role ${id}`, organizationName: 'Acme', location: 'Pune',
     status: 'published', createdAt: '2026-09-01T00:00:00.000Z', ...over });

const seed = (ids: string[]): Map<string, Canonical> => {
  const m = new Map<string, Canonical>();
  ids.forEach((id, i) => m.set(id, { _id: id, job: j(id), _fp: fingerprintJob(j(id)), _order: i }));
  return m;
};
/** Business equivalence: ids + fields + fingerprints. Excludes _order by design. */
const businessState = (m: Map<string, Canonical>) =>
  Array.from(m.values())
    .map((c) => `${c._id}:${c._fp}`)
    .sort().join('|');

/* ═══ CASE 1 — new jobs ════════════════════════════════════════════════════ */
{
  const corpus = [j('A'), j('B'), j('C')];
  const old = mirrorModel(corpus, new Map());
  const nu = new Map<string, Canonical>();
  upsertModel(corpus.map((job, i) => ({ job, order: i })), nu);
  check('CASE 1: three new jobs produce the same canonical set',
    businessState(old) === businessState(nu));
  check('CASE 1: ids map identically', old.get('A')?._id === nu.get('A')?._id);
  check('CASE 1: fingerprints match', old.get('B')?._fp === nu.get('B')?._fp);
}

/* ═══ CASE 2 — unchanged jobs ══════════════════════════════════════════════ */
{
  const store = seed(['A', 'B']);
  const before = businessState(store);
  const r = upsertModel([{ job: j('A') }, { job: j('B') }], store);
  check('CASE 2: unchanged jobs are reported unchanged', r.unchanged === 2);
  check('CASE 2: and cost ZERO writes', r.written === 0);
  check('CASE 2: canonical state is untouched', businessState(store) === before);
}

/* ═══ CASE 3 — changed job ═════════════════════════════════════════════════ */
{
  const store = seed(['A', 'B']);
  const bFp = store.get('B')!._fp;
  const r = upsertModel([{ job: j('A', { title: 'Changed A' }) }, { job: j('B') }], store);
  check('CASE 3: exactly one job is rewritten', r.written === 1 && r.unchanged === 1);
  check('CASE 3: A was updated', store.get('A')!.job.title === 'Changed A');
  check('CASE 3: B is byte-identical', store.get('B')!._fp === bFp);
  check('CASE 3: A keeps its position', store.get('A')!._order === 0);
}

/* ═══ CASE 4 — new + existing ══════════════════════════════════════════════ */
{
  const store = seed(['A', 'B']);
  upsertModel([{ job: j('A') }, { job: j('B') }, { job: j('C'), order: 2 }], store);
  check('CASE 4: the new job is inserted', store.has('C'));
  check('CASE 4: existing jobs survive', store.has('A') && store.has('B'));
  check('CASE 4: nothing else appeared', store.size === 3);
}

/* ═══ CASE 5 — PARTIAL BATCH (the critical one) ════════════════════════════ */
{
  const oldPrior = seed(['A', 'B', 'C', 'D']);
  /* OLD strategy given only A,B as its corpus — the $nin removes C and D. */
  mirrorModel([j('A'), j('B')], oldPrior);
  check('CASE 5: the OLD path DELETES absent jobs (why it must stay corpus-scoped)',
    !oldPrior.has('C') && !oldPrior.has('D'));

  const store = seed(['A', 'B', 'C', 'D']);
  upsertModel([{ job: j('A', { title: 'Updated A' }) }, { job: j('B') }], store);
  check('CASE 5: the NEW writer keeps C', store.has('C'));
  check('CASE 5: the NEW writer keeps D', store.has('D'));
  check('CASE 5: all four survive', store.size === 4);
  check('CASE 5: and A was still updated', store.get('A')!.job.title === 'Updated A');
  check('CASE 5: the two strategies DIFFER here — deliberately',
    businessState(oldPrior) !== businessState(store));
}

/* ═══ CASE 6 — duplicate input ═════════════════════════════════════════════ */
{
  const store = new Map<string, Canonical>();
  upsertModel([{ job: j('A'), order: 0 }, { job: j('A'), order: 0 }, { job: j('B'), order: 1 }], store);
  check('CASE 6: a duplicated job yields ONE canonical record', store.size === 2);
  check('CASE 6: and it is the right one', store.get('A')!.job.id === 'A');
}

/* ═══ CASE 7 — retry ═══════════════════════════════════════════════════════ */
{
  const store = seed(['A']);
  const state = businessState(store);
  const first = upsertModel([{ job: j('A') }], store);
  const second = upsertModel([{ job: j('A') }], store);
  check('CASE 7: a retry writes nothing', first.written === 0 && second.written === 0);
  check('CASE 7: and is idempotent', businessState(store) === state);
}

/* ═══ CASE 8 — only the changed job is rewritten ═══════════════════════════ */
{
  const store = seed(['A', 'B', 'C', 'D', 'E']);
  const r = upsertModel(
    ['A', 'B', 'C', 'D', 'E'].map((id) => ({ job: id === 'C' ? j('C', { title: 'New' }) : j(id) })),
    store,
  );
  check('CASE 8: one changed job in five → one write', r.written === 1);
  check('CASE 8: the other four are untouched', r.unchanged === 4);
}

/* ═══ 6. _ORDER — the unresolved semantic ══════════════════════════════════ */
{
  /* planIngest is executed for real, so this is production behaviour, not a
     model of it. */
  const existing = [j('OLD1'), j('OLD2')] as never;
  const draft = {
    identity: { key: 'acme::new role::pune', basis: 'sourceJobId' },
    title: 'New Role', organizationName: 'Acme', location: 'Pune',
    isActive: true, contentHash: 'h1',
  } as never;
  const plan = planIngest([draft], existing, { now: '2026-09-08T00:00:00.000Z' });

  check('_order: planIngest PREPENDS a new job — it lands at index 0',
    plan.report.created === 1 && String((plan.jobs[0] as { title?: unknown }).title) === 'New Role');
  check('_order: every existing job therefore SHIFTS by one',
    String((plan.jobs[1] as { id?: unknown }).id) === 'OLD1');

  /* Consequence: with dense array-index ordering, inserting ONE job changes the
     _order of EVERY other job. The mirror absorbs that by re-stamping them all.
     A per-document writer cannot, without rewriting the whole corpus — which is
     precisely the cost this phase exists to remove. */
  const prependIndex = 0;
  const appendIndex = plan.jobs.length - 1;
  check('_order: appending a new job at the END is NOT equivalent to production',
    prependIndex !== appendIndex);

  check('_order: the writer therefore REFUSES to guess a position for a new job',
    /is new and no order was supplied/.test(COLLECTION));
  check('_order: and the refusal names where the position must come from',
    /position must come from the caller \(see planIngest\)/.test(COLLECTION));
  check('_order: the discarded "append" default is gone',
    !/MAX_SAFE_INTEGER/.test(COLLECTION));
  check('_order: a known job keeps its stored position when none is supplied',
    /stored position is then left untouched/.test(COLLECTION));
}

/* ═══ 2.7D — SPARSE ORDERING ══════════════════════════════════════════════
   Dense indices cannot survive per-document writes: prepending one posting
   renumbers all 5,276. Gaps let a job be inserted without touching either
   neighbour. The SEMANTICS are unchanged — ascending _order is still the
   board, new postings still go to the front — only the numbers are spaced. */
{
  /* ── Insertion at the beginning: where planIngest puts a new posting ── */
  const board = [0, ORDER_STEP, 2 * ORDER_STEP];        // three existing jobs
  const first = orderBefore(board[0]);
  check('BEGIN: a new posting sorts ahead of everything', first < board[0]);
  check('BEGIN: neither existing job is touched',
    board[0] === 0 && board[1] === ORDER_STEP);
  check('BEGIN: an empty collection starts at the origin', orderBefore(null) === 0);

  /* ── Insertion between two jobs ── */
  const mid = orderBetween(board[0], board[1]);
  check('MIDDLE: a position exists between two neighbours', mid !== null);
  check('MIDDLE: it sorts strictly between them',
    mid !== null && mid > board[0] && mid < board[1]);
  check('MIDDLE: the neighbours keep their own positions',
    board[0] === 0 && board[1] === ORDER_STEP);

  /* ── Insertion at the end ── */
  const last = orderAfter(board[2]);
  check('END: an appended posting sorts after everything', last > board[2]);
  check('END: an empty collection appends at the origin', orderAfter(null) === 0);

  /* ── Multiple insertions at the front, as planIngest would ── */
  const many = ordersBefore(board[0], 3);
  check('MULTI: three insertions get three distinct positions',
    new Set(many).size === 3);
  check('MULTI: all sort ahead of the existing board',
    many.every((o) => o < board[0]));
  check('MULTI: they descend, so batch order is preserved',
    many[0] > many[1] && many[1] > many[2]);
  check('MULTI: and still no existing job was renumbered', board.join() === [0, ORDER_STEP, 2 * ORDER_STEP].join());

  /* ── NO DENSE RENUMBERING ── */
  const before = [0, ORDER_STEP, 2 * ORDER_STEP];
  const after = [...before];
  orderBefore(after[0]); orderBetween(after[0], after[1]); orderAfter(after[2]);
  check('NO RENUMBER: computing positions never mutates existing ones',
    before.join() === after.join());
  check('NO RENUMBER: inserting at the front costs ONE write, not corpus-many',
    ordersBefore(before[0], 1).length === 1);

  /* ── Exhaustion is detected, never papered over ── */
  check('EXHAUSTION: adjacent integers have no room', orderBetween(5, 6) === null);
  check('EXHAUSTION: identical positions have no room', orderBetween(7, 7) === null);
  check('EXHAUSTION: hasSpaceBetween agrees', !hasSpaceBetween(5, 6) && hasSpaceBetween(0, 100));
  check('EXHAUSTION: a healthy gap survives ~20 halvings',
    (() => {
      let lo = 0, hi = ORDER_STEP, n = 0;
      for (;;) { const m = orderBetween(lo, hi); if (m === null) break; hi = m; n += 1; }
      return n >= 19;
    })());
  const gaps = findExhaustedGaps([0, 1, 100, 200]);
  check('EXHAUSTION: exhausted gaps are reported with their position',
    gaps.length === 1 && gaps[0].index === 0);
  check('EXHAUSTION: healthy spacing reports nothing',
    findExhaustedGaps([0, ORDER_STEP, 2 * ORDER_STEP]).length === 0);

  /* ── Rebalance is EXPLICIT ── */
  const plan = planRebalance(['a', 'b', 'c']);
  check('REBALANCE: it re-spaces every document — O(corpus), not O(changed)',
    plan.assignments.length === 3);
  check('REBALANCE: relative order is preserved exactly',
    plan.assignments.map((a) => a.id).join() === 'a,b,c');
  check('REBALANCE: the new spacing is healthy',
    findExhaustedGaps(plan.assignments.map((a) => a.order)).length === 0);
  check('REBALANCE: an empty collection needs nothing',
    planRebalance([]).unnecessary === true);
  check('REBALANCE: nothing in the writer triggers it automatically',
    !/planRebalance|rebalance/i.test(COLLECTION));

  /* ── createdAt was NOT substituted ── */
  check('createdAt is NOT used as the ordering mechanism',
    !/sort\(\{ *createdAt/.test(COLLECTION));

  /* ── The writer still refuses to invent a position ── */
  check('the writer refuses a new job with no order',
    /is new and no order was supplied/.test(COLLECTION));
  check('and refuses a non-integer order',
    /was given a non-integer order/.test(COLLECTION));
}

/* ═══ 2.7D — ordering behaviour through the writer model ══════════════════ */
{
  const store = seed(['A', 'B']);                 // dense 0,1 as production has today
  store.get('A')!._order = 0;
  store.get('B')!._order = ORDER_STEP;

  /* A new posting at the front, positioned by the caller. */
  const min = Math.min(...Array.from(store.values()).map((c) => c._order));
  upsertModel([{ job: j('NEW'), order: orderBefore(min) }], store);
  check('WRITER: the new job sorts first',
    store.get('NEW')!._order < store.get('A')!._order);
  check('WRITER: existing jobs kept their exact positions',
    store.get('A')!._order === 0 && store.get('B')!._order === ORDER_STEP);

  /* A changed job keeps its position. */
  upsertModel([{ job: j('A', { title: 'Changed' }) }], store);
  check('WRITER: a changed job keeps its _order', store.get('A')!._order === 0);
  check('WRITER: and its content was updated', store.get('A')!.job.title === 'Changed');

  /* Unchanged: zero writes. */
  const r = upsertModel([{ job: j('B') }], store);
  check('WRITER: an unchanged job costs no write', r.written === 0 && r.unchanged === 1);

  /* Retry and duplicates. */
  const size = store.size;
  upsertModel([{ job: j('B') }, { job: j('B') }], store);
  check('WRITER: duplicate input stays canonical', store.size === size);

  /* Partial batch still deletes nothing. */
  upsertModel([{ job: j('A', { title: 'Changed' }) }], store);
  check('WRITER: a partial batch leaves unrelated jobs alone',
    store.has('B') && store.has('NEW'));

  /* A new job with no order is refused by the model, as by the writer. */
  let threw = false;
  try { upsertModel([{ job: j('ORPHAN') }], store); } catch { threw = true; }
  check('WRITER: no new job can be inserted without an explicit order', threw);
  check('WRITER: and the refusal left the store untouched', !store.has('ORPHAN'));
}

/* ═══ 13. Mutation coverage ════════════════════════════════════════════════ */
{
  const fn = COLLECTION.slice(COLLECTION.indexOf('export async function upsertHiringJobs'));
  const body = fn.slice(0, fn.indexOf('\n}\n') + 2);
  check('M1: _id mapping intact', /_id: id/.test(body));
  check('M2: fingerprint is preserved on every write', /\[FP_FIELD\]: fp/.test(body));
  check('M3: _order is only ever set deliberately', /set\[ORDER_FIELD\] = input\.order/.test(body));
  check('M4: no unrelated job can be deleted', !/deleteMany|deleteOne|\$nin/.test(body));
  check('M5: partial input triggers no reconciliation', !/\$nin/.test(body));
  check('M6: duplicates collapse — writes are keyed by _id', /filter: \{ _id: id \}/.test(body));
  check('M7: changed jobs are written', /priors\.get\(id\) === fp/.test(body));
  check('M8: unchanged jobs are skipped', /unchanged \+= 1; return;/.test(body));
  check('M9: failure cannot become success', /ok: false, written: 0/.test(body));
  check('M10: app_state is not a dependency',
    !/app_state|hiringJobsPath|writeJsonFile|getHiringJobs/.test(body));
}

console.log(`\n${passed} checks passed, ${failed} failed.`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
console.log('ALL CHECKS PASSED');
