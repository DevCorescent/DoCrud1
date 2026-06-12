import { NextResponse } from 'next/server';
import {
  historyFilePath,
  usersPath,
  upraisedPath,
  gigsPath,
  readJsonFile,
} from '@/lib/server/storage';

export const dynamic = 'force-dynamic';

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

export async function GET() {
  try {
    const [history, users, upraised, gigs] = await Promise.all([
      readJsonFile<unknown[]>(historyFilePath, []),
      readJsonFile<Array<{ isActive?: boolean; role?: string; email?: string }>>(usersPath, []),
      readJsonFile<Record<string, string[]>>(upraisedPath, {}),
      readJsonFile<Array<{ status?: string }>>(gigsPath, []),
    ]);

    const peopleCount = users.filter(
      (u) => u.isActive !== false && !(u.role === 'admin' && (u.email || '').includes('company.com')),
    ).length;

    const upraisesTotal = Object.values(upraised).reduce((sum, arr) => sum + arr.length, 0);

    const publishedGigs = gigs.filter((g) => g.status === 'published').length;

    return NextResponse.json({
      publishes: { value: fmt(history.length), raw: history.length, label: 'documents published' },
      people: { value: fmt(peopleCount), raw: peopleCount, label: 'professionals' },
      upraises: { value: fmt(upraisesTotal), raw: upraisesTotal, label: 'upraises given' },
      gigs: { value: fmt(publishedGigs), raw: publishedGigs, label: 'live gigs' },
    });
  } catch {
    return NextResponse.json(
      { publishes: { value: '—', raw: 0, label: 'documents published' }, people: { value: '—', raw: 0, label: 'professionals' }, upraises: { value: '—', raw: 0, label: 'upraises given' }, gigs: { value: '—', raw: 0, label: 'live gigs' } },
      { status: 200 },
    );
  }
}
