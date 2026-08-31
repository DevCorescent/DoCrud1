/**
 * Transactional emails for the business verification workflow.
 *
 * Emails sent:
 *  1. Owner  → "Received"  — when they submit the form
 *  2. Admin  → "New request" — alert to super admin inbox
 *  3. Owner  → "Approved"  — with congrats + badge note
 *  4. Owner  → "Rejected"  — with admin notes so they can fix & resubmit
 */
import { sendTrackedMail } from '@/lib/server/mailer';
import { resolveSystemEmail } from '@/lib/server/system-emails';
import { buildEmailChrome, escapeHtmlLite } from '@/lib/server/email-chrome';
import { getPublicAppBaseUrl } from '@/lib/url';
import { getSuperAdminEmail } from '@/lib/server/super-admin-auth';
import type { BusinessVerification } from '@/lib/server/business-verification';

// ── helpers ──────────────────────────────────────────────────────────────────
function origin() {
  return getPublicAppBaseUrl().replace(/\/$/, '');
}
const esc = escapeHtmlLite;

/** Shared branded button */
function btn(href: string, label: string, color = '#4f46e5') {
  return `<div style="text-align:center;margin:28px 0 8px;">
    <a href="${esc(href)}"
       style="display:inline-block;padding:13px 32px;border-radius:12px;
              background:${color};color:#fff;font-size:14px;font-weight:700;
              text-decoration:none;letter-spacing:-0.01em;">
      ${esc(label)}
    </a>
  </div>`;
}

/** Muted info row (label + value) */
function row(label: string, value: string) {
  return `<tr>
    <td style="padding:6px 12px 6px 0;font-size:12px;color:#94a3b8;white-space:nowrap;vertical-align:top;">${esc(label)}</td>
    <td style="padding:6px 0;font-size:12px;color:#e2e8f0;vertical-align:top;">${esc(value || '—')}</td>
  </tr>`;
}

/** Table of submitted verification details */
function detailsTable(v: BusinessVerification) {
  return `
  <table cellpadding="0" cellspacing="0" border="0"
    style="width:100%;border-collapse:collapse;margin:16px 0;background:#0f172a;
           border-radius:12px;overflow:hidden;border:1px solid #1e293b;">
    <tbody>
      ${row('Legal Name',        v.legalName)}
      ${row('Business Type',     v.businessType.replace(/_/g, ' ').toUpperCase())}
      ${row('Registration No.',  v.registrationNumber)}
      ${row('PAN',               v.pan)}
      ${row('GSTIN',             v.gstin ?? '—')}
      ${row('Address',           `${v.registeredAddress}, ${v.city}, ${v.state} ${v.pincode}, ${v.country}`)}
      ${row('Website',           v.website ?? '—')}
      ${row('Contact Person',    v.contactName)}
      ${row('Contact Email',     v.contactEmail)}
      ${row('Contact Phone',     v.contactPhone)}
      ${row('Years in Business', v.yearsInBusiness ?? '—')}
      ${row('Employee Count',    v.employeeCount ?? '—')}
      ${row('Annual Revenue',    v.annualRevenue ?? '—')}
      ${row('Category',          v.businessCategory ?? '—')}
    </tbody>
  </table>`;
}

