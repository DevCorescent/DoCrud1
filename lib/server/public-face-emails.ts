/**
 * Public Face application email helpers
 * OTP verification, application received, under review, approved, rejected
 */

import { sendTrackedMail } from '@/lib/server/mailer';
import { buildEmailChrome, escapeHtmlLite } from '@/lib/server/email-chrome';
import { getPublicAppBaseUrl } from '@/lib/url';
import type { PublicFaceCategory } from '@/types/document';

function origin() {
  return getPublicAppBaseUrl().replace(/\/$/, '');
}

export const PUBLIC_FACE_CATEGORY_LABELS: Record<PublicFaceCategory, string> = {
  actor_actress: 'Actor / Actress',
  singer_musician: 'Singer / Musician',
  athlete_sportsperson: 'Athlete / Sportsperson',
  model: 'Model',
  content_creator: 'Content Creator',
  influencer: 'Influencer',
  politician: 'Politician',
  entrepreneur_ceo: 'Entrepreneur / CEO',
  author_writer: 'Author / Writer',
  academic_scientist: 'Academic / Scientist',
  tv_personality: 'TV Personality',
  comedian: 'Comedian',
  social_activist: 'Social Activist',
  chef_culinary: 'Chef / Culinary Expert',
  fashion_designer: 'Fashion Designer',
  photographer_videographer: 'Photographer / Videographer',
  game_streamer: 'Game Streamer',
  journalist: 'Journalist',
  other: 'Public Figure',
};

