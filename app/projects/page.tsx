import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import NextDynamic from 'next/dynamic';
import { Suspense } from 'react';
import { buildPageMetadata } from '@/lib/seo';
import { getThemeSettings } from '@/lib/server/settings';
import { getAuthSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/* Wired exactly as /jobs is, because it is the same page: a client board in the
   light shell, rendered client-side because its first paint is a skeleton over
   the panel's glass and SSR-ing it would only move that skeleton into the HTML.
   The shim is the panel's own ground colour, so there is no white flash before
   the stylesheet lands. */
const ProjectsBoard = NextDynamic(() => import('@/components/projects/board/ProjectsBoard'), {
  ssr: false,
  loading: () => <div style={{ minHeight: '100dvh', background: '#eaf0fa' }} />,
});

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: 'Projects | Docrud',
    description: 'Browse project briefs posted on Docrud — fixed or hourly, one-off or ongoing.',
    path: '/projects',
    keywords: ['projects', 'freelance', 'briefs', 'contract work', 'docrud projects'],
  });
}

export default async function ProjectsRoute() {
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
    /* The board reads `?category=` and `?q=` from the URL, and
       `useSearchParams` opts a client component out of static rendering — so it
       needs a Suspense boundary or the route fails to build. */
    <Suspense fallback={null}>
      <ProjectsBoard
        softwareName={themeSettings.softwareName}
        guestMode={!session && isGuest}
        viewer={viewer}
      />
    </Suspense>
  );
}
