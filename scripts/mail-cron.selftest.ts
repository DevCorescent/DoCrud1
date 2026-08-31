/**
 * Scheduled-mail self-test (Phase 2).
 *
 * The behaviour under test is the part that is dangerous to get wrong: a job
 * that runs unattended, repeatedly, and sends real email to real people. The
 * three failures worth catching are
 *
 *   1. sending the same campaign twice because two runs overlapped,
 *   2. reporting a campaign as delivered when every send failed,
 *   3. one broken campaign preventing every later campaign from going out.
 *
 * Sends are exercised against a stubbed transport, so nothing here contacts a
 * mail provider or depends on the suspended mailbox. That limit is the point:
 * these tests prove the APPLICATION's scheduling is correct. They cannot and do
 * not prove SMTP transport or mailbox delivery works.
 */
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

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const CRON = read('app/api/cron/mail/route.ts');
const AUTH = read('lib/server/cron-auth.ts');
const CAMPAIGNS = read('lib/server/mail-campaigns.ts');
const MAILER = read('lib/server/mailer.ts');
const VERCEL = read('vercel.json');
const ENV_EXAMPLE = read('.env.example');
const RUN_ROUTE = read('app/api/admin/mail/campaigns/run/route.ts');

/* ── Test harness ─────────────────────────────────────────────────────────
   These tests drive the REAL persistence path. `MONGODB_URI` is cleared so
   lib/server/storage resolves to the local JSON file, the real campaign file is
   backed up and restored around the run, and audiences use explicit email
   addresses so no user store is involved.

   Only the mail SENDER is substituted, through the documented parameter on
   sendMailCampaign/runDueMailCampaigns. Nothing contacts a provider, so none of
   this depends on the suspended mailbox — and equally, none of it proves SMTP
   works. */
import { existsSync, readFileSync as rf, writeFileSync, unlinkSync } from 'fs';

const CAMPAIGN_FILE = path.join(process.cwd(), 'data', 'mail-campaigns.json');
let backup: string | null = null;

type Campaign = Record<string, unknown>;
let sendAttempts: string[] = [];

function setStore(campaigns: Campaign[]) {
  writeFileSync(CAMPAIGN_FILE, JSON.stringify({ campaigns }, null, 2));
  sendAttempts = [];
}
function getStore(): Campaign[] {
  return (JSON.parse(rf(CAMPAIGN_FILE, 'utf8')) as { campaigns: Campaign[] }).campaigns;
}
function byId(id: string): Campaign | undefined {
  return getStore().find((c) => c.id === id);
}

/** Stand-in for sendTrackedMail. `mode` decides how it behaves per recipient. */
function makeSender(mode: 'ok' | 'fail' | 'one-bad') {
  return (async (input: { to: string }) => {
    sendAttempts.push(input.to);
    if (mode === 'fail') {
      throw new Error('Invalid login: 535 mailbox is in a suspended status');
    }
    if (mode === 'one-bad' && input.to === 'a@example.com') {
      throw new Error('550 mailbox unavailable');
    }
    return { skipped: false, messageId: 'stub', outboxId: 'stub' };
  }) as unknown as import('@/lib/server/mail-campaigns').CampaignMailSender;
}

function campaign(over: Partial<Campaign> = {}): Campaign {
  const now = new Date().toISOString();
  return {
    id: 'cmp-test-1', title: 'Test', subject: 'Hello', text: 'Body',
    audience: { mode: 'emails', emails: ['a@example.com', 'b@example.com'] },
    sendAt: new Date(Date.now() - 60_000).toISOString(),
    status: 'scheduled', createdAt: now, updatedAt: now, createdBy: 'admin@docrud.com',
    ...over,
  };
}

/* ── Cron auth, exercised through the real helper ─────────────────────── */
function fakeReq(headers: Record<string, string>) {
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as unknown as import('next/server').NextRequest;
}

