import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import NextDynamic from 'next/dynamic';
import { buildPageMetadata } from '@/lib/seo';
import { getThemeSettings } from '@/lib/server/settings';
import { getAuthSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

// Client-only: avoids SSR/hydration mismatches from auth-conditional rendering
const PublicHomepage = NextDynamic(() => import('@/components/PublicHomepage'), {
  ssr: false,
  loading: () => <div className="h-screen w-full bg-[#0D0D0F]" />,
});

export const metadata = buildPageMetadata({
  title: 'Docrud | Document Management, Forms, PDF Editor, AI Tools & Secure File Sharing',
  description:
    'Docrud helps teams create documents, build forms, edit PDFs, review files with AI, share securely, and manage daily workflows from one workspace.',
  path: '/',
  keywords: ['docrud', 'document management software', 'pdf editor', 'secure file sharing', 'form builder', 'ai document review'],
});

export default async function Home() {
  const cookieStore = await cookies();
  const isGuest = cookieStore.get('guestMode')?.value === '1';

  const [session, themeSettings] = await Promise.all([
    getAuthSession(),
    getThemeSettings(),
  ]);

  if (!session && !isGuest) {
    redirect('/onboarding');
  }

  return (
    <PublicHomepage
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
      guestMode={!session && isGuest}
    />
  );
}
