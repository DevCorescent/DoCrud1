import type { Metadata } from 'next';
import MyJobsPage from '@/components/jobs/MyJobsPage';
import { buildPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'My Jobs | Docrud',
  description: 'Manage the roles you posted on Docrud — status, applications, edits and unpublishing.',
  path: '/jobs/my',
  // Personal management surface: useful to the owner, not to search engines.
  noIndex: true,
});

export default function MyJobsRoute() {
  return <MyJobsPage />;
}
