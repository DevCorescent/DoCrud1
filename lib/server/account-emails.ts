/**
 * Account lifecycle email helpers
 * OTP verification, deactivation, deletion, warning, reactivation
 */

import { sendTrackedMail } from '@/lib/server/mailer';
import { resolveSystemEmail } from '@/lib/server/system-emails';
import { buildEmailChrome, escapeHtmlLite } from '@/lib/server/email-chrome';
import { getPublicAppBaseUrl } from '@/lib/url';

function origin() {
  return getPublicAppBaseUrl().replace(/\/$/, '');
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/* ─── OTP email ─────────────────────────────────────────────────────── */
export async function sendAccountActionOtpEmail(opts: {
  to: string;
  name: string;
  otp: string;
  action: 'deactivate' | 'delete';
  expiresAt: string;
}) {
  const { to, name, otp, action, expiresAt } = opts;
  const safeName   = escapeHtmlLite(name || 'there');
  const actionWord = action === 'delete' ? 'permanently delete' : 'deactivate';
  const actionBig  = action === 'delete' ? 'Delete Account' : 'Deactivate Account';
  const color      = action === 'delete' ? '#ef4444' : '#f59e0b';
  const expireTime = new Date(expiresAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#e2e8f0;line-height:1.6;">
      Hi <strong style="color:#f8fafc;">${safeName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;line-height:1.7;">
      We received a request to <strong style="color:#f8fafc;">${actionWord}</strong> your Docrud account.
      Use the OTP below to confirm this action.
    </p>

    <!-- OTP box -->
    <div style="margin:28px 0;text-align:center;">
      <div style="display:inline-block;background:#0f172a;border:2px solid ${color};border-radius:16px;padding:24px 40px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#64748b;letter-spacing:0.12em;text-transform:uppercase;">
          One-Time Password
        </p>
        <p style="margin:0;font-size:38px;font-weight:900;letter-spacing:0.18em;color:${color};font-variant-numeric:tabular-nums;">
          ${otp}
        </p>
        <p style="margin:8px 0 0;font-size:11px;color:#64748b;">
          Expires at ${expireTime} · Valid for 10 minutes
        </p>
      </div>
    </div>

    <div style="background:${action === 'delete' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)'};border:1px solid ${color}33;border-radius:12px;padding:16px 20px;margin:0 0 24px;">
      <p style="margin:0;font-size:13px;color:${action === 'delete' ? '#fca5a5' : '#fcd34d'};font-weight:600;">
        ⚠️ ${actionBig} — Important Notice
      </p>
      <p style="margin:8px 0 0;font-size:13px;color:#94a3b8;line-height:1.6;">
        ${action === 'delete'
          ? 'This action is <strong style="color:#f8fafc;">permanent and irreversible</strong>. All your data, posts, connections, gigs, and documents will be permanently erased.'
          : 'Your account will be temporarily deactivated. You can reactivate it at any time by simply logging in.'
        }
      </p>
    </div>

    <p style="margin:0 0 8px;font-size:13px;color:#64748b;">
      If you did not request this, please ignore this email — your account is safe.
    </p>
    <p style="margin:0;font-size:12px;color:#475569;">
      For security, this OTP is valid for <strong style="color:#94a3b8;">10 minutes only</strong> and can be used once.
    </p>
  `;

  const html = buildEmailChrome({
    origin: origin(),
    subject: `${otp} — Your Docrud ${actionBig} OTP`,
    preheader: `OTP: ${otp} — Use this to ${actionWord} your Docrud account.`,
    bodyHtml,
  });

  /* Presentation may come from the published system-email configuration.
     `resolveSystemEmail` returns null for every failure mode, so the built-in
     content below stays the guaranteed path — an editing mistake must never
     stop an account-action code arriving. The OTP, its expiry and the action
     itself are still decided by the caller. */
  const configured = await resolveSystemEmail('account_action_otp', {
    otp,
    firstName: (name || 'there').split(' ')[0],
    action: actionWord,
    expiresAt: expireTime,
  }).catch(() => null);

  return sendTrackedMail({
    policyKey: 'otp_verification',
    typeLabel: 'system',
    to,
    subject: configured?.subject ?? `${otp} — Your Docrud ${actionBig} OTP`,
    preheader: `OTP: ${otp} — Use this to ${actionWord} your Docrud account.`,
    text: configured?.text
      ?? `Your Docrud ${actionBig} OTP is: ${otp}\nValid until ${expireTime}.\nDo not share this with anyone.`,
    html: configured?.html ?? html,
    origin: origin(),
    sentBy: 'system',
    metadata: { action, userId: opts.to },
  });
}

/* ─── Deactivation confirmation email ───────────────────────────────── */
export async function sendDeactivationConfirmEmail(opts: {
  to: string;
  name: string;
  deadline: string | null; // ISO or null = indefinite
}) {
  const { to, name, deadline } = opts;
  const safeName = escapeHtmlLite(name || 'there');
  const deadlineText = deadline
    ? `Your account will be <strong style="color:#f8fafc;">automatically deleted on ${fmt(deadline)}</strong> if not reactivated.`
    : `Your account will remain deactivated indefinitely until you log in to reactivate it.`;

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#e2e8f0;line-height:1.6;">
      Hi <strong style="color:#f8fafc;">${safeName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;line-height:1.7;">
      Your Docrud account has been <strong style="color:#f8fafc;">successfully deactivated</strong>.
      Your profile is now hidden from the platform.
    </p>

    <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#fcd34d;">📅 Timeline</p>
      <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.7;">${deadlineText}</p>
    </div>

    <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.20);border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#a5b4fc;">✦ How to reactivate</p>
      <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.7;">
        Simply <strong style="color:#f8fafc;">log in to Docrud</strong> using your existing credentials.
        Your account will be instantly restored with all your data intact.
      </p>
    </div>

    <div style="text-align:center;margin:28px 0;">
      <a href="${origin()}/login"
         style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;padding:13px 32px;border-radius:12px;font-size:14px;font-weight:700;letter-spacing:-0.01em;">
        Log in to Reactivate
      </a>
    </div>

    <p style="margin:0;font-size:12px;color:#475569;text-align:center;">
      Didn't request this? Contact us at <a href="mailto:support@docrud.app" style="color:#6366f1;">support@docrud.app</a>
    </p>
  `;

  const html = buildEmailChrome({
    origin: origin(),
    subject: 'Your Docrud account has been deactivated',
    preheader: 'Your account is deactivated. Log in anytime to reactivate it.',
    bodyHtml,
  });

    /* Presentation only: the caller still decides WHICH email this is,
     who receives it and what the values are. A resolution failure
     returns null and the built-in content below is used. */
  const configured = await resolveSystemEmail('account_deactivated', {
    firstName: (name || 'there').split(' ')[0],
    deadline: deadline ? fmt(deadline) : 'you sign in again',
  }).catch(() => null);

return sendTrackedMail({
    policyKey: 'otp_verification',
    typeLabel: 'system',
    to,
    subject: configured?.subject ?? 'Your Docrud account has been deactivated',
    preheader: 'Your account is deactivated. Log in anytime to reactivate it.',
    text: configured?.text ?? `Your Docrud account has been deactivated. ${deadline ? `It will be deleted on ${fmt(deadline)} if not reactivated.` : 'Log in anytime to reactivate.'} Visit ${origin()}/login to reactivate.`,
    html: configured?.html ?? html,
    origin: origin(),
    sentBy: 'system',
  });
}

/* ─── 1-week warning email ───────────────────────────────────────────── */
export async function sendDeactivationWarningEmail(opts: {
  to: string;
  name: string;
  deadline: string; // ISO
}) {
  const { to, name, deadline } = opts;
  const safeName = escapeHtmlLite(name || 'there');

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#e2e8f0;line-height:1.6;">
      Hi <strong style="color:#f8fafc;">${safeName}</strong>,
    </p>

    <div style="background:rgba(239,68,68,0.10);border:1px solid rgba(239,68,68,0.30);border-radius:12px;padding:20px;margin:0 0 20px;">
      <p style="margin:0 0 6px;font-size:14px;font-weight:800;color:#fca5a5;">⚠️ Account Deletion Warning</p>
      <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.7;">
        Your Docrud account is scheduled to be <strong style="color:#f8fafc;">permanently deleted on ${fmt(deadline)}</strong>
        (in 7 days) because it has been deactivated.
      </p>
    </div>

    <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;line-height:1.7;">
      All your data — posts, connections, documents, gigs, and profile — will be
      <strong style="color:#f8fafc;">permanently and irreversibly erased</strong>.
    </p>

    <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.20);border-radius:12px;padding:20px;margin:0 0 28px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#a5b4fc;">✦ Reactivate before it's too late</p>
      <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.7;">
        Just <strong style="color:#f8fafc;">log in to Docrud</strong> with your credentials and your
        account will be instantly restored — no forms, no waiting.
      </p>
    </div>

    <div style="text-align:center;margin:0 0 24px;">
      <a href="${origin()}/login"
         style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;padding:14px 36px;border-radius:12px;font-size:14px;font-weight:700;letter-spacing:-0.01em;box-shadow:0 4px 20px rgba(99,102,241,0.45);">
        Reactivate My Account
      </a>
    </div>

    <p style="margin:0;font-size:12px;color:#475569;text-align:center;">
      If you intended to delete your account, no action is needed.
      Questions? <a href="mailto:support@docrud.app" style="color:#6366f1;">support@docrud.app</a>
    </p>
  `;

  const html = buildEmailChrome({
    origin: origin(),
    subject: '⚠️ Your Docrud account will be deleted in 7 days',
    preheader: `Act now — your account will be permanently deleted on ${fmt(deadline)}.`,
    bodyHtml,
  });

    /* Presentation only: the caller still decides WHICH email this is,
     who receives it and what the values are. A resolution failure
     returns null and the built-in content below is used. */
  const configured = await resolveSystemEmail('account_deletion_warning', {
    firstName: (name || 'there').split(' ')[0],
    deadline: fmt(deadline),
  }).catch(() => null);

return sendTrackedMail({
    policyKey: 'otp_verification',
    typeLabel: 'system',
    to,
    subject: configured?.subject ?? '⚠️ Your Docrud account will be deleted in 7 days',
    preheader: `Act now — your account will be permanently deleted on ${fmt(deadline)}.`,
    text: configured?.text ?? `Warning: Your Docrud account will be permanently deleted on ${fmt(deadline)}. Log in now to reactivate: ${origin()}/login`,
    html: configured?.html ?? html,
    origin: origin(),
    sentBy: 'system',
  });
}

/* ─── Account deleted confirmation ─────────────────────────────────── */
export async function sendAccountDeletedEmail(opts: { to: string; name: string }) {
  const safeName = escapeHtmlLite(opts.name || 'there');

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#e2e8f0;line-height:1.6;">
      Hi <strong style="color:#f8fafc;">${safeName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;line-height:1.7;">
      Your Docrud account has been <strong style="color:#f8fafc;">permanently deleted</strong>.
      All associated data has been erased from our systems.
    </p>
    <div style="background:rgba(100,116,139,0.08);border:1px solid rgba(100,116,139,0.20);border-radius:12px;padding:16px 20px;margin:0 0 24px;">
      <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.7;">
        If you change your mind in the future, you're always welcome to
        <a href="${origin()}/register" style="color:#6366f1;font-weight:600;">create a new account</a>.
        We'd love to have you back.
      </p>
    </div>
    <p style="margin:0;font-size:12px;color:#475569;">
      Questions? <a href="mailto:support@docrud.app" style="color:#6366f1;">support@docrud.app</a>
    </p>
  `;

  const html = buildEmailChrome({
    origin: origin(),
    subject: 'Your Docrud account has been deleted',
    preheader: 'Account deletion confirmed. We\'re sad to see you go.',
    bodyHtml,
  });

    /* Presentation only: the caller still decides WHICH email this is,
     who receives it and what the values are. A resolution failure
     returns null and the built-in content below is used. */
  const configured = await resolveSystemEmail('account_deleted', {
    firstName: (opts.name || 'there').split(' ')[0],
  }).catch(() => null);

return sendTrackedMail({
    policyKey: 'otp_verification',
    typeLabel: 'system',
    to: opts.to,
    subject: configured?.subject ?? 'Your Docrud account has been deleted',
    preheader: 'Account deletion confirmed.',
    text: configured?.text ?? `Your Docrud account has been permanently deleted. If you change your mind, create a new account at ${origin()}/register`,
    html: configured?.html ?? html,
    origin: origin(),
    sentBy: 'system',
  });
}

/* ─── Reactivation email ────────────────────────────────────────────── */
export async function sendAccountReactivatedEmail(opts: { to: string; name: string }) {
  const safeName = escapeHtmlLite(opts.name || 'there');

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#e2e8f0;line-height:1.6;">
      Welcome back, <strong style="color:#f8fafc;">${safeName}</strong>! 🎉
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;line-height:1.7;">
      Your Docrud account has been <strong style="color:#f8fafc;">successfully reactivated</strong>.
      Everything is exactly as you left it — your profile, connections, documents, and gigs are all intact.
    </p>
    <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:12px;padding:20px;margin:0 0 28px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#6ee7b7;">✅ Account Restored</p>
      <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.7;">
        Your profile is now visible, and you have full access to all Docrud features.
      </p>
    </div>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${origin()}"
         style="display:inline-block;background:linear-gradient(135deg,#10b981,#059669);color:#fff;text-decoration:none;padding:13px 32px;border-radius:12px;font-size:14px;font-weight:700;">
        Go to Dashboard
      </a>
    </div>
  `;

  const html = buildEmailChrome({
    origin: origin(),
    subject: '✅ Your Docrud account is back!',
    preheader: 'Welcome back! Your account has been successfully reactivated.',
    bodyHtml,
  });

    /* Presentation only: the caller still decides WHICH email this is,
     who receives it and what the values are. A resolution failure
     returns null and the built-in content below is used. */
  const configured = await resolveSystemEmail('account_reactivated', {
    firstName: (opts.name || 'there').split(' ')[0],
  }).catch(() => null);

return sendTrackedMail({
    policyKey: 'otp_verification',
    typeLabel: 'system',
    to: opts.to,
    subject: configured?.subject ?? '✅ Your Docrud account is back!',
    preheader: 'Welcome back! Your account has been successfully reactivated.',
    text: configured?.text ?? `Welcome back! Your Docrud account has been reactivated. Visit ${origin()} to continue.`,
    html: configured?.html ?? html,
    origin: origin(),
    sentBy: 'system',
  });
}
