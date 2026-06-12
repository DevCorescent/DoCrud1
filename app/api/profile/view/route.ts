import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { addSocialEvent } from '@/lib/server/social-events';

export const dynamic = 'force-dynamic';

/**
 * POST /api/profile/view
 * Body: { targetUserId: string }
 * Called when an authenticated user opens another user's profile page.
 * Rate-limited to one event per viewer per target per hour (server-side).
 */

// In-memory rate limit: "viewerId:targetId" → last record time
const viewRateLimit = new Map<string, number>();

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    const sessionEmail = session?.user?.email;
    if (!sessionEmail) return NextResponse.json({ ok: false });

    const body = (await req.json().catch(() => null)) as { targetUserId?: string } | null;
    const targetUserId = body?.targetUserId?.trim();
    if (!targetUserId) return NextResponse.json({ ok: false });

    const users = await getStoredUsers();
    const actor = users.find((u) => u.email.toLowerCase() === sessionEmail.toLowerCase());
    if (!actor || actor.id === targetUserId) return NextResponse.json({ ok: false });

    // Rate-limit: one view notification per viewer→target per 60 minutes
    const key = `${actor.id}:${targetUserId}`;
    const lastView = viewRateLimit.get(key) ?? 0;
    if (Date.now() - lastView < 60 * 60 * 1000) return NextResponse.json({ ok: false });
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
