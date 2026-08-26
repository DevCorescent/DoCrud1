import type { Metadata } from 'next';
import JobsFeedPage from '@/components/JobsFeedPage';
import { buildPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: 'Jobs | Docrud',
    description: 'Browse and apply to open roles published on Docrud.',
    path: '/jobs',
    keywords: ['jobs', 'careers', 'hiring', 'open roles', 'docrud jobs'],
  });
}

export default function JobsFeedRoute() {
  return <JobsFeedPage />;
}
