import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { getAuthSession } from '@/lib/server/auth';
import { getSaasPlanById } from '@/lib/server/saas';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

type WelcomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WelcomePage({ searchParams }: WelcomePageProps) {
  const [session, settings, themeSettings, rawParams] = await Promise.all([
    getAuthSession(),
    getLandingSettings(),
    getThemeSettings(),
    searchParams || Promise.resolve({}),
  ]);
  const params = (rawParams || {}) as Record<string, string | string[] | undefined>;

  if (!session?.user?.email) {
    redirect('/login');
  }

  const planId = typeof params.plan === 'string' ? params.plan : '';
  const plan = planId ? await getSaasPlanById(planId) : null;

  return (
    <PublicSiteChrome softwareName={themeSettings.softwareName} accentLabel={themeSettings.accentLabel} settings={settings}>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <Card className="rounded-[2.25rem] border-white/80 bg-white/88 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
          <CardContent className="space-y-8 p-6 text-center sm:p-10">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              Plan activated
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Welcome to docrud</h1>
              <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
                {plan ? `${plan.name} is now active for your account.` : 'Your account is now ready.'} You can move straight into the workspace and start generating documents, running AI analysis, and sharing secure files.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  title: 'Plan ready',
                  body: plan ? `${plan.maxDocumentGenerations} documents available in the current cycle.` : 'Your account is activated and ready to use.',
                },
                {
                  title: 'Billing saved',
                  body: 'A transaction and invoice trail has been created so the billing flow stays clean and traceable.',
                },
                {
                  title: 'Next best step',
                  body: 'Open your workspace and complete branding, templates, and first document setup.',
                },
              ].map((item) => (
                <div key={item.title} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5 text-left">
                  <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
                </div>
              ))}
            </div>

            <div className="rounded-[1.5rem] border border-sky-200 bg-sky-50 p-5 text-left">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 flex-none text-sky-700" />
                <p className="text-sm leading-7 text-sky-950">
                  Start with `Billing`, `Profile`, or the guided workspace tour if you want a smooth first-run walkthrough.
                </p>
              </div>
            </div>

            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild className="rounded-xl bg-slate-950 text-white hover:bg-slate-800">
                <Link href="/workspace">
                  Go to Workspace
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-xl">
                <Link href="/workspace?tab=billing">Open Billing</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PublicSiteChrome>
  );
}