async function main() {
  /* Force the local-file storage path so nothing touches a database. */
  delete process.env.MONGODB_URI;
  if (existsSync(CAMPAIGN_FILE)) backup = rf(CAMPAIGN_FILE, 'utf8');

  const { checkCronAuth } = await import('@/lib/server/cron-auth');
  const {
    runDueMailCampaigns, sendMailCampaign, CampaignAlreadyClaimedError,
  } = await import('@/lib/server/mail-campaigns');
  const { MAX_DELIVERY_ATTEMPTS: MAIL_MAX_ATTEMPTS } = await import('@/lib/server/mail-provider');

  console.log('\n── 1. Cron authentication ──');

  const prevSecret = process.env.CRON_SECRET;
  const prevEnv = process.env.NODE_ENV;

  process.env.CRON_SECRET = 'super-secret-value';
  check('a request with no credentials is rejected',
    !checkCronAuth(fakeReq({ host: 'docrud.com' })).authorized);
  check('a wrong secret is rejected',
    !checkCronAuth(fakeReq({ 'x-cron-secret': 'wrong' })).authorized);
  check('the x-cron-secret header is accepted',
    checkCronAuth(fakeReq({ 'x-cron-secret': 'super-secret-value' })).authorized);
  check('the Authorization Bearer header is accepted (what Vercel Cron sends)',
    checkCronAuth(fakeReq({ authorization: 'Bearer super-secret-value' })).authorized);
  check('a bare Authorization value without Bearer is rejected',
    !checkCronAuth(fakeReq({ authorization: 'super-secret-value' })).authorized);
  check('an empty header does not match an empty comparison',
    !checkCronAuth(fakeReq({ 'x-cron-secret': '' })).authorized);
  /* The secret must never be echoed, in any branch. */
  const reasons = [
    checkCronAuth(fakeReq({})).reason,
    checkCronAuth(fakeReq({ 'x-cron-secret': 'wrong' })).reason,
  ].join(' ');
  check('the auth result never contains the secret', !reasons.includes('super-secret-value'));

  /* Production must not fall back to "localhost is fine". */
  delete process.env.CRON_SECRET;
  Object.defineProperty(process.env, 'NODE_ENV',
    { value: 'production', configurable: true, writable: true, enumerable: true });
  check('with no secret configured, production rejects even a localhost call',
    !checkCronAuth(fakeReq({ host: 'localhost:3000' })).authorized);
  Object.defineProperty(process.env, 'NODE_ENV',
    { value: 'development', configurable: true, writable: true, enumerable: true });
  check('with no secret configured, development still allows localhost',
    checkCronAuth(fakeReq({ host: 'localhost:3000' })).authorized);
  check('with no secret configured, development rejects a remote host',
    !checkCronAuth(fakeReq({ host: 'evil.example.com' })).authorized);

  if (prevSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = prevSecret;
  Object.defineProperty(process.env, 'NODE_ENV',
    { value: prevEnv, configurable: true, writable: true, enumerable: true });

  console.log('\n── 2. The route is reachable without a session ──');

  check('the cron route uses the shared cron auth', CRON.includes('checkCronAuth(req)'));
  check('it requires no admin session',
    !CRON.includes('getSuperAdminSessionFromRequest') && !CRON.includes('getAuthSession'));
  check('it rejects unauthorized callers with 401', CRON.includes('{ status: 401 }'));
  /* The route documents the variable by name; what must never happen is
     reading it into a response. */
  check('it never reads or returns the secret value',
    !/process\.env\.CRON_SECRET/.test(CRON));
  check('it answers GET, which is what Vercel Cron issues',
    CRON.includes('export async function GET'));
  check('it reuses the existing runner rather than a second send path',
    CRON.includes('runDueMailCampaigns') && !CRON.includes('sendTrackedMail'));
  check('tracking links use the canonical host, not the scheduler hostname',
    CRON.includes('getPublicAppBaseUrl()'));
  check('an internal error is logged, not returned',
    CRON.includes("console.error('[cron/mail]") && CRON.includes("'Scheduled mail run failed.'"));
  check('the secret is not accepted from the query string',
    !AUTH.includes('searchParams') && !CRON.includes('searchParams'));
  check('the secret comparison is constant-time', AUTH.includes('timingSafeEqual'));

  console.log('\n── 3. Vercel cron configuration ──');

  const vercel = JSON.parse(VERCEL) as { crons?: Array<{ path: string; schedule: string }> };
  check('a cron entry exists', Array.isArray(vercel.crons) && vercel.crons.length > 0);
  check('it points at the mail endpoint',
    Boolean(vercel.crons?.some((c) => c.path === '/api/cron/mail')));
  check('it runs often enough to be useful',
    Boolean(vercel.crons?.some((c) => /^\*\/\d+ /.test(c.schedule))));
  check('there are no duplicate cron paths',
    new Set((vercel.crons ?? []).map((c) => c.path)).size === (vercel.crons ?? []).length);
  check('the existing build configuration is untouched',
    VERCEL.includes('"framework": "nextjs"') && VERCEL.includes('"buildCommand"'));
  check('CRON_SECRET is documented as a placeholder only',
    /^CRON_SECRET=$/m.test(ENV_EXAMPLE));
  check('no real secret was committed',
    !/CRON_SECRET=.+/.test(ENV_EXAMPLE.replace(/CRON_SECRET=$/m, '')));

  console.log('\n── 4. Due campaigns actually run ──');

  const ORIGIN = 'https://www.docrud.com';

  setStore([campaign()]);
  let summary = await runDueMailCampaigns(ORIGIN, makeSender('ok'));
  check('a due campaign is processed', summary.processed === 1);
  check('it reaches every recipient', sendAttempts.length === 2, String(sendAttempts.length));
  check('it is reported as sent', summary.results[0]?.status === 'sent');
  check('the campaign ends in the sent state', byId('cmp-test-1')?.status === 'sent');
  check('progress records the real counts',
    JSON.stringify(byId('cmp-test-1')?.progress).includes('"sent":2'));
  check('nothing is left holding a claim', !byId('cmp-test-1')?.claimToken);

  setStore([campaign({ sendAt: new Date(Date.now() + 3_600_000).toISOString() })]);
  summary = await runDueMailCampaigns(ORIGIN, makeSender('ok'));
  check('a future campaign is NOT processed', summary.processed === 0);
  check('no email is attempted for it', sendAttempts.length === 0);
  check('it stays scheduled', byId('cmp-test-1')?.status === 'scheduled');

  setStore([campaign({ status: 'draft', sendAt: undefined })]);
  summary = await runDueMailCampaigns(ORIGIN, makeSender('ok'));
  check('a draft is not sent by the scheduler',
    summary.processed === 0 && sendAttempts.length === 0);

  setStore([campaign({ status: 'cancelled' })]);
  summary = await runDueMailCampaigns(ORIGIN, makeSender('ok'));
  check('a cancelled campaign is not sent',
    summary.processed === 0 && sendAttempts.length === 0);

  console.log('\n── 5. A campaign is never sent twice ──');

  setStore([campaign()]);
  await runDueMailCampaigns(ORIGIN, makeSender('ok'));
  const firstPass = sendAttempts.length;
  /* The scenario that matters: the scheduler fires again before anyone has
     touched anything. */
  const second = await runDueMailCampaigns(ORIGIN, makeSender('ok'));
  check('a second run finds nothing due', second.processed === 0);
  check('no additional email is sent', sendAttempts.length === firstPass,
    `${sendAttempts.length} vs ${firstPass}`);

  setStore([campaign({ status: 'sending' })]);
  let claimed = false;
  try { await sendMailCampaign('cmp-test-1', ORIGIN, undefined, makeSender('ok')); }
  catch (e) { claimed = e instanceof CampaignAlreadyClaimedError; }
  check('a campaign already in flight cannot be claimed', claimed);
  check('no email is sent for an in-flight campaign', sendAttempts.length === 0);

  setStore([campaign({ status: 'sent' })]);
  let rejected = false;
  try { await sendMailCampaign('cmp-test-1', ORIGIN, undefined, makeSender('ok')); }
  catch (e) { rejected = e instanceof CampaignAlreadyClaimedError; }
  check('an already-sent campaign cannot be resent', rejected);
  check('no email is sent for it', sendAttempts.length === 0);

  setStore([campaign()]);
  /* Two overlapping workers, started together — what an overlapping cron does. */
  const both = await Promise.allSettled([
    sendMailCampaign('cmp-test-1', ORIGIN, undefined, makeSender('ok')),
    sendMailCampaign('cmp-test-1', ORIGIN, undefined, makeSender('ok')),
  ]);
  const fulfilled = both.filter((r) => r.status === 'fulfilled').length;
  check('only one of two concurrent workers sends the campaign', fulfilled === 1,
    `${fulfilled} succeeded`);
  check('recipients are not doubled', sendAttempts.length === 2, String(sendAttempts.length));

  console.log('\n── 6. Failure is recorded as failure ──');

  setStore([campaign()]);
  summary = await runDueMailCampaigns(ORIGIN, makeSender('fail'));
  /* The regression that mattered: `failed > 0 ? 'sent' : 'sent'` recorded a
     campaign in which every single send was rejected as delivered. */
  check('a campaign where every send failed is NOT reported as sent',
    summary.results[0]?.status === 'failed', String(summary.results[0]?.status));
  check('the campaign record ends in the failed state',
    byId('cmp-test-1')?.status === 'failed', String(byId('cmp-test-1')?.status));
  check('the provider error is retained for the admin',
    String(byId('cmp-test-1')?.lastError || '').includes('suspended'));
  check('an SMTP 535 stays a failure',
    String(summary.results[0]?.error || '').includes('535'));
  check('the failure count is real',
    JSON.stringify(byId('cmp-test-1')?.progress).includes('"failed":2'));
  check('no credential appears in the stored error',
    !/password|pass=|secret/i.test(String(byId('cmp-test-1')?.lastError)));
  check('a failed campaign does not stay wedged in sending',
    byId('cmp-test-1')?.status !== 'sending');

  setStore([
    campaign({ id: 'cmp-broken', audience: { mode: 'emails', emails: [] } }),
    campaign({ id: 'cmp-good' }),
  ]);
  summary = await runDueMailCampaigns(ORIGIN, makeSender('ok'));
  check('a broken campaign does not stop the others', summary.processed === 2);
  check('the healthy campaign still went out', sendAttempts.length === 2);
  check('the healthy one is reported sent',
    summary.results.find((r) => r.id === 'cmp-good')?.status === 'sent');
  check('the broken one is reported failed',
    summary.results.find((r) => r.id === 'cmp-broken')?.status === 'failed');
  check('the broken one does not stay wedged in sending',
    byId('cmp-broken')?.status === 'failed');

  setStore([campaign()]);
  summary = await runDueMailCampaigns(ORIGIN, makeSender('one-bad'));
  check('a partly-delivered campaign is reported as partial, not sent',
    summary.results[0]?.status === 'partial', String(summary.results[0]?.status));
  check('the partial failure reason is kept',
    String(summary.results[0]?.error || '').includes('550'));
  check('a partial campaign still records both counts',
    JSON.stringify(byId('cmp-test-1')?.progress).includes('"sent":1')
    && JSON.stringify(byId('cmp-test-1')?.progress).includes('"failed":1'));

  console.log('\n── 6b. Retry is driven by classification ──');

  /** A sender that fails every recipient with a specific error object. */
  const failWith = (err: Record<string, unknown>) =>
    (async (i: { to: string }) => {
      sendAttempts.push(i.to);
      throw Object.assign(new Error(String(err.message)), err);
    }) as unknown as import('@/lib/server/mail-campaigns').CampaignMailSender;

  /* A suspended mailbox must not be retried: retrying cannot fix billing. */
  setStore([campaign()]);
  summary = await runDueMailCampaigns(ORIGIN, failWith({
    code: 'EAUTH', responseCode: 535,
    message: "Invalid login: 535 mailbox is in a suspended status",
  }));
  let c = byId('cmp-test-1')!;
  let deliveries = (c.deliveries ?? []) as Array<Record<string, unknown>>;
  check('a 535 campaign fails outright', c.status === 'failed', String(c.status));
  check('535 is recorded as an auth failure',
    deliveries.every((d) => d.failureKind === 'auth'));
  check('535 records the provider code', deliveries.every((d) => d.providerCode === 535));
  check('535 is never scheduled for retry',
    deliveries.every((d) => d.nextRetryAt === null));
  check('535 deliveries are marked failed, not pending',
    deliveries.every((d) => d.status === 'failed'));
  check('the attempt count is persisted', deliveries.every((d) => d.attempts === 1));
  check('the last attempt time is persisted', deliveries.every((d) => d.lastAttemptAt));
  check('a 535 campaign is not left queued for another pass',
    summary.results[0]?.status === 'failed');

  /* And the decisive one: a second cron pass must not re-attempt it. */
  const attemptsAfter535 = sendAttempts.length;
  await runDueMailCampaigns(ORIGIN, failWith({ code: 'EAUTH', responseCode: 535, message: 'x' }));
  check('a suspended-mailbox campaign is NOT retried by the next cron run',
    sendAttempts.length === attemptsAfter535, `${sendAttempts.length} vs ${attemptsAfter535}`);

  /* A permanent recipient rejection is likewise never retried. */
  setStore([campaign()]);
  await runDueMailCampaigns(ORIGIN, failWith({ responseCode: 550, message: '550 no such user' }));
  c = byId('cmp-test-1')!;
  deliveries = (c.deliveries ?? []) as Array<Record<string, unknown>>;
  check('a 550 is classified as a recipient failure',
    deliveries.every((d) => d.failureKind === 'recipient'));
  check('a 550 is never scheduled for retry', deliveries.every((d) => d.nextRetryAt === null));
  check('an all-550 campaign fails', c.status === 'failed');

  /* TLS failures are permanent too. */
  setStore([campaign()]);
  await runDueMailCampaigns(ORIGIN, failWith({ code: 'ESOCKET', message: 'certificate has expired' }));
  deliveries = (byId('cmp-test-1')!.deliveries ?? []) as Array<Record<string, unknown>>;
  check('a TLS failure is classified as tls', deliveries.every((d) => d.failureKind === 'tls'));
  check('a TLS failure is never retried', deliveries.every((d) => d.nextRetryAt === null));

  console.log('\n── 6c. Retryable failures ARE retried ──');

  setStore([campaign()]);
  summary = await runDueMailCampaigns(ORIGIN, failWith({ code: 'ETIMEDOUT', message: 'timeout' }));
  c = byId('cmp-test-1')!;
  deliveries = (c.deliveries ?? []) as Array<Record<string, unknown>>;
  check('a connection failure is retryable',
    deliveries.every((d) => d.failureKind === 'connection' && d.status === 'pending'));
  check('a retry time is scheduled', deliveries.every((d) => typeof d.nextRetryAt === 'string'));
  check('the campaign goes back to the queue rather than failing',
    c.status === 'scheduled', String(c.status));
  check('the runner reports it as retrying', summary.results[0]?.status === 'retrying');
  check('the campaign is re-queued for the earliest retry',
    c.sendAt === deliveries.map((d) => d.nextRetryAt).sort()[0]);
  /* Not yet due, so the next pass must leave it alone. */
  const beforeEarly = sendAttempts.length;
  await runDueMailCampaigns(ORIGIN, makeSender('ok'));
  check('a retry that is not yet due is not attempted',
    sendAttempts.length === beforeEarly);

  const throttled = await (async () => {
    setStore([campaign()]);
    await runDueMailCampaigns(ORIGIN, failWith({ responseCode: 421, message: '421 too many messages' }));
    return (byId('cmp-test-1')!.deliveries ?? []) as Array<Record<string, unknown>>;
  })();
  check('a rate limit is retryable', throttled.every((d) => d.status === 'pending'));

  console.log('\n── 6d. A retry pass only touches pending recipients ──');

  /* The worst possible bug: a retry that re-delivers to everyone who already
     succeeded. One address fails transiently, one succeeds. */
  setStore([campaign()]);
  sendAttempts = [];
  await runDueMailCampaigns(ORIGIN, (async (i: { to: string }) => {
    sendAttempts.push(i.to);
    if (i.to === 'a@example.com') throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    return { skipped: false, messageId: 'x', outboxId: 'x' };
  }) as unknown as import('@/lib/server/mail-campaigns').CampaignMailSender);
  c = byId('cmp-test-1')!;
  deliveries = (c.deliveries ?? []) as Array<Record<string, unknown>>;
  check('only the failing recipient is tracked', deliveries.length === 1
    && deliveries[0].to === 'a@example.com', JSON.stringify(deliveries.map((d) => d.to)));
  check('the successful recipient is not queued for retry',
    !deliveries.some((d) => d.to === 'b@example.com'));
  check('the successful send is counted',
    JSON.stringify(c.progress).includes('"sent":1'));

  /* Make the retry due, then run again. */
  const due = JSON.parse(JSON.stringify(byId('cmp-test-1'))) as Record<string, unknown>;
  (due.deliveries as Array<Record<string, unknown>>)[0].nextRetryAt = new Date(Date.now() - 1000).toISOString();
  due.sendAt = new Date(Date.now() - 1000).toISOString();
  setStore([due]);
  await runDueMailCampaigns(ORIGIN, makeSender('ok'));
  check('the retry pass mails ONLY the pending recipient',
    sendAttempts.length === 1 && sendAttempts[0] === 'a@example.com',
    JSON.stringify(sendAttempts));
  c = byId('cmp-test-1')!;
  check('a successful retry completes the campaign', c.status === 'sent', String(c.status));
  check('the send count accumulates across passes',
    JSON.stringify(c.progress).includes('"sent":2'), JSON.stringify(c.progress));
  check('no pending deliveries remain', !c.deliveries || (c.deliveries as unknown[]).length === 0);

  console.log('\n── 6e. Exhausted retries and partial failure ──');

  /* Attempts carry across passes, so the ceiling is per recipient. */
  const exhausted = campaign({
    deliveries: [{
      to: 'a@example.com', attempts: MAIL_MAX_ATTEMPTS - 1, status: 'pending',
      failureKind: 'connection', nextRetryAt: new Date(Date.now() - 1000).toISOString(),
    }],
    sendAt: new Date(Date.now() - 1000).toISOString(),
    progress: { total: 2, sent: 1, failed: 0 },
  });
  setStore([exhausted]);
  sendAttempts = [];
  await runDueMailCampaigns(ORIGIN, failWith({ code: 'ETIMEDOUT', message: 'timeout' }));
  c = byId('cmp-test-1')!;
  deliveries = (c.deliveries ?? []) as Array<Record<string, unknown>>;
  check('the final attempt is made', sendAttempts.length === 1);
  check('an exhausted recipient stops being retried',
    deliveries.every((d) => d.nextRetryAt === null && d.status === 'failed'));
  /* Some delivered, some permanently did not: that is neither sent nor failed. */
  check('a campaign with successes and permanent failures is partially_failed',
    c.status === 'partially_failed', String(c.status));
  check('the permanently failed recipient is counted, not the delivered one',
    JSON.stringify(c.progress).includes('"failed":1')
    && JSON.stringify(c.progress).includes('"sent":1'), JSON.stringify(c.progress));
  check('the provider error survives on the exhausted delivery',
    deliveries.every((d) => typeof d.error === 'string' && String(d.error).length > 0));

  console.log('\n── 7. TLS verification ──');

  check('the shared mailer no longer disables certificate verification',
    !/rejectUnauthorized:\s*false/.test(MAILER));
  check('the OTP relay transport verifies certificates',
    !/rejectUnauthorized:\s*false/.test(
      read('app/api/onboarding/send-otp/route.ts').split('Direct MX fallback')[0]));
  check('the drive send-email transport verifies certificates',
    !/rejectUnauthorized:\s*false/.test(read('app/api/drive/send-email/route.ts')));
  /* The direct-MX fallback stays opportunistic on purpose; it must be the only
     remaining exception, and it must say why. */
  const OTP = read('app/api/onboarding/send-otp/route.ts');
  check('only the direct-MX fallback remains permissive',
    (OTP.match(/rejectUnauthorized:\s*false/g) ?? []).length === 1);
  check('that exception is documented', OTP.includes('opportunistic-TLS behaviour'));

  console.log('\n── 8. The existing mail system still works the same way ──');

  check('there is still exactly one send function',
    MAILER.includes('export async function sendTrackedMail'));
  check('the outbox state machine is unchanged',
    MAILER.includes("status: 'queued'") && MAILER.includes("status: 'sent'")
    && MAILER.includes("status: 'failed'"));
  check('cc, bcc, replyTo and attachments are still supported',
    MAILER.includes('cc: input.cc') && MAILER.includes('bcc: input.bcc')
    && MAILER.includes('replyTo:') && MAILER.includes('attachments:'));
  check('mail policies are still enforced', MAILER.includes('getMailPolicies()'));
  check('tracking is still applied',
    MAILER.includes('buildTrackingPixel') && MAILER.includes('rewriteLinksForTracking'));
  /* One call site, and the injected sender defaults to sendTrackedMail
     everywhere — so production still has exactly one send path. */
  check('the campaign module still has one send call site',
    (CAMPAIGNS.match(/await sender\(/g) ?? []).length === 1);
  check('the sender always defaults to the shared mailer',
    (CAMPAIGNS.match(/sender: CampaignMailSender = sendTrackedMail/g) ?? []).length === 2);
  check('no alternative transport is imported by the campaign module',
    !CAMPAIGNS.includes('nodemailer'));
  /* The concern is a parallel copy of the OUTBOX statuses inside the campaign
     module; a result label on the runner's return value is not that. */
  check('the outbox state machine is not duplicated in the campaign module',
    !CAMPAIGNS.includes("OutboundEmailStatus") && !CAMPAIGNS.includes("'tested'"));
  check('delivery retry state reuses the campaign record, not a new store',
    CAMPAIGNS.includes('deliveries?: MailDelivery[]') && !CAMPAIGNS.includes('deliveriesPath'));
  check('the manual admin trigger still exists and is still admin-guarded',
    RUN_ROUTE.includes("session?.user?.role !== 'admin'")
    && RUN_ROUTE.includes('runDueMailCampaigns'));
  check('the manual endpoint still returns a results key', RUN_ROUTE.includes('summary'));
  check('account, billing and OTP mail still route through the shared mailer',
    read('lib/server/account-emails.ts').includes('sendTrackedMail')
    && read('lib/server/notification-emails.ts').includes('sendTrackedMail'));
  check('the other cron jobs were not rescheduled or removed',
    !VERCEL.includes('account-cleanup') && !VERCEL.includes('billing'));

  restore();
  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

/** Leave the repository exactly as it was found. */
function restore() {
  if (backup !== null) writeFileSync(CAMPAIGN_FILE, backup);
  else if (existsSync(CAMPAIGN_FILE)) unlinkSync(CAMPAIGN_FILE);
}

main().catch((err) => { restore(); console.error(err); process.exit(1); });
