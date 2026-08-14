import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import NextDynamic from 'next/dynamic';
import { buildPageMetadata } from '@/lib/seo';
import { getThemeSettings } from '@/lib/server/settings';
import { getAuthSession } from '@/lib/server/auth';
import { getProfileFields } from '@/lib/server/user-profiles';

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
    getAuthSession().catch(() => null),
    getThemeSettings().catch(() => ({ softwareName: 'Docrud', accentLabel: 'Platform' })),
  ]);

  if (!session && !isGuest) {
    redirect('/onboarding');
  }

  // First-run gate: an individual whose email is verified but who has never been
  // through onboarding gets the welcome → interests → first-post flow once.
  // Guests, business accounts and anyone already onboarded fall straight through.
  const needsOnboarding = Boolean(
    session?.user?.id
    && session.user.accountType === 'individual'
    && session.user.emailVerified === true
    && (await getProfileFields(session.user.id, ['onboardingDone'])
      .then((profile) => profile.onboardingDone !== true)
      .catch(() => false)),
  );

  if (needsOnboarding) {
    redirect('/onboarding/start');
  }

  return (
    <PublicHomepage
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
      guestMode={!session && isGuest}
    />
  );
}
