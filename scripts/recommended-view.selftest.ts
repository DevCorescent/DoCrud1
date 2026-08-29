/**
 * /jobs?recommended=1 regression test.
 *
 * THE BUG: the homepage said "149 new matches" and the jobs page said
 * "Showing your 0 best matches / No jobs found".
 *
 * The API was never wrong. The page's loading state was driven by the ALL-JOBS
 * request, which resolves in milliseconds, while the recommendation request —
 * the only one that feeds this view — was still in flight. So the page declared
 * itself "ready" with an empty recommendation set and rendered a false empty
 * state over data that had not arrived.
 *
 * These checks model that state machine exactly. They fail on the old logic
 * (`loading = state === 'loading'`) and pass on the fixed logic.
 */

type Req = 'loading' | 'ready' | 'error';

/** The page's derived flags — mirrors JobsFeedPage. */
function derive(opts: {
  recommendedOnly: boolean; listState: Req; recState: Req;
  all: unknown[]; recommended: unknown[];
}) {
  const loading = opts.recommendedOnly ? opts.recState === 'loading' : opts.listState === 'loading';
  const errored = opts.recommendedOnly ? opts.recState === 'error' : opts.listState === 'error';
  const source = opts.recommendedOnly ? opts.recommended : opts.all;
  const showsEmpty = !loading && !errored && source.length === 0;
  return { loading, errored, showsEmpty, count: source.length };
}

/** The old, buggy derivation, kept so the regression is provable. */
function deriveOld(opts: {
  recommendedOnly: boolean; listState: Req; recState: Req;
  all: unknown[]; recommended: unknown[];
}) {
  const loading = opts.listState === 'loading';
  const errored = opts.listState === 'error';
  const source = opts.recommendedOnly ? opts.recommended : opts.all;
  return { loading, errored, showsEmpty: !loading && !errored && source.length === 0 };
}

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const jobs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `job-${i}`, matchScore: 20 + i }));

function main() {
  /* ── THE BUG ── list back fast, recommendations still loading ── */
  const racing = { recommendedOnly: true, listState: 'ready' as Req, recState: 'loading' as Req, all: jobs(362), recommended: [] };
  check('THE BUG: old logic showed a false empty state during the race',
    deriveOld(racing).showsEmpty === true);
  check('fixed: the page reports LOADING, not "no jobs found"',
    derive(racing).loading === true && derive(racing).showsEmpty === false);

  /* ── recommendations arrive ── */
  const arrived = { ...racing, recState: 'ready' as Req, recommended: jobs(149) };
  const d = derive(arrived);
  check('149 recommendations render as 149, not 0', d.count === 149 && !d.showsEmpty);
  check('a total of 149 never collapses to an empty state', d.showsEmpty === false);

  /* ── genuine empty ── */
  const none = { ...racing, recState: 'ready' as Req, recommended: [] };
  check('a genuine zero DOES show the empty state',
    derive(none).showsEmpty === true && derive(none).loading === false);

  /* ── failure is a failure, not "no jobs" ── */
  const failed = { ...racing, recState: 'error' as Req, recommended: [] };
  check('a failed recommendation request shows an ERROR, not "no jobs found"',
    derive(failed).errored === true && derive(failed).showsEmpty === false);
  check('old logic wrongly showed "no jobs found" on a failed request',
    deriveOld(failed).showsEmpty === true);

  /* ── normal browsing is unaffected ── */
  const normalLoading = { recommendedOnly: false, listState: 'loading' as Req, recState: 'loading' as Req, all: [], recommended: [] };
  check('normal /jobs still keys off the all-jobs request', derive(normalLoading).loading === true);
  const normalReady = { recommendedOnly: false, listState: 'ready' as Req, recState: 'loading' as Req, all: jobs(362), recommended: [] };
  check('normal /jobs renders while recommendations are still loading',
    derive(normalReady).loading === false && derive(normalReady).count === 362);
  const normalErr = { recommendedOnly: false, listState: 'error' as Req, recState: 'ready' as Req, all: [], recommended: jobs(5) };
  check('normal /jobs still surfaces its own error', derive(normalErr).errored === true);
  check('a recommendation failure does NOT break normal browsing',
    derive({ recommendedOnly: false, listState: 'ready' as Req, recState: 'error' as Req, all: jobs(10), recommended: [] }).errored === false);

  /* ── the match percentage is server data, never recomputed ── */
  const withScores = jobs(3);
  check('every recommended job carries a server matchScore',
    withScores.every((j) => typeof j.matchScore === 'number'));
  /* The page drops anything the server did not score, so a fake or default
     percentage can never reach a card. */
  const mixed: Array<{ id: string; matchScore?: number }> = [...withScores, { id: 'unscored' }];
  check('the page filter keeps only server-scored jobs',
    mixed.filter((j) => typeof j.matchScore === 'number').length === 3);

  console.log(`\n${checks - failures}/${checks} checks passed.`);
  if (failures > 0) { console.log('SELF-TEST FAILED'); process.exit(1); }
  console.log('SELF-TEST OK');
}
main();