// ── 1. Owner confirmation — "We received your request" ───────────────────────
export async function sendVerificationSubmittedEmail(opts: {
  ownerEmail: string;
  ownerName: string;
  businessName: string;
  verif: BusinessVerification;
}) {
  const { ownerEmail, ownerName, businessName, verif } = opts;
  const base = origin();
  const businessUrl = `${base}/businesses/${verif.businessPageId}`;

  const html = buildEmailChrome({
    origin: base,
    subject: 'Business Verification Request Received',
    preheader: `We've received your verification request for ${businessName}. Our team will review it shortly.`,
    bodyHtml: `
      <h2 style="color:#f8fafc;font-size:22px;font-weight:700;margin:0 0 6px;">
        Verification Request Received 🔍
      </h2>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 24px;">
        Hi ${esc(ownerName)}, we've received your business verification request for
        <strong style="color:#e2e8f0;">${esc(businessName)}</strong>.
        Our team will review your submission and respond within <strong style="color:#e2e8f0;">2–3 business days</strong>.
      </p>

      <div style="background:#1e293b;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
        <p style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:0.12em;
                  text-transform:uppercase;margin:0 0 4px;">WHAT HAPPENS NEXT</p>
        <ol style="color:#94a3b8;font-size:13px;margin:8px 0 0;padding-left:20px;line-height:1.8;">
          <li>Our compliance team reviews your submitted documents</li>
          <li>We may reach out at <strong style="color:#e2e8f0;">${esc(verif.contactEmail)}</strong> if we need more information</li>
          <li>You'll receive an email the moment a decision is made</li>
          <li>Once approved, a <strong style="color:#818cf8;">✓ Verified</strong> badge appears on your business profile</li>
        </ol>
      </div>

      <p style="color:#64748b;font-size:12px;font-weight:700;letter-spacing:0.12em;
                text-transform:uppercase;margin:20px 0 8px;">YOUR SUBMISSION SUMMARY</p>
      ${detailsTable(verif)}

      <p style="color:#64748b;font-size:12px;margin:20px 0 8px;">
        Submitted on ${new Date(verif.submittedAt).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}
      </p>
      ${btn(businessUrl, 'View Your Business Page')}
    `,
  });

    /* Presentation only: the caller still decides WHICH email this is,
     who receives it and what the values are. A resolution failure
     returns null and the built-in content below is used. */
  const configured = await resolveSystemEmail('business_verification_submitted', {
    firstName: (ownerName || 'there').split(' ')[0],
    businessName,
  }).catch(() => null);

await sendTrackedMail({
    policyKey: 'business_verification',
    typeLabel: 'system',
    to: ownerEmail,
    subject: configured?.subject ?? `Verification request received — ${businessName}`,
    text: configured?.text ?? `Hi ${ownerName}, we received your business verification request for ${businessName}. We'll review it within 2–3 business days and email you with the result.`,
    html: configured?.html ?? html,
    preheader: `Verification request received for ${businessName}`,
    origin: base,
  });
}

// ── 2. Admin alert — new request needs review ─────────────────────────────────
export async function sendVerificationAdminAlertEmail(opts: {
  businessName: string;
  ownerEmail: string;
  verif: BusinessVerification;
}) {
  const { businessName, ownerEmail, verif } = opts;
  const adminEmail = await getSuperAdminEmail();
  if (!adminEmail) return; // no admin email configured

  const base = origin();
  const reviewUrl = `${base}/super-admin`; // SA panel → Verifications tab

  const html = buildEmailChrome({
    origin: base,
    subject: 'New Business Verification Request',
    preheader: `${businessName} has submitted a verification request — review it in the admin panel.`,
    bodyHtml: `
      <h2 style="color:#f8fafc;font-size:22px;font-weight:700;margin:0 0 6px;">
        New Verification Request 📋
      </h2>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 20px;">
        A business owner has submitted a verification request that needs your review.
      </p>

      <div style="background:#1e293b;border-radius:12px;padding:16px 20px;margin-bottom:8px;">
        <p style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:0.12em;
                  text-transform:uppercase;margin:0 0 8px;">BUSINESS DETAILS</p>
        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
          <tbody>
            ${row('Business Name',  businessName)}
            ${row('Owner Email',    ownerEmail)}
            ${row('Submitted At',   new Date(verif.submittedAt).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' }))}
          </tbody>
        </table>
      </div>

      <p style="color:#64748b;font-size:12px;font-weight:700;letter-spacing:0.12em;
                text-transform:uppercase;margin:20px 0 8px;">SUBMITTED INFORMATION</p>
      ${detailsTable(verif)}
      ${btn(reviewUrl, 'Review in Admin Panel', '#7c3aed')}
    `,
  });

  await sendTrackedMail({
    policyKey: 'business_verification',
    typeLabel: 'system',
    to: adminEmail,
    subject: `[Action Required] New verification request — ${businessName}`,
    text: `New business verification request from ${businessName} (${ownerEmail}). Login to the admin panel to review: ${reviewUrl}`,
    html,
    preheader: `New verification request from ${businessName}`,
    origin: base,
    sentBy: 'system',
  });
}