/* ─── OTP email ──────────────────────────────────────────────────────── */
export async function sendPublicFaceOtpEmail(opts: {
  to: string;
  name: string;
  otp: string;
  expiresAt: string;
}) {
  const { to, name, otp, expiresAt } = opts;
  const safeName = escapeHtmlLite(name || 'there');
  const expireTime = new Date(expiresAt).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#e2e8f0;line-height:1.6;">
      Hi <strong style="color:#f8fafc;">${safeName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;line-height:1.7;">
      You are one step away from submitting your <strong style="color:#f8fafc;">Public Face</strong> application.
      Use the OTP below to verify your email and complete your submission.
    </p>

    <div style="margin:28px 0;text-align:center;">
      <div style="display:inline-block;background:#0f172a;border:2px solid #a855f7;border-radius:16px;padding:24px 40px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#64748b;letter-spacing:0.12em;text-transform:uppercase;">
          Verification Code
        </p>
        <p style="margin:0;font-size:38px;font-weight:900;letter-spacing:0.18em;color:#d946ef;font-variant-numeric:tabular-nums;">
          ${otp}
        </p>
        <p style="margin:8px 0 0;font-size:11px;color:#64748b;">
          Expires at ${expireTime} · Valid for 10 minutes
        </p>
      </div>
    </div>

    <div style="background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.25);border-radius:12px;padding:16px 20px;margin:0 0 24px;">
      <p style="margin:0;font-size:13px;color:#c084fc;font-weight:600;">
        ✨ Public Face Application
      </p>
      <p style="margin:8px 0 0;font-size:13px;color:#94a3b8;line-height:1.6;">
        Once approved, your profile will receive a <strong style="color:#f8fafc;">Public Face badge</strong> with your category,
        and you'll be featured in the exclusive Public Faces directory.
      </p>
    </div>

    <p style="margin:0;font-size:12px;color:#475569;">
      If you didn't request this, please ignore this email. This OTP is valid for <strong style="color:#94a3b8;">10 minutes only</strong>.
    </p>
  `;

  const html = buildEmailChrome({
    origin: origin(),
    subject: 'Verify your email — Public Face application',
    preheader: `Your OTP is ${otp}. Valid for 10 minutes.`,
    bodyHtml,
  });

  return sendTrackedMail({
    policyKey: 'public_face_notifications',
    typeLabel: 'system',
    to,
    subject: 'Verify your email — Public Face application',
    text: `Your OTP to verify your Public Face application is: ${otp}. Valid for 10 minutes.`,
    html,
    preheader: `Your OTP is ${otp}`,
    origin: origin(),
  });
}

/* ─── Application received ───────────────────────────────────────────── */
export async function sendPublicFaceApplicationReceivedEmail(opts: {
  to: string;
  name: string;
  category: PublicFaceCategory;
  applicationId: string;
}) {
  const { to, name, category, applicationId } = opts;
  const safeName = escapeHtmlLite(name || 'there');
  const categoryLabel = PUBLIC_FACE_CATEGORY_LABELS[category] || 'Public Figure';

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#e2e8f0;line-height:1.6;">
      Hi <strong style="color:#f8fafc;">${safeName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;line-height:1.7;">
      We've received your <strong style="color:#f8fafc;">Public Face application</strong> and it's now in our review queue.
      Our team will carefully review your submission and get back to you within <strong style="color:#f8fafc;">3–5 business days</strong>.
    </p>

    <div style="background:linear-gradient(135deg,rgba(168,85,247,0.12),rgba(99,102,241,0.12));border:1px solid rgba(168,85,247,0.3);border-radius:16px;padding:20px 24px;margin:0 0 24px;">
      <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:0.1em;">Your Application</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;justify-content:space-between;gap:16px;">
          <span style="font-size:12px;color:#64748b;">Application ID</span>
          <span style="font-size:12px;color:#e2e8f0;font-weight:600;font-family:monospace;">${applicationId.slice(0, 12)}…</span>
        </div>
        <div style="display:flex;justify-content:space-between;gap:16px;">
          <span style="font-size:12px;color:#64748b;">Category</span>
          <span style="font-size:12px;color:#c084fc;font-weight:700;">${escapeHtmlLite(categoryLabel)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;gap:16px;">
          <span style="font-size:12px;color:#64748b;">Status</span>
          <span style="font-size:12px;color:#fbbf24;font-weight:700;">Pending Review</span>
        </div>
      </div>
    </div>

    <p style="margin:0 0 16px;font-size:13px;color:#94a3b8;line-height:1.7;">
      <strong style="color:#f8fafc;">What happens next?</strong>
    </p>
    <ul style="margin:0 0 20px;padding-left:20px;font-size:13px;color:#94a3b8;line-height:1.8;">
      <li>Our team reviews your social presence and identity proof</li>
      <li>We may request additional information if needed</li>
      <li>Once approved, your profile gets the <strong style="color:#c084fc;">Public Face badge</strong></li>
      <li>You'll be featured in the exclusive <strong style="color:#f8fafc;">Public Faces directory</strong></li>
    </ul>

    <p style="margin:0;font-size:12px;color:#475569;">
      You'll receive another email as soon as the review is complete.
    </p>
  `;

  const html = buildEmailChrome({
    origin: origin(),
    subject: 'Your Public Face application has been received',
    preheader: `Application received for ${categoryLabel} — review in progress.`,
    bodyHtml,
  });

  return sendTrackedMail({
    policyKey: 'public_face_notifications',
    typeLabel: 'system',
    to,
    subject: 'Your Public Face application has been received',
    text: `Hi ${name}, we've received your Public Face application for "${categoryLabel}". We'll review it within 3–5 business days.`,
    html,
    origin: origin(),
  });
}

/* ─── Application approved ───────────────────────────────────────────── */
export async function sendPublicFaceApprovedEmail(opts: {
  to: string;
  name: string;
  category: PublicFaceCategory;
}) {
  const { to, name, category } = opts;
  const safeName = escapeHtmlLite(name || 'there');
  const categoryLabel = PUBLIC_FACE_CATEGORY_LABELS[category] || 'Public Figure';

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#e2e8f0;line-height:1.6;">
      Congratulations, <strong style="color:#f8fafc;">${safeName}</strong>! 🎉
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;line-height:1.7;">
      Your <strong style="color:#f8fafc;">Public Face application has been approved!</strong> You are now officially recognised as a
      <strong style="color:#c084fc;">${escapeHtmlLite(categoryLabel)}</strong> on Docrud.
    </p>

    <div style="background:linear-gradient(135deg,rgba(168,85,247,0.15),rgba(217,70,239,0.15));border:1px solid rgba(168,85,247,0.4);border-radius:20px;padding:28px;margin:0 0 28px;text-align:center;">
      <div style="font-size:48px;margin:0 0 12px;">✨</div>
      <p style="margin:0 0 8px;font-size:22px;font-weight:900;color:#f8fafc;letter-spacing:-0.02em;">Public Face</p>
      <p style="margin:0 0 16px;font-size:14px;color:#c084fc;font-weight:700;">${escapeHtmlLite(categoryLabel)}</p>
      <div style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7,#d946ef);border-radius:12px;padding:10px 24px;">
        <p style="margin:0;font-size:13px;font-weight:800;color:#fff;letter-spacing:0.05em;">VERIFIED PUBLIC FACE</p>
      </div>
    </div>

    <p style="margin:0 0 12px;font-size:13px;color:#94a3b8;line-height:1.7;">
      <strong style="color:#f8fafc;">Your new privileges:</strong>
    </p>
    <ul style="margin:0 0 20px;padding-left:20px;font-size:13px;color:#94a3b8;line-height:1.8;">
      <li>Your profile now displays the <strong style="color:#c084fc;">Public Face badge</strong> with your category</li>
      <li>You are featured in the exclusive <strong style="color:#f8fafc;">Public Faces directory</strong></li>
      <li>You can send messages to anyone on the platform</li>
      <li>Your profile is prioritised in discovery and search results</li>
    </ul>

    <p style="margin:0;font-size:12px;color:#475569;">
      Visit your profile to see your new badge. Welcome to the Public Faces community!
    </p>
  `;

  const html = buildEmailChrome({
    origin: origin(),
    subject: '🎉 Congratulations — You are now a Public Face!',
    preheader: `Your Public Face application as ${categoryLabel} has been approved.`,
    bodyHtml,
  });

  return sendTrackedMail({
    policyKey: 'public_face_notifications',
    typeLabel: 'system',
    to,
    subject: '🎉 Congratulations — You are now a Public Face!',
    text: `Congratulations ${name}! Your Public Face application for "${categoryLabel}" has been approved. Your profile now has the Public Face badge.`,
    html,
    origin: origin(),
  });
}

/* ─── Application rejected ───────────────────────────────────────────── */
export async function sendPublicFaceRejectedEmail(opts: {
  to: string;
  name: string;
  category: PublicFaceCategory;
  adminNote?: string;
}) {
  const { to, name, category, adminNote } = opts;
  const safeName = escapeHtmlLite(name || 'there');
  const categoryLabel = PUBLIC_FACE_CATEGORY_LABELS[category] || 'Public Figure';

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#e2e8f0;line-height:1.6;">
      Hi <strong style="color:#f8fafc;">${safeName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;line-height:1.7;">
      After careful review, we were unable to approve your <strong style="color:#f8fafc;">Public Face application</strong> for
      <strong style="color:#c084fc;">${escapeHtmlLite(categoryLabel)}</strong> at this time.
    </p>

    ${adminNote ? `
    <div style="background:rgba(248,113,113,0.06);border:1px solid rgba(248,113,113,0.2);border-radius:12px;padding:16px 20px;margin:0 0 24px;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#f87171;text-transform:uppercase;letter-spacing:0.1em;">Review Note</p>
      <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">${escapeHtmlLite(adminNote)}</p>
    </div>
    ` : ''}

    <p style="margin:0 0 12px;font-size:13px;color:#94a3b8;line-height:1.7;">
      <strong style="color:#f8fafc;">You can reapply</strong> after strengthening your public presence:
    </p>
    <ul style="margin:0 0 20px;padding-left:20px;font-size:13px;color:#94a3b8;line-height:1.8;">
      <li>Grow your social media following and engagement</li>
      <li>Add more proof of public recognition (awards, media features)</li>
      <li>Ensure your identity proof is clear and matches your profile</li>
      <li>Provide links to credible press coverage or notable achievements</li>
    </ul>

    <p style="margin:0;font-size:12px;color:#475569;">
      We appreciate your application and encourage you to apply again once you have additional evidence of your public standing.
    </p>
  `;

  const html = buildEmailChrome({
    origin: origin(),
    subject: 'Update on your Public Face application',
    preheader: 'Your Public Face application requires more information.',
    bodyHtml,
  });

  return sendTrackedMail({
    policyKey: 'public_face_notifications',
    typeLabel: 'system',
    to,
    subject: 'Update on your Public Face application',
    text: `Hi ${name}, we reviewed your Public Face application for "${categoryLabel}" and were unable to approve it at this time.${adminNote ? ` Note: ${adminNote}` : ''} You may reapply after strengthening your public presence.`,
    html,
    origin: origin(),
  });
}

/* ─── Admin notification ─────────────────────────────────────────────── */
export async function sendPublicFaceAdminNotificationEmail(opts: {
  adminEmail: string;
  applicantName: string;
  applicantEmail: string;
  category: PublicFaceCategory;
  applicationId: string;
  adminPanelUrl: string;
}) {
  const { adminEmail, applicantName, applicantEmail, category, applicationId, adminPanelUrl } = opts;
  const categoryLabel = PUBLIC_FACE_CATEGORY_LABELS[category] || 'Public Figure';

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#e2e8f0;line-height:1.6;">
      A new <strong style="color:#f8fafc;">Public Face application</strong> has been submitted and is awaiting your review.
    </p>

    <div style="background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.25);border-radius:16px;padding:20px 24px;margin:0 0 24px;">
      <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:0.1em;">Application Details</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div><span style="font-size:12px;color:#64748b;">Applicant: </span><span style="font-size:13px;color:#f8fafc;font-weight:600;">${escapeHtmlLite(applicantName)}</span></div>
        <div><span style="font-size:12px;color:#64748b;">Email: </span><span style="font-size:13px;color:#e2e8f0;">${escapeHtmlLite(applicantEmail)}</span></div>
        <div><span style="font-size:12px;color:#64748b;">Category: </span><span style="font-size:13px;color:#c084fc;font-weight:700;">${escapeHtmlLite(categoryLabel)}</span></div>
        <div><span style="font-size:12px;color:#64748b;">ID: </span><span style="font-size:12px;color:#94a3b8;font-family:monospace;">${applicationId}</span></div>
      </div>
    </div>

    <div style="text-align:center;margin:24px 0;">
      <a href="${escapeHtmlLite(adminPanelUrl)}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;font-size:14px;font-weight:700;padding:12px 28px;border-radius:12px;text-decoration:none;letter-spacing:0.02em;">
        Review Application →
      </a>
    </div>

    <p style="margin:0;font-size:12px;color:#475569;">
      Please review this application at your earliest convenience and approve or reject with a note.
    </p>
  `;

  const html = buildEmailChrome({
    origin: origin(),
    subject: `New Public Face application — ${applicantName} (${categoryLabel})`,
    preheader: `${applicantName} has applied as ${categoryLabel}. Review pending.`,
    bodyHtml,
  });

  return sendTrackedMail({
    policyKey: 'public_face_notifications',
    typeLabel: 'system',
    to: adminEmail,
    subject: `New Public Face application — ${applicantName} (${categoryLabel})`,
    text: `New Public Face application from ${applicantName} (${applicantEmail}) for ${categoryLabel}. Application ID: ${applicationId}. Review at: ${adminPanelUrl}`,
    html,
    origin: origin(),
  });
}
