import PublicPolicyPage from '@/components/PublicPolicyPage';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';
import { getPolicyDefinitionById } from '@/lib/policies';

export const dynamic = 'force-dynamic';

export default async function SignedDocumentPolicyPage() {
  const [settings, themeSettings] = await Promise.all([getLandingSettings(), getThemeSettings()]);
  const policy = getPolicyDefinitionById('signed-document-policy');
  if (!policy) return null;
  return <PublicPolicyPage softwareName={themeSettings.softwareName} accentLabel={themeSettings.accentLabel} settings={settings} policy={policy} />;
}

