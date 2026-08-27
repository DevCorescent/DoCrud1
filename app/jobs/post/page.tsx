import type { Metadata } from 'next';
import PostJobPage from '@/components/jobs/PostJobPage';
import { buildPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    title: 'Post a Job | Docrud',
    description: 'Post a hiring role to the Docrud Jobs marketplace.',
    path: '/jobs/post',
    keywords: ['post a job', 'hiring', 'job posting', 'recruit', 'docrud jobs'],
  });
}

export default function PostJobRoute() {
  return <PostJobPage />;
}
