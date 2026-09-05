/**
 * The one-time-code email — built and delivered in ONE place.
 *
 * ═══ WHY THIS MODULE EXISTS ═══
 *
 * The verification code used to be built and posted by
 * `/api/onboarding/send-otp`, which stood up its own throwaway nodemailer
 * transports with far tighter timeouts than the transport the rest of the
 * application sends through (6 s to connect, against a relay whose cold start
 * is documented at 10–15 s in lib/server/smtp-transport.ts). Every other email
 * in the product went out over the pooled transport and arrived; the signup
 * code took the private path and aborted before the relay had finished saying
 * hello. Two senders, one of them quietly broken.
 *
 * Now there is one sender. It goes through the SAME provider seam — and so the
 * same pooled, credential-verified transport — as every other message, and its
 * fallbacks exist for the case the primary relay is genuinely unreachable
 * rather than merely slow.
 *
 * ═══ DELIVERY ORDER ═══
 *
 *   1. The application's configured relay, through the provider seam. This is
 *      authenticated and SPF-aligned, so it is the only path that reliably
 *      reaches any recipient domain.
 *   2. The same relay host on 587 + STARTTLS. Hosting networks and providers
 *      block 465 and 587 asymmetrically; when the configured port is refused
 *      the other one very often is not. Certificates are still verified.
 *   3. Direct-to-MX on 587 as a last resort, so a code can still arrive while
 *      an operator is fixing the relay.
 *
 * A failure at every step is a REAL failure: it throws, the caller answers with
 * an error, and nobody is parked on a "check your email" screen waiting for a
 * message that was never sent.
 *
 * ═══ WHAT IS DELIBERATELY ABSENT ═══
 *
 * No tracking pixel, no link rewriting, no suppression-list check. A
 * verification code is security-critical transactional mail: it must be
 * byte-for-byte pristine for deliverability, and it must reach a recipient who
 * has unsubscribed from everything else.
 *
 * The code itself is never logged, never returned to a caller, and never
 * stored anywhere but as a salted hash by whichever flow owns the session.
 */
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import nodemailer from 'nodemailer';
import { getMailSettings } from '@/lib/server/settings';
import { getMailProvider, classifyMailError, type MailFailureKind } from '@/lib/server/mail-provider';
import { resolveSystemEmail } from '@/lib/server/system-emails';
import {
  appendEmailOutboxEvent,
  createOutboundEmailId,
  updateEmailOutboxEvent,
} from '@/lib/server/email-outbox';


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
export function buildOtpHtml(otp: string, firstName: string): string {
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
    ${otp} is your Docrud verification code — expires in 30 minutes. Do not share it.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
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
                      ⏱ Expires in <strong style="color:#64748b;">30 minutes</strong>
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

export function buildOtpText(otp: string, firstName: string): string {
  return `Hi${firstName ? ` ${firstName}` : ''},

Your Docrud email verification code is:

  ${otp}

Enter this code in the Docrud app to verify your account. It expires in 30 minutes.

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

/* ─── Delivery ────────────────────────────────────────────────────────────── */

type Attempt = {
  label: string;
  /** True when this attempt authenticates with the configured relay account. */
  credentialed?: boolean;
  run: () => Promise<{ messageId?: string }>;
};

/**
 * Run one delivery attempt. Never throws — the caller walks the list and the
 * LAST failure is what surfaces, so a broken first hop cannot mask a working
 * second one.
 */
async function runAttempt(
  attempt: Attempt,
): Promise<{ ok: true; messageId?: string } | { ok: false; error: string; kind: MailFailureKind }> {
  try {
    const info = await attempt.run();
    console.log(`[otp-email] ${attempt.label}: delivered (msgId=${info.messageId ?? 'n/a'})`);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    /* Classified rather than stringified: "535 mailbox suspended" and "connect
       ETIMEDOUT" need different answers from an operator, and the outbox row
       below is where they go looking. */
    const failure = classifyMailError(err);
    console.error(`[otp-email] ${attempt.label}: failed (${failure.kind}) — ${failure.message}`);
    return { ok: false, error: `${attempt.label}: ${failure.message}`, kind: failure.kind };
  }
}

async function sendVia(
  transport: nodemailer.Transporter,
  mailOptions: Parameters<nodemailer.Transporter['sendMail']>[0],
): Promise<{ messageId?: string }> {
  try {
    const info = await transport.sendMail(mailOptions);
    return { messageId: info.messageId };
  } finally {
    try { (transport as nodemailer.Transporter & { close?: () => void }).close?.(); } catch { /* ignore */ }
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

export type OtpEmailPurpose = 'email_verification' | 'signup_verification';

export type SendOtpEmailInput = {
  to: string;
  otp: string;
  firstName?: string;
  /** Recorded on the outbox row so an operator can tell the flows apart. */
  purpose: OtpEmailPurpose;
  /** Present only once an account exists; a pre-account signup has no user id. */
  userId?: string;
};

/**
 * Build and deliver the verification code. Throws when every path failed.
 *
 * The outbox row is written BEFORE the first attempt and updated after the
 * last, so a code that never arrived is visible in the admin console with the
 * provider's own words for why.
 */
export async function sendOtpEmail(input: SendOtpEmailInput): Promise<void> {
  const to = String(input.to || '').trim();
  const otp = String(input.otp || '').trim();
  const firstName = String(input.firstName || '').trim();
  if (!to || !otp) throw new Error('An OTP email needs a recipient and a code.');

  /* Two independent storage reads, so they go together rather than one after
     the other. Neither depends on the other's answer, and on a deployment where
     these are database round trips the second one was pure added latency.

     Presentation comes from the PUBLISHED system-email configuration when one
     exists and renders cleanly. `resolveSystemEmail` returns null for every
     failure mode — no published version, storage down, corrupt content, an
     unresolved variable — so the built-in template below stays the guaranteed
     path. An admin's editing mistake must never stop a verification code
     arriving. The code itself is generated, hashed and expired by the flow that
     owns the session; only the wording is configurable. */
  const [smtp, configured] = await Promise.all([
    getMailSettings(),
    resolveSystemEmail('signup_otp', {
      otp, firstName: firstName || 'there', email: to,
    }).catch(() => null),
  ]);

  if (!smtp.fromEmail) throw new Error('SMTP sender address is not configured.');

  const senderDomain = smtp.fromEmail.split('@')[1] ?? 'docrud.com';
  const messageId = `<otp-${Date.now()}-${crypto.randomBytes(6).toString('hex')}@${senderDomain}>`;

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

  const outboxId = createOutboundEmailId('otp');
  const queuedAt = new Date().toISOString();
  /* Started, NOT awaited. Recording the row costs a write (and, on the database
     path, a trim of the outbox) and the code does not depend on it, so it runs
     alongside the SMTP handshake rather than in front of it. It is awaited
     before the row is updated, so the update can never overtake the insert. */
  const recorded = appendEmailOutboxEvent({
    id: outboxId,
    createdAt: queuedAt,
    status: 'queued',
    type: 'system',
    to,
    subject: mailOptions.subject,
    sentBy: 'system',
    tracking: { opens: 0, clicks: 0 },
    metadata: { purpose: input.purpose, ...(input.userId ? { userId: input.userId } : {}) },
  }).catch((err) => {
    /* The outbox is a record, not the delivery. Losing the row must not lose
       the code. */
    console.error('[otp-email] could not record the outbox row', err);
  });

  const attempts: Attempt[] = [];

  /* An authenticated relay with no credentials to authenticate WITH cannot
     deliver, and finding that out costs a full TCP + TLS handshake before the
     server gets as far as rejecting the login — measured at ~2 s per port
     against the configured host. Two ports meant ~4 s spent, every single
     send, learning something the configuration already said. So the relay is
     only attempted when it could actually work. */
  const relayUsable = Boolean(smtp.host)
    && (!smtp.requireAuth || Boolean(smtp.username && smtp.password));

  if (smtp.host && !relayUsable) {
    console.warn(
      `[otp-email] relay(${smtp.host}) skipped: authentication is required but no `
      + 'username/password is configured. Set the SMTP credentials in mail settings.',
    );
  }

  if (relayUsable) {
    /* 1. The application's one pooled, authenticated transport. */
    attempts.push({
      label: `relay(${smtp.host})`,
      credentialed: true,
      run: () => getMailProvider().send({
        from: mailOptions.from,
        to: mailOptions.to,
        replyTo: mailOptions.replyTo,
        subject: mailOptions.subject,
        text: mailOptions.text,
        html: mailOptions.html,
      }),
    });

    /* 2. The same relay host on the other submission port. Certificates are
          verified here exactly as they are on the pooled transport — this is a
          port change, not a downgrade in trust. */
    const altPort = Number(smtp.port) === 587 ? 465 : 587;
    attempts.push({
      label: `relay-${altPort}(${smtp.host})`,
      credentialed: true,
      run: () => sendVia(nodemailer.createTransport({
        host: smtp.host,
        port: altPort,
        secure: altPort === 465,
        auth: smtp.requireAuth ? { user: smtp.username, pass: smtp.password } : undefined,
        connectionTimeout: 12_000,
        greetingTimeout:    8_000,
        socketTimeout:     12_000,
      }), mailOptions),
    });
  }

  /* 3. Direct-to-MX on 587. Unauthenticated and not SPF-aligned, so it is a
        last resort rather than a peer of the paths above.

        The MX lookup happens INSIDE the attempt. It used to run while this list
        was being built, which meant every send — including the overwhelming
        majority that the relay delivers on the first try — paid for a DNS
        round trip whose answer was then thrown away (measured at ~0.5 s cold).
        Now it is only paid when this fallback is actually reached. */
  const recipientDomain = to.split('@')[1] ?? '';
  if (recipientDomain) {
    attempts.push({
      label: `direct-mx-587(${recipientDomain})`,
      run: async () => {
        const mxHost = await resolveTopMx(recipientDomain);
        if (!mxHost) throw new Error(`no MX record for ${recipientDomain}`);
        return sendVia(nodemailer.createTransport({
          host: mxHost,
          port: 587,
          secure: false,
          name: senderDomain,
          connectionTimeout: 10_000,
          greetingTimeout:    6_000,
          socketTimeout:     10_000,
          /* The ONLY permissive TLS in the mail paths, and only here. A receiving
             MX presents a certificate for its own hostname, which frequently does
             not match the name its MX record advertises; refusing that would make
             this fallback useless. Encrypted-but-unauthenticated is standard
             opportunistic-TLS behaviour for direct MX delivery, and it is still
             better than the cleartext alternative. Every AUTHENTICATED path above
             verifies certificates, because a credential travels over those. */
          tls: { rejectUnauthorized: false },
        }), mailOptions);
      },
    });
  }

  const failures: string[] = [];
  /* Set once the relay says the credentials are no good. The alternate port is
     the SAME host and the SAME account, so it will be told exactly the same
     thing — and a second handshake to hear it costs another two seconds. An
     auth failure is not retryable by definition (see classifyMailError), so
     this skips work that could not have changed the outcome. */
  let credentialsRejected = false;

  for (const attempt of attempts) {
    if (attempt.credentialed && credentialsRejected) {
      failures.push(`${attempt.label}: skipped — the relay already rejected these credentials`);
      continue;
    }

    const result = await runAttempt(attempt);
    if (result.ok) {
      /* The insert was started before the send; make sure it has landed before
         updating the row it created. */
      await recorded;
      await updateEmailOutboxEvent(outboxId, (ev) => ({
        ...ev,
        status: 'sent',
        messageId: result.messageId,
        sentAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attempts: failures.length + 1,
      })).catch(() => { /* the mail went; the bookkeeping is best-effort */ });
      return;
    }
    if (result.kind === 'auth') credentialsRejected = true;
    failures.push(result.error);
  }

  const summary = failures.length
    ? `OTP delivery failed for every configured path — ${failures.join(' | ')}`
    : 'OTP delivery failed: no mail relay is configured and the recipient domain has no reachable MX.';

  await recorded;
  await updateEmailOutboxEvent(outboxId, (ev) => ({
    ...ev,
    status: 'failed',
    error: summary,
    attempts: Math.max(1, failures.length),
    failedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })).catch(() => { /* already failing; do not mask the cause */ });

  throw new Error(summary);
}