// ── 3. Owner notification — Approved ─────────────────────────────────────────
export async function sendVerificationApprovedEmail(opts: {
  ownerEmail: string;
  ownerName: string;
  businessName: string;
  verif: BusinessVerification;
  adminNotes?: string;
}) {
  const { ownerEmail, ownerName, businessName, verif, adminNotes } = opts;
  const base = origin();
  const businessUrl = `${base}/businesses/${verif.businessPageId}`;

  const notesHtml = adminNotes?.trim()
    ? `<div style="background:#14532d;border:1px solid #166534;border-radius:12px;
                   padding:14px 18px;margin:16px 0;">
         <p style="color:#4ade80;font-size:11px;font-weight:700;letter-spacing:0.12em;
                   text-transform:uppercase;margin:0 0 6px;">NOTE FROM OUR TEAM</p>
         <p style="color:#bbf7d0;font-size:13px;margin:0;">${esc(adminNotes.trim())}</p>
       </div>`
    : '';

  const html = buildEmailChrome({
    origin: base,
    subject: `🎉 ${businessName} is now Verified on Docrud!`,
    preheader: `Congratulations! Your business has been verified — the badge is now live on your profile.`,
    bodyHtml: `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;background:#1e3a5f;border:2px solid #3b82f6;
                    border-radius:50%;width:64px;height:64px;line-height:64px;font-size:32px;">
          ✓
        </div>
      </div>
      <h2 style="color:#f8fafc;font-size:22px;font-weight:700;margin:0 0 6px;text-align:center;">
        Congratulations, You're Verified! 🎉
      </h2>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 24px;text-align:center;">
        Hi ${esc(ownerName)}, great news — <strong style="color:#e2e8f0;">${esc(businessName)}</strong>
        has been <strong style="color:#818cf8;">officially verified</strong> on Docrud.
      </p>

      <div style="background:#1e293b;border-radius:12px;padding:16px 20px;margin-bottom:16px;">
        <p style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:0.12em;
                  text-transform:uppercase;margin:0 0 10px;">WHAT THIS MEANS FOR YOU</p>
        <ul style="color:#94a3b8;font-size:13px;margin:0;padding-left:20px;line-height:1.9;">
          <li>A <strong style="color:#818cf8;">✓ Verified</strong> badge now appears on your business profile</li>
          <li>Your business is highlighted in the verified filter on the Businesses directory</li>
          <li>Customers and partners will see you as a trusted, verified entity</li>
        </ul>
      </div>

      ${notesHtml}
      ${btn(businessUrl, 'View Your Verified Business Page', '#059669')}
    `,
  });

    /* Presentation only: the caller still decides WHICH email this is,
     who receives it and what the values are. A resolution failure
     returns null and the built-in content below is used. */
  const configured = await resolveSystemEmail('business_verification_approved', {
    firstName: (ownerName || 'there').split(' ')[0],
    businessName,
  }).catch(() => null);

await sendTrackedMail({
    policyKey: 'business_verification',
    typeLabel: 'system',
    to: ownerEmail,
    subject: configured?.subject ?? `🎉 ${businessName} is now Verified on Docrud`,
    text: configured?.text ?? `Congratulations ${ownerName}! ${businessName} has been verified on Docrud. Your verified badge is now live on your business profile.${adminNotes ? `\n\nNote from our team: ${adminNotes}` : ''}`,
    html: configured?.html ?? html,
    preheader: `${businessName} is now verified on Docrud`,
    origin: base,
  });
}

