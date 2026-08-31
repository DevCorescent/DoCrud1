/**
 * Outbox persistence self-test.
 *
 * The outbox is the audit trail: if a send happened and the outbox does not
 * record it, the record is worthless. The bug these tests exist to prevent was
 * real and was observed in a live run — a campaign correctly recorded
 * `failed: 2` while the outbox contained a single row, because four concurrent
 * appends each read the same array and the last write won.
 *
 * So the central test is not "does append work" but "do N concurrent appends
 * all survive". A single-append test would have passed against the broken code.
 *
 * These run against the real local-file storage path with the database
 * disabled, because that is the path that had the defect.
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import path from 'path';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const OUTBOX_SRC = read('lib/server/email-outbox.ts');
const STORAGE_SRC = read('lib/server/storage.ts');

const OUTBOX_FILE = path.join(process.cwd(), 'data', 'email-outbox.json');
let backup: string | null = null;

type OutboxStatus = 'queued' | 'sent' | 'failed' | 'tested';
interface StoredEvent { id: string; status: OutboxStatus; to: string; metadata?: Record<string, string> }

function readEvents(): StoredEvent[] {
  if (!existsSync(OUTBOX_FILE)) return [];
  try {
    const parsed = JSON.parse(readFileSync(OUTBOX_FILE, 'utf8')) as { events?: StoredEvent[] };
    return Array.isArray(parsed.events) ? parsed.events : [];
  } catch { return []; }
}

function resetOutbox() {
  mkdirSync(path.dirname(OUTBOX_FILE), { recursive: true });
  writeFileSync(OUTBOX_FILE, JSON.stringify({ events: [] }));
}

async function main() {
  /* The defect is in the local-file path; force it. */
  delete process.env.MONGODB_URI;
  if (existsSync(OUTBOX_FILE)) backup = readFileSync(OUTBOX_FILE, 'utf8');

  const {
    appendEmailOutboxEvent, updateEmailOutboxEvent, getEmailOutbox, createOutboundEmailId,
  } = await import('@/lib/server/email-outbox');

  const event = (id: string, over: Partial<StoredEvent> = {}) => ({
    id,
    createdAt: new Date().toISOString(),
    status: 'queued' as OutboxStatus,
    type: 'system' as const,
    to: `${id}@example.com`,
    subject: `Subject ${id}`,
    sentBy: 'test',
    tracking: { opens: 0, clicks: 0 },
    ...over,
  });

  console.log('\n── 1. The fix is actually in the code ──');

  check('local-file mutations are serialised', OUTBOX_SRC.includes('function withOutboxLock'));
  check('append runs inside the lock', OUTBOX_SRC.includes('return withOutboxLock(async () => {'));
  check('update shares the same lock',
    (OUTBOX_SRC.match(/withOutboxLock\(async \(\) => \{/g) ?? []).length === 2);
  /* A rejected operation must not wedge every later append. */
  check('a failed operation still releases the lock',
    STORAGE_SRC.includes('previous.then(operation, operation)'));
  check('the lock is the shared per-path helper, not an outbox-only copy',
    OUTBOX_SRC.includes('withStorageLock(OUTBOX_LOCK, operation)')
    && STORAGE_SRC.includes('export function withStorageLock'));
  /* The campaign document has the same read-modify-write shape and the same
     hazard; its claim must be a real critical section, not a timing accident. */
  const CAMPAIGNS_SRC = read('lib/server/mail-campaigns.ts');
  check('campaign writes are serialised on the same mechanism',
    CAMPAIGNS_SRC.includes("withStorageLock(CAMPAIGN_LOCK"));
  check('the claim reads and writes inside one critical section',
    CAMPAIGNS_SRC.includes('return withStorageLock(CAMPAIGN_LOCK, async () => {')
    && CAMPAIGNS_SRC.indexOf('const campaign = await getMailCampaignById(id);')
       > CAMPAIGNS_SRC.indexOf('return withStorageLock(CAMPAIGN_LOCK, async () => {'));
  check('the cross-instance token verify is retained',
    CAMPAIGNS_SRC.includes('confirmed.claimToken !== token'));
  check('the Mongo path is untouched by the lock',
    OUTBOX_SRC.includes('await upsertEmailOutboxRow(event)')
    && OUTBOX_SRC.indexOf('upsertEmailOutboxRow(event)') < OUTBOX_SRC.indexOf('withOutboxLock(async'));
  /* The fix must not be "make sending serial". */
  check('the send loop is still concurrent',
    read('lib/server/mail-campaigns.ts').includes('runLimited(unique, 4,'));
  check('file writes are atomic',
    STORAGE_SRC.includes('.tmp') && STORAGE_SRC.includes('fs.rename(tmpPath, filePath)'));
  check('a failed atomic write cleans up its temp file',
    STORAGE_SRC.includes('fs.unlink(tmpPath)'));

  console.log('\n── 2. Single append ──');

  resetOutbox();
  await appendEmailOutboxEvent(event('eml-single'));
  check('one append persists one event', readEvents().length === 1);
  check('the event is readable back',
    (await getEmailOutbox(10)).some((e) => e.id === 'eml-single'));

  console.log('\n── 3. Concurrent appends — the actual bug ──');

  resetOutbox();
  await Promise.all([
    appendEmailOutboxEvent(event('eml-a')),
    appendEmailOutboxEvent(event('eml-b')),
  ]);
  let stored = readEvents();
  check('two concurrent appends both persist', stored.length === 2, `${stored.length} stored`);

  resetOutbox();
  await Promise.all(
    Array.from({ length: 10 }, (_, i) => appendEmailOutboxEvent(event(`eml-c${i}`))),
  );
  stored = readEvents();
  check('ten concurrent appends all persist', stored.length === 10, `${stored.length} stored`);
  check('every id survives',
    Array.from({ length: 10 }, (_, i) => `eml-c${i}`).every((id) => stored.some((e) => e.id === id)));
  check('no duplicates are created',
    new Set(stored.map((e) => e.id)).size === stored.length);

  console.log('\n── 4. Mixed concurrent traffic ──');

  resetOutbox();
  await Promise.all([
    appendEmailOutboxEvent(event('eml-ok-1', { status: 'sent' })),
    appendEmailOutboxEvent(event('eml-bad-1', { status: 'failed' })),
    appendEmailOutboxEvent(event('eml-ok-2', { status: 'sent' })),
    appendEmailOutboxEvent(event('eml-bad-2', { status: 'failed' })),
  ]);
  stored = readEvents();
  check('concurrent success and failure events all persist', stored.length === 4, `${stored.length}`);
  check('statuses are preserved',
    stored.filter((e) => e.status === 'sent').length === 2
    && stored.filter((e) => e.status === 'failed').length === 2);

  resetOutbox();
  await Promise.all([
    appendEmailOutboxEvent(event('eml-x1', { metadata: { campaignId: 'cmp-1' } })),
    appendEmailOutboxEvent(event('eml-x2', { metadata: { campaignId: 'cmp-2' } })),
    appendEmailOutboxEvent(event('eml-x3', { metadata: { campaignId: 'cmp-1' } })),
  ]);
  stored = readEvents();
  check('events from different campaigns all persist', stored.length === 3);
  check('campaign attribution survives',
    stored.filter((e) => e.metadata?.campaignId === 'cmp-1').length === 2);

  console.log('\n── 5. Concurrent appends and updates together ──');

  /* An update racing an append dropped whichever wrote first. Tracking pixels
     fire concurrently, so this is not a theoretical case. */
  resetOutbox();
  await appendEmailOutboxEvent(event('eml-u1'));
  await Promise.all([
    updateEmailOutboxEvent('eml-u1', (ev) => ({ ...ev, status: 'sent' })),
    appendEmailOutboxEvent(event('eml-u2')),
    appendEmailOutboxEvent(event('eml-u3')),
  ]);
  stored = readEvents();
  check('an update racing appends loses nothing', stored.length === 3, `${stored.length}`);
  check('the update was applied',
    stored.find((e) => e.id === 'eml-u1')?.status === 'sent');

  resetOutbox();
  await appendEmailOutboxEvent(event('eml-t1'));
  await Promise.all(
    Array.from({ length: 5 }, () =>
      updateEmailOutboxEvent('eml-t1', (ev) => ({
        ...ev,
        tracking: { ...ev.tracking, opens: (ev.tracking?.opens ?? 0) + 1 },
      }))),
  );
  const tracked = (await getEmailOutbox(10)).find((e) => e.id === 'eml-t1');
  /* Five concurrent increments must produce five, not one. */
  check('concurrent tracking increments are not lost',
    tracked?.tracking.opens === 5, String(tracked?.tracking.opens));

  console.log('\n── 6. Idempotency and corruption ──');

  resetOutbox();
  await appendEmailOutboxEvent(event('eml-dup'));
  await appendEmailOutboxEvent(event('eml-dup', { status: 'sent' }));
  stored = readEvents();
  check('re-appending the same id does not duplicate it', stored.length === 1);
  check('the later write wins', stored[0].status === 'sent');

  /* Corrupt storage must not throw; the read falls back and the append still
     records. Losing history is bad, but crashing the send path is worse. */
  writeFileSync(OUTBOX_FILE, '{ this is not valid json');
  let threw = false;
  try { await appendEmailOutboxEvent(event('eml-after-corrupt')); }
  catch { threw = true; }
  check('a corrupt outbox file does not throw', !threw);
  check('appending still works after corruption',
    readEvents().some((e) => e.id === 'eml-after-corrupt'));

  check('ids are unique per call',
    createOutboundEmailId('x') !== createOutboundEmailId('x'));

  console.log('\n── 7. Nothing else changed ──');

  check('the event schema is unchanged',
    OUTBOX_SRC.includes("export type OutboundEmailStatus = 'queued' | 'sent' | 'failed' | 'tested'")
    && OUTBOX_SRC.includes('tracking: {'));
  check('the outbox cap is unchanged', OUTBOX_SRC.includes('.slice(0, 2000)'));
  check('tracking helpers still exist',
    OUTBOX_SRC.includes('export function buildTrackingPixel')
    && OUTBOX_SRC.includes('export function rewriteLinksForTracking'));
  check('campaign accounting was not altered as a workaround',
    read('lib/server/mail-campaigns.ts').includes('sent += 1')
    && read('lib/server/mail-campaigns.ts').includes('classifyMailError(err)'));

  restore();
  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

function restore() {
  if (backup !== null) writeFileSync(OUTBOX_FILE, backup);
  else if (existsSync(OUTBOX_FILE)) unlinkSync(OUTBOX_FILE);
}

main().catch((err) => { restore(); console.error(err); process.exit(1); });
