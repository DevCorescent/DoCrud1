/**
 * Phase 2.7A — the contract the canonical job writer must satisfy.
 *
 * Run: npm run test:job-write-contract
 *
 * ═══ WHAT THIS IS, AND WHAT IT IS NOT ═══
 *
 * `upsertHiringJobs()` does not exist yet. This suite exists BEFORE it, so the
 * behaviour it must preserve is written down while the current behaviour is
 * still the reference — not reconstructed afterwards from whatever the new code
 * happens to do.
 *
 * Two kinds of check, and the distinction matters:
 *
 *   · CONTRACT — an executable model of the future writer's semantics. The
 *     model is not production code and is not a stand-in for it; it makes the
 *     required properties concrete and testable so 2.7B has something to
 *     satisfy rather than a paragraph to interpret.
 *
 *   · STRUCTURAL — assertions against the REAL files, which fail if a future
 *     edit reintroduces a hazard the audit identified.
 *
 * ═══ THE HAZARD THIS SUITE EXISTS FOR ═══
 *
 * `mirrorPublishedJobs` ends with `deleteMany({_id: {$nin: ids}})`. That is
 * correct for a mirror, whose input is the whole corpus by definition. It would
 * be catastrophic in an ingestion writer, whose input is one source's batch: a
 * scraper returning 40 of 5,276 jobs would delete 5,236 live postings.
 *
 * Absence of evidence is not evidence of absence. Removal must come from a
 * lifecycle decision with positive evidence, never from a job's failure to
 * appear in someone else's batch.
 *
 * NOTHING HERE TOUCHES A DATABASE, AND NOTHING HERE CHANGES PRODUCTION.
 */
import { readFileSync } from 'node:fs';
import { fingerprintJob } from '../lib/server/db/hiring-jobs-collection';
import { upsertHiringJobs } from '../lib/server/db/hiring-jobs-collection';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const read = (p: string) => readFileSync(p, 'utf8');

const HIRING = read('lib/server/hiring.ts');
const COLLECTION = read('lib/server/db/hiring-jobs-collection.ts');
const INGEST = read('lib/server/job-sources/ingest.ts');

/* ═══ The contract model ═══════════════════════════════════════════════════
   An in-memory canonical store implementing the SEMANTICS 2.7B must provide.
   Deliberately tiny: identity, fingerprint change-detection, and the absolute
   refusal to delete anything a batch merely failed to mention. */

type Job = Record<string, unknown> & { id: string };
interface Stored { job: Job; fp: string; order: number; updatedAt: number }

class CanonicalStore {
  private docs = new Map<string, Stored>();
  private seq = 0;
  /** Counts FULL document rewrites, so "unchanged costs nothing" is testable. */
  public rewrites = 0;

  /** The future upsertHiringJobs(changed[]). Batch-scoped, never corpus-scoped. */
  upsert(batch: ReadonlyArray<Job>): { inserted: number; updated: number; unchanged: number } {
    if (!Array.isArray(batch)) throw new Error('batch must be an array');
    let inserted = 0, updated = 0, unchanged = 0;

    for (const job of batch) {
      /* An id-less job cannot be addressed, so it cannot be written. It must
         not be silently skipped either — that is how a corpus quietly loses
         postings — so it is a hard error. */
      if (!job || typeof job.id !== 'string' || !job.id) throw new Error('job without an id');

      const fp = fingerprintJob(job);
      const prior = this.docs.get(job.id);

      if (!prior) {
        this.docs.set(job.id, { job, fp, order: this.seq += 1, updatedAt: Date.now() });
        this.rewrites += 1;
        inserted += 1;
      } else if (prior.fp !== fp) {
        /* Changed: rewrite the document, KEEP its identity and position. */
        this.docs.set(job.id, { job, fp, order: prior.order, updatedAt: Date.now() });
        this.rewrites += 1;
        updated += 1;
      } else {
        unchanged += 1; // no write at all
      }
    }
    /* NOTE THE ABSENCE: no reconciliation, no deleteMany, no $nin. A job not
       mentioned by this batch is simply not this batch's business. */
    return { inserted, updated, unchanged };
  }

