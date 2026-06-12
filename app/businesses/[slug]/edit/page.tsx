import dynamic from 'next/dynamic';
import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/server/auth';
import { getBusinessPageBySlug } from '@/lib/server/business-pages';
import { buildPageMetadata } from '@/lib/seo';

const BusinessPageEditor = dynamic(() => import('@/components/BusinessPageEditor'), { ssr: false });

export function generateMetadata({ params }: { params: { slug: string } }) {
  return buildPageMetadata({
    title: `Edit Business Page | Docrud`,
    description: 'Edit your business page on Docrud.',
    path: `/businesses/${params.slug}/edit`,
  });
}

export default async function EditBusinessPage({ params }: { params: { slug: string } }) {
  const session = await getAuthSession();
  if (!session) redirect(`/login?next=/businesses/${params.slug}/edit`);

  const page = await getBusinessPageBySlug(params.slug);
  if (!page) redirect('/businesses');
  if (page.ownerUserId !== session.user?.id) redirect(`/businesses/${params.slug}`);

  return <BusinessPageEditor page={page} />;
}
