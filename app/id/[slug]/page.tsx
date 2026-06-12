import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicVirtualIdPage from '@/components/PublicVirtualIdPage';
import { buildPageMetadata } from '@/lib/seo';
import { getPublicVirtualIdCard } from '@/lib/server/virtual-ids';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const card = await getPublicVirtualIdCard(params.slug);
  if (!card) {
    return buildPageMetadata({
      title: 'Virtual ID | Docrud',
      description: 'View public virtual ID cards published through Docrud.',
      path: `/id/${params.slug}`,
      noIndex: true,
    });
  }

  return buildPageMetadata({
    title: `${card.title || card.ownerName} | Virtual ID | Docrud`,
    description: `View the public virtual ID profile for ${card.ownerName || card.title} on Docrud.`,
    path: `/id/${params.slug}`,
    keywords: ['virtual id', card.ownerName || '', card.title || '', 'public profile'],
  });
}

export default async function VirtualIdPublicPage({ params }: { params: { slug: string } }) {
  const card = await getPublicVirtualIdCard(params.slug);
  if (!card) {
    notFound();
  }

  return <PublicVirtualIdPage card={card} />;
}
