import { NextResponse } from 'next/server';
import { getStoredUsers } from '@/lib/server/auth';
import { getAllProfiles, getFollowCounts } from '@/lib/server/user-profiles';
import { getPublicGigListings } from '@/lib/server/gigs';
import { getUpraiseCounts } from '@/lib/server/upraised';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [users, profiles, gigs] = await Promise.all([
      getStoredUsers(),
      getAllProfiles(),
      getPublicGigListings(),
    ]);

    const filteredForCounts = users.filter((u) => u.isActive !== false);
    const upraiseCounts = await getUpraiseCounts(filteredForCounts.map((u) => u.id));

    // Count gigs per owner
    const gigCountByUser: Record<string, number> = {};
    for (const gig of gigs) {
      if (gig.ownerUserId) {
        gigCountByUser[gig.ownerUserId] = (gigCountByUser[gig.ownerUserId] ?? 0) + 1;
      }
    }

    // Filter out internal test accounts and inactive users
    const filteredUsers = users.filter((user) => {
      if (user.isActive === false) return false;
      if (user.role === 'admin' && user.email.includes('company.com')) return false;
      return true;
    });

    // Build people cards with follow counts
    const people = await Promise.all(
      filteredUsers.map(async (user) => {
        const counts = await getFollowCounts(user.id);
        const profile = profiles[user.id] ?? {};
        return {
          id: user.id,
          name: user.name,
          accountType: user.accountType,
          createdAt: user.createdAt,
          docrudGo: profile.docrudGo === true,
          publicFace: profile.publicFace
            ? { category: profile.publicFace.category, approvedAt: profile.publicFace.approvedAt }
            : null,
          profile: {
            headline: profile.headline,
            bio: profile.bio,
            location: profile.location,
            avatarUrl: profile.avatarUrl,
            bannerUrl: profile.bannerUrl,
            coverGradient: profile.coverGradient,
            coverPosition: profile.coverPosition,
            skills: profile.skills,
            openToWork: profile.openToWork,
            pronouns: profile.pronouns,
          },
          stats: {
            followers: counts.followers,
            following: counts.following,
            gigsCount: gigCountByUser[user.id] ?? 0,
          },
          upraiseCount: upraiseCounts[user.id] ?? 0,
        };
      }),
    );

    // Public Faces first, then docrudGo verified, then most upraised, then most followed
    people.sort((a, b) => {
      const aPF = !!a.publicFace;
      const bPF = !!b.publicFace;
      if (aPF !== bPF) return aPF ? -1 : 1;
      if (a.docrudGo !== b.docrudGo) return a.docrudGo ? -1 : 1;
      if (b.upraiseCount !== a.upraiseCount) return b.upraiseCount - a.upraiseCount;
      return b.stats.followers - a.stats.followers;
    });

    return NextResponse.json({ people });
  } catch (error) {
    console.error('[public/people] GET error', error);
    return NextResponse.json({ error: 'Failed to load people.' }, { status: 500 });
  }
}
