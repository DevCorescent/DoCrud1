import { NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { sendTrackedMail } from '@/lib/server/mailer';

export const dynamic = 'force-dynamic';

/** POST — send a storage capacity alert email to the authenticated user */
export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ ok: true }); // silently succeed — not a hard error
    }

    const body = await request.json().catch(() => null);
    const level = typeof body?.level === 'string' ? body.level : '75';
    const used = typeof body?.used === 'string' ? body.used : '—';
    const total = typeof body?.total === 'string' ? body.total : '—';
    const planLabel = typeof body?.planLabel === 'string' ? body.planLabel : 'Free (1 GB)';

    const users = await getStoredUsers();
    const normalizedEmail = (session.user.email || '').trim().toLowerCase();
    const user = users.find((u) => u.email.trim().toLowerCase() === normalizedEmail);
    if (!user) return NextResponse.json({ ok: true });

    const origin = new URL(request.url).origin;
    const isLimit = level === '100';
    const isCritical = level === '90';

    const subject = isLimit
      ? 'Your DocRud Drive is full — uploads paused'
      : isCritical
        ? 'Your DocRud Drive is 90% full — upgrade now'
        : 'Your DocRud Drive is 75% full';

    const statusColor = isLimit ? '#ef4444' : isCritical ? '#f97316' : '#eab308';
    const statusLabel = isLimit ? '100% — Full' : isCritical ? '90% — Critical' : '75% — Watch';

    const headline = isLimit
      ? 'Your drive is full.'
      : isCritical
        ? 'Running critically low on space.'
        : 'Storage at 75% capacity.';

    const bodyText = isLimit
      ? 'File uploads have been paused. Upgrade your DocRud Drive plan to restore full access and continue storing files.'
      : 'Your DocRud Drive is filling up fast. Upgrade now to keep everything running without interruption.';

    await sendTrackedMail({
      policyKey: 'storage_alerts',
      typeLabel: 'system',
      to: user.email,
      subject,
      preheader: `${used} of ${total} used (${statusLabel.split(' — ')[0]}). Upgrade to continue uploading.`,
      text: `${headline}\n\n${bodyText}\n\nUsed: ${used} of ${total}\nCurrent plan: ${planLabel}\n\nUpgrade storage: ${origin}/billing\nManage billing: ${origin}/billing`,
      html: `
        <div style="background:#08080f;padding:0;margin:0;font-family:'Inter',system-ui,sans-serif;">
          <div style="max-width:540px;margin:0 auto;padding:40px 24px;">

            <div style="margin-bottom:20px;">
              <span style="display:inline-block;padding:4px 12px;border-radius:99px;background:${statusColor}18;border:1px solid ${statusColor}40;font-size:11px;font-weight:700;color:${statusColor};letter-spacing:0.10em;text-transform:uppercase;">
                DocRud Drive · Storage Alert
              </span>
            </div>

            <h1 style="margin:0 0 10px;font-size:30px;font-weight:800;color:#ffffff;letter-spacing:-0.025em;line-height:1.15;">
              ${headline}
            </h1>
            <p style="margin:0 0 32px;font-size:15px;color:rgba(255,255,255,.55);line-height:1.65;">
              ${bodyText}
            </p>

            <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:18px;padding:22px;margin-bottom:20px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                <span style="font-size:11px;font-weight:700;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:0.10em;">Storage Usage</span>
                <span style="font-size:11px;font-weight:700;color:${statusColor};letter-spacing:0.04em;">${statusLabel}</span>
              </div>
              <div style="height:7px;background:rgba(255,255,255,.07);border-radius:99px;overflow:hidden;margin-bottom:10px;">
                <div style="height:100%;width:${level}%;background:${statusColor};border-radius:99px;"></div>
              </div>
              <div style="display:flex;justify-content:space-between;">
                <span style="font-size:12px;color:rgba(255,255,255,.55);">${used} used</span>
                <span style="font-size:12px;color:rgba(255,255,255,.30);">${total} total</span>
              </div>
            </div>

            <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:16px 20px;margin-bottom:28px;">
              <span style="font-size:11px;font-weight:700;color:rgba(255,255,255,.30);text-transform:uppercase;letter-spacing:0.10em;display:block;margin-bottom:4px;">Current Plan</span>
              <span style="font-size:14px;font-weight:600;color:rgba(255,255,255,.80);">${planLabel}</span>
            </div>

            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:36px;">
              <a href="${origin}/billing"
                 style="display:inline-block;padding:13px 26px;border-radius:999px;background:#ffffff;color:#08080f;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:-0.01em;">
                Upgrade Storage →
              </a>
              <a href="${origin}/billing"
                 style="display:inline-block;padding:13px 26px;border-radius:999px;border:1px solid rgba(255,255,255,.14);color:rgba(255,255,255,.65);text-decoration:none;font-weight:600;font-size:14px;">
                View Billing
              </a>
            </div>

            <hr style="border:none;border-top:1px solid rgba(255,255,255,.07);margin-bottom:20px;" />

            <p style="margin:0;font-size:11px;color:rgba(255,255,255,.22);line-height:1.65;">
              You're receiving this because your DocRud Drive storage crossed the ${level}% threshold.<br />
              Each threshold alert is sent only once. Manage notification preferences in your account settings.
            </p>

          </div>
        </div>
      `,
      origin,
      metadata: { level, planLabel, used, total },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[storage-alert]', error);
    return NextResponse.json({ ok: true }); // always succeed silently
  }
}
