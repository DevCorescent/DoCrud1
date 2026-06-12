import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';
import PublicTemplateMarketplaceSellerPage from '@/components/PublicTemplateMarketplaceSellerPage';

export const dynamic = 'force-dynamic';

export default async function TemplateMarketplaceSellerPage({ params }: { params: { id: string } }) {
  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicTemplateMarketplaceSellerPage
      settings={landingSettings}
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
      sellerUserId={params.id}
    />
  );
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  return buildPageMetadata({
    title: 'Seller | Template Marketplace | docrud',
    description: 'Browse templates by this seller.',
    path: `/template-marketplace/seller/${params.id}`,
    keywords: ['template marketplace', 'seller', 'docrud'],
  });
}

