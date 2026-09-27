import type { Metadata } from 'next';
import { Suspense } from 'react';
import JobPostWizard from '@/components/jobs/post/JobPostWizard';
import { buildPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

/**
 * One route, two configurations — see `OppKind` in lib/jobs/post-wizard.ts. The
 * title follows `?kind=` so a shared bookmark, a search result and the browser
 * tab all say which composer was opened, even though the form behind them is
 * the same one.
 */
export async function generateMetadata(
  { searchParams }: { searchParams?: Record<string, string | string[] | undefined> },
): Promise<Metadata> {
  const internship = searchParams?.kind === 'internship';
  const noun = internship ? 'an Internship' : 'a Job';
  return buildPageMetadata({
    title: `Post ${noun} | Docrud`,
    description: internship
      ? 'Post an internship to the Docrud opportunities marketplace.'
      : 'Post a hiring role to the Docrud opportunities marketplace.',
    path: internship ? '/jobs/post?kind=internship' : '/jobs/post',
    keywords: internship
      ? ['post an internship', 'internship', 'hiring interns', 'docrud opportunities']
      : ['post a job', 'hiring', 'job posting', 'recruit', 'docrud jobs'],
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
