import { redirect } from 'next/navigation';
import CheckoutExperience from '@/components/CheckoutExperience';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { decodeCustomPlanConfiguration } from '@/lib/pricing-config';
import { getAuthSession } from '@/lib/server/auth';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';
import { getSaasPlanById } from '@/lib/server/saas';

export const dynamic = 'force-dynamic';

type CheckoutPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const [session, settings, themeSettings, rawParams] = await Promise.all([
    getAuthSession(),
    getLandingSettings(),
    getThemeSettings(),
    searchParams || Promise.resolve({}),
  ]);
  const params = (rawParams || {}) as Record<string, string | string[] | undefined>;

  if (!session?.user?.email) {
    const targetPlan = typeof params.plan === 'string' ? params.plan : '';
    const targetConfig = typeof params.config === 'string' ? `&config=${params.config}` : '';
    redirect(targetPlan ? `/login?callbackUrl=${encodeURIComponent(`/checkout?plan=${targetPlan}${targetConfig}`)}` : '/login');
  }

  const planId = typeof params.plan === 'string' ? params.plan : '';
  const customConfiguration = typeof params.config === 'string' ? decodeCustomPlanConfiguration(params.config) : null;
  const referralCode = typeof params.ref === 'string' ? params.ref : '';
  if (!planId) {
    redirect('/pricing');
  }

  const plan = await getSaasPlanById(planId);
  // Only block if plan is not found or is inactive
  if (!plan || !plan.active) {
    redirect('/pricing');
  }

  const accountType = session.user.accountType === 'individual' ? 'individual' : 'business';
  const isUniversalWorkspacePlan = plan.id.startsWith('workspace-');
  if (!isUniversalWorkspacePlan && (plan.targetAudience || 'business') !== accountType) {
    redirect('/pricing');
  }

  return (
    <PublicSiteChrome softwareName={themeSettings.softwareName} accentLabel={themeSettings.accentLabel} settings={settings}>
      <CheckoutExperience plan={plan} customConfiguration={customConfiguration} referralCode={referralCode} />
    </PublicSiteChrome>
  );
}
