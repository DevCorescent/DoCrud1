import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { getStoredUsers } from '@/lib/server/auth';
import { getAllProfiles } from '@/lib/server/user-profiles';
import { getSocialEvents } from '@/lib/server/social-events';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [users, profileMap, socialEventsData] = await Promise.all([
      getStoredUsers(),
      getAllProfiles().catch(() => ({})),
      getSocialEvents().catch(() => ({ events: [] })),
    ]);

    const profiles = Object.values(profileMap as Record<string, Record<string, unknown>>);
    const events = (socialEventsData.events || []) as Array<Record<string, unknown>>;

    const now = Date.now();
    const day7 = now - 7 * 86400000;
    const day30 = now - 30 * 86400000;

    // Follower/following stats
    let totalFollowRelations = 0;
    let usersWithFollowers = 0;
    const followCounts: number[] = [];
    profiles.forEach((p) => {
      const followers = (p.followers as string[] | undefined)?.length || 0;
      const following = (p.following as string[] | undefined)?.length || 0;
      totalFollowRelations += followers;
      if (followers > 0) usersWithFollowers++;
      followCounts.push(followers);
    });
    followCounts.sort((a, b) => b - a);
    const avgFollowers = profiles.length > 0 ? Math.round(totalFollowRelations / profiles.length) : 0;

    // Top users by followers
    const topByFollowers = profiles
      .map((p) => ({
        userId: String(p.userId || ''),
        name: users.find((u) => u.id === String(p.userId || ''))?.name || String(p.name || ''),
        email: users.find((u) => u.id === String(p.userId || ''))?.email || '',
        followers: (p.followers as string[] | undefined)?.length || 0,
        following: (p.following as string[] | undefined)?.length || 0,
        openToWork: Boolean(p.openToWork),
        profileSetupDone: Boolean(p.profileSetupDone),
      }))
      .sort((a, b) => b.followers - a.followers)
      .slice(0, 20);

    // Social events breakdown
    const eventTypes: Record<string, number> = {};
    const events7d = events.filter((e) => e.createdAt && new Date(String(e.createdAt)).getTime() >= day7);
    const events30d = events.filter((e) => e.createdAt && new Date(String(e.createdAt)).getTime() >= day30);
    events7d.forEach((e) => {
      const t = String(e.type || 'unknown');
      eventTypes[t] = (eventTypes[t] || 0) + 1;
    });

    // Profile completeness
    const profilesWithHeadline = profiles.filter((p) => p.headline).length;
    const profilesWithBio = profiles.filter((p) => p.bio).length;
    const profilesWithSkills = profiles.filter((p) => (p.skills as string[] | undefined)?.length).length;
    const profilesWithLocation = profiles.filter((p) => p.location).length;
    const openToWork = profiles.filter((p) => p.openToWork).length;
    const docrudGo = profiles.filter((p) => p.docrudGo).length;
    const profilesSetup = profiles.filter((p) => p.profileSetupDone).length;

    // Daily social activity (14 days)
    const dailySocial: { date: string; events: number; follows: number; likes: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const dateStr = d.toISOString().slice(0, 10);
      const dayEvents = events.filter((e) => String(e.createdAt || '').slice(0, 10) === dateStr);
      dailySocial.push({
        date: dateStr,
        events: dayEvents.length,
        follows: dayEvents.filter((e) => e.type === 'follow').length,
        likes: dayEvents.filter((e) => e.type === 'like' || e.type === 'post_like').length,
      });
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalProfiles: profiles.length,
        totalUsers: users.length,
        totalFollowRelations,
        usersWithFollowers,
        avgFollowers,
        profilesSetup,
        openToWork,
        docrudGo,
        profilesWithHeadline,
        profilesWithBio,
        profilesWithSkills,
        profilesWithLocation,
        totalEvents7d: events7d.length,
        totalEvents30d: events30d.length,
      },
      topByFollowers,
      eventTypes,
      dailySocial,
    });
  } catch (err) {
    console.error('[super-admin/network GET]', err);
    return NextResponse.json({ error: 'Failed to load network data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { action, userId } = await req.json() as { action: string; userId?: string };

    await appendSuperAdminAudit({
      action: `network_${action}`,
      targetType: 'user',
      targetId: userId,
      ip: req.headers.get('x-forwarded-for') || undefined,
    });

    // Future: clear followers, remove profile content, etc.
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[super-admin/network POST]', err);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
