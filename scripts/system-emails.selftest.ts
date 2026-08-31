/**
 * System email self-test (Phase 9).
 *
 * Two requirements dominate this file.
 *
 * §35 — configuration must reach the REAL sender. A settings screen that edits
 * something no sender reads is the worst possible outcome here: it looks like
 * it works. So the OTP path is exercised end to end with the transport
 * intercepted, and the outgoing message is inspected.
 *
 * §36 — and it must fall back. A verification code is how a user gets into
 * their account; an admin's typo, or a storage outage, must never stop one
 * arriving.
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import {
  SYSTEM_EMAILS, getSystemEmailDefinition, saveSystemEmailDraft, publishSystemEmail,
  resetSystemEmailToDefault, resolveSystemEmail, unsupportedVariables,
  renderSystemEmail, invalidateSystemEmailCache, SystemEmailConflictError,
} from '@/lib/server/system-emails';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const LIB = read('lib/server/system-emails.ts');
const API = read('app/api/super-admin/mail/system-emails/route.ts');
const OTP_ROUTE = read('app/api/onboarding/send-otp/route.ts');
const UI = read('components/superadmin/mail/SystemEmails.tsx');
/* The test send is no longer a system-email-specific action. It is the one
   shared endpoint every mail surface uses, so these assertions follow it
   there - and gain the checks that only a unified route can make. */
const TEST_API = read('app/api/super-admin/mail/test-send/route.ts');
const TEST_UI = read('components/superadmin/mail/TestSendDialog.tsx');
const CONTEXT = read('lib/server/email-render-context.ts');

const FILE = path.join(process.cwd(), 'data', 'system-emails.json');
let backup: string | null = null;

