import type { Metadata } from 'next';
import { Suspense } from 'react';
import JobPostWizard from '@/components/jobs/post/JobPostWizard';
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
  /* The wizard reads its step from the query string, so it must sit inside a
     Suspense boundary — useSearchParams opts a client component out of static
     rendering, and without this the whole route fails to build. */
  return (
    <Suspense fallback={null}>
      <JobPostWizard />
    </Suspense>
  );
}
