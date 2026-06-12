import PublicPolicyPage from '@/components/PublicPolicyPage';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';
import { getPolicyDefinitionById } from '@/lib/policies';

export const dynamic = 'force-dynamic';

export default async function DataPrivacyPolicyPage() {
  const [settings, themeSettings] = await Promise.all([getLandingSettings(), getThemeSettings()]);
  const policy = getPolicyDefinitionById('data-privacy-policy');
  if (!policy) return null;
  return <PublicPolicyPage softwareName={themeSettings.softwareName} accentLabel={themeSettings.accentLabel} settings={settings} policy={policy} />;
}

