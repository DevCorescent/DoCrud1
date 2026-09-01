import type { Metadata } from 'next';
import RecommendationsPage from '@/components/jobs/recommendations/RecommendationsPage';
import { buildPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Recommended Jobs | Docrud',
  description: 'Roles matched to your profile, ranked by relevance with your ATS match for each.',
  path: '/jobs/recommended',
  // Personalized to one member: useful to them, meaningless to a crawler.
  noIndex: true,
});

export default function RecommendedJobsRoute() {
  return <RecommendationsPage />;
}
