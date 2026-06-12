/**
 * Notification email helpers — sent when social events occur.
 * Users can opt out via emailPreferences in their profile.
 */
import { sendTrackedMail } from '@/lib/server/mailer';
import { buildEmailChrome, escapeHtmlLite } from '@/lib/server/email-chrome';
import { getPublicAppBaseUrl } from '@/lib/url';
import type { SocialEventType } from '@/lib/server/social-events';

function origin() {
  return getPublicAppBaseUrl().replace(/\/$/, '');
}

export interface NotificationEmailPayload {
  to: string;
  recipientName: string;
  type: SocialEventType | 'message';
  actorName: string;
  actorId?: string;
  resourceTitle?: string;
  resourceId?: string;
  excerpt?: string;
  href?: string;
}

export async function sendNotificationEmail(p: NotificationEmailPayload): Promise<void> {
  const safe = (s: string) => escapeHtmlLite(s || '');
  const base = origin();
  const profileUrl = p.actorId ? `${base}/u/${p.actorId}` : base;
  const actionUrl = p.href
    ? p.href.startsWith('http') ? p.href : `${base}${p.href}`
    : profileUrl;

  const configs: Record<string, {
    subject: string;
    emoji: string;
    accent: string;
    headline: string;
    body: string;
    cta: string;
  }> = {
    follow: {
      subject: `${safe(p.actorName)} started following you on Docrud`,
      emoji: '👋',
      accent: '#38bdf8',
      headline: `You have a new follower!`,
      body: `<strong style="color:#f8fafc;">${safe(p.actorName)}</strong> just followed you on Docrud. Check out their profile and connect back.`,
      cta: 'View Profile',
    },
    like: {
      subject: `${safe(p.actorName)} liked your post`,
      emoji: '❤️',
      accent: '#f43f5e',
      headline: `Someone liked your content`,
      body: `<strong style="color:#f8fafc;">${safe(p.actorName)}</strong> liked your post${p.resourceTitle ? ` <em>"${safe(p.resourceTitle)}"</em>` : ''}. Keep creating great content!`,
      cta: 'See the Post',
    },
    comment: {
      subject: `${safe(p.actorName)} commented on your post`,
      emoji: '💬',
      accent: '#34d399',
      headline: `New comment on your post`,
      body: `<strong style="color:#f8fafc;">${safe(p.actorName)}</strong> commented on${p.resourceTitle ? ` <em>"${safe(p.resourceTitle)}"</em>` : ' your post'}${p.excerpt ? `:<br/><br/><em style="color:#94a3b8;">"${safe(p.excerpt)}"</em>` : '.'}`,
      cta: 'View Comment',
    },
    mention: {
      subject: `${safe(p.actorName)} mentioned you on Docrud`,
      emoji: '@',
      accent: '#fbbf24',
      headline: `You were mentioned`,
      body: `<strong style="color:#f8fafc;">${safe(p.actorName)}</strong> mentioned you${p.resourceTitle ? ` in <em>"${safe(p.resourceTitle)}"</em>` : ''}${p.excerpt ? `:<br/><br/><em style="color:#94a3b8;">"${safe(p.excerpt)}"</em>` : '.'}`,
      cta: 'See Mention',
    },
    gig_applied: {
      subject: `New application on your gig — ${safe(p.resourceTitle || 'Your Gig')}`,
      emoji: '💼',
      accent: '#34d399',
      headline: `Someone applied to your gig!`,
      body: `<strong style="color:#f8fafc;">${safe(p.actorName)}</strong> submitted an application for your gig${p.resourceTitle ? ` <em>"${safe(p.resourceTitle)}"</em>` : ''}. Review their proposal and respond.`,
      cta: 'Review Application',
    },
    message: {
      subject: `New message from ${safe(p.actorName)} on Docrud`,
      emoji: '✉️',
      accent: '#818cf8',
      headline: `You have a new message`,
      body: `<strong style="color:#f8fafc;">${safe(p.actorName)}</strong> sent you a message${
        p.excerpt
          ? `:<br/><br/><blockquote style="margin:12px 0;padding:12px 16px;border-left:3px solid #818cf8;background:#1e1b4b22;border-radius:4px;color:#94a3b8;font-style:italic;">${safe(p.excerpt.slice(0, 200))}${p.excerpt.length > 200 ? '…' : ''}</blockquote>`
          : '.'
      }`,
      cta: 'Read Message',
    },
    profile_view: {
      subject: `${safe(p.actorName)} viewed your Docrud profile`,
      emoji: '👀',
      accent: '#94a3b8',
      headline: `Someone viewed your profile`,
      body: `<strong style="color:#f8fafc;">${safe(p.actorName)}</strong> visited your Docrud profile. Make sure your profile is up to date!`,
      cta: 'View Your Profile',
    },
    document_viewed: {
      subject: `Your document was viewed on Docrud`,
      emoji: '📄',
      accent: '#60a5fa',
      headline: `Your document got a view`,
      body: `<strong style="color:#f8fafc;">${safe(p.actorName)}</strong> viewed your shared document${p.resourceTitle ? ` <em>"${safe(p.resourceTitle)}"</em>` : ''}.`,
      cta: 'View Document',
    },
  };

  const cfg = configs[p.type];
  if (!cfg) return;

  const bodyHtml = `
    <div style="text-align:center;margin-bottom:28px;">
      <span style="font-size:48px;line-height:1;">${cfg.emoji}</span>
    </div>
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:800;color:#f8fafc;text-align:center;letter-spacing:-0.02em;">${cfg.headline}</h2>
    <p style="margin:0 0 8px;font-size:14px;color:#94a3b8;line-height:1.7;">
      Hi <strong style="color:#f8fafc;">${safe(p.recipientName)}</strong>,
    </p>
    <p style="margin:0 0 28px;font-size:14px;color:#94a3b8;line-height:1.7;">${cfg.body}</p>

    <div style="text-align:center;margin:32px 0;">
      <a href="${actionUrl}" target="_blank" rel="noopener noreferrer"
        style="display:inline-block;background:${cfg.accent};color:#0a0a0f;font-size:14px;font-weight:700;padding:13px 28px;border-radius:12px;text-decoration:none;letter-spacing:-0.01em;">
        ${cfg.cta} &rarr;
      </a>
    </div>

    <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:20px;margin-top:8px;">
      <p style="margin:0;font-size:11px;color:#475569;text-align:center;line-height:1.8;">
        You're receiving this because you have email notifications enabled on Docrud.<br/>
        <a href="${base}/u/me?tab=settings" style="color:#64748b;text-decoration:underline;">Manage notification preferences</a>
      </p>
    </div>
  `;

  const html = buildEmailChrome({
    origin: base,
    subject: cfg.subject,
    preheader: cfg.headline,
    bodyHtml,
  });

  await sendTrackedMail({
    policyKey: 'social_notifications',
    typeLabel: 'system',
    to: p.to,
    subject: cfg.subject,
    text: `${cfg.headline} — ${cfg.body.replace(/<[^>]*>/g, '')}`,
    html,
    origin: base,
  });
}
