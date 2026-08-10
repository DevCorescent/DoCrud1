import { NextRequest, NextResponse } from 'next/server';
import { getStoredUsers, getAuthSession } from '@/lib/server/auth';
import { getStoredUserById } from '@/lib/server/users';
import { getProfileData, getFollowCounts, isFollowing as checkIsFollowing } from '@/lib/server/user-profiles';
import { getPublicGigListings } from '@/lib/server/gigs';
import { getPublicAnalyticsForUser } from '@/lib/server/file-transfers';

export const dynamic = 'force-dynamic';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, 3);
  return `${visible}***@${domain}`;
}

export async function GET(req: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const { userId } = params;

    const users = await getStoredUsers();
    let found = users.find((u) => u.id === userId);
    // Fallback: cache may be stale for newly registered users — do a direct DB row lookup
    if (!found) found = await getStoredUserById(userId) ?? undefined;
    if (!found) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const session = await getAuthSession();
    const sessionUser = session?.user?.email
      ? users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase())
      : null;

    const [profile, counts, allGigs, followingThisUser, publishAnalytics] = await Promise.all([
      getProfileData(userId),
      getFollowCounts(userId),
      getPublicGigListings(),
      sessionUser ? checkIsFollowing(sessionUser.id, userId) : Promise.resolve(false),
      getPublicAnalyticsForUser(userId),
    ]);

    const userGigs = allGigs.filter((g) => g.ownerUserId === userId);

    const isOwnProfile = sessionUser?.id === userId;

    // Resume files are only fully exposed to the owner. Other viewers get the
    // metadata needed to render the download action, never the storage URL —
    // downloads go through /api/profile/resume/[userId], which enforces the
    // Docrud Infinity entitlement server-side.
    const safeProfile = isOwnProfile
      ? profile
      : {
          ...profile,
          resumeFiles: (profile.resumeFiles ?? []).map((entry) => ({
            id: entry.id,
            fileName: entry.fileName,
            uploadedAt: entry.uploadedAt,
            url: '',
          })),
        };

    const safeUser = {
      id: found.id,
      name: found.name,
      email: maskEmail(found.email),
      role: found.role,
      accountType: found.accountType,
      createdAt: found.createdAt,
    };

    return NextResponse.json({
      user: safeUser,
      profile: safeProfile,
      stats: {
        followers: counts.followers,
        following: counts.following,
        publishedCount: publishAnalytics.publishCount,
        gigsCount: userGigs.length,
        totalViews: publishAnalytics.totalViews,
        totalLikes: publishAnalytics.totalLikes,
        totalComments: publishAnalytics.totalComments,
      },
      isFollowing: followingThisUser,
      isOwnProfile,
      recentPublished: [],
      recentGigs: userGigs.slice(0, 6).map((g) => ({
        id: g.id,
        slug: g.slug,
        title: g.title,
        summary: g.summary,
        category: g.category,
        skills: g.skills,
        budgetLabel: g.budgetLabel,
        timelineLabel: g.timelineLabel,
        engagementType: g.engagementType,
        locationPreference: g.locationPreference,
        connectCount: g.connectCount,
        createdAt: g.createdAt,
      })),
    });
  } catch (error) {
    console.error('[public/profile] GET error', error);
    return NextResponse.json({ error: 'Failed to load profile.' }, { status: 500 });
  }
}
