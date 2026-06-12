import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getAllProfiles } from '@/lib/server/user-profiles';
import { getStoredUsers } from '@/lib/server/auth';
import { listResumeDirectory } from '@/lib/server/resume-directory';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query') || '';
  const view = searchParams.get('view') || 'profiles';

  try {
    const [users, profileMap] = await Promise.all([
      getStoredUsers(),
      getAllProfiles().catch(() => ({})),
    ]);

    if (view === 'resumes') {
      const resumes = await listResumeDirectory({ q: query, limit: 200 }).catch(() => ({ entries: [], total: 0 }));
      return NextResponse.json({ resumes: (resumes as { entries?: unknown[]; total: number }).entries ?? [], total: resumes.total });
    }

    // Merge users with their profile data
    const enriched = users
      .filter((u) => {
        if (!query) return true;
        const hay = `${u.name} ${u.email} ${u.organizationName || ''} ${u.role}`.toLowerCase();
        return hay.includes(query.toLowerCase());
      })
      .map((u) => {
        const profile = (profileMap as Record<string, Record<string, unknown>>)[u.id] || {};
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          accountType: u.accountType,
          organizationName: u.organizationName,
          isActive: u.isActive,
          createdAt: u.createdAt,
          lastLogin: u.lastLogin,
          // Profile data
          headline: profile.headline,
          location: profile.location,
          bio: profile.bio,
          skills: profile.skills,
          openToWork: profile.openToWork,
          profileSetupDone: profile.profileSetupDone,
          docrudGo: profile.docrudGo,
          socialLinks: profile.socialLinks,
          interests: profile.interests,
          subscription: u.subscription,
        };
      });

    // Stats
    const openToWork = enriched.filter((u) => u.openToWork).length;
    const profilesSetup = enriched.filter((u) => u.profileSetupDone).length;
    const docrudGo = enriched.filter((u) => u.docrudGo).length;

    // Location distribution
    const locationDist: Record<string, number> = {};
    enriched.forEach((u) => {
      const loc = String(u.location || 'Unknown');
      locationDist[loc] = (locationDist[loc] || 0) + 1;
    });

    // Skills distribution
    const skillsDist: Record<string, number> = {};
    enriched.forEach((u) => {
      (u.skills as string[] || []).forEach((s) => {
        skillsDist[s] = (skillsDist[s] || 0) + 1;
      });
    });
    const topSkills = Object.entries(skillsDist).sort(([, a], [, b]) => b - a).slice(0, 20).map(([skill, count]) => ({ skill, count }));

    return NextResponse.json({
      people: enriched.slice(0, 500),
      total: enriched.length,
      stats: { openToWork, profilesSetup, docrudGo, total: users.length },
      locationDistribution: Object.entries(locationDist).sort(([, a], [, b]) => b - a).slice(0, 20).map(([location, count]) => ({ location, count })),
      topSkills,
    });
  } catch (err) {
    console.error('[super-admin/people GET]', err);
    return NextResponse.json({ error: 'Failed to load people' }, { status: 500 });
  }
}
