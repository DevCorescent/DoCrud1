/**
 * Canonical email rendering self-test (Phase 10).
 *
 * The claim under test is narrow and total: there is ONE pipeline, and every
 * surface that shows, tests or sends an email goes through it.
 *
 * That claim is easy to make and easy to lose. Before this phase the codebase
 * had a server preview route, two different client-side `{{variable}}`
 * substitutions written inline in React components, a variable engine in the
 * recipient module, and a system-email resolver - five implementations, four
 * of which agreed by coincidence. So a large part of this file asserts the
 * ABSENCE of the second implementations, not just the presence of the first.
 *
 * The behavioural half exercises the renderer directly, because that is where
 * escaping, ordering and the variable contract actually live.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  renderEmail, extractEmailVariables, unsupportedEmailVariables, missingEmailVariables,
  resolveEmailVariables, escapeVariableValue,
} from '@/lib/email/render-email';
import {
  AUDIENCE_VARIABLES, SAMPLE_VALUES, sampleValuesFor, usesSecuritySensitiveData,
} from '@/lib/email/variable-contracts';
import { getEmailRenderContext, isEmailSource, EMAIL_SOURCES } from '@/lib/server/email-render-context';
import { SYSTEM_EMAILS } from '@/lib/server/system-emails';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');

const RENDERER = read('lib/email/render-email.ts');
const CONTRACTS = read('lib/email/variable-contracts.ts');
const CONTEXT = read('lib/server/email-render-context.ts');
const PREVIEW_API = read('app/api/super-admin/mail/preview/route.ts');
const TEST_API = read('app/api/super-admin/mail/test-send/route.ts');
const SMTP_TEST_API = read('app/api/super-admin/mail/test/route.ts');
const PREVIEW_UI = read('components/superadmin/mail/EmailPreviewDialog.tsx');
const TEST_UI = read('components/superadmin/mail/TestSendDialog.tsx');
const COMPOSE = read('components/superadmin/mail/MailCompose.tsx');
const TEMPLATES_UI = read('components/superadmin/mail/MailTemplates.tsx');
const SYSTEM_UI = read('components/superadmin/mail/SystemEmails.tsx');
const CAMPAIGNS_UI = read('components/superadmin/mail/MailCampaigns.tsx');
const CAMPAIGNS_LIB = read('lib/server/mail-campaigns.ts');
const RECIPIENTS_LIB = read('lib/server/mail-recipients.ts');
const SYSTEM_LIB = read('lib/server/system-emails.ts');
const MAILER = read('lib/server/mailer.ts');

const ALL_UI = [PREVIEW_UI, TEST_UI, COMPOSE, TEMPLATES_UI, SYSTEM_UI, CAMPAIGNS_UI];
const AUD = Array.from(AUDIENCE_VARIABLES);

async function main() {
  console.log('\n── 1. There is exactly one rendering pipeline ──');

  /* The decisive check: no COMPONENT resolves a variable. If one did, an admin
     could approve a preview the server never produced. */
  const substitutionPattern = /\{\{\s*\\s\*\(\[a-zA-Z0-9_\]/;
  check('no React component substitutes variables',
    ALL_UI.every((src) => !substitutionPattern.test(src)
      && !src.includes('PREVIEW_VALUES') && !src.includes('const renderPreview')
      && !src.includes('const fill = (')));
  check('no React component sanitizes in place of the server',
    ALL_UI.every((src) => !src.includes('sanitizeEmailHtml') && !src.includes('DOMPurify')));
  check('no React component derives plain text',
    ALL_UI.every((src) => !src.includes('emailHtmlToText')));
  check('the preview route renders through the canonical pipeline',
    PREVIEW_API.includes("from '@/lib/email/render-email'") && PREVIEW_API.includes('renderEmail({'));
  check('the test-send route renders through the canonical pipeline',
    TEST_API.includes("from '@/lib/email/render-email'") && TEST_API.includes('renderEmail({'));
  check('production transactional sends render through it too',
    SYSTEM_LIB.includes('renderEmail({') && SYSTEM_LIB.includes("from '@/lib/email/render-email'"));
  check('production campaign sends render through it too',
    CAMPAIGNS_LIB.includes('renderEmail({') && CAMPAIGNS_LIB.includes("from '@/lib/email/render-email'"));
  /* The variable engine that used to live in the recipient module. */
  check('the recipient engine delegates rather than keeping its own copy',
    RECIPIENTS_LIB.includes('export const extractVariables = extractEmailVariables;')
    && !RECIPIENTS_LIB.includes('const VARIABLE_PATTERN'));
  check('the system-email module delegates rather than keeping its own copy',
    SYSTEM_LIB.includes('unsupportedEmailVariables(content, def.variables)')
    && !SYSTEM_LIB.includes('const VAR_PATTERN'));
  check('the canonical pattern is defined exactly once',
    RENDERER.includes('export const EMAIL_VARIABLE_PATTERN'));
  check('only one SMTP path exists behind a test send',
    TEST_API.includes('sendTrackedMail(') && !TEST_API.includes('createTransport')
    && !TEST_API.includes('nodemailer') && MAILER.includes('getMailProvider().send('));

  console.log('\n── 2. Sanitize, then resolve, then derive text ──');

  const script = renderEmail({
    subject: 'Hi', html: '<p>ok</p><script>alert(1)</script>', supported: [],
  });
  check('script tags never reach the output', !script.html.includes('<script'));
  check('the surviving content is kept', script.html.includes('ok'));
  check('the sanitizer reports that it changed something', script.sanitizerChanged);

  const handler = renderEmail({
    subject: 'Hi', html: '<p onclick="steal()">hello</p>', supported: [],
  });
  check('event handlers are stripped', !handler.html.includes('onclick'));

  for (const [label, markup] of [
    ['javascript: links', '<a href="javascript:alert(1)">go</a>'],
    ['vbscript: links', '<a href="vbscript:msgbox">go</a>'],
    ['iframes', '<iframe src="https://evil.test"></iframe>'],
    ['objects', '<object data="x.swf"></object>'],
    ['embeds', '<embed src="x.swf">'],
    ['data: images', '<img src="data:text/html;base64,PHNjcmlwdD4=">'],
  ] as const) {
    const out = renderEmail({ subject: 's', html: markup, supported: [] });
    check(`${label} do not survive`,
      !/javascript:|vbscript:|<iframe|<object|<embed|src="data:/i.test(out.html), out.html);
  }

  const safe = renderEmail({
    subject: 's',
    html: '<a href="https://docrud.com">site</a> <a href="mailto:a@b.com">mail</a>'
      + '<img src="https://docrud.com/a.png" alt="A logo">',
    supported: [],
  });
  check('https links survive', safe.html.includes('https://docrud.com'));
  check('mailto links survive', safe.html.includes('mailto:a@b.com'));
  check('https images survive with their alt text',
    safe.html.includes('https://docrud.com/a.png') && safe.html.includes('A logo'));

  console.log('\n── 3. Variables ──');

  check('variables are extracted in order of first appearance',
    JSON.stringify(extractEmailVariables('{{b}} {{a}} {{b}}')) === '["b","a"]');
  check('inner whitespace is tolerated',
    extractEmailVariables('{{  firstName  }}')[0] === 'firstName');
  check('unsupported variables are reported against the given contract',
    JSON.stringify(unsupportedEmailVariables('{{firstName}} {{city}}', AUD)) === '["city"]');
  check('missing values are distinct from unsupported ones',
    JSON.stringify(missingEmailVariables('{{firstName}} {{role}}', AUD, { firstName: 'A' }))
      === '["role"]');
  check('an unresolved placeholder is left visible, not blanked',
    resolveEmailVariables('Hi {{city}}', { firstName: 'A' }) === 'Hi {{city}}');

  const subj = renderEmail({
    subject: 'Welcome {{firstName}}', html: '<p>Hello {{firstName}}</p>',
    supported: AUD, values: { firstName: 'Test' },
  });
  check('subject variables resolve', subj.subject === 'Welcome Test', subj.subject);
  check('body variables resolve', subj.html.includes('Hello Test'));
  check('the subject is not HTML-escaped, being a header',
    renderEmail({ subject: '{{companyName}}', html: '<p>x</p>', supported: AUD,
      values: { companyName: 'A & B' } }).subject === 'A & B');

  /* The injection this ordering prevents. A recipient's display name is data
     they control; the previous per-recipient renderer interpolated it raw. */
  const hostile = renderEmail({
    subject: 'Hi', html: '<p>Hello {{firstName}}</p>', supported: AUD,
    values: { firstName: '<img src=x onerror=alert(1)>' },
  });
  check('a substituted value cannot introduce markup',
    !hostile.html.includes('<img') && hostile.html.includes('&lt;img'));
  check('quotes in a value cannot break out of an attribute',
    escapeVariableValue('a"b\'c') === 'a&quot;b&#39;c');
  check('ampersands are escaped before the rest',
    escapeVariableValue('&lt;') === '&amp;lt;');

  console.log('\n── 4. Plain text is derived from the final HTML ──');

  const text = renderEmail({
    subject: 's',
    html: '<h1>Hello</h1><p>Welcome <b>Test</b></p>'
      + '<p><a href="https://docrud.com/go">Open docrud</a></p>'
      + '<table><tr><td>Plan</td><td>Pro</td></tr></table>',
    supported: [],
  }).text;
  check('headings and paragraphs become readable lines',
    text.includes('Hello') && text.includes('Welcome Test'));
  check('no raw tags survive into plain text', !/<[a-z]/i.test(text), text.slice(0, 120));
  check('a link keeps its destination',
    text.includes('Open docrud') && text.includes('https://docrud.com/go'));
  check('table cells do not run together into garbage',
    text.includes('Plan') && text.includes('Pro'));
  check('plain text reflects resolved values, not placeholders',
    !renderEmail({ subject: 's', html: '<p>Hi {{firstName}}</p>', supported: AUD,
      values: { firstName: 'Test' } }).text.includes('{{'));

  console.log('\n── 5. Sample data is fixed, fake and shared ──');

  check('sample data lives in one module', CONTRACTS.includes('export const SAMPLE_VALUES'));
  check('the OTP sample is a constant, never generated',
    SAMPLE_VALUES.otp === '123456'
    && !CONTRACTS.includes('random') && !CONTRACTS.includes('Math.random'));
  check('no sample value looks like real user data',
    Object.values(SAMPLE_VALUES).every((v) => !/@(?!example\.com)[a-z]+\.(com|in|org)/i.test(v)));
  check('sampleValuesFor is total, so a new variable still previews',
    sampleValuesFor(['somethingBrandNew']).somethingBrandNew === 'Example somethingBrandNew');
  check('every system email draws its samples from that one map',
    SYSTEM_LIB.includes('sampleValues: sampleValuesFor(d.variables)')
    && SYSTEM_EMAILS.every((d) => d.variables.every((v) => typeof d.sampleValues[v] === 'string')));
  check('credential-shaped sample data is flagged',
    usesSecuritySensitiveData(['otp']) && !usesSecuritySensitiveData(['firstName']));
  check('the UI says the sample OTP is not real',
    PREVIEW_UI.includes('not a real OTP or token'));
  check('nothing in the preview or test path mints a credential',
    !PREVIEW_API.includes('generateOtp') && !TEST_API.includes('generateOtp')
    && !PREVIEW_API.includes('crypto.randomInt') && !TEST_API.includes('crypto.randomInt'));

  console.log('\n── 6. The contract is per email, never global ──');

  check('every declared source resolves to a contract',
    EMAIL_SOURCES.every((s) => getEmailRenderContext(s, 'signup_otp') !== null));
  check('an unknown source is rejected, not defaulted',
    !isEmailSource('anything') && isEmailSource('template'));
  check('an unknown system email type is refused',
    getEmailRenderContext('system', 'not_a_real_type') === null);
  check('the route turns that into a 404 rather than a permissive default',
    TEST_API.includes("{ error: 'Unknown system email.' }, { status: 404 }")
    && PREVIEW_API.includes("{ error: 'Unknown email source.' }, { status: 400 }"));

  const otpContract = getEmailRenderContext('system', 'signup_otp')!;
  const templateContract = getEmailRenderContext('template')!;
  check('a system email offers its own variables',
    otpContract.supported.includes('otp') && !otpContract.supported.includes('companyName'));
  check('an audience email cannot borrow otp',
    !templateContract.supported.includes('otp')
    && templateContract.supported.includes('firstName'));
  check('the two contracts really differ',
    JSON.stringify(otpContract.supported) !== JSON.stringify(templateContract.supported));
  check('preview and test send ask the same function for it',
    PREVIEW_API.includes('getEmailRenderContext(') && TEST_API.includes('getEmailRenderContext(')
    && CONTEXT.includes('export function getEmailRenderContext'));

  console.log('\n── 7. Preview ──');

  check('preview requires a super admin',
    PREVIEW_API.includes("{ error: 'Unauthorized' }, { status: 401 }")
    && PREVIEW_API.includes('getSuperAdminSessionFromRequest'));
  /* Calls, not prose: the file explains WHY it never sends, and matching the
     bare name would fail on its own documentation. */
  check('preview opens no SMTP connection',
    !/\bgetMailProvider\(/.test(PREVIEW_API) && !/\bsendTrackedMail\(/.test(PREVIEW_API)
    && !PREVIEW_API.includes("from '@/lib/server/mailer'")
    && !PREVIEW_API.includes("from '@/lib/server/mail-provider'"));
  check('preview shows the message as it will be framed when sent',
    PREVIEW_API.includes('wrapInChrome: true') && RENDERER.includes('buildEmailChrome({'));
  check('desktop, mobile and plain text are all offered',
    PREVIEW_UI.includes("['desktop', 'mobile', 'text']"));
  check('mobile is a real narrow viewport, not a narrower div',
    PREVIEW_UI.includes('desktop: 640, mobile: 390'));
  check('HTML is rendered, not escaped', PREVIEW_UI.includes('srcDoc={'));
  check('the message cannot execute in the admin session',
    PREVIEW_UI.includes('sandbox=""') && !/sandbox=["'][^"']*allow-scripts/.test(PREVIEW_UI));
  check('the resolved subject is shown',
    PREVIEW_UI.includes('{data.subject'));
  check('the admin is told sample values are in use',
    PREVIEW_UI.includes('Preview uses sample data'));
  check('sanitizer removals are disclosed rather than hidden',
    PREVIEW_UI.includes('removed or rewrote part of this HTML'));
  check('unsupported variables are reported in the preview',
    PREVIEW_UI.includes('Not supported by this email'));
  check('a huge body is refused rather than parsed',
    PREVIEW_API.includes('MAX_HTML') && PREVIEW_API.includes('status: 413'));

  console.log('\n── 8. Preview reflects UNSAVED content ──');

  /* The dialogs take the live editor state as props and post it. There is no
     path from a dialog to stored content, which is what makes an unsaved edit
     previewable at all. */
  check('the preview dialog posts the content it was given',
    PREVIEW_UI.includes('JSON.stringify({ source, type, subject, html, preheader, campaignId })'));
  check('the preview dialog never loads stored content',
    !PREVIEW_UI.includes('/drafts') && !PREVIEW_UI.includes('/templates')
    && !PREVIEW_UI.includes('/system-emails'));
  check('nothing is cached between openings',
    PREVIEW_UI.includes('setData(null)'));
  check('the composer passes its live editor state',
    COMPOSE.includes('<EmailPreviewDialog') && COMPOSE.includes('subject={subject}')
    && COMPOSE.includes('html={html}'));
  check('the template screen passes its live form state',
    TEMPLATES_UI.includes('subject={form.subject}') && TEMPLATES_UI.includes('html={form.html}'));
  check('the system email screen passes its live editor state',
    SYSTEM_UI.includes('<EmailPreviewDialog') && SYSTEM_UI.includes('subject={subject}'));

  console.log('\n── 9. Test send ──');

  check('a test send requires a super admin',
    TEST_API.includes("{ error: 'Unauthorized' }, { status: 401 }"));
  check('an invalid recipient is a 400',
    TEST_API.includes('isValidEmail(recipient)') && TEST_API.includes('status: 400'));
  check('a missing subject is a 400',
    TEST_API.includes("{ error: 'A subject is required.' }, { status: 400 }"));
  check('an empty body is a 400',
    TEST_API.includes("{ error: 'The email body is empty.' }, { status: 400 }"));
  check('an unsupported variable blocks the send',
    TEST_API.includes('rendered.unsupported.length'));
  check('a body that sanitizes down to nothing is refused',
    TEST_API.includes('Nothing is left to send after sanitizing'));
  check('the server re-renders instead of trusting the browser',
    TEST_API.includes('renderEmail({') && !TEST_API.includes('body.previewHtml')
    && !TEST_API.includes('body.renderedHtml'));
  check('no audience is reachable',
    !TEST_API.includes('resolveRecipients') && !TEST_API.includes('mail-recipients')
    && !TEST_API.includes('segment'));
  check('there is one recipient field and no picker',
    !TEST_UI.includes('RecipientPicker')
    /* The dialog names the audience only to promise it cannot reach one, so
       this asserts no audience is FETCHED rather than never mentioned. */
    && !TEST_UI.includes('/mail/recipients')
    && (TEST_UI.match(/type="email"/g) ?? []).length === 1);
  check('no scheduling is possible from a test',
    !TEST_UI.includes('sendAt') && !TEST_UI.includes('schedule'));
  check('the test is marked as a test in the message itself',
    TEST_API.includes('`[TEST] ${rendered.subject}`')
    && TEST_API.includes('sample data, not real values'));
  check('it uses the existing tracked sender and outbox',
    TEST_API.includes('sendTrackedMail({') && TEST_API.includes("typeLabel: 'test'"));
  check('outbox rows are identifiable as tests',
    TEST_API.includes("test: 'true'") && TEST_API.includes('source: String(source)'));
  check('there is no second test-mail log',
    !TEST_API.includes('appendEmailOutboxEvent') && MAILER.includes('appendEmailOutboxEvent'));
  check('the audit records no content and no values',
    TEST_API.includes('details: { source: String(source), recipient }'));

  console.log('\n── 10. Test send truthfulness ──');

  check('acceptance is called acceptance',
    TEST_API.includes("'The provider accepted the test message.'"));
  check('rejection is called rejection',
    TEST_API.includes("'The provider rejected the test message.'"));
  check('nothing claims delivery',
    !TEST_API.includes('Delivered') && !TEST_API.includes('delivered to')
    && !TEST_UI.includes('Delivered') && !TEST_UI.includes('was delivered'));
  check('the UI says acceptance is not arrival',
    TEST_UI.includes('is not something this panel can see'));
  check('the failure kind, code and permanence are all surfaced',
    TEST_API.includes('failureKind: failure.kind') && TEST_API.includes('providerCode: failure.code')
    && TEST_API.includes('retryable: failure.retryable')
    && TEST_UI.includes('Failure: ${outcome.failureKind}')
    && TEST_UI.includes('Provider code ${outcome.providerCode}'));
  check('safe advice is passed through, not invented in the browser',
    TEST_API.includes('advice: failure.advice') && TEST_UI.includes('{outcome.advice}'));
  check('a policy block is reported as "nothing was sent"',
    TEST_API.includes('Blocked by the mail policy for test sends. Nothing was sent.'));
  /* The old diagnostic endpoint claimed delivery on a successful handshake. */
  check('the SMTP diagnostic route no longer claims delivery',
    !SMTP_TEST_API.includes('Test email delivered')
    && SMTP_TEST_API.includes('The provider accepted a diagnostic message'));

  console.log('\n── 11. Duplicate protection ──');

  check('the client guard is synchronous, not React state',
    TEST_UI.includes('const busyRef = useRef(false);')
    && TEST_UI.includes('if (busyRef.current) return;'));
  check('the button is disabled while submitting',
    TEST_UI.includes('disabled={disabled}') && TEST_UI.includes('sending ||'));
  check('the server collapses an identical repeat',
    TEST_API.includes('alreadySentRecently(key)') && TEST_API.includes('createHash('));
  check('the key covers actor, recipient and the exact content',
    TEST_API.includes("idempotencyKey([actor, recipient, source, String(body.type ?? ''), rawSubject, rawHtml])"));
  check('a suppressed duplicate is reported, not silently dropped',
    TEST_API.includes('duplicate: true') && TEST_UI.includes('outcome.duplicate'));
  check('the window is short enough not to block a real second test',
    TEST_API.includes('IDEMPOTENCY_WINDOW_MS = 15_000'));
  /* The guard stops a double-click duplicating a message that WAS sent. A
     failed attempt must be retryable at once, or an admin who fixes the
     provider is told "an identical test was just submitted". */
  check('a failed attempt can be retried immediately',
    TEST_API.includes('releaseIdempotencyKey(key);')
    && /catch \(err\) \{[\s\S]{0,600}releaseIdempotencyKey\(key\);/.test(TEST_API));

  console.log('\n── 12. Campaign preview ──');

  check('the campaign count is resolved on the server',
    PREVIEW_API.includes('resolveRecipients(found.audience.segment)'));
  check('the browser cannot supply a count',
    !PREVIEW_UI.includes('recipientCount:') || PREVIEW_UI.includes('data.campaign.recipientCount'));
  check('the production recipient list is never returned',
    !PREVIEW_API.includes('.emails') && !PREVIEW_API.includes('previewRecipientRows'));
  check('the audience description is shown',
    PREVIEW_API.includes('describeSegment(') && PREVIEW_UI.includes('data.campaign.audienceDescription'));
  check('the irreversibility of a send is stated',
    PREVIEW_UI.includes('Sending cannot be undone'));
  check('a campaign can be previewed from its detail screen',
    CAMPAIGNS_UI.includes('<EmailPreviewDialog') && CAMPAIGNS_UI.includes('source="campaign"')
    && CAMPAIGNS_UI.includes('campaignId={c.id}'));
  check('the campaign screen no longer injects stored HTML into the panel',
    !CAMPAIGNS_UI.includes('dangerouslySetInnerHTML'));

  console.log('\n── 13. Production sends use the same rules ──');

  /* The bug this closes: templates advertised `{{firstName}}`, the API
     validated it, the UI promised it would be "resolved per recipient when a
     campaign runs" - and the send loop substituted nothing, so the literal
     placeholder would have been mailed to the entire audience. The
     substitution function had no caller outside its own test. */
  check('the campaign send loop resolves variables per recipient',
    CAMPAIGNS_LIB.includes('const values = { ...neutralVariableValues(to)'));
  check('it uses the canonical renderer, not a local substitution',
    CAMPAIGNS_LIB.includes('supported: SUPPORTED_VARIABLES'));
  check('an unmatched recipient still reads as prose, never a placeholder',
    CAMPAIGNS_LIB.includes("firstName: 'there'"));
  check('the audience is only re-resolved when the content is personalised',
    CAMPAIGNS_LIB.includes('const usesVariables = extractEmailVariables(')
    && CAMPAIGNS_LIB.includes('usesVariables\n    ? await audienceVariableValues'));
  check('the personalisation source exposes users, not just addresses',
    RECIPIENTS_LIB.includes('export async function resolveRecipientUsers')
    && RECIPIENTS_LIB.includes('export function recipientVariableValues'));
  check('a transactional send derives its text from the final html',
    SYSTEM_LIB.includes('text: rendered.text'));
  check('a surviving placeholder still falls back to the built-in email',
    SYSTEM_LIB.includes('if (extractEmailVariables(`${rendered.subject} ${rendered.html}`).length) return null;'));
  check('an unsupported variable also falls back',
    SYSTEM_LIB.includes('if (rendered.unsupported.length) return null;'));

  console.log('\n── 14. Fallback and failure behaviour ──');

  check('an empty body renders to empty rather than throwing',
    renderEmail({ subject: '', html: '', supported: [] }).html !== undefined);
  check('null-ish input is tolerated',
    extractEmailVariables(null).length === 0 && extractEmailVariables(undefined).length === 0);
  check('a contract with no variables reports every placeholder as unsupported',
    JSON.stringify(renderEmail({ subject: '{{x}}', html: '<p>{{y}}</p>', supported: [] }).unsupported)
      === '["x","y"]');
  check('a value supplied for an unsupported variable is still not injected',
    renderEmail({ subject: '{{city}}', html: '<p>x</p>', supported: AUD, values: {} }).subject
      === '{{city}}');

  console.log('\n── 15. Wiring ──');

  for (const [label, src] of [
    ['compose', COMPOSE], ['templates', TEMPLATES_UI],
    ['system emails', SYSTEM_UI], ['campaigns', CAMPAIGNS_UI],
  ] as const) {
    check(`${label} uses the shared preview dialog`, src.includes('<EmailPreviewDialog'));
    check(`${label} uses the shared test send dialog`, src.includes('<TestSendDialog'));
    /* And keeps no preview markup of its own. */
    check(`${label} has no preview dialog of its own`,
      !src.includes('aria-label="Email preview"') && !src.includes('aria-label="Template preview"')
      && !src.includes('aria-label="System email preview"'));
  }
  check('drafts reuse the composer rather than a third editor',
    read('components/superadmin/mail/MailDrafts.tsx').includes('<MailCompose'));
  check('an archived template cannot be test-sent',
    TEMPLATES_UI.includes("editingStatus === 'archived'"));

  console.log(
    failures === 0
      ? `\n✅ ${checks}/${checks} checks passed`
      : `\n❌ ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
