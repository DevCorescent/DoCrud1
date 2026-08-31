/**
 * Mail provider health + failure classification self-test.
 *
 * Classification decides whether a failed message is retried, so getting it
 * wrong is expensive in both directions: retrying a suspended mailbox burns
 * attempts forever, and retrying a permanently rejected recipient is what gets
 * a sending domain blocklisted. These tests pin the classification of the
 * errors this app has actually seen.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  classifyMailError, nextRetryAt, MAX_DELIVERY_ATTEMPTS,
} from '@/lib/server/mail-provider';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const PROVIDER = read('lib/server/mail-provider.ts');
const HEALTH_API = read('app/api/super-admin/mail/health/route.ts');
const PANEL = read('components/superadmin/MailHealthPanel.tsx');
const ADMIN = read('components/SuperAdminPanel.tsx');

function main() {
  console.log('\n── 1. The real GoDaddy failure ──');

  /* Verbatim from the live provider reply. */
  const suspended = classifyMailError({
    code: 'EAUTH', responseCode: 535,
    message: "Invalid login: 535 Your message wasn't accepted. $(_authemail) is in a suspended status.",
  });
  check('a suspended mailbox is an auth failure', suspended.kind === 'auth', suspended.kind);
  /* The important one: no number of retries fixes a billing suspension. */
  check('a suspended mailbox is NOT retryable', !suspended.retryable);
  check('the advice names the real remedy',
    suspended.advice.includes('suspended') && suspended.advice.includes('provider'));
  check('the provider wording is preserved', suspended.message.includes('535'));
  check('the SMTP code is captured', suspended.code === 535);

  console.log('\n── 2. Transient vs permanent ──');

  for (const [code, kind, retryable] of [
    ['ETIMEDOUT', 'connection', true],
    ['ECONNREFUSED', 'connection', true],
    ['ENOTFOUND', 'connection', true],
  ] as const) {
    const f = classifyMailError({ code, message: 'socket problem' });
    check(`${code} is a retryable connection failure`, f.kind === kind && f.retryable === retryable);
  }

  const tls = classifyMailError({ code: 'ESOCKET', message: 'certificate has expired' });
  check('a TLS problem is classified as tls', tls.kind === 'tls');
  check('a TLS problem is not retryable', !tls.retryable);

  const throttled = classifyMailError({ message: 'Too many messages, rate limit exceeded' });
  check('a rate limit is retryable', throttled.kind === 'rate_limit' && throttled.retryable);

  /* Never retried: repeated attempts at a dead address damage reputation. */
  for (const code of [550, 551, 553]) {
    const f = classifyMailError({ responseCode: code, message: 'mailbox unavailable' });
    check(`SMTP ${code} is a permanent recipient failure`, f.kind === 'recipient' && !f.retryable);
  }
  check('a permanent recipient failure says not to retry',
    classifyMailError({ responseCode: 550, message: 'no such user' }).advice.includes('reputation'));

  for (const code of [421, 451, 452]) {
    const f = classifyMailError({ responseCode: code, message: 'try again later' });
    check(`SMTP ${code} is treated as temporary`, f.retryable, f.kind);
  }
  const perm5xx = classifyMailError({ responseCode: 554, message: 'transaction failed' });
  check('an unlisted 5xx is permanent', !perm5xx.retryable);

  const unknown = classifyMailError(new Error('something odd happened'));
  check('an unclassified error is flagged as unknown', unknown.kind === 'unknown');
  check('an unclassified error is retried, but says so', unknown.retryable
    && unknown.advice.includes('could not be classified'));
  check('a non-error input does not throw',
    classifyMailError(undefined).kind === 'unknown');

  console.log('\n── 3. Retry scheduling ──');

  const transient = classifyMailError({ code: 'ETIMEDOUT', message: 'timeout' });
  const first = nextRetryAt(transient, 1, 0);
  check('a transient failure schedules a retry', first !== null);
  check('the first retry is a short delay',
    first !== null && new Date(first).getTime() === 60_000, String(first));
  check('backoff grows',
    new Date(nextRetryAt(transient, 2, 0)!).getTime() > new Date(first!).getTime());
  check('retries stop at the attempt ceiling',
    nextRetryAt(transient, MAX_DELIVERY_ATTEMPTS, 0) === null);
  /* Both guards matter independently. */
  check('a permanent failure is never scheduled, even on attempt 1',
    nextRetryAt(suspended, 1, 0) === null);
  check('a permanent recipient failure is never scheduled',
    nextRetryAt(classifyMailError({ responseCode: 550, message: 'x' }), 1, 0) === null);
  check('the attempt ceiling is bounded', MAX_DELIVERY_ATTEMPTS > 1 && MAX_DELIVERY_ATTEMPTS <= 6);

  console.log('\n── 4. Provider abstraction ──');

  check('a provider interface exists',
    PROVIDER.includes('export interface MailProvider') && PROVIDER.includes('verify()'));
  check('SMTP is one implementation of it',
    PROVIDER.includes('export class SmtpMailProvider implements MailProvider'));
  check('health reuses the real pooled transporter, not a parallel guess',
    PROVIDER.includes('getCachedTransporter()'));
  check('an unconfigured provider is distinguished from a broken one',
    PROVIDER.includes("status: 'unconfigured'"));
  check('a retryable fault is degraded, a permanent one unavailable',
    PROVIDER.includes("failure.retryable ? 'degraded' : 'unavailable'"));
  check('health checks are cached so they do not run per render',
    PROVIDER.includes('HEALTH_TTL_MS') && PROVIDER.includes('getProviderHealth(force'));
  /* What matters is that no credential VALUE is read or returned — advice copy
     may legitimately contain the word "password". */
  check('no credential value is read or returned',
    !/settings\.password|smtp\.password|auth:\s*\{/.test(PROVIDER)
    && !PROVIDER.includes('username:'));
  check('the health shape carries only non-secret connection facts',
    PROVIDER.includes('host: settings.host') && PROVIDER.includes('port: Number(settings.port)')
    && !/password/.test(PROVIDER.slice(PROVIDER.indexOf('export interface ProviderHealth'),
                                       PROVIDER.indexOf('export interface MailProvider'))));

  console.log('\n── 5. Health API ──');

  check('the endpoint is super-admin guarded',
    HEALTH_API.includes('getSuperAdminSessionFromRequest')
    && HEALTH_API.includes("{ error: 'Unauthorized' }, { status: 401 }"));
  check('a forced re-check is opt-in', HEALTH_API.includes("searchParams.get('force') === '1'"));
  check('application health is reported separately from provider health',
    HEALTH_API.includes('application:') && HEALTH_API.includes('provider: health?.status'));
  check('failures are grouped by classified cause',
    HEALTH_API.includes('classifyMailError') && HEALTH_API.includes('failureGroups'));
  check('the rate is named acceptance, not delivery',
    HEALTH_API.includes('acceptanceRate') && !HEALTH_API.includes('deliveryRate'));
  check('an unmeasurable rate is null, not zero',
    HEALTH_API.includes('attempted > 0 ?') && HEALTH_API.includes(': null'));
  check('no secret is exposed',
    !/SMTP_PASSWORD|MONGODB_URI|CRON_SECRET/.test(HEALTH_API));
  check('internal errors are logged, not returned',
    HEALTH_API.includes('console.error') && HEALTH_API.includes("'Failed to load mail health.'"));

  console.log('\n── 6. The UI tells the truth ──');

  check('delivery health is its own panel', ADMIN.includes('<MailHealthPanel />'));
  /* Health is no longer the landing view — the Overview is, and it surfaces a
     provider outage at the top with a link straight to Health. */
  check('mail health is still reachable as its own section',
    ADMIN.includes("<MailHealthPanel />") && ADMIN.includes("view === 'health'"));
  check('provider status is stated in words, not colour alone',
    PANEL.includes("word: 'Operational'") && PANEL.includes("word: 'Unavailable'"));
  check('the provider error and its remedy are both shown',
    PANEL.includes('{p.failure.message}') && PANEL.includes('{p.failure.advice}'));
  check('retryable vs permanent is explained to the admin',
    PANEL.includes('queued mail will be retried automatically')
    && PANEL.includes('retrying will not help') || PANEL.includes('Classified as permanent'));
  check('the failure count expands into causes',
    PANEL.includes('View ') && PANEL.includes('failureGroups.map'));
  /* The central honesty requirement. */
  check('the panel separates provider failure from application health',
    PANEL.includes('The application, queue and database are working'));
  check('acceptance is not described as inbox delivery',
    PANEL.includes('not that it reached an inbox'));
  check('tracking limitations are disclosed',
    PANEL.includes('under-count clients that block images'));
  check('an unmeasurable metric reads as Not available',
    PANEL.includes("'Not available'"));
  check('there is no polling loop',
    !PANEL.includes('setInterval') && PANEL.includes('void load(false); }, [load]'));
  check('loading, error and retry states exist',
    PANEL.includes('Loading mail health…') && PANEL.includes('role="alert"')
    && PANEL.includes('>Retry<'));

  console.log('\n── 6b. Mail Center overview ──');

  const OVERVIEW = read('components/superadmin/MailOverview.tsx');
  const ADMIN2 = read('components/SuperAdminPanel.tsx');

  check('the overview is mounted in the Mail Center', ADMIN2.includes('<MailOverview'));
  /* Compose joined the nav in Phase 4; Overview is still where the tab opens. */
  check('overview is the default view',
    /const \[view, setView\] = useState<[^>]*'compose'[^>]*>\('overview'\)/.test(ADMIN2));
  /* Section 40: no placeholder tabs. Only implemented sections are offered. */
  /* Section 40: only implemented sections are offered. Compose is real now;
     templates/analytics/settings are still absent rather than stubbed. */
  /* Anchored on the mail view declaration specifically — an unrelated
     `useState<'overview' | …>` elsewhere in the panel matches a bare search. */
  const navDecl = (/const \[view, setView\] = useState<[^>]*'compose'[^>]*>\([^)]*\)/.exec(ADMIN2) ?? [''])[0];
  check('no unimplemented tab is advertised',
    !ADMIN2.includes('Coming soon')
    && !/'templates'|'analytics'|'settings'|'recipients'/.test(navDecl));
  check('compose is a real section, not a placeholder',
    navDecl.includes("'compose'") && ADMIN2.includes('<MailCompose />'));
  check('every figure comes from the real health endpoint',
    OVERVIEW.includes("fetch('/api/super-admin/mail/health'")
    && !/const \w+ = \[\s*\{ *label/.test(OVERVIEW));
  check('the overview reads campaign state, not guesses',
    HEALTH_API.includes('getMailCampaigns()') && OVERVIEW.includes('campaigns.scheduled'));
  check('pending retries are surfaced',
    HEALTH_API.includes('pendingRetries') && OVERVIEW.includes('Awaiting retry'));
  check('recent failures carry their classification',
    HEALTH_API.includes('recentFailures') && OVERVIEW.includes('f.retryable'));
  /* The vocabulary rule this whole project keeps returning to. */
  check('the overview says accepted, never delivered',
    OVERVIEW.includes('Accepted by the provider')
    && OVERVIEW.includes('not proof of inbox') && !/\bDelivered\b/.test(OVERVIEW));
  check('tracking limitations are disclosed',
    OVERVIEW.includes('under-count clients that block images'));
  check('an unmeasurable figure reads as Not available',
    OVERVIEW.includes("'Not available'"));
  check('a provider outage is called out above everything else',
    OVERVIEW.includes('Mail delivery is not working')
    && OVERVIEW.includes('this is a provider problem'));
  check('there is no polling loop',
    !OVERVIEW.includes('setInterval') && OVERVIEW.includes('void load(false); }, [load]'));
  check('loading, error and retry states exist',
    OVERVIEW.includes('Loading mail overview…') && OVERVIEW.includes('role="alert"')
    && OVERVIEW.includes('>Retry<'));
  check('tables scroll inside their own container', OVERVIEW.includes('overflow-x-auto'));
  check('the superseded inline overview was removed, not left dead',
    !ADMIN2.includes('{false && data &&') && !ADMIN2.includes('Recent Outbox'));

  console.log('\n── 7. Existing behaviour preserved ──');

  check('the outbox view still exists', ADMIN.includes("view === 'outbox'"));
  check('the overview view still exists', ADMIN.includes("view === 'overview'"));
  check('the campaign send path is untouched',
    read('lib/server/mail-campaigns.ts').includes('claimCampaign')
    && read('lib/server/mail-campaigns.ts').includes('CampaignAlreadyClaimedError'));
  check('the shared mailer is still the single send path',
    read('lib/server/mailer.ts').includes('export async function sendTrackedMail'));
  check('TLS verification is still enabled',
    !/rejectUnauthorized:\s*false/.test(read('lib/server/mailer.ts')));
  /* Phase 2: the provider is now the send path. What must stay true is that
     there is still exactly ONE transport and one call into it. */
  const MAILER = read('lib/server/mailer.ts');
  const TRANSPORT = read('lib/server/smtp-transport.ts');
  check('the provider exposes a send method',
    PROVIDER.includes('send(message: MailMessage): Promise<MailSendResult>'));
  check('there is exactly one transporter call site',
    (PROVIDER.match(/transporter\.sendMail\(/g) ?? []).length === 1);
  check('sendTrackedMail delivers through the provider',
    MAILER.includes('await getMailProvider().send({')
    && !/transporter\.sendMail\(/.test(MAILER));
  check('only one SMTP transport exists',
    TRANSPORT.includes('nodemailer.createTransport(')
    && !PROVIDER.includes('nodemailer.createTransport')
    && !MAILER.includes('nodemailer.createTransport'));
  check('the pooled transport is preserved',
    TRANSPORT.includes('pool: true') && TRANSPORT.includes('maxConnections: 5'));
  check('the transport lives below both, so there is no import cycle',
    !TRANSPORT.includes("from '@/lib/server/mailer'")
    && !TRANSPORT.includes("from '@/lib/server/mail-provider'"));
  check('provider errors are not swallowed before classification',
    !PROVIDER.includes('.catch(() => null)'));
  check('a provider can be substituted for tests',
    PROVIDER.includes('export function setMailProviderForTesting'));

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