  /** Removal is explicit and per-job — the only way a job leaves the store. */
  retire(id: string, evidence: 'source-says-gone' | 'expired' | 'employer-closed'): boolean {
    if (!evidence) throw new Error('removal requires positive evidence');
    return this.docs.delete(id);
  }

  ids(): string[] { return Array.from(this.docs.keys()).sort(); }
  get(id: string): Stored | undefined { return this.docs.get(id); }
  get size(): number { return this.docs.size; }
}

const job = (id: string, over: Record<string, unknown> = {}): Job =>
  ({ id, title: `Role ${id}`, organizationName: 'Acme', status: 'published', ...over });

/* ═══ 1. Identity ══════════════════════════════════════════════════════════ */
{
  const s = new CanonicalStore();
  s.upsert([job('a'), job('b')]);
  check('a new job is stored under its own id', s.ids().join(',') === 'a,b');
  check('the document is addressed by job.id', s.get('a')?.job.id === 'a');

  let threw = false;
  try { s.upsert([{ title: 'no id' } as unknown as Job]); } catch { threw = true; }
  check('a job with no id is REFUSED, not silently skipped', threw);
  check('and the refusal leaves the store untouched', s.size === 2);
}

/* ═══ 2. Idempotency and change detection ══════════════════════════════════ */
{
  const s = new CanonicalStore();
  const j = job('a');
  const first = s.upsert([j]);
  check('a first write inserts', first.inserted === 1);

  const rewritesAfterInsert = s.rewrites;
  const second = s.upsert([{ ...j }]);
  check('the same job written twice is idempotent', s.size === 1);
  check('an unchanged fingerprint is reported unchanged', second.unchanged === 1);
  check('and costs NO document rewrite', s.rewrites === rewritesAfterInsert);

  const third = s.upsert([job('a', { title: 'Senior Role' })]);
  check('a changed fingerprint updates the document', third.updated === 1);
  check('and rewrites it', s.rewrites === rewritesAfterInsert + 1);
  check('the update keeps the same identity', s.size === 1 && s.get('a')?.job.id === 'a');
  check('the fingerprint actually differs for differing content',
    fingerprintJob(job('a')) !== fingerprintJob(job('a', { title: 'Senior Role' })));
  check('and is stable for identical content',
    fingerprintJob(job('a')) === fingerprintJob(job('a')));
  check('field ORDER does not change the fingerprint',
    fingerprintJob({ id: 'x', a: 1, b: 2 } as Job) === fingerprintJob({ id: 'x', b: 2, a: 1 } as Job));
}

/* ═══ 3. THE DESTRUCTIVE-RECONCILIATION TEST ═══════════════════════════════
   The audit's primary risk, stated as the scenario from the spec. */
{
  const s = new CanonicalStore();
  s.upsert([job('A'), job('B'), job('C'), job('D')]);
  check('four canonical jobs exist', s.ids().join(',') === 'A,B,C,D');

  /* One source reports only A and B. C and D belong to other sources, or this
     source paged, or its response was truncated. The writer cannot tell which,
     and MUST NOT guess. */
  s.upsert([job('A', { title: 'Updated A' }), job('B')]);

  check('a batch of A,B does NOT delete C', s.get('C') !== undefined);
  check('a batch of A,B does NOT delete D', s.get('D') !== undefined);
  check('all four survive a partial batch', s.ids().join(',') === 'A,B,C,D');
  check('the mentioned job was still updated', s.get('A')?.job.title === 'Updated A');

  /* Removal exists — but only as an explicit act with a stated reason. */
  const gone = s.retire('C', 'source-says-gone');
  check('an explicit retire with evidence DOES remove', gone && s.get('C') === undefined);
  check('and touches nothing else', s.ids().join(',') === 'A,B,D');
}