// ── 4. Owner notification — Rejected ─────────────────────────────────────────
export async function sendVerificationRejectedEmail(opts: {
  ownerEmail: string;
  ownerName: string;
  businessName: string;
  verif: BusinessVerification;
  adminNotes: string;
}) {
  const { ownerEmail, ownerName, businessName, verif, adminNotes } = opts;
  const base = origin();
  const businessUrl = `${base}/businesses/${verif.businessPageId}`;

  const html = buildEmailChrome({
    origin: base,
    subject: `Action Required: Verification update for ${businessName}`,
    preheader: `We were unable to verify ${businessName} at this time. Please review the feedback and resubmit.`,
    bodyHtml: `
      <h2 style="color:#f8fafc;font-size:22px;font-weight:700;margin:0 0 6px;">
        Verification Update — Action Required
      </h2>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 20px;">
        Hi ${esc(ownerName)}, after reviewing your verification request for
        <strong style="color:#e2e8f0;">${esc(businessName)}</strong>,
        our compliance team was unable to approve it at this time.
        Please review the feedback below and resubmit with the requested corrections.
      </p>

      ${adminNotes?.trim()
        ? `<div style="background:#3b0e0e;border:1px solid #7f1d1d;border-radius:12px;
                       padding:14px 18px;margin:0 0 20px;">
             <p style="color:#f87171;font-size:11px;font-weight:700;letter-spacing:0.12em;
                       text-transform:uppercase;margin:0 0 8px;">FEEDBACK FROM OUR TEAM</p>
             <p style="color:#fca5a5;font-size:14px;margin:0;line-height:1.6;">${esc(adminNotes.trim())}</p>
           </div>`
        : `<div style="background:#1e293b;border-radius:12px;padding:14px 18px;margin:0 0 20px;">
             <p style="color:#94a3b8;font-size:13px;margin:0;">
               Please ensure all submitted information matches your official business registration documents
               and resubmit the form.
             </p>
           </div>`
      }

      <div style="background:#1e293b;border-radius:12px;padding:16px 20px;margin-bottom:16px;">
        <p style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:0.12em;
                  text-transform:uppercase;margin:0 0 8px;">WHAT TO DO NEXT</p>
        <ol style="color:#94a3b8;font-size:13px;margin:0;padding-left:20px;line-height:1.8;">
          <li>Read the feedback carefully above</li>
          <li>Correct the information in your verification form</li>
          <li>Visit your business page and click <em>"Resubmit"</em> to try again</li>
          <li>Our team will review your updated submission promptly</li>
        </ol>
      </div>

      ${btn(businessUrl, 'Go to Business Page & Resubmit', '#dc2626')}

      <p style="color:#475569;font-size:12px;text-align:center;margin-top:16px;">
        Need help? Reply to this email and our support team will assist you.
      </p>
    `,
  });

    /* Presentation only: the caller still decides WHICH email this is,
     who receives it and what the values are. A resolution failure
     returns null and the built-in content below is used. */
  const configured = await resolveSystemEmail('business_verification_rejected', {
    firstName: (ownerName || 'there').split(' ')[0],
    businessName,
    reason: adminNotes || 'No additional details were provided.',
  }).catch(() => null);

await sendTrackedMail({
    policyKey: 'business_verification',
    typeLabel: 'system',
    to: ownerEmail,
    subject: configured?.subject ?? `Verification update for ${businessName} — action required`,
    text: configured?.text ?? `Hi ${ownerName}, your verification request for ${businessName} could not be approved at this time.\n\nFeedback: ${adminNotes || 'Please ensure all details match your official business registration.'}\n\nVisit your business page to resubmit: ${businessUrl}`,
    html: configured?.html ?? html,
    preheader: `Your verification for ${businessName} needs attention`,
    origin: base,
  });
}
