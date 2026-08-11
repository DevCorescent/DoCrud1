import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { getStoredUserById } from '@/lib/server/users';
import { recordProfileVisit } from '@/lib/server/profile-activity';
import { addSocialEvent } from '@/lib/server/social-events';

export const dynamic = 'force-dynamic';

/**
 * POST /api/profile/view
 * Body: { targetUserId: string }
 * Called when an authenticated user opens another user's profile page.
 * Rate-limited to one event per viewer per target per hour (server-side).
 */

// In-memory guard for the notification event only. The durable 24h visit
// dedup lives in profile_visits, keyed by visitor/owner/day.
const viewRateLimit = new Map<string, number>();

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    const sessionEmail = session?.user?.email;
    if (!sessionEmail) return NextResponse.json({ ok: false });

    const body = (await req.json().catch(() => null)) as { targetUserId?: string } | null;
    const targetUserId = body?.targetUserId?.trim();
    if (!targetUserId) return NextResponse.json({ ok: false });

    // Indexed lookup — this used to read the entire users collection.
    const actorId = await resolveSessionUserId(session);
    if (!actorId || actorId === targetUserId) return NextResponse.json({ ok: false });
    const actor = await getStoredUserById(actorId);
    if (!actor) return NextResponse.json({ ok: false });

    // Durable, idempotent: one visit row per visitor/owner/UTC day, so repeated
    // renders or navigations cannot create duplicate records.
    void recordProfileVisit({
      profileOwnerId: targetUserId,
      visitorUserId: actor.id,
      source: 'profile',
    }).catch(() => { /* non-critical */ });

    // Rate-limit the *notification* to one per viewer→target per 60 minutes
    const key = `${actor.id}:${targetUserId}`;
    const lastView = viewRateLimit.get(key) ?? 0;
    if (Date.now() - lastView < 60 * 60 * 1000) return NextResponse.json({ ok: true });
    viewRateLimit.set(key, Date.now());

    void addSocialEvent({
      type: 'profile_view',
      actorId: actor.id,
      actorName: actor.name || actor.email,
      actorAvatar: (actor as any).profile?.avatarUrl,
      actorHeadline: (actor as any).profile?.headline,
      targetUserId,
      href: `/u/${actor.id}`,
    }).catch(() => { /* non-critical */ });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
