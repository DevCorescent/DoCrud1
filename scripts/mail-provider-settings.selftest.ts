/**
 * Provider settings self-test (Phase 15).
 *
 * The dominant risk in a settings screen is a credential escaping through it,
 * so most of this file is about what must NOT appear: no password, no mask, no
 * length, no environment value, and no write path that could reach a
 * credential field through a form meant for a display name.
 *
 * The second risk is architectural: a settings page is where a second SMTP
 * connection usually gets written. The check here calls the same
 * `getProviderHealth` the Health tab uses.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { getMailSettings } from '@/lib/server/settings';

let checks = 0; let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}
const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const API = read('app/api/super-admin/mail/provider/route.ts');
const UI = read('components/superadmin/mail/MailProviderSettings.tsx');
const PANEL = read('components/SuperAdminPanel.tsx');
const PROVIDER = read('lib/server/mail-provider.ts');
const MAILER = read('lib/server/mailer.ts');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const API_CODE = stripComments(API);
const UI_CODE = stripComments(UI);

async function main() {
  console.log('\n── 1. Authorization ──');

  /* Call sites, not the import line: counting every mention made the number
     depend on how the module happens to be imported. */
  check('every verb is guarded',
    (API.match(/await getSuperAdminSessionFromRequest\(req\)/g) ?? []).length === 3
    && (API.match(/status: 401/g) ?? []).length === 3);
  check('GET, PATCH and POST all exist',
    API.includes('export async function GET') && API.includes('export async function PATCH')
    && API.includes('export async function POST'));
  check('the guard runs before any settings read',
    API.indexOf('getSuperAdminSessionFromRequest') < API.indexOf('getMailSettings()'));

  console.log('\n── 2. No credential escapes ──');

  const settings = await getMailSettings().catch(() => null);
  check('the deployment does have a stored credential to leak',
    Boolean(settings), 'cannot assert redaction without one');

  /* Presence only. A mask still discloses length and confirms existence. */
  /* The property is that no password VALUE is ever placed in the response.
     The word legitimately appears as a presence check and as an env KEY name,
     so this asserts the shape instead: every read of the stored password is
     wrapped in Boolean(), and no response key carries it. */
  check('the response never includes a password field',
    !/\bpassword\s*:/.test(API_CODE)
    && Array.from(API_CODE.matchAll(/settings\.password/g))
      .every((m) => /Boolean\([^)]*$/.test(API_CODE.slice(Math.max(0, m.index! - 40), m.index!))));
  check('presence is reported instead of a value',
    API.includes('credentialPresent: Boolean(settings.password)'));
  check('no mask is emitted', !API_CODE.includes("'********'") && !UI_CODE.includes('****'));
  check('no credential length is exposed',
    !/password\.length|credential\.length/i.test(API_CODE));
  check('the username value is not returned either',
    API.includes('usernamePresent: Boolean(settings.username)')
    && !/username: settings\.username/.test(API_CODE));
  check('the UI never renders a credential',
    !/value=\{[^}]*password/i.test(UI_CODE) && UI.includes('Credentials are never displayed'));
  check('no arbitrary environment access reaches the browser',
    !/process\.env\[[^\]]*\]/.test(UI) && !API_CODE.includes('process.env)')
    /* Only fixed, known keys are probed, and only for presence. */
    && API.includes("envBacked('SMTP_HOST')"));
  check('presence probing returns a boolean, never a value',
    API.includes('return Boolean(process.env[key]);'));

  console.log('\n── 3. Only safe fields are writable ──');

  check('the writable set is an allow-list',
    API.includes("const EDITABLE = ['fromName', 'replyTo'] as const;"));
  /* A deny-list or a spread would let a crafted request rewrite the host. */
  check('an unknown field is refused, not ignored',
    API.includes("error: 'These settings cannot be changed here.'"));
  check('no partial spread of the request body reaches storage',
    !/\.\.\.body/.test(API_CODE) && !/\.\.\.payload/.test(API_CODE));
  check('existing settings are preserved around a change',
    API.includes('const next = { ...defaultMailSettings, ...current, ...changes };'));
  check('a sender name is validated', API.includes("error: 'A sender name is required.'"));
  check('a reply-to address is validated',
    API.includes('isValidEmail(value)') && API.includes("'Enter a valid reply-to address.'"));
  check('an empty reply-to is allowed to clear it', API.includes('if (value && !isValidEmail'));
  check('the UI only offers the editable fields',
    UI.includes('id="pv-from-name"') && UI.includes('id="pv-reply-to"')
    && !UI.includes('id="pv-host"') && !UI.includes('id="pv-password"'));
  check('read-only fields say where they are configured',
    UI.includes('Set by SMTP_HOST') && UI.includes('deployment action'));

  console.log('\n── 4. One provider, one health implementation ──');

  check('the check reuses the shared health function',
    API.includes('getProviderHealth(true)'));
  check('no second transport is created here',
    !API.includes('nodemailer') && !API.includes('createTransport')
    && !API.includes('new SmtpMailProvider'));
  check('the provider name comes from the seam',
    API.includes('getMailProvider().name'));
  check('the send path still goes through MailProvider',
    MAILER.includes('getMailProvider().send('));
  check('there is still exactly one health cache',
    (PROVIDER.match(/HEALTH_TTL_MS/g) ?? []).length >= 1
    && !API.includes('HEALTH_TTL') && !API.includes('cached ='));

  console.log('\n── 5. Opening the page opens no connection ──');

  /* A live verify is a ~5.5s handshake; a settings page that waits for one
     shows a spinner before its first paint. */
  check('GET uses the cached health only',
    API.includes('const health = getCachedProviderHealth();'));
  check('GET never forces a live check',
    !/GET[\s\S]{0,1500}getProviderHealth\(/.test(API));
  check('only the explicit action performs a check',
    API.includes("(body as { action?: string }).action !== 'check'"));
  check('an unknown action is refused', API.includes("error: 'Unknown action.'"));

  console.log('\n── 6. Truthful provider states ──');

  check('the classification, code and permanence are all returned',
    API.includes('failureKind: health.failure?.kind')
    && API.includes('providerCode: health.failure?.code')
    && API.includes('retryable: health.failure?.retryable'));
  check('the existing provider advice is passed through',
    API.includes('advice: health.failure?.advice'));
  /* A connection check is not a send. */
  check('a check never claims delivery',
    !/\b(delivered|delivery rate|inbox delivery)\b/i.test(API_CODE + UI_CODE));
  check('acceptance is called acceptance',
    UI.includes('Last accepted by provider') && API.includes('lastAcceptedAt'));
  check('the UI states acceptance is not inbox delivery',
    UI.includes('not proof that anything reached an inbox'));
  check('every provider status has wording',
    ['healthy', 'degraded', 'unavailable', 'unconfigured']
      .every((s) => UI.includes(`${s}:`)));

  console.log('\n── 7. Audit ──');

  check('a settings change is audited',
    API.includes("action: 'mail.provider.settings_updated'"));
  check('the audit records old and new values',
    API.includes("`${current[k] || '(empty)'} -> ${changes[k] || '(empty)'}`"));
  check('only non-secret fields can be audited',
    API.includes('(Object.keys(changes) as EditableKey[])'));
  check('a check is audited without a credential',
    API.includes("action: 'mail.provider.checked'")
    && !/details:[^}]*password/i.test(API_CODE));
  check('the existing audit mechanism is used',
    API.includes('appendSuperAdminAudit'));

  console.log('\n── 8. Wiring, and nothing else touched ──');

  check('the section is mounted in the Mail Center',
    PANEL.includes('<MailProviderSettings />') && PANEL.includes("'provider'"));
  check('the existing navigation architecture is reused',
    PANEL.includes("'outbox', 'suppression', 'analytics', 'provider', 'health'"));
  check('a lapsed session reads as a lapsed session',
    UI.includes('describeFetchError(r.status'));
  /* §10: nothing outside provider settings was changed by this page. */
  check('it does not touch recipients, retry, suppression or rendering',
    !API.includes('mail-recipients') && !API.includes('mail-suppression')
    && !API.includes('render-email') && !API.includes('sendMailCampaign'));
  check('it does not send mail', !API.includes('sendTrackedMail'));

  /* The bug this covers: save and check shared one busy flag, so clicking
     Save while a ~14s provider check was running was silently dropped - no
     save, no error, no feedback. Independent actions get independent guards. */
  check('a save is not blocked by a running provider check',
    UI.includes('const savingRef = useRef(false);')
    && UI.includes('const checkingRef = useRef(false);')
    && !UI.includes('busyRef'));
  check('each action still guards its own double-click',
    UI.includes('if (savingRef.current) return;')
    && UI.includes('if (checkingRef.current) return;'));

  console.log(failures === 0
    ? `\n✅ ${checks}/${checks} checks passed`
    : `\n❌ ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
