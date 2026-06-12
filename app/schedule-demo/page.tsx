import { CheckCircle2 } from 'lucide-react';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import InquiryForm from '@/components/InquiryForm';
import { Card, CardContent } from '@/components/ui/card';
import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'Schedule a Demo | Docrud',
  description:
    'Request a Docrud demo to see document workflows, forms, AI review, secure file sharing, and business operations in action.',
  path: '/schedule-demo',
  keywords: ['schedule demo', 'docrud demo', 'product walkthrough'],
});

export default async function ScheduleDemoPage() {
  const [settings, themeSettings] = await Promise.all([getLandingSettings(), getThemeSettings()]);

  return (
    <PublicSiteChrome softwareName={themeSettings.softwareName} accentLabel={themeSettings.accentLabel} settings={settings}>
      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-[2.5rem] border border-white/80 bg-slate-950 text-white shadow-[0_24px_60px_rgba(15,23,42,0.16)]">
          <CardContent className="p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60">Schedule Demo</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight">{settings.demoPageTitle}</h2>
            <p className="mt-5 text-base leading-8 text-white/75">{settings.demoPageSubtitle}</p>
            <div className="mt-8 space-y-3">
              {settings.demoBenefits.map((benefit) => (
                <div key={benefit} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/85">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-white" />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2.5rem] border border-white/80 bg-white/78 shadow-[0_24px_60px_rgba(15,23,42,0.1)] backdrop-blur-2xl">
          <CardContent className="p-6 sm:p-8">
            <InquiryForm requestType="demo" title="Tell us what you want to see in the demo" submitLabel="Request Demo" includeDemoFields />
          </CardContent>
        </Card>
      </section>
    </PublicSiteChrome>
  );
}
