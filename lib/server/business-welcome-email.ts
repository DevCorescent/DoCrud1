/**
 * The business welcome + invoice email.
 *
 * Lifted out of /api/saas/signup because TWO paths now finish a business
 * signup: that form, and the onboarding flow, which creates the workspace only
 * after the emailed verification code comes back. One message, so a workspace
 * created through onboarding is not a quieter, lesser version of the same
 * event.
 *
 * Sending is best-effort. A welcome email that fails must never turn a created,
 * verified workspace into an error.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { getDefaultPublicPlan, saasFeatureCatalog } from '@/lib/server/saas';
import { sendTrackedMail } from '@/lib/server/mailer';

function escapeHtmlLite(value: string) {
  return String(value || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export type BusinessWelcomeEmailInput = {
  to: string;
  name: string;
  organizationName: string;
  userId: string;
  /** The request origin, so the links point at the deployment being used. */
  origin: string;
};

export async function sendBusinessWelcomeEmail(opts: BusinessWelcomeEmailInput): Promise<void> {
    const origin = opts.origin;
    const defaultPlan = await getDefaultPublicPlan('business');
    const featureLabelByKey = new Map(saasFeatureCatalog.map((item) => [item.key, item.label]));
    const includedFeatureLabels = (defaultPlan?.includedFeatures || [])
      .map((key) => featureLabelByKey.get(key) || key)
      .slice(0, 10);

    const invoiceId = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${opts.userId.slice(-6)}`;
    const invoiceDate = new Date().toISOString();
    const planName = defaultPlan?.name || 'docrud Workspace';
    const priceLabel = defaultPlan?.priceLabel || '—';
    const amountInPaise = defaultPlan?.amountInPaise ?? 0;
    const amountInRupees = (amountInPaise / 100).toFixed(2);

    const subject = `Welcome to ${escapeHtmlLite(opts.organizationName)} on docrud`;
    const loginUrl = `${origin}/login`;
    const workspaceUrl = `${origin}/workspace`;

    const text = [
      `Welcome to docrud, ${opts.name?.trim() || 'there'}.`,
      '',
      `Workspace: ${opts.organizationName}`,
      `Plan: ${planName} (${priceLabel})`,
      '',
      `Next steps:`,
      `1) Sign in: ${loginUrl}`,
      `2) Open your workspace: ${workspaceUrl}`,
      `3) Invite teammates and start generating documents.`,
      '',
      `Invoice: ${invoiceId} (₹${amountInRupees})`,
    ].join('\n');

    const html = `
      <div style="border-radius: 18px; border: 1px solid rgba(148,163,184,.55); background: linear-gradient(135deg, rgba(2,6,23,.96), rgba(15,23,42,.92), rgba(245,158,11,.18)); padding: 16px; color: #ffffff;">
        <div style="font-size: 11px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: rgba(255,255,255,.75);">
          Welcome
        </div>
        <div style="margin-top: 8px; font-size: 16px; font-weight: 900;">${escapeHtmlLite(opts.organizationName)}</div>
        <div style="margin-top: 2px; font-size: 13px; color: rgba(255,255,255,.75);">${escapeHtmlLite(planName)} · ${escapeHtmlLite(priceLabel)}</div>
        <div style="margin-top: 10px; display:flex; gap:10px; flex-wrap:wrap;">
          <a href="${escapeHtmlLite(loginUrl)}" style="display:inline-block; text-decoration:none; border-radius: 999px; padding: 10px 14px; font-size: 12px; font-weight: 800; letter-spacing: .06em; background: #ffffff; color:#0f172a;">
            Sign in
          </a>
          <a href="${escapeHtmlLite(workspaceUrl)}" style="display:inline-block; text-decoration:none; border-radius: 999px; padding: 10px 14px; font-size: 12px; font-weight: 800; letter-spacing: .06em; background: rgba(255,255,255,.10); color:#ffffff; border: 1px solid rgba(255,255,255,.18);">
            Open workspace
          </a>
        </div>
      </div>

      <div style="margin-top: 16px; border-radius: 18px; border: 1px solid rgba(226,232,240,.9); background: #ffffff; padding: 16px;">
        <div style="font-size: 11px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: rgba(15,23,42,.55);">
          Included highlights
        </div>
        <ul style="margin: 10px 0 0; padding-left: 18px; font-size: 13px; color: rgba(15,23,42,.78);">
          ${includedFeatureLabels.map((label) => `<li>${escapeHtmlLite(label)}</li>`).join('')}
        </ul>
      </div>

      <div style="margin-top: 16px; border-radius: 18px; border: 1px solid rgba(226,232,240,.9); background: #ffffff; padding: 16px;">
        <div style="font-size: 11px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: rgba(15,23,42,.55);">
          Next steps
        </div>
        <ol style="margin: 10px 0 0; padding-left: 18px; font-size: 13px; color: rgba(15,23,42,.78);">
          <li>Invite teammates (Roles & permissions live in your workspace settings).</li>
          <li>Set branding (logo, watermark, and letterhead if needed).</li>
          <li>Generate your first document and share it securely.</li>
        </ol>
      </div>

      <div style="margin-top: 16px; border-radius: 18px; border: 1px solid rgba(226,232,240,.9); background: #ffffff; padding: 16px;">
        <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
          <div>
            <div style="font-size: 11px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: rgba(15,23,42,.55);">
              Invoice
            </div>
            <div style="margin-top: 6px; font-size: 13px; color: rgba(15,23,42,.78);">
              <div><strong>${escapeHtmlLite(invoiceId)}</strong></div>
              <div>Date: ${escapeHtmlLite(new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(invoiceDate)))}</div>
              <div>Billed to: ${escapeHtmlLite(opts.to)}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size: 12px; font-weight: 800; color: rgba(15,23,42,.78);">Total</div>
            <div style="margin-top: 4px; font-size: 18px; font-weight: 900; letter-spacing: -.02em;">₹${escapeHtmlLite(amountInRupees)}</div>
          </div>
        </div>
        <div style="margin-top: 12px; border-top: 1px solid rgba(226,232,240,.9); padding-top: 12px; font-size: 13px; color: rgba(15,23,42,.78);">
          <div style="display:flex; justify-content:space-between; gap:12px;">
            <div>${escapeHtmlLite(planName)} (${escapeHtmlLite(priceLabel)})</div>
            <div><strong>₹${escapeHtmlLite(amountInRupees)}</strong></div>
          </div>
        </div>
      </div>

      <div style="margin-top: 16px; font-size: 12px; color: rgba(15,23,42,.55);">
        If you did not create this workspace, please ignore this email.
      </div>
    `.trim();

    await sendTrackedMail({
      policyKey: 'business_welcome',
      typeLabel: 'system',
      to: opts.to,
      subject,
      text,
      html,
      preheader: `Your workspace is ready — ${planName}`,
      origin,
      metadata: { type: 'business_signup_welcome', planId: defaultPlan?.id || 'unknown', organizationId: opts.userId },
      attachment: await (async () => {
        try {
          const brochurePath = path.join(process.cwd(), 'public', 'email', 'docrud-brochure.pdf');
          const content = await fs.readFile(brochurePath);
          return { filename: 'docrud-brochure.pdf', content, contentType: 'application/pdf' };
        } catch {
          return undefined;
        }
      })(),
    });
}

/** Fire-and-forget wrapper for callers that must answer the request first. */
export function queueBusinessWelcomeEmail(opts: BusinessWelcomeEmailInput): void {
  void sendBusinessWelcomeEmail(opts).catch((err) => {
    console.error('[business-welcome-email] send failed (non-fatal)', err);
  });
}
