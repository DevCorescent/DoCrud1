/**
 * /onboarding — the onboarding flow.
 *
 * This is the real route. The flow it renders was developed behind
 * /onboarding/preview; that staging route is gone and this is now the only
 * entry point.
 *
 * The previous 3,700-line signup funnel still sits in ./_legacy. It is no
 * longer routed — Next does not route an underscore-prefixed directory — and
 * is kept only as a rollback for as long as this flow is new. It can be
 * deleted once this one has proven itself in production; nothing imports it
 * any more.
 *
 * This route is a redirect target across the app (middleware.ts, app/page.tsx,
 * and every `signOut({ callbackUrl: '/onboarding' })`), so it must always
 * render something usable to a signed-out visitor.
 */
import OnboardingClient from './OnboardingClient';
import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Get started | Docrud',
  description: 'Tell us what you are looking for and see the roles open on Docrud right now.',
  path: '/onboarding',
  noIndex: true,
});

export default function OnboardingPage() {
  return <OnboardingClient />;
}
