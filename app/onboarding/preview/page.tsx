/**
 * /onboarding/preview — the new onboarding UI on its own, so each transferred
 * screen can be compared against the design source before the flow exists.
 *
 * This is a staging mount, not the real route. /onboarding still renders the
 * existing signup funnel (app/onboarding/_legacy) and keeps doing so until
 * Phase 11. Delete this route once the flow lands on /onboarding.
 */
import PreviewClient from './PreviewClient';
import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Onboarding preview | Docrud',
  description: 'Visual staging route for the onboarding flow.',
  path: '/onboarding/preview',
  noIndex: true,
});

export default function OnboardingPreviewPage() {
  return <PreviewClient />;
}
