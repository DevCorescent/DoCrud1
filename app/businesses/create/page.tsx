import NextDynamic from 'next/dynamic';
import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/server/auth';
import { hasInfinity } from '@/lib/server/infinity';
import { buildPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

const BusinessPageCreator = NextDynamic(() => import('@/components/BusinessPageCreator'), { ssr: false });

export const metadata = buildPageMetadata({
  title: 'Create Business Page | Docrud',
  description: 'Create a free business page on Docrud to showcase your company, post jobs, and share updates.',
  path: '/businesses/create',
});

export default async function CreateBusinessPage() {
  const session = await getAuthSession();
  if (!session) redirect('/login?next=/businesses/create');
  const infinity = await hasInfinity(session.user!.id!);
  if (!infinity) redirect('/infinity?returnTo=/businesses/create');
  return <BusinessPageCreator />;
}
