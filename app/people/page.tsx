import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import NextDynamic from 'next/dynamic';
import { buildPageMetadata } from '@/lib/seo';
import { getThemeSettings } from '@/lib/server/settings';
import { getAuthSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

const TalentBoard = NextDynamic(() => import('@/components/people/board/TalentBoard'), {
  ssr: false,
  loading: () => <div style={{ minHeight: '100dvh', background: '#f6f7fa' }} />,
});

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: 'Talent | Docrud',
    description: 'Browse people on Docrud by skill, headline and location — published profiles, open to work.',
    path: '/people',
    keywords: ['talent', 'people', 'directory', 'hire', 'skills', 'docrud'],
  });
}

export default async function Page() {
  const cookieStore = await cookies();
  const isGuest = cookieStore.get('guestMode')?.value === '1';

  const [session, themeSettings] = await Promise.all([
    getAuthSession().catch(() => null),
    getThemeSettings().catch(() => ({ softwareName: 'Docrud', accentLabel: 'Platform' })),
  ]);

  const viewer = session?.user
    ? { name: session.user.name ?? null, email: session.user.email ?? null }
    : null;

  return (
    <TalentBoard
      softwareName={themeSettings.softwareName}
      guestMode={!session && isGuest}
      viewer={viewer}
    />
  );
}
