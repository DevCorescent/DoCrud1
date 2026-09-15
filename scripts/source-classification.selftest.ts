/**
 * Phase 6A-fix — verified, enabled, and the difference between them.
 *
 *   npx tsx scripts/source-classification.selftest.ts
 *
 * ═══ WHAT WAS ACTUALLY WRONG ═══
 *
 * The console showed "Approved sources: 2" while 87 boards had been verified,
 * and that looked like a bug. It was not: the number counted boards present in
 * the ENVIRONMENT, which is exactly the set a run will fetch, and that set is
 * genuinely 2. The 87 live in `data/job-sources/verified-boards.txt`, which
 * nothing at runtime read.
 *
 * So the defect was the WORD, not the number. "Approved" reads as an approval
 * registry — as though two boards were all that existed — when it meant
 * "switched on in this environment". A correct number under a misleading label
 * is still a screen that misinforms.
 *
 * These assertions keep the two concepts apart, and keep "cannot read the
 * inventory" distinguishable from "nothing verified".
 */
import assert from 'node:assert/strict';
import { readFileSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const INVENTORY = 'data/job-sources/verified-boards.txt';

async function classification() {
  console.log('\n── 1. Verified and enabled are counted separately ──');
  const inv = await import('@/lib/server/job-sources/verified-inventory');
  inv.resetVerifiedInventoryCache();

  const boards = inv.getVerifiedInventory();
  assert.ok(boards, 'inventory should be readable in the repository');
  check('the inventory parses', boards!.length > 0, `${boards!.length} boards`);

  /* The inventory is the source of truth for the count. Hardcoding 87 into the
     test would mean the test stops tracking the file the moment a board is
     added or removed. */
  const expected = read(INVENTORY).split('\n')
    .map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean).length;
  check('the parsed count matches the file, not a constant',
    boards!.length === expected, `${boards!.length} vs ${expected}`);

  /* Two enabled out of the whole inventory: 2 enabled, the rest not. */
  const someEnabled = [boards![0].sourceId, boards![1].sourceId];
  const summary = inv.summariseInventory(someEnabled);
  check('verified counts every board in the inventory',
    summary.verified === boards!.length);
  check('not-enabled is verified minus enabled',
    summary.verifiedNotEnabled === boards!.length - 2,
    `${summary.verifiedNotEnabled}`);

  /* An enabled board that is NOT in the inventory must not inflate the
     verified total — enabling something is not the same as verifying it. */
  const withUnknown = inv.summariseInventory([...someEnabled, 'greenhouse:neverprobed']);
  check('enabling an unverified board does not raise the verified count',
    withUnknown.verified === boards!.length);
  check('and it is not reported as verified',
    inv.isVerifiedBoard('greenhouse:neverprobed') === false);
  check('a board in the inventory is reported as verified',
    inv.isVerifiedBoard(boards![0].sourceId) === true);
}

async function unreadableIsNotZero() {
  console.log('\n── 2. An unreadable inventory reports unknown, never zero ──');
  const inv = await import('@/lib/server/job-sources/verified-inventory');
  const real = path.join(ROOT, INVENTORY);
  const parked = `${real}.selftest-bak`;

  /* A deployment that omits the file is a real possibility. Reporting
     "0 verified" there would be a confident claim built on a missing file —
     the same mistake as rendering a failed read as TOTAL 0. */
  renameSync(real, parked);
  try {
    inv.resetVerifiedInventoryCache();
    const summary = inv.summariseInventory(['greenhouse:stripe']);
    check('verified is null, not 0', summary.verified === null);
    check('not-enabled is null, not 0', summary.verifiedNotEnabled === null);
    check('getVerifiedInventory returns null', inv.getVerifiedInventory() === null);
    check('isVerifiedBoard does not throw and claims nothing',
      inv.isVerifiedBoard('greenhouse:stripe') === false);
  } finally {
    renameSync(parked, real);
    inv.resetVerifiedInventoryCache();
  }
  check('the inventory file was restored', existsSync(real));
}

function statusContract() {
  console.log('\n── 3. The status API keeps the two numbers distinct ──');
  const src = read('lib/server/scraper-client.ts');

  check('enabled still comes from the environment-driven registry',
    src.includes('sourceNames: enabled.map((s) => s.name)'));
  check('verified comes from the inventory', src.includes('summariseInventory'));
  check('each source row carries its own verified flag',
    src.includes('verified: isVerifiedBoard(s.name)'));

  /* If the two were counted from different lists, the screen could claim a
     board is enabled that a run would never fetch. */
  check('both counts derive from the same registry list',
    /summariseInventory\(all\.map\(\(s\) => s\.name\)\)/.test(src));
}

function labelIsHonest() {
  console.log('\n── 4. The console says which number it is showing ──');
  const ui = read('components/superadmin/JobsTab.tsx');

  check('the tile is labelled "Enabled sources"', ui.includes('Enabled sources'));
  check('"Approved sources" is gone', !ui.includes('>Approved sources<'));
  check('the count is still the enabled set, not the inventory',
    ui.includes('scraper.sources.filter((s) => s.enabled).length'));
  check('the verified total is shown alongside', ui.includes('verifiedCount'));
  check('an unreadable inventory renders nothing rather than a zero',
    ui.includes('scraper.verifiedCount !== null &&'));
  check('boards that are verified but off are called out',
    ui.includes('not enabled'));
  check('the empty state no longer says "approved"',
    !ui.includes('No approved sources'));
}

function nothingEnabled() {
  console.log('\n── 5. This change enabled nothing ──');
  const example = read('.env.example');
  /* Reading the inventory must not become a way to configure from it. */
  check('the inventory is not written into .env.example',
    !example.includes('cockroachlabs') && !example.includes('clickhouse'));
  const invSrc = read('lib/server/job-sources/verified-inventory.ts');
  check('the inventory module never mutates the environment',
    !/process\.env\[[^\]]+\]\s*=/.test(invSrc));
  check('it never triggers a fetch or a run',
    !/fetch\(|runCanonicalIngestion|acquireScraperLease/.test(invSrc));
  /* Counts CALLS, not the import binding — `import { readFileSync }` is not a
     filesystem read. */
  check('it only reads the one inventory file',
    (invSrc.match(/readFileSync\(/g) || []).length === 1);
}

async function main() {
  await classification();
  await unreadableIsNotZero();
  statusContract();
  labelIsHonest();
  nothingEnabled();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

main().catch((error) => {
  /* Never leave the repository without its inventory if an assertion threw
     between the rename and the restore. */
  const real = path.join(ROOT, INVENTORY);
  const parked = `${real}.selftest-bak`;
  if (!existsSync(real) && existsSync(parked)) renameSync(parked, real);
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
});
