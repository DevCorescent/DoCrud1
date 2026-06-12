import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicCertificatePage from '@/components/PublicCertificatePage';
import { buildPageMetadata } from '@/lib/seo';
import { getPublicCertificate } from '@/lib/server/certificates';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const certificate = await getPublicCertificate(params.slug);
  if (!certificate) {
    return buildPageMetadata({
      title: 'Published Certificate | Docrud',
      description: 'View and verify published certificates from Docrud.',
      path: `/certificate/${params.slug}`,
      noIndex: true,
    });
  }

  return buildPageMetadata({
    title: `${certificate.certificateTitle || certificate.name} | ${certificate.recipientName} | Docrud`,
    description: `View the published certificate for ${certificate.recipientName} and verify certificate details through Docrud.`,
    path: `/certificate/${params.slug}`,
    keywords: ['certificate verification', certificate.recipientName || '', certificate.certificateTitle || '', 'published certificate'],
  });
}

export default async function CertificatePublicPage({ params }: { params: { slug: string } }) {
  const certificate = await getPublicCertificate(params.slug);
  if (!certificate) {
    notFound();
  }

  return <PublicCertificatePage certificate={certificate} />;
}
