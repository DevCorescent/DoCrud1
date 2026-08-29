import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import JobDetailPage from '@/components/jobs/JobDetailPage';
import { buildPageMetadata, buildJobPostingSchema, buildBreadcrumbSchema, jsonLd, metaDesc } from '@/lib/seo';
import { getPublishedHiringJobById, userOwnsHiringJob } from '@/lib/server/hiring';
import { getAuthSession } from '@/lib/server/auth';
import { getStoredUsers } from '@/lib/server/auth';
import { getPublicAppBaseUrl } from '@/lib/url';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const job = await getPublishedHiringJobById(params.id);

  if (!job) {
    return buildPageMetadata({
      title: 'Job Opening | Docrud',
      description: 'Explore public job openings published through Docrud.',
      path: `/jobs/${params.id}`,
      noIndex: true,
    });
  }

  const description = metaDesc(
    `${job.title} at ${job.organizationName}${job.location ? ` in ${job.location}` : ''}. Explore responsibilities, requirements, and apply through Docrud.`,
    160,
  );

  return buildPageMetadata({
    title: `${job.title} | ${job.organizationName} | Docrud Jobs`,
    description,
    path: `/jobs/${params.id}`,
    keywords: [
      job.title,
      job.organizationName,
      job.location ?? '',
      job.employmentType ?? '',
      'job opening',
      'hiring',
      'career',
      'docrud jobs',
    ].filter(Boolean) as string[],
    ogType: 'article',
    publishedTime: job.createdAt ? new Date(job.createdAt).toISOString() : undefined,
    modifiedTime: job.updatedAt ? new Date(job.updatedAt).toISOString() : undefined,
  });
}

export default async function PublicHiringJobDetailPage({ params }: { params: { id: string } }) {
  const baseUrl = getPublicAppBaseUrl();
  // The marketplace detail view carries its own chrome, so the landing/theme
  // settings the old public-site shell needed are no longer fetched here.
  const job = await getPublishedHiringJobById(params.id);

  if (!job) notFound();

  /* Ownership is decided on the SERVER from the session, so the owner-only
     controls cannot be revealed by editing client state — and the API re-checks
     ownership on every write regardless of what the UI shows. */
  let isOwner = false;
  try {
    const session = await getAuthSession();
    if (session?.user?.email) {
      const users = await getStoredUsers();
      const viewer = users.find(
        (entry) => entry.email.toLowerCase() === session.user!.email!.toLowerCase(),
      );
      if (viewer) isOwner = userOwnsHiringJob(viewer, job);
    }
  } catch { /* a session lookup failure simply means no owner controls */ }

  const jobSchema = buildJobPostingSchema({
    title: job.title,
    description: metaDesc(job.description ?? job.title, 5000),
    organizationName: job.organizationName,
    location: job.location,
    remoteAllowed: job.workMode === 'remote' || job.workMode === 'hybrid',
    employmentType: job.employmentType === 'part_time' ? 'PART_TIME' : 'FULL_TIME',
    salary: undefined,
    postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : undefined,
    url: `${baseUrl}/jobs/${params.id}`,
  });

  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: 'Home', url: baseUrl },
    { name: 'Jobs', url: `${baseUrl}/jobs` },
    { name: `${job.title} at ${job.organizationName}`, url: `${baseUrl}/jobs/${params.id}` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(jobSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }}
      />
      <JobDetailPage job={job} isOwner={isOwner} />
    </>
  );
}
