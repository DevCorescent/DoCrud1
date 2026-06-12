import { Mail, Phone } from 'lucide-react';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import InquiryForm from '@/components/InquiryForm';
import { Card, CardContent } from '@/components/ui/card';
import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'Contact Docrud | Sales, Product Questions & Support',
  description:
    'Contact Docrud for product questions, onboarding help, demo requests, support, and business conversations.',
  path: '/contact',
  keywords: ['contact docrud', 'docrud sales', 'support contact', 'demo request'],
});

export default async function ContactPage() {
  const [settings, themeSettings] = await Promise.all([getLandingSettings(), getThemeSettings()]);

  return (
    <PublicSiteChrome softwareName={themeSettings.softwareName} accentLabel={themeSettings.accentLabel} settings={settings}>
      <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="rounded-[2.5rem] border border-white/80 bg-white/74 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
          <CardContent className="p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Contact</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">{settings.contactPageTitle}</h2>
            <p className="mt-5 text-base leading-8 text-slate-600">{settings.contactPageSubtitle}</p>
            <div className="mt-8 space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white/80 p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-900"><Mail className="h-4 w-4" />Email</p>
                <p className="mt-2 text-sm text-slate-600">{settings.contactEmail}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white/80 p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-900"><Phone className="h-4 w-4" />Phone</p>
                <p className="mt-2 text-sm text-slate-600">{settings.contactPhone}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2.5rem] border border-white/80 bg-white/78 shadow-[0_24px_60px_rgba(15,23,42,0.1)] backdrop-blur-2xl">
          <CardContent className="p-6 sm:p-8">
            <InquiryForm requestType="contact" title={settings.contactHeading} submitLabel="Send Message" />
          </CardContent>
        </Card>
      </section>
    </PublicSiteChrome>
  );
}
