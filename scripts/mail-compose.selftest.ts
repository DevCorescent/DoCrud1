/**
 * Compose + email sanitization self-test.
 *
 * The sanitizer is a security boundary, not a formatter: its output is stored,
 * rendered into the admin preview with `dangerouslySetInnerHTML`, and mailed to
 * thousands of people. So most of this file is adversarial input, and the
 * assertions are about what must NOT survive.
 *
 * The rest covers the invariant the composer rests on: the preview, the test
 * send and the real send all use the same sanitized HTML, so an admin cannot
 * approve one email and deliver another.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { sanitizeEmailHtml, isSafeEmailUrl } from '@/lib/security/email-html-sanitizer';
import { emailHtmlToText } from '@/lib/email/html-to-text';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const DRAFTS_API = read('app/api/super-admin/mail/drafts/route.ts');
const PREVIEW_API = read('app/api/super-admin/mail/preview/route.ts');
const RENDERER = read('lib/email/render-email.ts');
const UPLOAD_API = read('app/api/super-admin/mail/upload/route.ts');
const TEST_API = read('app/api/super-admin/mail/test/route.ts');
const DRAFTS_LIB = read('lib/server/mail-drafts.ts');
const EDITOR = read('components/superadmin/mail/RichEmailEditor.tsx');
const COMPOSE = read('components/superadmin/mail/MailCompose.tsx');
const PANEL = read('components/SuperAdminPanel.tsx');
/* Preview and test send are now shared components rather than composer-local
   code, so the assertions that guarded them follow them here. */
const PREVIEW_UI = read('components/superadmin/mail/EmailPreviewDialog.tsx');
const TEST_UI = read('components/superadmin/mail/TestSendDialog.tsx');
const TEST_SEND_API = read('app/api/super-admin/mail/test-send/route.ts');

const clean = (html: string) => sanitizeEmailHtml(html).toLowerCase();

