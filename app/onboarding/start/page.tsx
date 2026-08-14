import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/server/auth';
import { getProfileFields } from '@/lib/server/user-profiles';
import { buildPageMetadata } from '@/lib/seo';
import OnboardingFlow from '@/components/OnboardingFlow';

export const dynamic = 'force-dynamic';

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

  return <OnboardingFlow initialInterests={Array.isArray(profile.interests) ? profile.interests : []} />;
}
