import { NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import {
  listReferralRedemptions,
  listReferralInvites,
  listReferralActivations,
} from '@/lib/server/referrals';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [users, invites, activations, redemptions] = await Promise.all([
      getStoredUsers(),
      listReferralInvites(5000),
      listReferralActivations(5000),
      listReferralRedemptions(1500),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));

    // Enrich activations with names
    const enrichedActivations = activations.map((act) => {
      const referrer = userMap.get(act.referrerUserId);
      const referee  = userMap.get(act.refereeUserId);
      return {
        ...act,
        referrerName:  referrer?.name  || '—',
        referrerEmail: referrer?.email || '—',
        referrerOrg:   referrer?.organizationName || '—',
        refereeName:   referee?.name   || '—',
        refereeOrg:    referee?.organizationName  || '—',
      };
    });

    // Enrich invites
    const enrichedInvites = invites.map((inv) => {
      const referrer = userMap.get(inv.referrerUserId);
      return {
        ...inv,
        referrerName:  referrer?.name  || '—',
        referrerEmail: referrer?.email || '—',
      };
    });

    // Per-referrer leaderboard
    const leaderboardMap = new Map<string, {
      userId: string;
      name: string;
      email: string;
      org: string;
      invitesSent: number;
      activations: number;
      bonusGranted: boolean;
      bonusGrantedAt?: string;
    }>();

    for (const act of activations) {
      const referrer = userMap.get(act.referrerUserId);
      if (!referrer) continue;
      const existing = leaderboardMap.get(act.referrerUserId) ?? {
        userId:       referrer.id,
        name:         referrer.name,
        email:        referrer.email,
        org:          referrer.organizationName || '—',
        invitesSent:  invites.filter((i) => i.referrerUserId === referrer.id).length,
        activations:  0,
        bonusGranted: false,
      };
      existing.activations += 1;
      if (act.bonusGrantedAt) {
        existing.bonusGranted   = true;
        existing.bonusGrantedAt = act.bonusGrantedAt;
      }
      leaderboardMap.set(act.referrerUserId, existing);
    }

    // Also include users who only sent invites (no activations yet)
    for (const inv of invites) {
      if (leaderboardMap.has(inv.referrerUserId)) continue;
      const referrer = userMap.get(inv.referrerUserId);
      if (!referrer) continue;
      leaderboardMap.set(inv.referrerUserId, {
        userId:      referrer.id,
        name:        referrer.name,
        email:       referrer.email,
        org:         referrer.organizationName || '—',
        invitesSent: invites.filter((i) => i.referrerUserId === referrer.id).length,
        activations: 0,
        bonusGranted: false,
      });
    }

    const leaderboard = Array.from(leaderboardMap.values())
      .sort((a, b) => b.activations - a.activations || b.invitesSent - a.invitesSent)
      .slice(0, 50);

    // Summary stats
    const totalInvitesSent    = invites.length;
    const totalActivations    = activations.length;
    const totalBonusesGranted = activations.filter((a) => a.bonusGrantedAt).length;
    const uniqueReferrers     = new Set(activations.map((a) => a.referrerUserId)).size;
    const uniqueReferees      = new Set(activations.map((a) => a.refereeUserId)).size;

    // Conversion rate (invites → activations)
    const conversionRate = totalInvitesSent > 0
      ? Math.round((totalActivations / totalInvitesSent) * 100)
      : 0;

    // Recent 30 days trend
    const now30dAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const invites30d    = invites.filter((i)    => i.sentAt       >= now30dAgo).length;
    const activations30d = activations.filter((a) => a.activatedAt >= now30dAgo).length;

    return NextResponse.json({
      summary: {
        totalInvitesSent,
        totalActivations,
        totalBonusesGranted,
        uniqueReferrers,
        uniqueReferees,
        conversionRate,
        invites30d,
        activations30d,
      },
      leaderboard,
      activations: enrichedActivations.slice(0, 200),
      invites:     enrichedInvites.slice(0, 200),
      redemptions: redemptions.slice(0, 200),
    }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[admin/commerce/referrals]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
