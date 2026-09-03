/**
 * No Docrud email carries an automatic image.
 *
 * `buildEmailChrome` used to hard-code `/email/header.png` — a 1.5 MB "Explore
 * gigs. Find talent. Get it done." advert — onto every email it wrapped. The
 * fix is not a per-email opt-out: the shared chrome now renders an image ONLY
 * when a caller explicitly supplies one, so a new email type added later
 * inherits no advert.
 *
 * The chrome is pure, so real generated HTML is asserted here rather than the
 * source that produces it.
 */
import { readFileSync } from 'node:fs';
import { buildEmailChrome, safeEmailImageUrl } from '@/lib/server/email-chrome';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const ORIGIN = 'https://www.docrud.com';
const OTP = '481902';

/** No image is ever automatic, whatever the email is. */
function assertNoAutoImage(label: string, html: string) {
  check(`${label}: no /email/header.png`, !html.includes('/email/header.png'));
  check(`${label}: no header.png by any spelling`, !/header\.png/i.test(html));
  check(`${label}: no marketing copy`, !/explore gigs|find talent|get it done/i.test(html));
  check(`${label}: no <img> at all`, !/<img/i.test(html));
  check(`${label}: no cid: reference`, !html.includes('cid:'));
  check(`${label}: no data: URI`, !/src="data:/i.test(html));
}

/** The body shapes the real senders pass in, one per email category. */
const CATEGORIES: Array<[string, string, string]> = [
  ['OTP', `${OTP} — Your Docrud Deactivate Account OTP`,
    `<p>Hi <strong>Asha</strong>,</p><div>${OTP}</div><p>Do not share this with anyone.</p>`],
  ['account verification', 'Verify your Docrud email',
    `<p>Use this code to verify your email address:</p><div>${OTP}</div>`],
  ['Public Face verification', 'Verify your email — Public Face application',
    `<p>Use the OTP below to verify your email.</p><div>${OTP}</div>`],
  ['business verification', 'Your business verification was approved',
    '<p>Your organisation has been verified.</p>'],
  ['notification', 'You have a new connection request',
    '<p>Priya wants to connect with you on Docrud.</p>'],
  ['system email', 'Docrud service update',
    '<p>Scheduled maintenance this weekend.</p>'],
  ['application', 'Your application was received',
    '<p>We received your application for Backend Engineer.</p>'],
  ['security', 'A new sign-in to your Docrud account',
    '<p>We noticed a sign-in from a new device.</p>'],
  ['admin', '[docrud] Super Admin OTP',
    `<p>Sign-in OTP</p><div>${OTP}</div>`],
];

function main() {
  console.log('\n── 1. Every email category, by default ──');
  for (const [label, subject, body] of CATEGORIES) {
    const html = buildEmailChrome({ origin: ORIGIN, subject, bodyHtml: body });
    assertNoAutoImage(label, html);
  }

  console.log('\n── 2. Absent, null and empty all mean no image ──');
  {
    for (const [label, value] of [
      ['omitted', undefined], ['null', null], ['empty string', ''], ['whitespace', '   '],
    ] as Array<[string, string | null | undefined]>) {
      const html = buildEmailChrome({
        origin: ORIGIN, subject: 'x', bodyHtml: '<p>y</p>', headerImageUrl: value,
      });
      check(`${label} renders no image`, !/<img/i.test(html));
      check(`${label} does not fall back to header.png`, !html.includes('header.png'));
    }
    /* The specific regression: no `||` or `??` reaching for the old asset. */
    const src = readFileSync('lib/server/email-chrome.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    check('the chrome source names no default asset', !/header\.png/.test(src), 'header.png in code');
    check('and has no fallback operator reaching for one',
      !/\|\|\s*['"`][^'"`]*\/email\//.test(src) && !/\?\?\s*['"`][^'"`]*\/email\//.test(src));
  }

  console.log('\n── 3. The Super Admin exception still works ──');
  {
    const withImage = buildEmailChrome({
      origin: ORIGIN, subject: 'Campaign', bodyHtml: '<p>Hello.</p>',
      headerImageUrl: '/email/header.png',
    });
    check('an explicitly configured image IS rendered', /<img[^>]*header\.png/i.test(withImage));
    check('and it is the one that was configured', withImage.includes('src="/email/header.png"'));

    const custom = buildEmailChrome({
      origin: ORIGIN, subject: 'Campaign', bodyHtml: '<p>Hello.</p>',
      headerImageUrl: 'https://media.docrud.com/campaigns/spring.png',
    });
    check('an https image is rendered', custom.includes('https://media.docrud.com/campaigns/spring.png'));

    /* Explicit does not mean unchecked. */
    for (const hostile of [
      'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd',
      'http://insecure.example.com/a.png', '//evil.com/a.png', 'not a url',
      '/a.png" onerror="alert(1)', "/a.png' onload='x",
    ]) {
      check(`a hostile image url is refused: ${hostile.slice(0, 38)}`,
        safeEmailImageUrl(hostile) === '', safeEmailImageUrl(hostile));
    }
    check('a same-origin path is allowed', safeEmailImageUrl('/email/header.png') === '/email/header.png');
    check('an https url is allowed',
      safeEmailImageUrl('https://media.docrud.com/a.png').startsWith('https://media.docrud.com/'));
    check('a refused url renders no image, not a broken one',
      !/<img/i.test(buildEmailChrome({
        origin: ORIGIN, subject: 'x', bodyHtml: '<p>y</p>', headerImageUrl: 'javascript:alert(1)',
      })));
  }

  console.log('\n── 4. Nothing else was removed ──');
  {
    const html = buildEmailChrome({
      origin: ORIGIN,
      subject: `${OTP} — Your Docrud Deactivate Account OTP`,
      preheader: `OTP: ${OTP}`,
      bodyHtml: `<p>Hi <strong>Asha</strong>,</p><div>${OTP}</div><p>Do not share this with anyone.</p>`,
    });
    check('the verification code survives', html.includes(OTP));
    check('the greeting survives', html.includes('Hi <strong>Asha</strong>'));
    check('the security line survives', html.includes('Do not share this with anyone'));
    check('the subject renders', html.includes('Your Docrud Deactivate Account OTP'));
    check('the docrud wordmark survives', html.includes('docrud'));
    check('the "why am I getting this" line survives',
      html.includes('You’re receiving this email because you used docrud'));
    check('the Open docrud link survives', html.includes('Open docrud'));
    check('the preheader survives', html.includes(`OTP: ${OTP}`));
  }

  console.log('\n── 5. No caller reintroduces it, at any wrap depth ──');
  {
    const strip = (f: string) => readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    /* The per-email opt-out is GONE. Its existence would mean the default was
       still wrong and every new email had to remember to decline. */
    for (const f of ['lib/server/email-chrome.ts', 'lib/server/mailer.ts',
      'lib/server/account-emails.ts', 'lib/server/public-face-emails.ts',
      'app/api/super-admin/auth/send-otp/route.ts', 'app/api/early-access/waitlist/route.ts']) {
      check(`${f.split('/').pop()} carries no per-email opt-out`,
        !/showMarketingBanner/.test(strip(f)));
    }

    /* Double-wrapping: these senders pre-wrap AND go through sendTrackedMail,
       which wraps again. With no default, neither wrap can add an image. */
    const mailer = strip('lib/server/mailer.ts');
    check('sendTrackedMail supplies no image of its own',
      /headerImageUrl: input\.headerImageUrl/.test(mailer) && !/header\.png/.test(mailer));
    for (const f of ['lib/server/account-emails.ts', 'lib/server/public-face-emails.ts',
      'lib/server/business-verification-emails.ts', 'lib/server/notification-emails.ts']) {
      check(`${f.split('/').pop()} passes no image to the chrome`,
        !/headerImageUrl/.test(strip(f)) && !/header\.png/.test(strip(f)));
    }

    /* No other path in the app can inject it either. */
    const signup = strip('app/api/onboarding/send-otp/route.ts');
    check('the signup OTP route still has no image', !/<img/i.test(signup));
  }

  console.log('\n── 6. The admin template path is untouched ──');
  {
    const sanitizer = readFileSync('lib/security/email-html-sanitizer.ts', 'utf8');
    check('admin template HTML may still contain an image', /'img'/.test(sanitizer));
    check('with src/alt/width/height allowed', /'src', 'alt', 'width', 'height'/.test(sanitizer));
    check('and event handlers still stripped',
      /FORBID_ATTR: \['onerror', 'onload'/.test(sanitizer));
    const sys = readFileSync('lib/server/system-emails.ts', 'utf8');
    check('system-email drafts are still sanitized', /sanitizeEmailHtml\(input\.html\)/.test(sys));
  }

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) { console.error('FAILED'); process.exit(1); }
}

main();
