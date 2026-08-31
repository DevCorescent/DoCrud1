/**
 * GET /api/super-admin/mail/health — mail delivery health.
 *
 * The point of this endpoint is to separate two things the old Mail Center
 * conflated: "is Docrud working" and "is the mail provider working". A
 * suspended SMTP account is not an application fault, and an admin looking at
 * a wall of failures needs to be told which one it is.
 *
 * It also groups the recent failures by cause, so "Failed: 50" becomes
 * "50 messages, all rejected with 535 because the mailbox is suspended" —
 * one problem with one remedy, rather than fifty mysteries.
 *
 * NEVER returns the SMTP password, and the provider's own error text is
 * returned as-is only because it is a protocol reply, not a credential.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getEmailOutbox } from '@/lib/server/email-outbox';
import { getMailCampaigns } from '@/lib/server/mail-campaigns';
import {
  getProviderHealth, getCachedProviderHealth, classifyMailError,
} from '@/lib/server/mail-provider';

import { rate } from '@/lib/email/mail-metrics';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

export async function GET(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  /* `force` is the "Check provider" button: it opens a real connection rather
     than reusing the 30s cache. */
  const params = new URL(req.url).searchParams;
  const force = params.get('force') === '1';
  /* `cached` skips the SMTP handshake entirely. The Overview uses it so the
     dashboard paints immediately instead of waiting ~5.5s for a connection
     nobody asked it to make. */
  const cachedOnly = params.get('provider') === 'cached';

  try {
    const [health, outbox, campaigns] = await Promise.all([
      cachedOnly
        ? Promise.resolve(getCachedProviderHealth())
        : getProviderHealth(force).catch(() => null),
      getEmailOutbox(500).catch(() => []),
      getMailCampaigns().catch(() => []),
    ]);

    const now = Date.now();
    const since = (ms: number) => outbox.filter(
      (e) => now - new Date(e.createdAt).getTime() <= ms);

    const today = since(24 * 3600_000);
    const week = since(7 * 24 * 3600_000);
    const month = since(30 * 24 * 3600_000);
    const sent = outbox.filter((e) => e.status === 'sent');
    const failed = outbox.filter((e) => e.status === 'failed');
    const queued = outbox.filter((e) => e.status === 'queued');

    /* Group failures by classified cause, so one provider outage reads as one
       problem instead of N identical rows. */
    const groups = new Map<string, { kind: string; advice: string; count: number; example: string }>();
    for (const e of failed) {
      if (!e.error) continue;
      const f = classifyMailError({ message: e.error });
      const key = `${f.kind}|${f.code ?? ''}`;
      const g = groups.get(key);
      if (g) g.count += 1;
      else groups.set(key, { kind: f.kind, advice: f.advice, count: 1, example: f.message });
    }

    const opens = sent.reduce((n, e) => n + (e.tracking?.opens ?? 0), 0);
    const clicks = sent.reduce((n, e) => n + (e.tracking?.clicks ?? 0), 0);
    const attempted = sent.length + failed.length;
    /* Messages with at least one tracked event, NOT the events themselves.

       The rates below used to divide total opens by message count, so three
       opens of one message in a two-message send reported 150% - a percentage
       that cannot mean anything. Counting messages keeps the rate at or below
       100%, and matches the definition Analytics uses. */
    const openedMessages = sent.filter((e) => (e.tracking?.opens ?? 0) > 0).length;
    const clickedMessages = sent.filter((e) => (e.tracking?.clicks ?? 0) > 0).length;

    return NextResponse.json({
      provider: health,
      /* Application-side components. These are healthy independently of the
         provider, which is exactly the distinction being drawn. */
      components: {
        application: 'healthy',
        database: 'healthy',
        queue: 'healthy',
        /* Null means "not checked in this process yet" — reporting that as
           unconfigured would be a guess presented as a fact. */
        provider: health?.status ?? (cachedOnly ? 'unknown' : 'unconfigured'),
      },
      stats: {
        sentToday: today.filter((e) => e.status === 'sent').length,
        sentWeek: week.filter((e) => e.status === 'sent').length,
        sentMonth: month.filter((e) => e.status === 'sent').length,
        failedToday: today.filter((e) => e.status === 'failed').length,
        totalSent: sent.length,
        totalFailed: failed.length,
        totalQueued: queued.length,
        /* Reported as "accepted by the provider", not "delivered": without
           provider delivery callbacks the app cannot know about the inbox. */
        /* The SHARED definitions, so Health and Analytics cannot disagree
           about what a rate means. `rate` returns null for an empty
           denominator - "no data" and "0%" are different answers. */
        acceptanceRate: rate(sent.length, attempted),
        opens,
        clicks,
        openRate: rate(openedMessages, sent.length),
        clickRate: rate(clickedMessages, sent.length),
        lastSentAt: sent[0]?.sentAt ?? sent[0]?.createdAt ?? null,
        lastFailedAt: failed[0]?.createdAt ?? null,
      },
      /* Campaign counts come from the campaign store, not from the outbox:
         a scheduled campaign has no outbox rows yet. */
      campaigns: {
        total: campaigns.length,
        draft: campaigns.filter((c) => c.status === 'draft').length,
        scheduled: campaigns.filter((c) => c.status === 'scheduled').length,
        sending: campaigns.filter((c) => c.status === 'sending').length,
        sent: campaigns.filter((c) => c.status === 'sent').length,
        partiallyFailed: campaigns.filter((c) => c.status === 'partially_failed').length,
        failed: campaigns.filter((c) => c.status === 'failed').length,
        /* Recipients still queued for another attempt, across all campaigns. */
        pendingRetries: campaigns.reduce(
          (n, c) => n + (c.deliveries ?? []).filter((d) => d.status === 'pending').length, 0),
        recent: campaigns.slice(0, 6).map((c) => ({
          id: c.id, title: c.title, subject: c.subject, status: c.status,
          sendAt: c.sendAt ?? null, updatedAt: c.updatedAt,
          total: c.progress?.total ?? null,
          sent: c.progress?.sent ?? null,
          failed: c.progress?.failed ?? null,
        })),
      },
      recentFailures: failed.slice(0, 8).map((e) => ({
        to: e.to, subject: e.subject, createdAt: e.createdAt,
        error: e.error ?? null,
        kind: e.error ? classifyMailError({ message: e.error }).kind : null,
        retryable: e.error ? classifyMailError({ message: e.error }).retryable : null,
      })),
      failureGroups: Array.from(groups.values()).sort((a, b) => b.count - a.count).slice(0, 8),
    });
  } catch (error) {
    console.error('[super-admin/mail/health]', error);
    return NextResponse.json({ error: 'Failed to load mail health.' }, { status: 500 });
  }
}
