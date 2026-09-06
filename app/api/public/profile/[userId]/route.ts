import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import {
  getStoredUserById,
  getStoredUserByEmail,
} from '@/lib/server/users';
import { getProfileData, getFollowCounts, isFollowing as checkIsFollowing } from '@/lib/server/user-profiles';
import { getPublicGigListingsForUser } from '@/lib/server/gigs';
import { getPublicAnalyticsForUser } from '@/lib/server/file-transfers';
import { calculateProfileScore } from '@/lib/profile-score';
import { publicMatchPreferences } from '@/lib/server/match-preferences';

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

    // The viewer lookup, the profile owner lookup and every profile fragment are
    // independent — resolve them in a single round of concurrency instead of
    // walking them one await at a time.
    const [found, session, profile, counts, userGigs, publishAnalytics] = await Promise.all([
      getStoredUserById(userId),
      getAuthSession(),
      getProfileData(userId),
      getFollowCounts(userId),
      getPublicGigListingsForUser(userId),
      getPublicAnalyticsForUser(userId),
    ]);

    if (!found) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const sessionUser = session?.user?.email
      ? await getStoredUserByEmail(session.user.email)
      : null;

    const isOwnProfile = sessionUser?.id === userId;
    const followingThisUser =
      sessionUser && !isOwnProfile ? await checkIsFollowing(sessionUser.id, userId) : false;

    // Resume files are only fully exposed to the owner. Other viewers get the
    // metadata needed to render the download action, never the storage URL —
    // downloads go through /api/profile/resume/[userId], which enforces the
    // Docrud Infinity entitlement server-side.
    /* What a VISITOR would see, computed once and sent to everyone — the owner
       included.

       The owner's own copy of `matchPreferences` is deliberately the FULL set
       (the editor needs every answer, including the private ones), which meant
       the About section — reading that same field — showed its owner answers
       they had switched off. It looked exactly like a broken toggle. The
       section now reads THIS field instead, so it renders the public view no
       matter who is looking, and cannot show a private answer to anybody. */
    const publishedPreferences = publicMatchPreferences(
      profile.matchPreferences, profile.matchPreferenceVisibility,
    );

    const safeProfile = isOwnProfile
      ? { ...profile, publicMatchPreferences: publishedPreferences }
      : {
          ...profile,
          resumeFiles: (profile.resumeFiles ?? []).map((entry) => ({
            id: entry.id,
            fileName: entry.fileName,
            uploadedAt: entry.uploadedAt,
            url: '',
          })),
          /* Matching preferences are REBUILT from an allow-list, not redacted
             from the spread above. A salary floor, a notice period and a
             willingness to relocate are answers a person gives so we can match
             them, not answers they have published — and this endpoint spreads
             the whole stored profile, so anything not deliberately projected
             here would be world-readable. `publicMatchPreferences` starts from
             an empty object and copies across only what its owner marked
             public, so a field added to the model later is private until
             somebody chooses otherwise. */
          matchPreferences: publicMatchPreferences(
            profile.matchPreferences, profile.matchPreferenceVisibility,
          ),
          /* The visibility record itself is not another person's business: it
             would state, field by field, exactly what is being withheld. */
          matchPreferenceVisibility: undefined,
          /* After the spread, never before it — a key placed first would be
             overwritten by whatever the stored profile happened to carry. */
          publicMatchPreferences: publishedPreferences,
        };

    const safeUser = {
      id: found.id,
      name: found.name,
      email: maskEmail(found.email),
      role: found.role,
      accountType: found.accountType,
      createdAt: found.createdAt,
    };

    /* Computed server-side from the stored profile on every request, so the
       client never supplies it and it cannot drift from the source data.
       Additive field — existing consumers of this response are unaffected. */
    const profileScore = calculateProfileScore(profile);

    return NextResponse.json({
      user: safeUser,
      profile: safeProfile,
      profileScore,
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