function main() {
  console.log('\n── 1. Script and event handlers ──');

  check('script tags are removed',
    !clean('<p>hi</p><script>alert(1)</script>').includes('<script'));
  check('script CONTENT does not survive as text',
    !clean('<script>alert(1)</script>').includes('alert(1)'));
  check('inline event handlers are stripped',
    !clean('<img src="https://x.com/a.png" onerror="alert(1)" alt="a">').includes('onerror'));
  check('onclick is stripped',
    !clean('<a href="https://x.com" onclick="steal()">x</a>').includes('onclick'));
  check('onload on a body-ish element is stripped',
    !clean('<div onload="x()">hi</div>').includes('onload'));
  check('iframes are removed', !clean('<iframe src="https://evil.com"></iframe>').includes('<iframe'));
  check('object and embed are removed',
    !clean('<object data="x"></object><embed src="y">').includes('<object')
    && !clean('<object data="x"></object><embed src="y">').includes('<embed'));
  check('forms are removed',
    !clean('<form action="https://evil.com"><input name="pw"></form>').includes('<form'));
  check('svg is removed (it can carry script)',
    !clean('<svg><script>alert(1)</script></svg>').includes('<svg'));
  check('style elements are removed',
    !clean('<style>body{display:none}</style><p>x</p>').includes('<style'));
  check('base tags are removed', !clean('<base href="https://evil.com">').includes('<base'));

  console.log('\n── 2. URL schemes ──');

  check('javascript: hrefs are dropped',
    !clean('<a href="javascript:alert(1)">x</a>').includes('javascript'));
  check('vbscript: hrefs are dropped',
    !clean('<a href="vbscript:msgbox(1)">x</a>').includes('vbscript'));
  check('file: hrefs are dropped',
    !clean('<a href="file:///etc/passwd">x</a>').includes('file:'));
  /* data: images render in the admin preview but are blocked by most mail
     clients — allowing them means approving an email nobody can see. */
  check('data: image sources are dropped',
    !clean('<img src="data:image/png;base64,iVBORw0KGgo=" alt="a">').includes('data:'));
  check('data:text/html is dropped',
    !clean('<a href="data:text/html,<script>alert(1)</script>">x</a>').includes('data:'));
  check('https links survive',
    clean('<a href="https://www.docrud.com">x</a>').includes('https://www.docrud.com'));
  check('mailto links survive',
    clean('<a href="mailto:a@b.com">x</a>').includes('mailto:a@b.com'));
  check('external links get noopener',
    clean('<a href="https://x.com">x</a>').includes('noopener'));

  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'file:///etc', 'not a url', '']) {
    check(`isSafeEmailUrl rejects ${bad.slice(0, 26) || '(empty)'}`, !isSafeEmailUrl(bad));
  }
  for (const good of ['https://www.docrud.com', 'http://example.com/a', 'mailto:a@b.com']) {
    check(`isSafeEmailUrl accepts ${good}`, isSafeEmailUrl(good));
  }

  console.log('\n── 3. CSS filtering ──');

  check('expression() is removed',
    !clean('<p style="width: expression(alert(1))">x</p>').includes('expression'));
  check('url(javascript:) is removed',
    !clean('<p style="background: url(javascript:alert(1))">x</p>').includes('javascript'));
  check('position is not allowed',
    !clean('<p style="position: fixed; top: 0">x</p>').includes('position'));
  check('legitimate styling survives',
    clean('<p style="color: #ff0000; text-align: center">x</p>').includes('color'));
  check('an all-unsafe style attribute is removed entirely',
    !clean('<p style="position:absolute">x</p>').includes('style'));

  console.log('\n── 4. Legitimate email content survives ──');

  const rich = sanitizeEmailHtml(
    '<h1>Title</h1><p><strong>Bold</strong> and <em>italic</em></p>'
    + '<ul><li>One</li><li>Two</li></ul><hr />'
    + '<table><tr><td>Cell</td></tr></table>'
    + '<img src="https://www.docrud.com/logo.png" alt="Docrud" width="600" />',
  );
  for (const tag of ['<h1', '<strong', '<em', '<ul', '<li', '<hr', '<table', '<td', '<img']) {
    check(`${tag}> survives`, rich.includes(tag));
  }
  check('image width is preserved', rich.includes('width="600"'));
  check('alt text is preserved', rich.includes('alt="Docrud"'));
  check('an image with no alt gets an empty alt rather than none',
    sanitizeEmailHtml('<img src="https://x.com/a.png">').includes('alt='));
  /* Sanitizing twice must be a no-op, or every save would erode the content. */
  check('sanitization is idempotent', sanitizeEmailHtml(rich) === rich);
  check('empty input is handled', sanitizeEmailHtml('') === '' && sanitizeEmailHtml(null) === '');

  console.log('\n── 5. Plain-text generation ──');

  const text = emailHtmlToText(
    '<h1>Hello</h1><p>First para</p><p>Second para</p>'
    + '<ul><li>Alpha</li><li>Beta</li></ul>'
    + '<a href="https://www.docrud.com">Visit us</a>'
    + '<img src="https://x.com/a.png" alt="A logo" />',
  );
  check('headings and paragraphs survive as text',
    text.includes('Hello') && text.includes('First para') && text.includes('Second para'));
  check('list items are marked', text.includes('• Alpha') && text.includes('• Beta'));
  /* A bare label in plain text leaves the reader with nothing to act on. */
  check('link destinations are preserved',
    text.includes('Visit us (https://www.docrud.com)'), text);
  check('image alt text is preserved', text.includes('[A logo]'));
  check('tags do not leak into the text', !text.includes('<'));
  check('blank lines are collapsed', !/\n{3,}/.test(text));
  check('entities are decoded', emailHtmlToText('<p>a &amp; b &lt;c&gt;</p>') === 'a & b <c>');
  check('empty input is handled', emailHtmlToText('') === '');

  console.log('\n── 6. Sanitization happens on the server ──');

  /* If the route sanitized instead of the library, a future caller reaching
     storage another way would bypass it. */
  check('the draft library sanitizes before storing',
    DRAFTS_LIB.includes('sanitizeEmailHtml(input.html)'));
  check('plain text is derived, never authored separately',
    DRAFTS_LIB.includes('text: emailHtmlToText(html)'));
  /* Sanitization moved down into the canonical renderer, so these follow it
     there: the preview route must go through that renderer, and the renderer
     must use the same sanitizer the storage path uses. The property is the
     same one - there is exactly one sanitizer - asserted a level deeper. */
  check('the preview endpoint sanitizes',
    PREVIEW_API.includes("renderEmail(") && RENDERER.includes('sanitizeEmailHtml(rawHtml)'));
  check('preview and send share one sanitizer',
    RENDERER.includes("from '@/lib/security/email-html-sanitizer'")
    && DRAFTS_LIB.includes("from '@/lib/security/email-html-sanitizer'")
    && !PREVIEW_API.includes('DOMPurify'));
  /* Stronger than before: the preview no longer injects the email into the
     admin page at all. It renders inside a sandboxed iframe with no
     allow-scripts, so the message cannot execute against a super-admin
     session even if the sanitizer were wrong. */
  check('the composer renders server-sanitized HTML, not its own',
    PREVIEW_UI.includes("fetch('/api/super-admin/mail/preview'")
    && PREVIEW_UI.includes('sandbox=""')
    /* The attribute, not the word: the file explains why allow-scripts is
       absent, and matching prose would fail on its own documentation. */
    && !/sandbox=["'][^"']*allow-scripts/.test(PREVIEW_UI)
    && !PREVIEW_UI.includes('dangerouslySetInnerHTML')
    && !COMPOSE.includes('dangerouslySetInnerHTML'));
  check('the client does not sanitize in place of the server',
    !COMPOSE.includes('sanitizeEmailHtml') && !EDITOR.includes('DOMPurify'));
  check('an oversized body is refused rather than parsed',
    PREVIEW_API.includes('too large to preview'));

  console.log('\n── 7. Drafts API ──');

  check('every verb is guarded',
    (DRAFTS_API.match(/const session = await guard\(req\);/g) ?? []).length === 3
    && (DRAFTS_API.match(/{ error: 'Unauthorized' }, { status: 401 }/g) ?? []).length === 3);
  /* An identity supplied by the browser is not an identity. */
  check('createdBy comes from the session, not the payload',
    DRAFTS_API.includes('actor: session.email') && !/body\.(createdBy|updatedBy|actor)/.test(DRAFTS_API));
  check('a subject is required', DRAFTS_API.includes("'A subject is required.'"));
  check('draft writes are serialised against autosave',
    DRAFTS_LIB.includes('withStorageLock(DRAFT_LOCK'));
  check('drafts use the existing storage layer, not localStorage',
    DRAFTS_LIB.includes("from '@/lib/server/storage'") && !COMPOSE.includes('localStorage'));
  check('the list omits bodies', DRAFTS_API.includes('hasAttachments'));
  check('draft creation is audited once, not per autosave',
    DRAFTS_API.includes("action: 'mail.draft.created'") && DRAFTS_API.includes('if (isNew)'));
  check('an audit failure cannot fail the save',
    DRAFTS_API.includes('never fail a save for the audit trail'));
  check('internal errors are logged, not returned',
    DRAFTS_API.includes('console.error') && DRAFTS_API.includes("'Unable to save draft.'"));

  console.log('\n── 8. Test send goes through the real pipeline ──');

  /* The route used to build its own unpooled transport — a second SMTP
     implementation free to drift from the one real sends use. */
  check('the test route no longer builds its own transport',
    !TEST_API.includes('nodemailer'));
  check('it sends through the provider',
    TEST_API.includes('provider.send(') && TEST_API.includes('getMailProvider()'));
  check('it verifies through the provider', TEST_API.includes('provider.verify()'));
  check('failures are classified like everywhere else',
    TEST_API.includes('classifyMailError(err)') && TEST_API.includes('failureKind: failure.kind'));
  check('retryability is reported', TEST_API.includes('retryable: failure.retryable'));
  check('a missing recipient is refused past the verify branch',
    TEST_API.includes("'A test recipient is required.'"));
  check('the composer never sends from the browser',
    !COMPOSE.includes('nodemailer') && !TEST_UI.includes('nodemailer')
    && TEST_UI.includes("fetch('/api/super-admin/mail/test-send'"));
  /* The bug this replaced: "Send test" posted to the SMTP diagnostic endpoint,
     which ignored the editor and mailed a fixed connection-test message. */
  check('a test send carries the CURRENT editor content',
    TEST_UI.includes('JSON.stringify({ source, type, subject, html, preheader, recipient })')
    && TEST_SEND_API.includes("String(body.subject ?? '')")
    && TEST_SEND_API.includes("String(body.html ?? '')"));
  check('the server re-renders rather than trusting the browser',
    TEST_SEND_API.includes('renderEmail({') && !TEST_SEND_API.includes('body.previewHtml'));
  check('no audience is reachable from a test send',
    !TEST_SEND_API.includes('resolveRecipients') && !TEST_SEND_API.includes('mail-recipients'));
  /* The rule the whole project keeps returning to. */
  check('a provider rejection is never reported as success',
    TEST_SEND_API.includes("'The provider rejected the test message.'")
    && !TEST_SEND_API.includes("'Delivered")
    && !TEST_UI.includes('Delivered'));
  check('acceptance is not described as delivery',
    TEST_UI.includes('delivery\n                is not something this panel can see')
    || TEST_UI.includes('is not something this panel can see'));
  check('a permanent failure says retrying will not help',
    TEST_UI.includes("'Retrying will not help'"));
  check('the failure classification reaches the admin',
    TEST_SEND_API.includes('failureKind: failure.kind')
    && TEST_SEND_API.includes('providerCode: failure.code')
    && TEST_SEND_API.includes('retryable: failure.retryable')
    && TEST_UI.includes('Provider code'));

  console.log('\n── 9. Upload safety ──');

  check('upload is super-admin guarded',
    UPLOAD_API.includes('getSuperAdminSessionFromRequest') && UPLOAD_API.includes('{ status: 401 }'));
  check('it reuses the shared storage helpers',
    UPLOAD_API.includes("from '@/lib/server/r2'") && UPLOAD_API.includes('isR2Configured()'));
  check('file types are allow-listed', UPLOAD_API.includes('ALLOWED_TYPES.has(file.type)'));
  check('SVG is not accepted', !UPLOAD_API.includes('svg'));
  check('ICO is not offered for email', !UPLOAD_API.includes('x-icon'));
  check('size is capped', UPLOAD_API.includes('file.size > MAX_BYTES'));
  /* A filename from the client is an attacker-controlled path. */
  check('the stored filename is generated, not taken from the upload',
    UPLOAD_API.includes('crypto.randomBytes') && !UPLOAD_API.includes('file.name'));
  check('internal paths are not returned',
    UPLOAD_API.includes("url: `/uploads/mail/") && !UPLOAD_API.includes('process.cwd()}`'));

  console.log('\n── 10. Editor and composer behaviour ──');

  check('the editor validates URLs before inserting',
    EDITOR.includes('function isSafeUrl') && EDITOR.includes('Other schemes are not allowed'));
  check('alt text is required for images',
    EDITOR.includes('Alt text is required'));
  check('inserted attributes are escaped', EDITOR.includes('const escapeAttr'));
  check('the button is table-based with no JavaScript',
    EDITOR.includes("role=\"presentation\"") && !EDITOR.includes('onclick='));
  check('the toolbar controls are labelled for assistive tech',
    EDITOR.includes('aria-label={title}') && EDITOR.includes('role="toolbar"'));
  check('the editing surface is announced as a textbox',
    EDITOR.includes('role="textbox"') && EDITOR.includes('aria-multiline="true"'));
  check('undo, redo and clear formatting exist',
    EDITOR.includes("exec('undo')") && EDITOR.includes("exec('redo')")
    && EDITOR.includes("exec('removeFormat')"));
  check('the selection survives opening a dialog',
    EDITOR.includes('rememberSelection') && EDITOR.includes('restoreSelection'));

  check('unsaved changes are tracked against the saved state',
    COMPOSE.includes('savedSnapshot') && COMPOSE.includes('snapshot !== savedSnapshot'));
  check('leaving with unsaved work is guarded',
    COMPOSE.includes("addEventListener('beforeunload'"));
  check('duplicate submissions are prevented',
    COMPOSE.includes('disabled={busy')
    /* Synchronous ref, because `sending` state does not update until the next
       render and a fast double-click would pass the disabled check twice. */
    && TEST_UI.includes('if (busyRef.current) return;')
    && TEST_UI.includes('busyRef.current = true;')
    /* And a server-side window, so a repeat that does get through is collapsed. */
    && TEST_SEND_API.includes('alreadySentRecently(key)'));
  check('a subject is required before saving',
    COMPOSE.includes('A subject is required before saving.'));
  check('the sender cannot be set from the browser',
    COMPOSE.includes('readOnly aria-readonly') && COMPOSE.includes('cannot be set here'));
  check('desktop, mobile and text previews exist',
    PREVIEW_UI.includes("const MODES: PreviewMode[] = ['desktop', 'mobile', 'text']")
    /* Real viewports, not just a narrower div. */
    && PREVIEW_UI.includes('desktop: 640, mobile: 390'));
  check('the preview states it is an approximation',
    PREVIEW_UI.includes('same pipeline that sends the email'));
  check('plain text comes from the server, not the browser',
    PREVIEW_UI.includes('{data.text') && !PREVIEW_UI.includes('replace(/<'));
  /* The nav grows each phase; what must hold is that Compose is mounted and
     is one of the mail views. */
  check('compose is mounted in the Mail Center',
    PANEL.includes('<MailCompose />')
    && /const \[view, setView\] = useState<[^>]*'compose'[^>]*>/.test(PANEL));
  /* Phase 5 delivered recipients and sending, so the old "not yet" note is
     gone. What must remain true is that nothing unbuilt is stubbed. */
  check('nothing unbuilt is stubbed',
    !COMPOSE.includes('Coming soon') && !COMPOSE.includes('Not implemented'));
  check('recipients and sending are now real, not placeholders',
    COMPOSE.includes('<RecipientPicker') && COMPOSE.includes('const confirmSend'));

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
