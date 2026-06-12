import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getStoredUsers } from '@/lib/server/auth';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const users = await getStoredUsers();

    // Extract credits data from user objects
    type CreditUser = {
      id: string; name: string; email: string; role: string;
      credits: { balance: number; totalEarned: number; totalSpent: number; currentStreak?: number; longestStreak?: number } | undefined;
    };

    const creditUsers: CreditUser[] = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      credits: (u as unknown as Record<string, unknown>).credits as CreditUser['credits'],
    })).filter((u) => u.credits);

    const totalBalance = creditUsers.reduce((s, u) => s + (u.credits?.balance || 0), 0);
    const totalEarned = creditUsers.reduce((s, u) => s + (u.credits?.totalEarned || 0), 0);
    const totalSpent = creditUsers.reduce((s, u) => s + (u.credits?.totalSpent || 0), 0);
    const usersWithCredits = creditUsers.filter((u) => (u.credits?.balance || 0) > 0).length;
    const avgBalance = creditUsers.length > 0 ? Math.round(totalBalance / creditUsers.length) : 0;

    const topEarners = [...creditUsers]
      .sort((a, b) => (b.credits?.totalEarned || 0) - (a.credits?.totalEarned || 0))
      .slice(0, 15)
      .map((u) => ({ id: u.id, name: u.name, email: u.email, earned: u.credits?.totalEarned || 0, balance: u.credits?.balance || 0, streak: u.credits?.currentStreak || 0 }));

    const topBalances = [...creditUsers]
      .sort((a, b) => (b.credits?.balance || 0) - (a.credits?.balance || 0))
      .slice(0, 15)
      .map((u) => ({ id: u.id, name: u.name, email: u.email, balance: u.credits?.balance || 0, earned: u.credits?.totalEarned || 0 }));

    const streakData = creditUsers.map((u) => u.credits?.currentStreak || 0).filter((s) => s > 0);
    const maxStreak = streakData.length ? Math.max(...streakData) : 0;
    const avgStreak = streakData.length ? Math.round(streakData.reduce((a, b) => a + b, 0) / streakData.length) : 0;
    const usersOnStreak = streakData.length;

    // Balance distribution buckets
    const buckets = { zero: 0, low: 0, medium: 0, high: 0, whale: 0 };
    creditUsers.forEach((u) => {
      const b = u.credits?.balance || 0;
      if (b === 0) buckets.zero++;
      else if (b < 100) buckets.low++;
      else if (b < 500) buckets.medium++;
      else if (b < 2000) buckets.high++;
      else buckets.whale++;
    });

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: { totalBalance, totalEarned, totalSpent, usersWithCredits, avgBalance, maxStreak, avgStreak, usersOnStreak, totalTrackedUsers: creditUsers.length },
      topEarners,
      topBalances,
      balanceDistribution: buckets,
    });
  } catch (err) {
    console.error('[super-admin/credits-overview GET]', err);
    return NextResponse.json({ error: 'Failed to load credits data' }, { status: 500 });
  }
}
