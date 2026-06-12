export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getProfileData, updateProfileData } from '@/lib/server/user-profiles';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const body = (await req.json()) as { id?: string };
    const id = String(body.id ?? '').trim();
    if (!id) return NextResponse.json({ error: 'Missing resume id.' }, { status: 400 });

    const profile = await getProfileData(userId);
    const history = profile.resumeFiles ?? [];
    const entry = history.find(r => r.id === id);
    if (!entry) return NextResponse.json({ error: 'Resume entry not found.' }, { status: 404 });

    const pd = entry.parsedData ?? {};
    const patch: Record<string, unknown> = {};

    if (pd.headline != null)                                            patch.headline = pd.headline;
    if (pd.bio      != null)                                            patch.bio      = pd.bio;
    if (pd.location != null)                                            patch.location = pd.location;
    if (pd.website  != null)                                            patch.website  = pd.website;
    if (Array.isArray(pd.skills)       && pd.skills.length > 0)        patch.skills       = pd.skills;
    if (Array.isArray(pd.experience)   && pd.experience.length > 0)    patch.experience   = pd.experience;
    if (Array.isArray(pd.education)    && pd.education.length > 0)     patch.education    = pd.education;
    if (Array.isArray((pd as Record<string, unknown>).achievements) && ((pd as Record<string, unknown>).achievements as unknown[]).length > 0) {
      patch.achievements = (pd as Record<string, unknown>).achievements;
    }
    if ((pd as Record<string, unknown>).socialLinks) {
      const sl = (pd as Record<string, unknown>).socialLinks as Record<string, string | undefined>;
      patch.socialLinks = { ...(profile.socialLinks ?? {}), ...sl };
    }

    await updateProfileData(userId, patch as Parameters<typeof updateProfileData>[1]);
    const updated = await getProfileData(userId);

    return NextResponse.json({ profile: updated, appliedFrom: entry.fileName });
  } catch (err) {
    console.error('[profile/rollback-resume] error', err);
    return NextResponse.json({ error: 'Rollback failed — please try again.' }, { status: 500 });
  }
}
