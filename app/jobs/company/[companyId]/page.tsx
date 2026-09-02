import type { Metadata } from 'next';
import CompanyJobsView from '@/components/jobs/company/CompanyJobsView';
import { buildPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Company jobs | Docrud',
  description: 'Open roles at this company, ranked by how well they match your profile.',
  path: '/jobs/company',
  /* Ranking is personal to the viewer, so this page is not a crawlable one. */
  noIndex: true,
});

export default function CompanyJobsRoute({ params }: { params: { companyId: string } }) {
  return <CompanyJobsView companyId={params.companyId} />;
}
