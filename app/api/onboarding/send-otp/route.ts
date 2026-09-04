import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import nodemailer from 'nodemailer';
import { getStoredUsers, getAuthSession } from '@/lib/server/auth';
import { enforceCaptcha, isCaptchaConfigured } from '@/lib/server/security/captcha';
import { otpSessionsPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import { getMailSettings } from '@/lib/server/settings';
import { resolveSystemEmail } from '@/lib/server/system-emails';
import { enforceRateLimits, getClientIp, rateKeyEmail, RATE_POLICIES } from '@/lib/server/security/rate-limit';
import {
  appendEmailOutboxEvent,
  createOutboundEmailId,
  updateEmailOutboxEvent,
} from '@/lib/server/email-outbox';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type EmailVerificationOtpSession = {
  id: string;
  purpose: 'email_verification';
  email: string;
  userId: string;
  otpHash: string;
  otpSalt: string;
  createdAt: string;
  expiresAt: string;
  attempts: number;
};

type OtpStore = {
  sessions: Array<Record<string, unknown>>;
};

function sha256Hex(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function generateOtp() {
  // Cryptographically secure 6-digit code (no leading-zero bias)
  return String(crypto.randomInt(100000, 999999));
}

function generateId() {
  return crypto.randomBytes(18).toString('base64url');
}

/* ─── OTP email HTML ──────────────────────────────────────────────────────────
   Design principles that maximise deliverability:
   ✓ Light background (#f8fafc) — dark backgrounds trigger spam heuristics
   ✓ No external image loads at send-time
   ✓ No tracking pixels / link rewrites (OTP emails must be pristine)
   ✓ Full plain-text counterpart
   ✓ Subject starts with the code — Gmail/Outlook recognise this pattern
   ✓ X-Entity-Ref-ID header per RFC — dedupe guard for Gmail
   ✓ Complete footer with context ("why am I getting this")
────────────────────────────────────────────────────────────────────────────── */
function buildOtpHtml(otp: string, firstName: string): string {
  const digits = otp.split('').map(d =>
    `<td style="padding:0 5px;"><span style="display:inline-block;width:44px;height:58px;line-height:58px;text-align:center;font-size:34px;font-weight:900;color:#111827;background:#f3f4f6;border:1.5px solid #e5e7eb;border-radius:10px;font-variant-numeric:tabular-nums;font-family:'Courier New',Courier,monospace;">${d}</span></td>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no"/>
  <title>Your Docrud verification code</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    @media only screen and (max-width:600px){
      .email-wrapper{width:100%!important;padding:16px!important;}
      .email-card{border-radius:16px!important;padding:28px 20px!important;}
      .otp-digit{width:36px!important;height:48px!important;line-height:48px!important;font-size:26px!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <!-- Preheader — hidden in body, shown in inbox preview -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    ${otp} is your Docrud verification code — expires in 10 minutes. Do not share it.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;">
    <tr>
      <td align="center" style="padding:48px 16px;">

        <!-- Card -->
        <table role="presentation" class="email-card" cellpadding="0" cellspacing="0" border="0" style="width:520px;max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(15,23,42,0.08);">

          <!-- Top accent bar -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#6366f1 0%,#818cf8 50%,#a5b4fc 100%);font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding:36px 44px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td>
                    <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#6366f1;">Docrud</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:10px;">
                    <h1 style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f172a;line-height:1.3;">
                      Verify your email${firstName ? `, ${firstName}` : ''}
                    </h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:8px;">
                    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#64748b;line-height:1.65;">
                      Enter the code below to verify your email address and activate your Docrud account.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- OTP code box -->
          <tr>
            <td style="padding:32px 44px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:14px;padding:28px 24px;text-align:center;">
                    <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#94a3b8;">
                      Your verification code
                    </p>
                    <!-- Individual digit boxes -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                      <tr>
                        ${digits}
                      </tr>
                    </table>
                    <p style="margin:18px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#94a3b8;line-height:1.5;">
                      ⏱ Expires in <strong style="color:#64748b;">10 minutes</strong>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Security note -->
          <tr>
            <td style="padding:0 44px 36px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:#92400e;line-height:1.6;">
                      🔒 <strong>Never share this code.</strong> Docrud will never ask for your code via phone, chat, or any other channel.
                      If you didn't request this, you can safely ignore this email — your account is not at risk.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 44px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="border-top:1px solid #f1f5f9;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 44px 28px;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#94a3b8;line-height:1.7;">
                You're receiving this because you created or are verifying a Docrud account.<br/>
                This is a security-critical transactional email — it cannot be unsubscribed from.
              </p>
              <p style="margin:8px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#cbd5e1;">
                © ${new Date().getFullYear()} Docrud · <a href="${process.env.NEXTAUTH_URL ?? 'https://docrud.com'}" style="color:#6366f1;text-decoration:none;">docrud.com</a>
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>

</body>
</html>`;
}

function buildOtpText(otp: string, firstName: string): string {
  return `Hi${firstName ? ` ${firstName}` : ''},

Your Docrud email verification code is:

  ${otp}

Enter this code in the Docrud app to verify your account. It expires in 10 minutes.

──────────────────────────────────────────
Security reminder
──────────────────────────────────────────
• Never share this code with anyone.
• Docrud will NEVER ask for this code by phone, chat, or email.
• If you didn't request this, ignore this email — your account is safe.
──────────────────────────────────────────

© ${new Date().getFullYear()} Docrud · https://docrud.com
You're receiving this because you created or are verifying a Docrud account.
`;
}

/* ─── OTP email dispatch ──────────────────────────────────────────────────────
   Strategy (in order):
   1. Configured SMTP relay (Titan / GoDaddy) — authenticated, SPF-aligned,
      reliable delivery to any recipient domain.
   2. Direct MX fallback on port 587 (STARTTLS) — only tried if no relay is
      configured or the relay fails.  Direct port-25 delivery is intentionally
      avoided: it bypasses authentication, breaks SPF, and causes receiving
      servers to silently drop or spam the message.

   Each attempt uses a fresh transporter so no stale pooled connections.
────────────────────────────────────────────────────────────────────────────── */

async function trySend(
  transporter: nodemailer.Transporter,
  mailOptions: Parameters<nodemailer.Transporter['sendMail']>[0],
  label: string,
): Promise<boolean> {
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[send-otp] ${label}: OK → msgId=${info.messageId} resp=${info.response}`);
    return true;
  } catch (err) {
    console.error(`[send-otp] ${label}: FAILED →`, (err as Error).message);
    return false;
  } finally {
    try { (transporter as nodemailer.Transporter & { close?: () => void }).close?.(); } catch { /* ignore */ }
  }
}

async function resolveTopMx(domain: string): Promise<string | null> {
  try {
    const records = await dns.resolveMx(domain);
    if (!records.length) return null;
    records.sort((a, b) => a.priority - b.priority);
    return records[0].exchange;
  } catch {
    return null;
  }
}

async function dispatchOtpEmail(to: string, otp: string, firstName: string): Promise<void> {
  const smtp = await getMailSettings();

  if (!smtp.fromEmail) {
    throw new Error('SMTP sender address is not configured.');
  }

  const messageId = `<otp-${Date.now()}-${crypto.randomBytes(6).toString('hex')}@${smtp.fromEmail.split('@')[1] ?? 'docrud.com'}>`;

  /* Presentation comes from the PUBLISHED system-email configuration when one
     exists and renders cleanly. `resolveSystemEmail` returns null for every
     failure mode — no published version, storage down, corrupt content, an
     unresolved variable — so the built-in template below stays the guaranteed
     path. An admin's editing mistake must never stop a verification code
     arriving. The OTP itself is still generated, hashed and expired by this
     route; only the wording is configurable. */
  const configured = await resolveSystemEmail('signup_otp', {
    otp, firstName: firstName || 'there', email: to,
  }).catch(() => null);

  const mailOptions = {
    from:    `"${smtp.fromName ?? 'Docrud'}" <${smtp.fromEmail}>`,
    to,
    replyTo: smtp.replyTo || smtp.fromEmail,
    subject: configured?.subject ?? `${otp} is your Docrud verification code`,
    text:    configured?.text ?? buildOtpText(otp, firstName),
    html:    configured?.html ?? buildOtpHtml(otp, firstName),
    headers: {
      'X-Entity-Ref-ID': messageId,
      'X-Mailer':        'Docrud Mailer',
      'Precedence':      'transactional',
      'Message-ID':      messageId,
    },
  };

  // ── 1. Configured SMTP relay — primary path (authenticated, SPF-aligned) ──
  // Timeouts are kept tight (6 s each) so the serverless function always
  // returns a response before the platform cuts it off.
  if (smtp.host) {
    const relayTransporter = nodemailer.createTransport({
      host: smtp.host,
      port: Number(smtp.port) || 465,
      secure: Boolean(smtp.secure),
      auth: smtp.requireAuth ? { user: smtp.username, pass: smtp.password } : undefined,
      connectionTimeout: 6_000,
      greetingTimeout:   4_000,
      socketTimeout:     6_000,
    });
    const ok = await trySend(relayTransporter, mailOptions, `relay(${smtp.host})`);
    if (ok) return;
  }

  // ── 2. Direct MX fallback via port 587 + STARTTLS ──
  const domain = to.split('@')[1] ?? '';
  const mxHost = await resolveTopMx(domain);
  if (mxHost) {
    const directTransporter = nodemailer.createTransport({
      host: mxHost,
      port: 587,
      secure: false,
      name: smtp.fromEmail.split('@')[1] ?? 'docrud.com',
      connectionTimeout: 5_000,
      greetingTimeout:   3_000,
      socketTimeout:     5_000,
      tls: { rejectUnauthorized: false },
    });
    const ok = await trySend(directTransporter, mailOptions, `direct-mx-587(${mxHost})`);
    if (ok) return;
  }

  throw new Error(
    smtp.host
      ? `OTP email delivery failed for ${to} — relay and direct methods both exhausted. Check SMTP credentials in mail settings.`
      : `OTP email delivery failed for ${to} — no SMTP relay configured and direct delivery failed. Configure SMTP in mail settings.`,
  );
}

/* ─── Route handler ───────────────────────────────────────────────────────── */
// No auth session required — this endpoint is called immediately after signup
// before the NextAuth client-side session has propagated. We look up the user
// by the email in the request body instead. The OTP itself provides no
// elevated access; it only marks that email as verified for that account.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string; captchaToken?: string };
    const email = String(body.email ?? '').toLowerCase().trim();
    if (!email) return NextResponse.json({ error: 'Email is required.' }, { status: 400 });

    /* An ANONYMOUS caller must pass the challenge before an email is sent.
       Without this the endpoint was a free mailer: rate limits slow that down
       but do not stop it, and the address being mailed is chosen by the caller.

       A caller who already has a session is exempt, because they solved the
       challenge to obtain it — this is the "resend my own verification code"
       path, and re-challenging it would break the existing signup flow that
       calls this immediately after an authenticated sign-in. */
    if (isCaptchaConfigured()) {
      const session = await getAuthSession().catch(() => null);
      if (!session?.user) {
        const captchaFail = await enforceCaptcha(body.captchaToken, {
          remoteIp: getClientIp(req),
          label: 'onboarding-send-otp',
        });
        if (captchaFail) return captchaFail;
      }
    }

    // Throttle OTP sends by account + IP (runs before the account lookup, so it
    // does not reveal whether the email is registered).
    const otpLimited = await enforceRateLimits([
      { key: `otp:send:emailverify:account:${rateKeyEmail(email)}`, policy: RATE_POLICIES.otpSendAccount },
      { key: `otp:send:emailverify:ip:${getClientIp(req)}`, policy: RATE_POLICIES.otpSendIp },
    ]);
    if (otpLimited) return otpLimited;

    // Find the registered user for this email
    const users = await getStoredUsers();
    const actor = users.find((u) => u.email.toLowerCase() === email);
    if (!actor) {
      // Return 200 so we don't reveal whether an email is registered
      return NextResponse.json({ sent: true });
    }

    // Rate-limit: at most one active OTP session per user (the prune below
    // removes any previous one before inserting the new one).
    const otp     = generateOtp();
    const salt    = crypto.randomBytes(16).toString('hex');
    const hash    = sha256Hex(`${salt}:${otp}`);
    const now     = new Date().toISOString();
    const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const store    = await readJsonFile<OtpStore>(otpSessionsPath, { sessions: [] });
    const sessions = Array.isArray(store.sessions) ? store.sessions : [];
    const pruned   = sessions.filter((s) => {
      const r = s as Record<string, unknown>;
      return !(r['purpose'] === 'email_verification' && r['userId'] === actor.id);
    });

    const newSession: EmailVerificationOtpSession = {
      id: generateId(), purpose: 'email_verification',
      email, userId: actor.id,
      otpHash: hash, otpSalt: salt,
      createdAt: now, expiresAt: expires, attempts: 0,
    };
    pruned.unshift(newSession as unknown as Record<string, unknown>);
    await writeJsonFile(otpSessionsPath, { sessions: pruned });

    const firstName = (actor.name ?? '').split(' ')[0];
    const subject   = `${otp} is your Docrud verification code`;
    const outboxId  = createOutboundEmailId('otp');

    await appendEmailOutboxEvent({
      id: outboxId,
      createdAt: now,
      status: 'queued',
      type: 'system',
      to: email,
      subject,
      sentBy: 'system',
      tracking: { opens: 0, clicks: 0 },
      metadata: { purpose: 'email_verification', userId: actor.id },
    });

    try {
      await dispatchOtpEmail(email, otp, firstName);
      await updateEmailOutboxEvent(outboxId, (ev) => ({
        ...ev,
        status: 'sent',
        sentAt: new Date().toISOString(),
      }));
    } catch (dispatchErr) {
      await updateEmailOutboxEvent(outboxId, (ev) => ({
        ...ev,
        status: 'failed',
        error: dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr),
      }));
      throw dispatchErr;
    }

    return NextResponse.json({ sent: true });

  } catch (error) {
    /* The DETAIL stays on the server. `dispatchOtpEmail` throws messages that
       name the recipient address and point at the mail configuration
       ("Check SMTP credentials in mail settings") — useful in a log, an
       infrastructure disclosure in a response body to a caller who may not even
       own the address. The failure is still a genuine 500; only its wording is
       generic, and the outbox row above already records the real cause. */
    console.error('[onboarding/send-otp] POST error', error);
    return NextResponse.json(
      { error: 'We could not send your code right now. Please try again in a moment.' },
      { status: 500 },
    );
  }
}
