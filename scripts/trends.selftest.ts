/**
 * Trends self-test — the vote and history semantics the board depends on.
 *
 * Runs the REAL store (lib/server/trends.ts) against a temporary file, so this
 * verifies the shipped code rather than a copy of its rules. Deliberately
 * covers the invariants that an optimization pass could quietly break:
 * dedupe, withdraw-on-repeat, direction switching, daily close, and the
 * "no invented movement" rule for a brand-new trend.
 */
import { promises as fs } from 'fs';
import path from 'path';

// Force the file-backed branch of the storage layer: no cluster, no network.
process.env.MONGODB_URI = '';

import { createTrend, getTrend, listTrends, setTrendStatus, voteTrend } from '@/lib/server/trends';

let checks = 0;
let failures = 0;

function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const file = path.join(process.cwd(), 'data', 'trends.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ trends: [], votes: {} }));

  /* ── create ── */
  const created = await createTrend({
    title: 'AI hiring in fintech', category: 'Careers',
    description: 'Roles shifting fast', userId: 'u1', userName: 'Author',
  });
  check('a trend can be created', created.ok);
  if (!created.ok) throw new Error(created.error);
  const id = created.trend.id;

  check('the author’s own vote is the opening score, not a free head start',
    created.trend.score === 1 && created.trend.up === 1 && created.trend.myVote === 1);
  check('a new trend has exactly one daily close', created.trend.history.length === 1);
  check('a new trend reports no movement it cannot prove',
    created.trend.change === 0 && created.trend.changePercent === null);

  const short = await createTrend({ title: 'ab', userId: 'u1', userName: 'A' });
  check('a too-short title is rejected', !short.ok && short.status === 400);

  const dup = await createTrend({ title: '  ai HIRING in Fintech ', userId: 'u2', userName: 'B' });
  check('a duplicate trend is rejected regardless of case/spacing', !dup.ok && dup.status === 409);

  /* ── rate limit ── */
  for (let i = 0; i < 4; i += 1) {
    await createTrend({ title: `Filler trend ${i}`, userId: 'u1', userName: 'Author' });
  }
  const limited = await createTrend({ title: 'One too many', userId: 'u1', userName: 'Author' });
  check('a member cannot exceed the daily add limit', !limited.ok && limited.status === 429);
  const other = await createTrend({ title: 'Different member is fine', userId: 'u9', userName: 'C' });
  check('the limit is per member, not global', other.ok);

  /* ── voting ── */
  let r = await voteTrend(id, 'u2', 1);
  check('an up vote raises the score', r.ok && r.trend.score === 2 && r.trend.voterCount === 2);

  r = await voteTrend(id, 'u2', 1);
  check('voting the same way again withdraws it', r.ok && r.trend.score === 1 && r.trend.voterCount === 1);
  check('a withdrawn vote is not left in the ledger', r.ok && r.trend.myVote === 0);

  r = await voteTrend(id, 'u2', -1);
  check('switching direction moves the vote rather than adding one',
    r.ok && r.trend.up === 1 && r.trend.down === 1 && r.trend.score === 0);

  r = await voteTrend(id, 'u3', -1);
  check('a second down vote takes the score negative', r.ok && r.trend.score === -1);

  let repeats = null;
  for (let i = 0; i < 5; i += 1) repeats = await voteTrend(id, 'u4', 1);
  check('five identical clicks cannot inflate the total',
    repeats !== null && repeats.ok && repeats.trend.up === 2);

  const missing = await voteTrend('does-not-exist', 'u2', 1);
  check('voting on an unknown trend is a 404', !missing.ok && missing.status === 404);

  /* ── history ── */
  const detail = await getTrend(id, 'u3');
  check('all of today’s voting collapses into ONE daily close',
    detail !== null && detail.history.length === 1);
  check('the last close carries the live score',
    detail !== null && detail.history[detail.history.length - 1].score === detail.score);
  check('the viewer sees their own position', detail !== null && detail.myVote === -1);
  check('a trend is reachable by slug too', (await getTrend('ai-hiring-in-fintech', null)) !== null);

  /* ── listing + moderation ── */
  const list = await listTrends('u3');
  check('the board is ranked by score, highest first',
    list.every((t, i) => i === 0 || list[i - 1].score >= t.score));
  check('the board carries the viewer’s own votes',
    (list.find((t) => t.id === id)?.myVote ?? 0) === -1);

  await setTrendStatus(id, 'hidden');
  check('a hidden trend leaves the board', !(await listTrends('u3')).some((t) => t.id === id));
  check('a hidden trend is not readable directly', (await getTrend(id, null)) === null);
  check('a hidden trend cannot be voted on', !(await voteTrend(id, 'u5', 1)).ok);
  await setTrendStatus(id, 'active');
  check('moderation is reversible and history survives it',
    (await getTrend(id, null))?.history.length === 1);

  await fs.unlink(file).catch(() => {});

  console.log(`\n${checks - failures}/${checks} checks passed.`);
  if (failures > 0) { console.log('SELF-TEST FAILED'); process.exit(1); }
  console.log('SELF-TEST OK');
}

main().catch((error) => { console.error(error); process.exit(1); });