/* ═══ 4. Empty and invalid batches ═════════════════════════════════════════ */
{
  const s = new CanonicalStore();
  s.upsert([job('A'), job('B')]);

  const empty = s.upsert([]);
  check('an EMPTY batch writes nothing', empty.inserted + empty.updated === 0);
  check('an empty batch DELETES NOTHING — the whole point', s.size === 2);

  let threw = false;
  try { s.upsert(null as unknown as Job[]); } catch { threw = true; }
  check('a non-array batch is refused', threw);
  check('and still deletes nothing', s.size === 2);
}

/* ═══ 5. Failure is not emptiness (the Phase 2.4 lesson) ═══════════════════ */
{
  /* A failing source must reach the writer as a THROW, never as []. If it
     arrives as [], the writer cannot distinguish "nothing to do" from
     "everything is gone" — which is exactly how the Phase 2.3 near-miss
     nearly deleted 5,276 documents. */
  const fetchOutcome = (kind: string): Job[] => {
    if (kind === 'ok-empty') return [];
    throw new Error(kind); // failure / timeout / malformed / auth / rate-limit
  };
  for (const kind of ['failure', 'timeout', 'malformed', 'auth', 'rate-limit']) {
    let threw = false;
    try { fetchOutcome(kind); } catch { threw = true; }
    check(`a ${kind} response throws rather than returning []`, threw);
  }
  check('only a LEGITIMATE empty source returns []', fetchOutcome('ok-empty').length === 0);

  const s = new CanonicalStore();
  s.upsert([job('A')]);
  check('and a legitimate empty source still deletes nothing', (s.upsert([]), s.size === 1));
}

/* ═══ 6. Concurrency, modelled as interleaving ═════════════════════════════ */
{
  const s = new CanonicalStore();
  /* Two workers, overlapping batches. Per-document upserts mean the overlap is
     resolved per job; neither worker can lose the other's unrelated writes —
     which is NOT true of today's whole-corpus write. */
  s.upsert([job('A'), job('shared')]);
  s.upsert([job('B'), job('shared')]);
  check('overlapping batches do not duplicate the shared job', s.size === 3);
  check('neither worker lost the other worker\'s jobs',
    s.ids().join(',') === 'A,B,shared');

  const before = s.size;
  s.upsert([job('A')]); // a retry of an already-applied batch
  check('a retry after a timeout is idempotent', s.size === before);
}

/* ═══ 7. Ordering ══════════════════════════════════════════════════════════ */
{
  const s = new CanonicalStore();
  s.upsert([job('A'), job('B'), job('C')]);
  const orderBefore = s.get('B')!.order;
  s.upsert([job('B', { title: 'Changed' })]);
  check('updating a job does not move it', s.get('B')!.order === orderBefore);
  check('order is assigned once, at insert', s.get('A')!.order < s.get('C')!.order);
}

