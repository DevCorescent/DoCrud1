import dynamic from 'next/dynamic';
import { buildPageMetadata } from '@/lib/seo';

const BusinessDirectory = dynamic(() => import('@/components/BusinessDirectory'), { ssr: false });

export const metadata = buildPageMetadata({
  title: 'Business Directory | Docrud',
  description: 'Discover companies, explore job openings, and connect with industry leaders on Docrud.',
  path: '/businesses',
});

export default function BusinessesPage() {
  return <BusinessDirectory />;
}
