import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import NextDynamic from 'next/dynamic';
import { buildPageMetadata } from '@/lib/seo';
import { getThemeSettings } from '@/lib/server/settings';
import { getAuthSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/* The board is a client surface with the TYRAI overlay behind a dynamic import,
   so it is rendered client-side for the same reason the homepage is: its first
   paint is a skeleton over the panel's glass, and SSR-ing it would only move
   that skeleton into the HTML. The shim below is the panel's own ground colour
   so there is no white flash before the stylesheet's aurora lands. */
const JobsBoard = NextDynamic(() => import('@/components/jobs/board/JobsBoard'), {
  ssr: false,
  loading: () => <div style={{ minHeight: '100dvh', background: '#eaf0fa' }} />,
});

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: 'Jobs | Docrud',
    description: 'Browse and apply to open roles published on Docrud.',
    path: '/jobs',
    keywords: ['jobs', 'careers', 'hiring', 'open roles', 'docrud jobs'],
  });
}

export default async function JobsFeedRoute() {
  const cookieStore = await cookies();
  const isGuest = cookieStore.get('guestMode')?.value === '1';

  const [session, themeSettings] = await Promise.all([
    getAuthSession().catch(() => null),
    getThemeSettings().catch(() => ({ softwareName: 'Docrud', accentLabel: 'Platform' })),
  ]);

  /* Resolved here rather than by a client round trip to /api/auth/session,
     which otherwise sits in front of the header's avatar on every load. */
  const viewer = session?.user
    ? { name: session.user.name ?? null, email: session.user.email ?? null }
    : null;

  return (
    <JobsBoard
      softwareName={themeSettings.softwareName}
      guestMode={!session && isGuest}
      viewer={viewer}
    />
  );
}
