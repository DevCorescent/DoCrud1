import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import NextDynamic from 'next/dynamic';
import { buildPageMetadata } from '@/lib/seo';
import { getThemeSettings } from '@/lib/server/settings';
import { getAuthSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

const CompaniesBoard = NextDynamic(() => import('@/components/businesses/board/CompaniesBoard'), {
  ssr: false,
  loading: () => <div style={{ minHeight: '100dvh', background: '#f6f7fa' }} />,
});

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: 'Companies | Docrud',
    description: 'Discover companies on Docrud — their pages, their industries and the roles they are hiring for.',
    path: '/businesses',
    keywords: ['companies', 'business directory', 'employers', 'hiring', 'docrud'],
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
    <CompaniesBoard
      softwareName={themeSettings.softwareName}
      guestMode={!session && isGuest}
      viewer={viewer}
    />
  );
}
