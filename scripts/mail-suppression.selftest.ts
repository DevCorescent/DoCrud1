/**
 * Suppression and unsubscribe self-test (Phase 13).
 *
 * One rule dominates: once someone unsubscribes, no campaign reaches them
 * again - including a campaign already in flight, and including a retry that
 * was pending before they opted out. The send-time check is exercised against
 * the REAL campaign send loop with the transport intercepted, because that is
 * the only way to know the check is actually on the path a send takes.
 *
 * The second rule is narrower and just as important: a suppression must never
 * block a verification code. Opting out of newsletters is not a request to be
 * locked out of your own account.
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import {
  normalizeEmail, addSuppression, removeSuppression, getSuppression,
  getSuppressionRecords, filterSuppressed, isSuppressed,
  createUnsubscribeToken, readUnsubscribeToken,
} from '@/lib/server/mail-suppression';
import { sendMailCampaign, upsertMailCampaign, getMailCampaignById } from '@/lib/server/mail-campaigns';
import { resolveRecipients } from '@/lib/server/mail-recipients';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const LIB = read('lib/server/mail-suppression.ts');
const CAMPAIGNS = read('lib/server/mail-campaigns.ts');
const API = read('app/api/super-admin/mail/suppression/route.ts');
const UNSUB_API = read('app/api/mail/unsubscribe/route.ts');
const PAGE = read('app/unsubscribe/page.tsx');
const UI = read('components/superadmin/mail/MailSuppression.tsx');
const RECIPIENTS = read('lib/server/mail-recipients.ts');
const MAILER = read('lib/server/mailer.ts');

/* Comments stripped: these files legitimately DISCUSS the words they forbid,
   and matching a file's own documentation says nothing about what it does. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const LIB_CODE = stripComments(LIB);

const SUP_FILE = path.join(process.cwd(), 'data', 'mail-suppression.json');
const CAMP_FILE = path.join(process.cwd(), 'data', 'mail-campaigns.json');
let supBackup: string | null = null;
let campBackup: string | null = null;

/** A transport stand-in that records who would have been mailed. */
function recordingSender() {
  const sentTo: string[] = [];
  const sender = async (input: { to: string }) => {
    sentTo.push(input.to);
    return { skipped: false, messageId: `m-${sentTo.length}`, outboxId: `o-${sentTo.length}` };
  };
  return { sentTo, sender: sender as never };
}

