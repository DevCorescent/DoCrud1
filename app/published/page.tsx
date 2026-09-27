import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import NextDynamic from 'next/dynamic';
import { buildPageMetadata } from '@/lib/seo';
import { getThemeSettings } from '@/lib/server/settings';
import { getAuthSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/* Client-rendered for the same reason the jobs board is: its first paint is a
   skeleton over the page's ground, and server-rendering it would only move that
   skeleton into the HTML. The shim is the page's own ground colour so there is
   no white flash before the stylesheet lands. */
const FeedBoard = NextDynamic(() => import('@/components/feed/board/FeedBoard'), {
  ssr: false,
  loading: () => <div style={{ minHeight: '100dvh', background: '#f6f7fa' }} />,
});

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: 'Feed | Docrud',
    description: 'Browse everything published on Docrud — documents, articles, posts, announcements, products and more.',
    path: '/published',
    keywords: ['feed', 'published', 'articles', 'documents', 'announcements', 'docrud'],
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
    <FeedBoard
      softwareName={themeSettings.softwareName}
      guestMode={!session && isGuest}
      viewer={viewer}
    />
  );
}
