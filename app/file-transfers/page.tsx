import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';
import { buildPageMetadata } from '@/lib/seo';
import PublicTransferPage from '@/components/PublicTransferPage';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'Secure File Transfers | Share Files with Passwords, Links & QR',
  description:
    'Send secure file transfers with encrypted links, QR sharing, password protection, download tracking, and client-ready delivery pages in Docrud.',
  path: '/file-transfers',
  keywords: ['secure file transfer', 'password protected file sharing', 'qr file sharing', 'file delivery tracking'],
});

export default async function FileTransfersPublicPage() {
  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicTransferPage
      settings={landingSettings}
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
    />
  );
}