/* ═══ 8. STRUCTURAL — production must still be untouched ═══════════════════ */
{
  /* 2.6+2.7E cut over: the app_state job write is GONE. The INVARIANT this
     replaced — one source of truth for the corpus — is now asserted directly. */
  check('the app_state job write is gone — one source of truth',
    !/writeJsonFile\(hiringJobsPath/.test(HIRING));
  check('the mirror is still called from the funnel',
    /mirrorPublishedJobs\(jobs as unknown/.test(HIRING));
  /* 2.7B: the writer now EXISTS. What must remain true is that no production
     caller uses it — the cutover is 2.7D, deliberately separate. */
  check('2.7B: upsertHiringJobs exists',
    /export async function upsertHiringJobs/.test(COLLECTION));
  check('2.7B: NO production caller has switched to it yet',
    !/upsertHiringJobs/.test(HIRING + INGEST));
  check('no write feature flag was introduced',
    !/JOB_WRITE_TO_HIRING_JOBS/.test(HIRING + COLLECTION + INGEST));
}

/* ═══ 9. STRUCTURAL — mutation resistance ══════════════════════════════════
   Each check names the mutation it exists to catch. */
{
  /* M4: deleteMany($nin) must stay OUT of the ingestion path. It is legitimate
     in the mirror, whose input is the whole corpus; it is catastrophic in a
     writer whose input is one source's batch. */
  check('M4: the ingestion path contains no $nin reconciliation',
    !/\$nin/.test(INGEST));
  /* Count CODE occurrences: retireHiringJob's doc comment names $nin to
     explain what it deliberately does NOT do. */
  const collectionCode = COLLECTION.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('M4: $nin appears ONLY in the whole-corpus mirror',
    (collectionCode.match(/\$nin/g) || []).length === 1);
  check('M4: and that one use is documented as corpus-scoped',
    /A job removed from app_state must disappear here too/.test(COLLECTION));

  /* M3: a failed read must throw, never degrade to []. */
  /* M3 unchanged in SUBSTANCE — a failed corpus read must never become [] —
     but the mechanism moved from readJsonFileStrict to the canonical selector,
     which throws rather than returning null. */
  check('M3: a failed canonical corpus read THROWS, never returns []',
    /return selectAllJobDocs\(\)/.test(HIRING)
    && /if \(!db\) throw new Error\('canonical job store unavailable/.test(COLLECTION));

  /* M5: fingerprint change-detection must survive. */
  check('M5: the mirror still skips unchanged documents by fingerprint',
    /if \(!prior \|\| prior\.fp !== fp\)/.test(COLLECTION));
  check('M5: and stamps the fingerprint it compared against',
    /\[FP_FIELD\]: fp/.test(COLLECTION));

  /* M1/M2: writes must remain identity-filtered upserts. */
  check('M1/M2: the mirror writes with an _id filter and upsert',
    /filter: \{ _id: id \}/.test(COLLECTION) && /upsert: true/.test(COLLECTION));
  check('M1/M2: no unfiltered updateMany in the job write path',
    !/updateMany\(\{\}/.test(COLLECTION));

  /* M7: an empty batch must never reach the funnel as a corpus. */
  check('M7: ingestion returns early on an empty source',
    /if \(!Array\.isArray\(jobs\) \|\| jobs\.length === 0\) return emptyReport\(\)/.test(INGEST));
  /* 2.7E moved the write to the canonical path; the GUARD is what matters and
     it is unchanged — a run where nothing changed still writes nothing. */
  check('M7: ingestion writes only when something actually changed',
    /if \(report\.created \|\| report\.updated\) \{/.test(INGEST));

  /* M6: app_state must not quietly regain canonical status after 2.7E. This is
     the contract, recorded now; it cannot fail until the cutover happens. */
  check('M6: app_state is NO LONGER canonical for jobs',
    !/readJsonFileStrict<HiringJobPosting/.test(HIRING)
    && !/writeJsonFile\(hiringJobsPath/.test(HIRING));
}

/* ═══ 9b. THE REAL upsertHiringJobs ════════════════════════════════════════
   Structural assertions against the shipped implementation. It reaches a
   database, so behaviour is exercised by the contract model above; these prove
   the real function has the shape the contract requires. */
{
  const fn = COLLECTION.slice(COLLECTION.indexOf('export async function upsertHiringJobs'));
  const body = fn.slice(0, fn.indexOf('\n}\n') + 2);

  check('R1: it writes with an _id filter and upsert',
    /filter: \{ _id: id \}, update, upsert: true/.test(body));
  check('R2: it NEVER deletes — no deleteMany, deleteOne or $nin',
    !/deleteMany|deleteOne|\$nin/.test(body));
  check('R3: it never reads or writes app_state',
    !/app_state|hiringJobsPath|writeJsonFile|readJsonFile|getHiringJobs/.test(body));
  check('R4: an empty batch returns early and writes nothing',
    /if \(inputs\.length === 0\) return empty/.test(body));
  check('R5: a job without an id is refused, not skipped',
    /a job without an id cannot be written/.test(body));
  check('R6: unchanged fingerprints issue NO write',
    /if \(priors\.get\(id\) === fp\) \{ unchanged \+= 1; return; \}/.test(body));
  check('R7: the fingerprint it compared against is stamped',
    /\[FP_FIELD\]: fp/.test(body));
  /* R8 originally pinned `$in: ids`, the whole input array. The batch is now
     CHUNKED, so the $in is bounded twice over — by the caller's batch and by
     the chunk size. The assertion is tightened to the stronger property rather
     than relaxed to match the rename. */
  check('R8: prior fingerprints are read with a bounded $in, not a full scan',
    /_id: \{ \$in: sliceIds as never\[\] \}/.test(body));
  check('R8a: the batch is split into bounded chunks, never one huge command',
    /for \(let start = 0; start < inputs\.length; start \+= chunk\)/.test(body)
    && /bulkBatchSize\(\)/.test(body));
  /* The cap lives at module scope, not inside the function body. */
  check('R8b: the chunk size is capped, so a bad env value cannot unbound it',
    /Math\.min\(BULK_BATCH_MAX, Math\.floor\(raw\)\)/.test(COLLECTION)
    && /raw < 1\) return BULK_BATCH_DEFAULT/.test(COLLECTION));
  check('R8c: a partially-failed bulk still reports ok:false',
    /ok: false,\s*\n\s*written: written \+ done/.test(body));
  check('R8d: a partial failure reports what was actually written, not zero',
    /written: written \+ done/.test(body) && /nUpserted/.test(body) && /nModified/.test(body));
  check('R8e: a partial failure still marks the collection stale',
    /markHiringJobsCollectionStale\(`upsert partially failed/.test(body));
  check('R9: the bulk write is unordered, so one bad document spares the rest',
    /ordered: false/.test(body));
  check('R10: a failure is reported, never returned as empty success',
    /ok: false/.test(body) && /markHiringJobsCollectionStale/.test(body));
  check('R11: failure does not claim documents were written',
    /ok: false, written: 0/.test(body));
  check('R12: order is stamped only when the caller supplies one',
    /if \(typeof input\.order === 'number'\) set\[ORDER_FIELD\]/.test(body));
  /* R13 was written in 2.7B asserting an "append at the end" default. Phase
     2.7C proved that default WRONG — planIngest prepends, so appending puts a
     new job at the opposite end of the board. The writer now refuses instead
     of guessing, and this check follows the corrected behaviour. */
  check('R13: a new document without a caller position is REFUSED, not defaulted',
    /is new and no order was supplied/.test(body));
  check('R13b: no invented ordering default survives',
    !/MAX_SAFE_INTEGER/.test(body));
  check('R14: it is exported for 2.7D to call', typeof upsertHiringJobs === 'function');
  check('R15: no lock, no Redis — atomic per-document upserts only',
    !/lock|redis|Redis/.test(body));
}

/* ═══ 10. Rollback contract ════════════════════════════════════════════════ */
{
  /* Until 2.7E, app_state holds the full corpus, so rollback is a flag. After
     2.7E it is not, and re-materialisation must exist BEFORE that ships. */
  /* 2.6+2.7E changed this contract, exactly as 2.7D predicted it would: with
     the app_state job write removed, rollback is no longer a flag flip and
     REQUIRES re-materialisation from hiring_jobs. Asserted so the change is
     recorded rather than discovered during an incident. */
  check('rollback now REQUIRES re-materialisation — app_state no longer holds the corpus',
    !/writeJsonFile\(hiringJobsPath, jobs\)/.test(HIRING));
  check('the mirror can reproduce a full corpus, so re-materialisation is possible',
    /deleteMany\(\{ _id: \{ \$nin: ids as never\[\] \} \}\)/.test(COLLECTION));
  /* NOT TESTABLE UNTIL 2.7B: that canonical persistence survives app_state
     being unavailable. Proving it requires a writer that does not write
     app_state, which 2.7A is forbidden from creating. */
}

console.log(`\n${passed} checks passed, ${failed} failed.`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
console.log('ALL CHECKS PASSED');
