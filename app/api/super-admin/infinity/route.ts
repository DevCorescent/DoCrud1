import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getProfileData, updateProfileData, getAllProfiles } from '@/lib/server/user-profiles';

export const dynamic = 'force-dynamic';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/** GET — list all Infinity subscribers */
export async function GET(req: NextRequest) {
  const fail = await guard(req);
  if (fail) return fail;

  try {
    const profiles = await getAllProfiles();
    const subscribers = Object.entries(profiles)
      .filter(([, p]) => p?.docrudInfinity)
      .map(([userId, p]) => ({
        userId,
        purchasedAt: p.docrudInfinityPurchasedAt,
        grantedFree: p.docrudInfinityGrantedFree ?? false,
      }))
      .sort((a, b) => new Date(b.purchasedAt || 0).getTime() - new Date(a.purchasedAt || 0).getTime());

    return NextResponse.json({ subscribers, total: subscribers.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** POST — grant or revoke Infinity for a user */
export async function POST(req: NextRequest) {
  const fail = await guard(req);
  if (fail) return fail;

  try {
    const body = await req.json() as { userId?: string; action?: 'grant' | 'revoke' };
    const { userId, action } = body;

    if (!userId || !['grant', 'revoke'].includes(action!)) {
      return NextResponse.json({ error: 'userId and action (grant|revoke) required' }, { status: 400 });
    }

    const profile = await getProfileData(userId);
    if (!profile && action === 'revoke') {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    if (action === 'grant') {
      await updateProfileData(userId, {
        docrudInfinity: true,
        docrudInfinityPurchasedAt: new Date().toISOString(),
        docrudInfinityGrantedFree: true,
      });
      return NextResponse.json({ success: true, action: 'granted', userId });
    } else {
      await updateProfileData(userId, {
        docrudInfinity: false,
        docrudInfinityGrantedFree: false,
      });
      return NextResponse.json({ success: true, action: 'revoked', userId });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