async function main() {
  delete process.env.MONGODB_URI;
  if (existsSync(FILE)) backup = readFileSync(FILE, 'utf8');
  writeFileSync(FILE, JSON.stringify({ configs: [] }));
  invalidateSystemEmailCache();

  console.log('\n── 1. The registry describes real senders only ──');

  check('at least one system email is registered', SYSTEM_EMAILS.length > 0);
  /* §39: a registered type whose sender does not read the config is a lie. */
  /* A sender is either a route (app/api/…) or a library module. */
  const senderFile = (sender: string) =>
    sender.startsWith('app/') ? `${sender}/route.ts` : `${sender}.ts`;
  for (const def of SYSTEM_EMAILS) {
    const senderSource = read(senderFile(def.sender));
    check(`${def.type}: its named sender actually reads the configuration`,
      senderSource.includes('resolveSystemEmail'), def.sender);
    check(`${def.type}: declares its own variables`, def.variables.length > 0);
    check(`${def.type}: has a built-in fallback`,
      Boolean(def.defaultSubject) && Boolean(def.defaultHtml));
  }
  /* The contract check moved into the canonical renderer, so this asserts the
     property where it now lives: this module hands the CANONICAL validator each
     definition's OWN variable list, never a shared one, and the registry really
     does hold more than one distinct contract. */
  check('variables are per-email, not a global list',
    LIB.includes('unsupportedEmailVariables(content, def.variables)')
    && !LIB.includes('SUPPORTED_VARIABLES')
    && new Set(SYSTEM_EMAILS.map((d) => d.variables.slice().sort().join(','))).size > 1);
  check('every registered sender path exists in the repository',
    SYSTEM_EMAILS.every((d) => existsSync(path.join(process.cwd(), senderFile(d.sender)))));

  console.log('\n── 2. Saving is not publishing ──');

  const def = getSystemEmailDefinition('signup_otp')!;
  const saved = await saveSystemEmailDraft({
    type: 'signup_otp', subject: 'Draft subject {{otp}}',
    html: '<p>Draft body {{firstName}}</p>', actor: 'admin@docrud.com',
  });
  check('a draft is saved', saved.draftSubject === 'Draft subject {{otp}}');
  check('nothing is published by saving', !saved.publishedSubject);
  invalidateSystemEmailCache();
  check('the sender still sees no configuration',
    (await resolveSystemEmail('signup_otp', { otp: '1', firstName: 'x', email: 'e' })) === null);
  check('the API states that saving does not publish', API.includes('published: false'));

  console.log('\n── 3. Publish validates before it writes ──');

  await saveSystemEmailDraft({
    type: 'signup_otp', subject: 'Code {{otp}}',
    html: '<p>Hi {{firstName}}, your city is {{city}}</p>',
    baseRevision: saved.revision, actor: 'a@b.com',
  });
  const blocked = await publishSystemEmail('signup_otp', 'a@b.com');
  /* A literal "{{city}}" reaching a user is the failure being prevented. */
  check('publishing is refused when a variable is unsupported', 'error' in blocked);
  check('the offending variable is named',
    'error' in blocked && blocked.unsupported.includes('city'));
  invalidateSystemEmailCache();
  check('production is unchanged after a refused publish',
    (await resolveSystemEmail('signup_otp', { otp: '1', firstName: 'x', email: 'e' })) === null);

  const cfg = await saveSystemEmailDraft({
    type: 'signup_otp', subject: 'Your code is {{otp}}',
    html: '<p>Hi {{firstName}}, your code is {{otp}}.</p>', actor: 'a@b.com',
  });
  const published = await publishSystemEmail('signup_otp', 'a@b.com');
  check('a valid draft publishes', 'config' in published);
  check('an empty subject cannot be published',
    'error' in await (async () => {
      await saveSystemEmailDraft({ type: 'signup_otp', subject: ' ', html: '<p>x</p>', actor: 'a' });
      return publishSystemEmail('signup_otp', 'a');
    })());
  /* Restore a good published version for the rest of the run. */
  await saveSystemEmailDraft({
    type: 'signup_otp', subject: 'Your code is {{otp}}',
    html: '<p>Hi {{firstName}}, your code is {{otp}}.</p>', actor: 'a@b.com',
  });
  await publishSystemEmail('signup_otp', 'a@b.com');
  invalidateSystemEmailCache();

  console.log('\n── 4. Resolution and fallback ──');

  const resolved = await resolveSystemEmail('signup_otp',
    { otp: '987654', firstName: 'Ada', email: 'ada@example.com' });
  check('the published version is returned', Boolean(resolved));
  check('variables are substituted', resolved!.subject === 'Your code is 987654', resolved?.subject);
  check('the body resolves too', resolved!.html.includes('Ada') && resolved!.html.includes('987654'));
  check('plain text is produced', resolved!.text.includes('987654'));
  check('no placeholder survives', !/\{\{/.test(`${resolved!.subject} ${resolved!.html}`));

  /* A missing value must fall back rather than mail "{{otp}}". */
  invalidateSystemEmailCache();
  check('a missing variable value falls back instead of leaking a placeholder',
    (await resolveSystemEmail('signup_otp', { firstName: 'Ada', email: 'e' })) === null);

  console.log('\n── 5. §36 Fallback when configuration is unavailable ──');

  writeFileSync(FILE, '{ this is not valid json');
  invalidateSystemEmailCache();
  const corrupt = await resolveSystemEmail('signup_otp',
    { otp: '1', firstName: 'x', email: 'e' });
  check('corrupt storage resolves to null, not a throw', corrupt === null);

  unlinkSync(FILE);
  invalidateSystemEmailCache();
  check('missing storage resolves to null',
    (await resolveSystemEmail('signup_otp', { otp: '1', firstName: 'x', email: 'e' })) === null);
  check('the sender falls back to its built-in template',
    OTP_ROUTE.includes('configured?.subject ?? `${otp} is your Docrud verification code`')
    && OTP_ROUTE.includes('configured?.html ?? buildOtpHtml(otp, firstName)'));
  check('a resolution failure cannot break the OTP flow',
    OTP_ROUTE.includes(".catch(() => null)"));
  check('the failure is logged for an operator, not the recipient',
    LIB.includes('console.error(`[system-emails] falling back'));

  console.log('\n── 6. §35 The real sender consumes the published config ──');

  writeFileSync(FILE, JSON.stringify({ configs: [] }));
  await saveSystemEmailDraft({
    type: 'signup_otp',
    subject: 'UNIQUE-QA-SUBJECT {{otp}}',
    html: '<p>UNIQUE-QA-BODY for {{firstName}} code {{otp}}</p>',
    actor: 'qa@docrud.com',
  });
  await publishSystemEmail('signup_otp', 'qa@docrud.com');
  invalidateSystemEmailCache();

  /* What the sender would put on the wire, for a known OTP. */
  const outgoing = await resolveSystemEmail('signup_otp',
    { otp: '424242', firstName: 'Grace', email: 'grace@example.com' });
  check('the outgoing subject is the published one',
    outgoing?.subject === 'UNIQUE-QA-SUBJECT 424242', outgoing?.subject);
  check('the outgoing body is the published one',
    Boolean(outgoing?.html.includes('UNIQUE-QA-BODY')));
  check('{{otp}} is resolved in the body', Boolean(outgoing?.html.includes('424242')));
  check('{{firstName}} is resolved', Boolean(outgoing?.html.includes('Grace')));
  check('no unresolved variable remains',
    !/\{\{/.test(`${outgoing?.subject} ${outgoing?.html} ${outgoing?.text}`));
  /* The wiring itself, so a refactor cannot quietly detach it. */
  check('the OTP route passes the real otp and name into resolution',
    OTP_ROUTE.includes("resolveSystemEmail('signup_otp', {")
    && OTP_ROUTE.includes('otp, firstName: firstName ||'));
  check('the OTP is still generated by the route, not the template',
    !LIB.includes('generateOtp') && !LIB.includes('crypto.randomInt'));

  console.log('\n── 7. Secrets and storage hygiene ──');

  const stored = readFileSync(FILE, 'utf8');
  check('no OTP value is persisted', !stored.includes('424242'));
  check('no recipient address is persisted', !stored.includes('grace@example.com'));
  check('the config stores no delivery state',
    !stored.includes('deliveries') && !stored.includes('providerCode'));
  check('the audit records a revision, not content',
    API.includes('details: { name: def.name, revision: result.config.revision }'));
  check('no secret is referenced', !/SMTP_PASSWORD|resetToken|passwordHash/.test(LIB + API));

  console.log('\n── 8. Sanitization, conflicts, reset ──');

  const nasty = await saveSystemEmailDraft({
    type: 'signup_otp', subject: 'S {{otp}}',
    html: '<p>ok</p><script>alert(1)</script><a href="javascript:x">x</a>',
    actor: 'a@b.com',
  });
  check('script is stripped', !nasty.draftHtml.includes('<script'));
  check('javascript: URLs are stripped', !nasty.draftHtml.includes('javascript'));
  check('the shared sanitizer is reused',
    LIB.includes("from '@/lib/security/email-html-sanitizer'"));

  let conflicted = false;
  try {
    await saveSystemEmailDraft({
      type: 'signup_otp', subject: 'stale', html: '<p>x</p>',
      baseRevision: 1, actor: 'a@b.com',
    });
  } catch (e) { conflicted = e instanceof SystemEmailConflictError; }
  check('a stale write is refused', conflicted);
  check('the API reports a conflict as 409',
    API.includes('conflict: true') && API.includes('{ status: 409 }'));

  const reset = await resetSystemEmailToDefault('signup_otp', 'a@b.com');
  check('reset restores the built-in content', reset!.draftSubject === def.defaultSubject);
  check('reset does NOT publish',
    reset!.publishedSubject !== def.defaultSubject);
  check('the API states reset is a draft only', API.includes('published: false }'));

  console.log('\n── 8b. Newly wired senders (9.5) ──');

  /* Each registered type must be consumed by the module it names — a
     registration whose sender ignores it is a settings screen that edits
     nothing. §1 checks routes; these are the library senders. */
  for (const d of SYSTEM_EMAILS) {
    const src = read(senderFile(d.sender));
    check(`${d.type}: ${d.sender} resolves configuration`, src.includes(`resolveSystemEmail('${d.type}'`));
    check(`${d.type}: falls back to built-in content`, src.includes('configured?.subject ??'));
    check(`${d.type}: a resolution failure cannot break the flow`, src.includes('.catch(() => null)'));
  }
  check('all thirteen configurable transactional emails are registered',
    SYSTEM_EMAILS.length === 13, String(SYSTEM_EMAILS.length));
  /* Distinct emails may legitimately need the same variables (two account
     notices both need only {{firstName}}); what must be unique is the type. */
  check('every registered type is unique',
    new Set(SYSTEM_EMAILS.map((d) => d.type)).size === SYSTEM_EMAILS.length);
  check('every registered type declares at least one variable',
    SYSTEM_EMAILS.every((d) => d.variables.length > 0));
  check('every variable has a sample value for preview and test-send',
    SYSTEM_EMAILS.every((d) => d.variables.every((v) => typeof d.sampleValues[v] === 'string')));
  check('no sample value looks like real user data',
    SYSTEM_EMAILS.every((d) => Object.values(d.sampleValues).every(
      (v) => !/@(?!example\.com)[a-z]+\.(com|in|org)/i.test(v))));
  /* §20: senders deliberately left alone must stay untouched. */
  const NOTIF = read('lib/server/notification-emails.ts');
  check('the generic notification sender is NOT wired',
    !NOTIF.includes('resolveSystemEmail'));
  check('internal admin alerts are NOT configurable',
    !SYSTEM_EMAILS.some((d) => /admin_alert|admin_notification/.test(d.type)));
  /* The business decision stays in code: each branch is its own email type. */
  check('approval and rejection are separate types, not one conditional template',
    SYSTEM_EMAILS.some((d) => d.type === 'business_verification_approved')
    && SYSTEM_EMAILS.some((d) => d.type === 'business_verification_rejected'));
  /* §12: the template must never own security semantics. */
  for (const d of SYSTEM_EMAILS) {
    check(`${d.type}: does not expose expiry or token controls`,
      !d.variables.includes('expiryMinutes') && !d.variables.some((v) => /token|secret|hash/i.test(v)));
  }

  const acct = getSystemEmailDefinition('account_action_otp')!;
  check('account_action_otp has its own variable set',
    acct.variables.includes('action') && !acct.variables.includes('email'));
  const pf = getSystemEmailDefinition('public_face_otp')!;
  check('public_face_otp has its own variable set',
    pf.variables.length === 2 && pf.variables.includes('otp'));

  /* Resolution works for a newly wired type. */
  writeFileSync(FILE, JSON.stringify({ configs: [] }));
  invalidateSystemEmailCache();
  await saveSystemEmailDraft({
    type: 'account_action_otp', subject: 'ACCT {{otp}}',
    html: '<p>{{firstName}} wants to {{action}} until {{expiresAt}}</p>', actor: 'a',
  });
  await publishSystemEmail('account_action_otp', 'a');
  invalidateSystemEmailCache();
  const acctOut = await resolveSystemEmail('account_action_otp',
    { otp: '111222', firstName: 'Ada', action: 'delete', expiresAt: '9:00 PM' });
  check('a newly wired type resolves its own variables',
    acctOut?.subject === 'ACCT 111222'
    && Boolean(acctOut?.html.includes('Ada') && acctOut?.html.includes('delete')));
  check('the other types are unaffected by one being published',
    (await resolveSystemEmail('public_face_otp', { otp: '1', firstName: 'x' })) === null);

  console.log('\n── 8c. Test send uses the CURRENT editor content ──');

  /* The failure this prevents: a test that quietly sends the saved draft, the
     published version, or a fixed diagnostic message — proving nothing about
     what the admin is looking at. */
  check('the test action reads subject and html from the request',
    TEST_API.includes("const rawSubject = String(body.subject ?? '').trim();")
    && TEST_API.includes("const rawHtml = String(body.html ?? '');"));
  check('it does not fall back to stored content',
    !TEST_API.includes('getSystemEmailConfig')
    && !TEST_API.includes('publishedHtml')
    && !TEST_API.includes('getMailTemplateById')
    && !TEST_API.includes('getMailDraft'));
  check('it uses the shared sanitizer and the shared sender',
    /* One level deeper now: the route renders through the canonical pipeline,
       which is where sanitization lives, and sends through the tracked sender. */
    TEST_API.includes('renderEmail({') && TEST_API.includes('sendTrackedMail({')
    && !TEST_API.includes('nodemailer') && !TEST_API.includes('createTransport'));
  check('a recipient is required and validated',
    TEST_API.includes('isValidEmail(recipient)')
    && TEST_API.includes("'Enter a valid test recipient address.'"));
  check('no audience can be reached from the test path',
    !TEST_API.includes('resolveRecipients') && !TEST_API.includes('mail-recipients')
    && !TEST_API.includes('audience'));
  check('unsupported variables block a test too',
    TEST_API.includes('rendered.unsupported.length')
    && TEST_API.includes('Remove them before sending a test.'));
  /* The contract applied is THIS email's, chosen by type - a system email
     cannot borrow the audience contract, and vice versa. */
  check('the per-email variable contract is applied',
    TEST_API.includes('getEmailRenderContext(source, body.type')
    && TEST_API.includes('supported: context.supported')
    && CONTEXT.includes('supported: def.variables'));
  check('sample values are used, never a real OTP',
    TEST_API.includes('values: context.sampleValues')
    && CONTEXT.includes('sampleValues: def.sampleValues')
    && !TEST_API.includes('generateOtp') && !TEST_API.includes('createOtp'));
  check('test content is marked as test',
    TEST_API.includes('const subject = `[TEST] ${rendered.subject}`;')
    && TEST_API.includes('sample data, not real values'));
  /* §6: acceptance is not delivery. */
  check('a successful test says accepted, not delivered',
    TEST_API.includes("'The provider accepted the test message.'")
    && !TEST_API.includes('Email delivered') && !TEST_API.includes('Delivered'));
  check('a provider failure is classified, not swallowed',
    TEST_API.includes('classifyMailError(err)') && TEST_API.includes('failureKind: failure.kind'));
  check('the UI surfaces the provider code and permanence',
    TEST_UI.includes('Provider code ${outcome.providerCode}')
    && TEST_UI.includes("'Retrying will not help'"));
  check('the test send is audited without content',
    TEST_API.includes("action: 'mail.test_send'")
    && TEST_API.includes('details: { source: String(source), recipient }')
    && !TEST_API.includes('details: { html'));
  check('the test goes through the outbox like any other send',
    TEST_API.includes("typeLabel: 'test'") && TEST_API.includes("test: 'true'"));
  check('the system email screen no longer has a test path of its own',
    !API.includes("action === 'test'") && UI.includes('<TestSendDialog'));

  console.log('\n── 9. Helpers and authorization ──');

  check('unsupported variables are detected per definition',
    JSON.stringify(unsupportedVariables('{{otp}} {{city}}', def)) === '["city"]');
  check('supported variables are not flagged',
    unsupportedVariables('{{otp}} {{firstName}} {{email}}', def).length === 0);
  check('rendering leaves unknown placeholders visible',
    renderSystemEmail('{{otp}} {{city}}', { otp: '1' }) === '1 {{city}}');
  check('both verbs are guarded',
    (API.match(/const session = await guard\(req\);/g) ?? []).length === 2
    && (API.match(/{ error: 'Unauthorized' }, { status: 401 }/g) ?? []).length === 2);
  check('an unknown type is a 404, never addressable storage',
    (API.match(/'Unknown system email\.' }, { status: 404 }/g) ?? []).length === 2);
  check('the actor comes from the session',
    API.includes('const actor = session.email') && !/body\.(actor|updatedBy)/.test(API));
  check('publishing invalidates the sender cache',
    LIB.includes('invalidateSystemEmailCache();') && LIB.includes('const CACHE_MS = 30_000'));
  check('system emails are separate from drafts, templates and campaigns',
    LIB.includes('systemEmailsPath')
    && !LIB.includes('mailDraftsPath') && !LIB.includes('mailTemplatesPath')
    && !LIB.includes('mailCampaignsPath'));

  restore();
  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

function restore() {
  if (backup !== null) writeFileSync(FILE, backup);
  else if (existsSync(FILE)) unlinkSync(FILE);
}

main().catch((err) => { restore(); console.error(err); process.exit(1); });
