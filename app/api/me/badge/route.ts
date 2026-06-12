import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getProfileData } from '@/lib/server/user-profiles';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ docrudGo: false, avatarUrl: null });
  }
  const profile = await getProfileData(session.user.id);
  return NextResponse.json(
    { docrudGo: profile?.docrudGo ?? false, avatarUrl: profile?.avatarUrl ?? null },
    { headers: { 'Cache-Control': 'private, max-age=60' } }
  );
}
