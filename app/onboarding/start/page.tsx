import { redirect } from 'next/navigation';
import { Dancing_Script } from 'next/font/google';
import { getAuthSession } from '@/lib/server/auth';
import { getProfileFields } from '@/lib/server/user-profiles';
import { buildPageMetadata } from '@/lib/seo';
import OnboardingFlow from '@/components/OnboardingFlow';

export const dynamic = 'force-dynamic';

/**
 * Script face for the "Share your story" heading only. Declared here rather
 * than in the root layout so it is fetched on this route alone — the rest of
 * the app keeps loading Manrope by itself.
 */
const scriptFont = Dancing_Script({
  subsets: ['latin'],
  display: 'swap',
  weight: ['600', '700'],
  variable: '--font-docrud-script',
  fallback: ['Georgia', 'serif'],
});

/** First name for the welcome greeting, with the fallbacks the session offers. */
function greetingName(name?: string | null, organization?: string | null, email?: string | null) {
  const source = name?.trim() || organization?.trim() || email?.split('@')[0]?.trim() || '';
  const first = source.split(/[\s._-]+/).filter(Boolean)[0] ?? '';
  if (!first) return '';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export const metadata = buildPageMetadata({
  title: 'Get Started | Docrud',
  description: 'Set up your Docrud experience — pick your interests and publish your first post.',
  path: '/onboarding/start',
  noIndex: true,
});

/**
 * First-run onboarding: welcome → interests → first post.
 *
 * Access rules mirror the ones the rest of the app already uses:
 * - no session            → the existing signup funnel at /onboarding
 * - unverified individual → the existing funnel, which owns the OTP step
 * - onboarding complete   → straight into the app (nothing to do here)
 */
export default async function OnboardingStartPage() {
  const session = await getAuthSession().catch(() => null);

  if (!session?.user?.id) {
    redirect('/onboarding');
  }

  if (session.user.accountType === 'individual' && session.user.emailVerified !== true) {
    redirect('/onboarding');
  }

  const profile = await getProfileFields(session.user.id, ['onboardingDone', 'interests'])
    .catch(() => ({ onboardingDone: undefined, interests: undefined }));

  if (profile.onboardingDone === true) {
    redirect('/');
  }

  return (
    <OnboardingFlow
      initialInterests={Array.isArray(profile.interests) ? profile.interests : []}
      userName={greetingName(session.user.name, session.user.organizationName, session.user.email)}
      scriptFontClass={scriptFont.variable}
    />
  );
}
