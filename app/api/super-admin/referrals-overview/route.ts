import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { listReferralInvites, listReferralActivations, listReferralRedemptions } from '@/lib/server/referrals';
import { getStoredUsers } from '@/lib/server/auth';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [invites, activations, redemptions, users] = await Promise.all([
      listReferralInvites(2000).catch(() => []),
      listReferralActivations(2000).catch(() => []),
      listReferralRedemptions(800).catch(() => []),
      getStoredUsers(),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));

    const now = Date.now();
    const day7 = now - 7 * 86400000;
    const day30 = now - 30 * 86400000;

    type Invite = { id: string; referrerUserId: string; inviteeEmail: string; sentAt?: string; signedUp?: boolean; signedUpAt?: string };
    type Activation = { id: string; referrerUserId: string; refereeUserId: string; activatedAt?: string; createdAt?: string };
    type Redemption = { id: string; referrerUserId: string; refereeUserId: string; transactionId?: string; bonusGranted?: boolean; createdAt?: string };

    const inv = invites as Invite[];
    const act = activations as Activation[];
    const red = redemptions as Redemption[];

    const conversionRate = inv.length > 0 ? Math.round((inv.filter((i) => i.signedUp).length / inv.length) * 100) : 0;

    // Top referrers by activations
    const referrerCounts: Record<string, { invites: number; activations: number; redemptions: number; name: string; email: string }> = {};
    inv.forEach((i) => {
      if (!referrerCounts[i.referrerUserId]) {
        const u = userMap.get(i.referrerUserId);
        referrerCounts[i.referrerUserId] = { invites: 0, activations: 0, redemptions: 0, name: u?.name || i.referrerUserId, email: u?.email || '' };
      }
      referrerCounts[i.referrerUserId].invites++;
    });
    act.forEach((a) => {
      if (!referrerCounts[a.referrerUserId]) {
        const u = userMap.get(a.referrerUserId);
        referrerCounts[a.referrerUserId] = { invites: 0, activations: 0, redemptions: 0, name: u?.name || a.referrerUserId, email: u?.email || '' };
      }
      referrerCounts[a.referrerUserId].activations++;
    });
    red.forEach((r) => {
      if (referrerCounts[r.referrerUserId]) referrerCounts[r.referrerUserId].redemptions++;
    });

    const topReferrers = Object.entries(referrerCounts)
      .sort(([, a], [, b]) => b.activations - a.activations)
      .slice(0, 15)
      .map(([userId, d]) => ({ userId, ...d }));

    // Daily invites (30 days)
    const dailyInvites: { date: string; invites: number; signups: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const dateStr = d.toISOString().slice(0, 10);
      const dayInvites = inv.filter((x) => String(x.sentAt || '').slice(0, 10) === dateStr);
      dailyInvites.push({
        date: dateStr,
        invites: dayInvites.length,
        signups: dayInvites.filter((x) => x.signedUp).length,
      });
    }

    const recentRedemptions = [...red]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 15)
      .map((r) => ({
        id: r.id,
        referrerName: userMap.get(r.referrerUserId)?.name || r.referrerUserId,
        referrerEmail: userMap.get(r.referrerUserId)?.email || '',
        refereeName: userMap.get(r.refereeUserId)?.name || r.refereeUserId,
        bonusGranted: r.bonusGranted,
        createdAt: r.createdAt,
      }));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalInvites: inv.length,
        totalSignedUp: inv.filter((i) => i.signedUp).length,
        conversionRate,
        totalActivations: act.length,
        totalRedemptions: red.length,
        bonusesGranted: red.filter((r) => r.bonusGranted).length,
        invites7d: inv.filter((i) => i.sentAt && new Date(i.sentAt).getTime() >= day7).length,
        invites30d: inv.filter((i) => i.sentAt && new Date(i.sentAt).getTime() >= day30).length,
        activations30d: act.filter((a) => (a.activatedAt || a.createdAt) && new Date(String(a.activatedAt || a.createdAt)).getTime() >= day30).length,
      },
      topReferrers,
      dailyInvites,
      recentRedemptions,
    });
  } catch (err) {
    console.error('[super-admin/referrals-overview GET]', err);
    return NextResponse.json({ error: 'Failed to load referrals data' }, { status: 500 });
  }
}