async function main() {
  delete process.env.MONGODB_URI;
  if (existsSync(SUP_FILE)) supBackup = readFileSync(SUP_FILE, 'utf8');
  if (existsSync(CAMP_FILE)) campBackup = readFileSync(CAMP_FILE, 'utf8');
  writeFileSync(SUP_FILE, JSON.stringify({ records: [] }));

  console.log('\n── 1. Normalization ──');

  check('an address is trimmed and lower-cased',
    normalizeEmail('  Alice@Example.COM  ') === 'alice@example.com');
  check('null-ish input normalizes to empty',
    normalizeEmail(null) === '' && normalizeEmail(undefined) === '');

  await addSuppression({
    email: '  Alice@Example.COM ', reason: 'admin_suppressed', actor: 'admin', source: 'admin',
  });
  check('the stored form is normalized',
    (await getSuppressionRecords())[0].email === 'alice@example.com');
  /* The failure this prevents: an unsubscribe from one casing not protecting
     the same inbox written another way. */
  check('a differently-cased address matches the same record',
    (await getSuppression('ALICE@example.com'))?.email === 'alice@example.com');
  check('a suppressed address reads as suppressed',
    await isSuppressed('Alice@Example.com'));

  console.log('\n── 2. Duplicates ──');

  await addSuppression({
    email: 'alice@example.com', reason: 'admin_suppressed', actor: 'admin2', source: 'admin',
  });
  await addSuppression({
    email: 'ALICE@EXAMPLE.COM', reason: 'admin_suppressed', actor: 'admin3', source: 'admin',
  });
  check('re-suppressing does not create duplicate records',
    (await getSuppressionRecords()).filter((r) => r.email === 'alice@example.com').length === 1);

  console.log('\n── 3. Unsubscribe wins over admin suppression ──');

  await addSuppression({
    email: 'alice@example.com', reason: 'unsubscribe', actor: 'recipient',
    source: 'unsubscribe_link',
  });
  check('an unsubscribe upgrades an existing admin suppression',
    (await getSuppression('alice@example.com'))?.reason === 'unsubscribe');
  await addSuppression({
    email: 'alice@example.com', reason: 'admin_suppressed', actor: 'admin', source: 'admin',
  });
  /* The override this refuses: an administrative action quietly replacing a
     person's own stated choice. */
  check('an admin suppression cannot downgrade an unsubscribe',
    (await getSuppression('alice@example.com'))?.reason === 'unsubscribe');

  const protectedRemoval = await removeSuppression('alice@example.com', 'admin');
  check('an unsubscribe cannot be lifted by an admin',
    !protectedRemoval.ok && protectedRemoval.reason === 'unsubscribe_protected');
  check('it is still active after the refused removal',
    await isSuppressed('alice@example.com'));
  check('the refusal lives in the store, not only in the UI',
    LIB.includes("return { ok: false, reason: 'unsubscribe_protected' } as const;"));
  check('the API reports the refusal rather than a false success',
    API.includes('status: 409') && API.includes('cannot re-enable'));
  /* The condition moved to the SERVER, which decides removability from the
     same rule the store enforces - so the UI can no longer offer a button the
     store would refuse, nor hide one it would allow. Stronger than the
     hardcoded reason check this replaces. */
  check('the UI offers no button that would always fail',
    UI.includes('{row.removable ? (')
    && read('app/api/super-admin/mail/suppression/route.ts')
      .includes('removable: r.active && !isProtectedReason(r.reason)'));

  console.log('\n── 4. Admin suppression can be lifted ──');

  await addSuppression({
    email: 'bob@example.com', reason: 'admin_suppressed', actor: 'admin', source: 'admin',
  });
  check('an admin suppression is active', await isSuppressed('bob@example.com'));
  const removed = await removeSuppression('BOB@example.com', 'admin');
  check('an admin suppression can be removed', removed.ok);
  check('it is no longer active', !(await isSuppressed('bob@example.com')));
  check('the record is deactivated, not deleted',
    (await getSuppression('bob@example.com'))?.active === false);
  check('removing a non-existent suppression is reported, not silently ok',
    !(await removeSuppression('nobody@example.com', 'admin')).ok);

  console.log('\n── 5. Tokens ──');

  const token = createUnsubscribeToken(' Carol@Example.com ');
  check('a token round-trips to the normalized address',
    readUnsubscribeToken(token) === 'carol@example.com');
  /* The URL must not carry readable PII: a signed token still puts the address
     in every server log and browser history it passes through. */
  check('the address is not readable in the token',
    !token.includes('@') && !token.toLowerCase().includes('carol'));
  check('the encoded body is not merely base64 of the address',
    !Buffer.from(token.split('.')[1], 'base64url').toString('utf8').includes('carol'));
  check('two tokens for one address differ',
    createUnsubscribeToken('c@x.com') !== createUnsubscribeToken('c@x.com'));
  check('a tampered token is rejected',
    readUnsubscribeToken(`${token.slice(0, -2)}zz`) === null);
  check('a token from another version is rejected',
    readUnsubscribeToken(`u1.${token.split('.')[1]}`) === null);
  check('garbage is rejected',
    readUnsubscribeToken('nope') === null && readUnsubscribeToken('') === null
    && readUnsubscribeToken(null) === null);
  check('every rejection looks the same to the caller',
    UNSUB_API.includes("'This unsubscribe link is not valid.'")
    && (UNSUB_API.match(/This unsubscribe link is not valid/g) ?? []).length === 1);
  check('the token carries no credential',
    !/\b(password|sessionToken|otpCode|smtp)\b/i.test(LIB_CODE)
    /* And nothing but the address is ever encrypted into it. */
    && LIB_CODE.includes("cipher.update(normalizeEmail(email), 'utf8')"));

  console.log('\n── 6. Unsubscribe is a POST, and idempotent ──');

  /* A GET would be followed by mail scanners and link checkers, silently
     opting people out before they ever opened the message. */
  check('unsubscribing requires a POST',
    UNSUB_API.includes('export async function POST')
    && !UNSUB_API.includes('export async function GET'));
  check('the page asks before acting',
    PAGE.includes('Unsubscribe me') && PAGE.includes("method: 'POST'"));
  check('the page does not act on load',
    !PAGE.includes('useEffect'));

  await addSuppression({
    email: 'carol@example.com', reason: 'unsubscribe', actor: 'recipient',
    source: 'unsubscribe_link',
  });
  await addSuppression({
    email: 'carol@example.com', reason: 'unsubscribe', actor: 'recipient',
    source: 'unsubscribe_link',
  });
  check('unsubscribing twice leaves one record',
    (await getSuppressionRecords()).filter((r) => r.email === 'carol@example.com').length === 1);
  check('the confirmation wording is the one required',
    UNSUB_API.includes('You have been unsubscribed from marketing emails.'));
  check('a repeat click is not audited twice',
    UNSUB_API.includes("if (!before?.active || before.reason !== 'unsubscribe')"));

  console.log('\n── 7. SEND-TIME check on the real send path ──');

  writeFileSync(CAMP_FILE, JSON.stringify({ campaigns: [] }));
  writeFileSync(SUP_FILE, JSON.stringify({ records: [] }));

  const audience = ['keep1@example.com', 'gone@example.com', 'keep2@example.com'];
  const makeCampaign = async (id: string) => upsertMailCampaign({
    id, title: `T ${id}`, subject: 'S', text: 'body', html: '<p>body</p>',
    audience: { mode: 'emails', emails: audience },
    status: 'scheduled', createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as never);

  /* Suppressed AFTER the campaign was created and its audience approved. */
  await makeCampaign('sup-1');
  await addSuppression({
    email: 'gone@example.com', reason: 'unsubscribe', actor: 'recipient',
    source: 'unsubscribe_link',
  });

  const first = recordingSender();
  await sendMailCampaign('sup-1', 'https://example.test', 'admin', first.sender);
  check('a suppressed recipient is not sent to',
    !first.sentTo.includes('gone@example.com'), first.sentTo.join(','));
  check('every eligible recipient is still sent to',
    first.sentTo.includes('keep1@example.com') && first.sentTo.includes('keep2@example.com'));
  check('exactly the eligible recipients were mailed', first.sentTo.length === 2);

  const after = await getMailCampaignById('sup-1');
  check('a suppressed recipient is not recorded as a failure',
    (after?.progress?.failed ?? 0) === 0, String(after?.progress?.failed));
  check('suppression is reported as its own figure',
    (after?.progress?.suppressed ?? 0) === 1, String(after?.progress?.suppressed));
  check('a suppressed recipient creates no delivery record to retry',
    !(after?.deliveries ?? []).some((d) => d.to === 'gone@example.com'));
  check('the campaign is not marked failed because of a suppression',
    after?.status === 'sent', after?.status);
  /* No attempt means no outbox row: the sender is never called for them. */
  check('no send attempt is made for a suppressed recipient',
    !first.sentTo.includes('gone@example.com'));

  check('the check runs on the send path, not only at preview',
    CAMPAIGNS.includes('const { eligible, suppressed } = await filterSuppressed(unique);'));
  check('it runs after the audience is resolved',
    CAMPAIGNS.indexOf('resolveAudience(campaign.audience)')
      < CAMPAIGNS.indexOf('await filterSuppressed(unique)'));

  console.log('\n── 8. Retry path ──');

  /* A recipient with a pending retry who unsubscribes before it runs. */
  writeFileSync(SUP_FILE, JSON.stringify({ records: [] }));
  await upsertMailCampaign({
    id: 'sup-2', title: 'T2', subject: 'S', text: 'body', html: '<p>body</p>',
    audience: { mode: 'emails', emails: audience },
    status: 'scheduled', createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deliveries: [
      { to: 'retry-me@example.com', attempts: 1, status: 'pending',
        failureKind: 'connection', error: 'ETIMEDOUT',
        nextRetryAt: new Date(Date.now() - 1000).toISOString(),
        lastAttemptAt: new Date().toISOString() },
      { to: 'retry-gone@example.com', attempts: 1, status: 'pending',
        failureKind: 'connection', error: 'ETIMEDOUT',
        nextRetryAt: new Date(Date.now() - 1000).toISOString(),
        lastAttemptAt: new Date().toISOString() },
    ],
  } as never);
  await addSuppression({
    email: 'retry-gone@example.com', reason: 'unsubscribe', actor: 'recipient',
    source: 'unsubscribe_link',
  });

  const retryRun = recordingSender();
  await sendMailCampaign('sup-2', 'https://example.test', 'admin', retryRun.sender);
  check('a retry pass only retried the pending recipients',
    retryRun.sentTo.every((t) => t.startsWith('retry-')), retryRun.sentTo.join(','));
  check('a pending retry for a suppressed recipient is skipped',
    !retryRun.sentTo.includes('retry-gone@example.com'), retryRun.sentTo.join(','));
  check('the other pending retry still runs',
    retryRun.sentTo.includes('retry-me@example.com'));
  const afterRetry = await getMailCampaignById('sup-2');
  check('the suppressed pending record is not carried forward',
    !(afterRetry?.deliveries ?? []).some((d) => d.to === 'retry-gone@example.com'));
  check('no second retry system was introduced',
    CAMPAIGNS.includes('const suppressedSet = new Set(suppressed);')
    && !CAMPAIGNS.includes('suppressionRetryQueue'));

  console.log('\n── 9. Preview counts ──');

  writeFileSync(SUP_FILE, JSON.stringify({ records: [] }));
  await addSuppression({
    email: 'p2@example.com', reason: 'unsubscribe', actor: 'recipient',
    source: 'unsubscribe_link',
  });
  const preview = await resolveRecipients({
    mode: 'manual',
    emails: ['p1@example.com', 'p2@example.com', 'p3@example.com', 'not-an-email'],
  } as never);
  check('the preview reports a suppressed count', preview.suppressed === 1);
  check('a suppressed recipient is excluded from the final list',
    !preview.emails.includes('p2@example.com'));
  check('the final count reflects the suppression', preview.final === 2, String(preview.final));
  check('an invalid address is still counted separately', preview.invalid === 1);
  check('suppressed is not folded into excluded', preview.excluded === 0,
    String(preview.excluded));
  /* The gap this covers: the resolver computed the count and the API dropped
     it, so a recipient silently vanished from the total with no explanation. */
  check('the count reaches the admin, not just the resolver',
    read('app/api/super-admin/mail/recipients/route.ts')
      .includes('suppressed: resolution.suppressed,')
    && read('app/api/super-admin/mail/route.ts').includes('suppressed: r.suppressed,'));
  check('the picker shows it as its own line',
    read('components/superadmin/mail/RecipientPicker.tsx').includes("['Suppressed'"));
  check('the send confirmation shows it too',
    read('components/superadmin/mail/MailCompose.tsx').includes("['Suppressed'"));
  check('the existing resolver was extended, not replaced',
    RECIPIENTS.includes('const { eligible, suppressed } = await filterSuppressed(emails);')
    && RECIPIENTS.includes('function classifyRecipients'));

  console.log('\n── 10. Transactional mail is never suppressed ──');

  /* The check lives on the campaign path only. A verification code goes
     through sendTrackedMail, which knows nothing about suppression. */
  check('the tracked sender does not consult the suppression list',
    !MAILER.includes('mail-suppression') && !MAILER.includes('isSuppressed'));
  check('no transactional sender imports suppression',
    !read('lib/server/account-emails.ts').includes('mail-suppression')
    && !read('lib/server/otp-email.ts').includes('mail-suppression'));
  check('suppression is applied by the campaign loop alone',
    CAMPAIGNS.includes("from '@/lib/server/mail-suppression'"));
  check('the module says marketing only', LIB.includes('MARKETING ONLY'));
  check('the recipient is told account email still arrives',
    UNSUB_API.includes('Security and account emails')
    && PAGE.includes('verification codes, will still be sent'));

  console.log('\n── 11. Campaign mail carries an unsubscribe link ──');

  check('a per-recipient token is generated at send time',
    CAMPAIGNS.includes('createUnsubscribeToken(to)'));
  check('the link is added to both html and text',
    CAMPAIGNS.includes('unsubscribeHtml') && CAMPAIGNS.includes('Unsubscribe from marketing emails: '));
  check('one shared link is not used for everyone',
    !CAMPAIGNS.includes('createUnsubscribeToken(campaign'));

  console.log('\n── 12. Authorization and audit ──');

  check('the admin API requires a super admin',
    (API.match(/status: 401/g) ?? []).length === 3
    && API.includes('getSuperAdminSessionFromRequest'));
  check('every verb is guarded',
    API.includes('export async function GET') && API.includes('export async function POST')
    && API.includes('export async function DELETE'));
  check('an invalid address is refused', API.includes("'Enter a valid email address.'"));
  check('adding is audited', API.includes("action: 'mail.suppression.added'"));
  check('removing is audited', API.includes("action: 'mail.suppression.removed'"));
  check('unsubscribing is audited', UNSUB_API.includes("action: 'mail.suppression.unsubscribed'"));
  check('the existing audit system is used, not a new log',
    API.includes('appendSuperAdminAudit') && UNSUB_API.includes('appendSuperAdminAudit'));
  check('no credential or token is audited',
    !/details:[^}]*\b(token|password|otp|secret)\b/i.test(API + UNSUB_API));
  check('the unsubscribe endpoint needs no session',
    !UNSUB_API.includes('getSuperAdminSessionFromRequest'));

  console.log('\n── 13. Storage ──');

  check('the existing storage pattern is reused',
    LIB.includes("from '@/lib/server/storage'") && LIB.includes('withStorageLock'));
  check('mutations are serialised',
    LIB.includes('return withStorageLock(LOCK, async () => {'));
  check('no second recipient or log store was created',
    !LIB.includes('appendEmailOutboxEvent') && !LIB.includes('createOutboundEmailId'));

  if (supBackup !== null) writeFileSync(SUP_FILE, supBackup);
  else if (existsSync(SUP_FILE)) unlinkSync(SUP_FILE);
  if (campBackup !== null) writeFileSync(CAMP_FILE, campBackup);
  else if (existsSync(CAMP_FILE)) unlinkSync(CAMP_FILE);

  console.log(
    failures === 0
      ? `\n✅ ${checks}/${checks} checks passed`
      : `\n❌ ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  if (supBackup !== null) writeFileSync(SUP_FILE, supBackup);
  if (campBackup !== null) writeFileSync(CAMP_FILE, campBackup);
  console.error(err);
  process.exit(1);
});
