import { NextResponse } from 'next/server';
import { getFileTransfers } from '@/lib/server/file-transfers';
import { getStoredUsers } from '@/lib/server/auth';
import { getUpraiseCounts } from '@/lib/server/upraised';
import { readJsonFile } from '@/lib/server/storage';
import { followsPath } from '@/lib/server/storage';

export const dynamic = 'force-dynamic';

const AVATAR_BGS = [
  'from-pink-500 to-rose-600', 'from-blue-500 to-indigo-600',
  'from-purple-500 to-violet-600', 'from-orange-500 to-amber-600',
  'from-teal-500 to-emerald-600', 'from-cyan-500 to-blue-600',
  'from-fuchsia-500 to-pink-600', 'from-red-500 to-rose-600',
  'from-lime-500 to-green-600', 'from-sky-500 to-cyan-600',
];

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '??';
}

export type LBEntry = {
  id: string;
  name: string;
  subtitle: string;
  initials: string;
  avatarBg: string;
  value: number;
  valueLabel: string;
  href: string;
};

export type LeaderboardsPayload = {
  upraisers: LBEntry[];
  followers: LBEntry[];
  liked: LBEntry[];
  commented: LBEntry[];
  viewed: LBEntry[];
  updatedAt: string;
};

export async function GET() {
  try {
    const [users, transfers, followsData] = await Promise.all([
      getStoredUsers(),
      getFileTransfers(),
      readJsonFile<Record<string, string[]>>(followsPath, {}),
    ]);

    const activeUsers = users.filter(
      u => u.isActive !== false && u.role !== 'admin',
    );

    const userIds = activeUsers.map(u => u.id);
    const upraiseCounts = await getUpraiseCounts(userIds);

    // Compute follower counts from follows data (followsData: { [followerId]: followedIds[] })
    const followerCounts: Record<string, number> = {};
    for (const followedIds of Object.values(followsData)) {
      for (const fid of followedIds) {
        followerCounts[fid] = (followerCounts[fid] ?? 0) + 1;
      }
    }

    // People leaderboards
    const upraisers: LBEntry[] = activeUsers
      .map((u, i) => ({
        id: u.id,
        name: u.name || u.email.split('@')[0],
        subtitle: (u as any).profile?.headline || (u as any).accountType || 'Professional',
        initials: initials(u.name || u.email.split('@')[0]),
        avatarBg: AVATAR_BGS[i % AVATAR_BGS.length],
        value: upraiseCounts[u.id] ?? 0,
        valueLabel: fmt(upraiseCounts[u.id] ?? 0),
        href: `/u/${u.id}`,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const followers: LBEntry[] = activeUsers
      .map((u, i) => ({
        id: u.id,
        name: u.name || u.email.split('@')[0],
        subtitle: (u as any).profile?.headline || 'Professional',
        initials: initials(u.name || u.email.split('@')[0]),
        avatarBg: AVATAR_BGS[i % AVATAR_BGS.length],
        value: followerCounts[u.id] ?? 0,
        valueLabel: fmt(followerCounts[u.id] ?? 0),
        href: `/u/${u.id}`,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Document leaderboards (public published items)
    const publicItems = transfers.filter(
      t => t.directoryVisibility === 'public' && t.authMode === 'public' && !t.revokedAt,
    );

    const docEntries = (sortFn: (t: typeof publicItems[0]) => number): LBEntry[] =>
      publicItems
        .map((t, i) => ({
          id: t.id,
          name: t.title || t.fileName,
          subtitle: t.uploadedBy?.split('@')[0] ?? 'Anonymous',
          initials: initials(t.uploadedBy?.split('@')[0] ?? 'Doc'),
          avatarBg: AVATAR_BGS[i % AVATAR_BGS.length],
          value: sortFn(t),
          valueLabel: fmt(sortFn(t)),
          href: `/published/${t.id}`,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

    const liked    = docEntries(t => t.likesCount ?? 0);
    const commented = docEntries(t => t.commentsCount ?? 0);
    const viewed   = docEntries(t => t.viewCount ?? t.openCount ?? 0);

    return NextResponse.json({
      upraisers,
      followers,
      liked,
      commented,
      viewed,
      updatedAt: new Date().toISOString(),
    } satisfies LeaderboardsPayload);
  } catch (e) {
    console.error('[leaderboards] error', e);
    return NextResponse.json({ upraisers:[], followers:[], liked:[], commented:[], viewed:[], updatedAt: new Date().toISOString() });
  }
}
