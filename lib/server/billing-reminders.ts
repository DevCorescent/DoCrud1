import { getStoredUsers } from '@/lib/server/auth';
import { getEmailOutbox } from '@/lib/server/email-outbox';
import { sendTrackedMail } from '@/lib/server/mailer';
import { escapeHtmlLite } from '@/lib/server/email-chrome';
import { getSaasPlanById, isSubscriptionPeriodExpired } from '@/lib/server/saas';

function formatDate(iso?: string) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' });
}

function buildCtaButton(label: string, href: string, tone: 'primary' | 'secondary' = 'primary') {
  const bg = tone === 'primary' ? '#0f172a' : '#ffffff';
  const fg = tone === 'primary' ? '#ffffff' : '#0f172a';
  const border = tone === 'primary' ? '#0f172a' : '#e2e8f0';
  return `
    <a href="${escapeHtmlLite(href)}"
       style="display:inline-block; padding:12px 16px; border-radius:14px; border:1px solid ${border}; background:${bg}; color:${fg}; font-weight:800; text-decoration:none; font-size:14px;">
      ${escapeHtmlLite(label)}
    </a>
  `.trim();
}

function buildReminderHtml(params: {
  origin: string;
  planName: string;
  planId?: string;
  periodEnd?: string;
  daysLeft?: number;
  variant: 'ending_soon' | 'expired';
}) {
  const origin = params.origin.replace(/\/$/, '');
  const billingHref = `${origin}/workspace?tab=billing`;
  const pricingHref = `${origin}/pricing`;
  const checkoutHref = params.planId ? `${origin}/checkout?plan=${encodeURIComponent(params.planId)}` : billingHref;

  const title = params.variant === 'expired'
    ? 'Your plan period ended'
    : 'Your plan is ending soon';
  const subtitle = params.variant === 'expired'
    ? 'Renew now to restore access and reset limits.'
    : `Ends on ${formatDate(params.periodEnd)}${typeof params.daysLeft === 'number' ? ` (${Math.max(0, params.daysLeft)} day${params.daysLeft === 1 ? '' : 's'} left)` : ''}.`;

  return `
    <div style="border:1px solid #e2e8f0; border-radius:22px; padding:18px; background:#ffffff;">
      <div style="font-size:12px; letter-spacing:.16em; text-transform:uppercase; font-weight:900; color:rgba(15,23,42,.55);">Billing</div>
      <div style="margin-top:10px; font-size:18px; font-weight:900; letter-spacing:-.02em; color:#0f172a;">${escapeHtmlLite(title)}</div>
      <div style="margin-top:8px; font-size:14px; color:rgba(15,23,42,.72);">${escapeHtmlLite(subtitle)}</div>
      <div style="margin-top:14px; padding:14px; border-radius:18px; border:1px solid #e2e8f0; background:#f8fafc;">
        <div style="font-size:12px; font-weight:900; color:rgba(15,23,42,.6);">Current plan</div>
        <div style="margin-top:6px; font-size:16px; font-weight:900; color:#0f172a;">${escapeHtmlLite(params.planName)}</div>
      </div>
      <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
        ${buildCtaButton('Renew now', checkoutHref, 'primary')}
        ${buildCtaButton('See upgrades', pricingHref, 'secondary')}
        ${buildCtaButton('Open billing', billingHref, 'secondary')}
      </div>
      <div style="margin-top:12px; font-size:12px; color:rgba(15,23,42,.6);">
        If you already renewed, you can ignore this email.
      </div>
    </div>
  `.trim();
}

export async function sendPlanRenewalReminders(params: {
  origin: string;
  daysAhead?: number;
  actorEmail?: string;
}) {
  const daysAhead = Math.max(1, Math.min(14, Math.round(params.daysAhead || 3)));
  const users = await getStoredUsers();
  const outbox = await getEmailOutbox(400);
  const now = Date.now();
  const windowEnd = now + daysAhead * 24 * 60 * 60 * 1000;

  const results: Array<{ email: string; status: 'sent' | 'skipped'; reason?: string }> = [];

  for (const user of users) {
    if (!user.email || !user.subscription?.planId) continue;
    if (user.role === 'admin' || user.role === 'employee') continue;

    const periodEnd = user.subscription.currentPeriodEnd || user.subscription.renewalDate;
    if (!periodEnd) continue;
    const end = new Date(periodEnd);
    if (!Number.isFinite(end.getTime())) continue;

    const expired = isSubscriptionPeriodExpired(user.subscription);
    const inWindow = end.getTime() <= windowEnd && end.getTime() >= now;
    const shouldSend = expired || inWindow;
    if (!shouldSend) continue;

    const plan = await getSaasPlanById(user.subscription.planId);
    const planName = plan?.name || user.subscription.planName || 'docrud Plan';

    const reminderKey = `renewal:${user.subscription.planId}:${end.toISOString().slice(0, 10)}:${expired ? 'expired' : 'ending'}`;
    const alreadySent = outbox.some((ev) => (
      ev.to.toLowerCase() === user.email.toLowerCase()
      && ev.metadata?.reminderKey === reminderKey
      && (ev.status === 'sent' || ev.status === 'queued')
    ));
    if (alreadySent) {
      results.push({ email: user.email, status: 'skipped', reason: 'Already sent' });
      continue;
    }

    const daysLeft = Math.ceil((end.getTime() - now) / (1000 * 60 * 60 * 24));
    const subject = expired
      ? `Renew your ${planName} to restore access`
      : `${planName} ends in ${Math.max(0, daysLeft)} day${daysLeft === 1 ? '' : 's'} — renew now`;
    const baseOrigin = params.origin.replace(/\/$/, '');
    const text = expired
      ? `Your ${planName} period ended on ${formatDate(periodEnd)}. Renew to restore access.\n\nOpen billing: ${baseOrigin}/workspace?tab=billing`
      : `Your ${planName} period ends on ${formatDate(periodEnd)}. Renew now to avoid interruption.\n\nOpen billing: ${baseOrigin}/workspace?tab=billing`;

    await sendTrackedMail({
      policyKey: 'billing_reminders',
      typeLabel: 'system',
      to: user.email,
      subject,
      text,
      preheader: expired ? 'Renew now to restore access and reset limits.' : 'Renew now to avoid interruption and reset limits.',
      html: buildReminderHtml({
        origin: params.origin,
        planName,
        planId: user.subscription.planId,
        periodEnd,
        daysLeft,
        variant: expired ? 'expired' : 'ending_soon',
      }),
      sentBy: params.actorEmail || 'system',
      origin: params.origin,
      metadata: {
        reminderKey,
        reminderType: 'subscription_renewal',
        planId: user.subscription.planId,
        periodEnd: end.toISOString(),
      },
    });

    results.push({ email: user.email, status: 'sent' });
  }

  return { results, daysAhead };
}
