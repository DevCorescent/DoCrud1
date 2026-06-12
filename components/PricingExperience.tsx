'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, SlidersHorizontal, Sparkles, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { encodeCustomPlanConfiguration } from '@/lib/pricing-config';
import type { CustomPlanConfiguration, SaasFeatureKey, SaasPlan } from '@/types/document';

type PricingExperienceProps = {
  businessPlans: SaasPlan[];
  individualPlans: SaasPlan[];
  isAuthenticated: boolean;
  authenticatedAccountType?: 'business' | 'individual' | null;
  pricingPageTitle: string;
  pricingPageSubtitle: string;
};

const featureCatalog: Array<{ key: SaasFeatureKey; label: string; monthlyPriceInPaise: number }> = [
  { key: 'doxpert', label: 'DoXpert AI', monthlyPriceInPaise: 9900 },
  { key: 'analytics', label: 'Visualizer + analytics', monthlyPriceInPaise: 8900 },
  { key: 'file_manager', label: 'File Directory + transfers', monthlyPriceInPaise: 4900 },
  { key: 'approvals', label: 'Board Room approvals', monthlyPriceInPaise: 6900 },
  { key: 'audit', label: 'Audit controls', monthlyPriceInPaise: 5900 },
  { key: 'branding', label: 'Branding controls', monthlyPriceInPaise: 3900 },
  { key: 'document_encrypter', label: 'Document encrypter', monthlyPriceInPaise: 5900 },
  { key: 'virtual_id', label: 'Virtual ID', monthlyPriceInPaise: 2900 },
  { key: 'e_certificates', label: 'E-certificates', monthlyPriceInPaise: 3900 },
  { key: 'docrudians', label: 'Docrudians', monthlyPriceInPaise: 1900 },
  { key: 'roles_permissions', label: 'Roles & permissions', monthlyPriceInPaise: 4900 },
  { key: 'integrations', label: 'Integrations', monthlyPriceInPaise: 9900 },
  { key: 'ai_copilot', label: 'DocAI copilot', monthlyPriceInPaise: 7900 },
];

function formatInr(amountInPaise?: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format((amountInPaise || 0) / 100);
}

function getPlanHref(
  plan: SaasPlan,
  isAuthenticated: boolean,
  customConfiguration?: CustomPlanConfiguration | null,
  referralCode?: string,
  signupPath: string = '/signup',
) {
  const config = customConfiguration ? `&config=${encodeCustomPlanConfiguration(customConfiguration)}` : '';
  const ref = referralCode ? `&ref=${encodeURIComponent(referralCode)}` : '';

  if (plan.billingModel === 'custom') {
    return isAuthenticated ? `/checkout?plan=${plan.id}${config}${ref}` : `${signupPath}?plan=${plan.id}${config}${ref}`;
  }

  if (plan.billingModel === 'subscription' && (plan.amountInPaise || 0) > 0) {
    return isAuthenticated ? `/checkout?plan=${plan.id}${ref}` : `${signupPath}?plan=${plan.id}${ref}`;
  }

  return isAuthenticated ? '/welcome' : signupPath;
}

export default function PricingExperience({
  businessPlans,
  isAuthenticated,
  pricingPageTitle,
  pricingPageSubtitle,
}: PricingExperienceProps) {
  const searchParams = useSearchParams();
  const referralCode = (searchParams?.get('ref') || '').trim();
  const signupFlow = (searchParams?.get('flow') || '').trim();
  const signupPath = signupFlow === 'individual' ? '/individual-signup' : '/signup';
  const [activeSection, setActiveSection] = useState<'workspace' | 'talent' | 'gigs'>('workspace');

  useEffect(() => {
    const requested = (searchParams?.get('tab') || '').trim();
    if (requested === 'talent' || requested === 'gigs' || requested === 'workspace') {
      setActiveSection(requested);
    }
  }, [searchParams]);

  const workspacePlans = useMemo(
    () => businessPlans.filter((plan) => plan.id.startsWith('workspace-')),
    [businessPlans],
  );
  const talentPlans = useMemo(
    () => businessPlans.filter((plan) => plan.id === 'talent-directory-pass'),
    [businessPlans],
  );
  const gigsPlans = useMemo(
    () => businessPlans.filter((plan) => plan.id === 'gigs-pass'),
    [businessPlans],
  );

  const trialPlan = workspacePlans.find((plan) => plan.id === 'workspace-trial') || workspacePlans[0] || null;
  const proPlan = workspacePlans.find((plan) => plan.id === 'workspace-pro') || workspacePlans[1] || null;
  const customPlan = workspacePlans.find((plan) => plan.id === 'workspace-build-your-own') || workspacePlans[2] || null;

  const [selectedFeatures, setSelectedFeatures] = useState<SaasFeatureKey[]>(['doxpert', 'file_manager', 'approvals']);
  const [teamSize, setTeamSize] = useState(20);
  const [monthlyDocs, setMonthlyDocs] = useState(500);
  const [mailboxThreads, setMailboxThreads] = useState(1500);
  const [aiCredits, setAiCredits] = useState(240);
  const [connectPaywallBusy, setConnectPaywallBusy] = useState(false);
  const [connectPaywallError, setConnectPaywallError] = useState('');

  const loadRazorpayScript = async () => {
    if (typeof window === 'undefined') return false;
    if ((window as any).Razorpay) return true;
    return new Promise<boolean>((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const startOneTimeConnectPurchase = async (product: 'talent' | 'gigs') => {
    if (!isAuthenticated) {
      setConnectPaywallError('Login required to purchase one-time credits.');
      return;
    }
    setConnectPaywallBusy(true);
    setConnectPaywallError('');

    try {
      const endpoint = product === 'talent' ? '/api/resumes/connect/create-order' : '/api/gigs/connect/create-order';
      const verifyEndpoint = product === 'talent' ? '/api/resumes/connect/verify' : '/api/gigs/connect/verify';
      const orderResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'one_time' }),
      });
      const orderPayload = await orderResponse.json().catch(() => null);
      if (!orderResponse.ok) throw new Error(orderPayload?.error || 'Unable to create checkout.');

      const loaded = await loadRazorpayScript();
      if (!loaded || !(window as any).Razorpay) throw new Error('Razorpay checkout script could not be loaded on this device.');

      const instance = new (window as any).Razorpay({
        key: orderPayload.keyId,
        amount: orderPayload.amountInPaise,
        currency: 'INR',
        name: 'docrud',
        description: product === 'talent' ? 'Resume Connect (one-time)' : 'Gigs Connect (one-time)',
        order_id: orderPayload.order?.id,
        handler: async (gatewayPayload: Record<string, string>) => {
          try {
            const verifyResponse = await fetch(verifyEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...gatewayPayload,
                purchaseId: orderPayload.purchaseId,
                mode: 'one_time',
              }),
            });
            const verifyPayload = await verifyResponse.json().catch(() => null);
            if (!verifyResponse.ok) throw new Error(verifyPayload?.error || 'Payment verification failed.');
          } catch (verificationError) {
            setConnectPaywallError(verificationError instanceof Error ? verificationError.message : 'Payment verification failed.');
          } finally {
            setConnectPaywallBusy(false);
          }
        },
        modal: {
          ondismiss: () => setConnectPaywallBusy(false),
        },
        theme: { color: '#0f172a' },
      });
      instance.open();
    } catch (error) {
      setConnectPaywallError(error instanceof Error ? error.message : 'Unable to start checkout.');
      setConnectPaywallBusy(false);
    }
  };

  useEffect(() => {
    if (!connectPaywallError) return;
    const timer = window.setTimeout(() => setConnectPaywallError(''), 5200);
    return () => window.clearTimeout(timer);
  }, [connectPaywallError]);

  const customConfiguration = useMemo<CustomPlanConfiguration | null>(() => {
    if (!customPlan) {
      return null;
    }

    const featureTotal = selectedFeatures.reduce((sum, key) => (
      sum + (featureCatalog.find((item) => item.key === key)?.monthlyPriceInPaise || 0)
    ), 0);
    const extraUsers = Math.max(teamSize - (customPlan.maxInternalUsers || 0), 0);
    const extraDocs = Math.max(monthlyDocs - (customPlan.maxDocumentGenerations || 0), 0);
    const extraMailboxThreads = Math.max(mailboxThreads - (customPlan.maxMailboxThreads || 0), 0);
    const subtotal = (proPlan?.amountInPaise || 29900)
      + featureTotal
      + (extraUsers * 900)
      + (extraDocs * 12)
      + (Math.ceil(extraMailboxThreads / 100) * 300)
      + Math.max(aiCredits - (customPlan.monthlyAiCredits || 0), 0) * 45;
    const total = subtotal + Math.round(subtotal * 0.18);

    return {
      source: 'pricing_builder',
      basePlanId: customPlan.id,
      featureKeys: selectedFeatures,
      maxDocumentGenerations: monthlyDocs,
      maxInternalUsers: teamSize,
      maxMailboxThreads: mailboxThreads,
      monthlyAiCredits: aiCredits,
      estimatedMonthlySubtotalInPaise: subtotal,
      estimatedMonthlyTotalInPaise: total,
    };
  }, [aiCredits, customPlan, mailboxThreads, monthlyDocs, proPlan?.amountInPaise, selectedFeatures, teamSize]);

  const highlightCards = [
    {
      title: 'Start a trial',
      detail: 'Login-based workspace access for 30 days with admin-enabled non-AI features ready instantly.',
    },
    {
      title: 'Upgrade smoothly',
      detail: 'AI tries guide habit first, then Workspace Pro unlocks full credits and every product surface.',
    },
    {
      title: 'Build your own',
      detail: 'Feature-picked monthly pricing with recurring billing and a tailored operating dashboard.',
    },
  ];

  const planCards = [trialPlan, proPlan, customPlan].filter(Boolean) as SaasPlan[];

  return (
    <div className="mx-auto flex w-full max-w-[112rem] flex-col px-1 py-5 sm:px-3 sm:py-7 lg:px-0 lg:py-8">
      <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-[linear-gradient(180deg,#ffffff,#f7f9fc)] shadow-[0_20px_70px_rgba(15,23,42,0.07)] sm:rounded-[2.25rem]">
        <div className="px-5 py-7 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600 sm:text-xs">
              <Sparkles className="h-4 w-4" />
              {activeSection === 'workspace' ? 'Workspace' : activeSection === 'talent' ? 'Talent Directory' : 'Gigs'}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              {pricingPageTitle || 'Plans and Pricing'}
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
              {pricingPageSubtitle || 'Choose the docrud workspace that fits your current stage, then upgrade smoothly as usage and AI needs grow.'}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {([
                { key: 'workspace' as const, label: 'Workspace' },
                { key: 'talent' as const, label: 'Talent Directory' },
                { key: 'gigs' as const, label: 'Gigs' },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveSection(tab.key)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    activeSection === tab.key
                      ? 'border-slate-900 bg-slate-950 text-white shadow-sm'
                      : 'border-white/60 bg-white/70 text-slate-700 hover:bg-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {activeSection === 'workspace' ? (
              <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                {highlightCards.map((item, index) => (
                  <span key={item.title} className="inline-flex items-center gap-2">
                    <span>{item.title}</span>
                    {index < highlightCards.length - 1 ? <span className="text-slate-300">•</span> : null}
                  </span>
                ))}
              </div>
            ) : null}
            {connectPaywallError ? (
              <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
                {connectPaywallError}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-5 space-y-5">
        {activeSection === 'workspace' ? (
          <>
            <div className="grid gap-4 xl:grid-cols-3">
              {planCards.map((plan) => {
                const href = plan.id === 'workspace-build-your-own'
                  ? getPlanHref(plan, isAuthenticated, customConfiguration, referralCode, signupPath)
                  : getPlanHref(plan, isAuthenticated, null, referralCode, signupPath);
                const isPro = plan.id === 'workspace-pro';
                const isCustom = plan.id === 'workspace-build-your-own';
                const monthlyHeadline = plan.amountInPaise ? formatInr(plan.amountInPaise) : 'Custom';
                const tone = isPro
                  ? 'border-slate-950 bg-slate-950 text-white shadow-[0_28px_90px_rgba(15,23,42,0.18)]'
                  : 'border-slate-200 bg-white text-slate-950 shadow-[0_20px_60px_rgba(15,23,42,0.05)]';
                return (
                  <Card key={plan.id} className={`flex h-full flex-col overflow-hidden rounded-[1.55rem] border ${tone} sm:rounded-[1.8rem]`}>
                    <CardContent className="flex h-full flex-col p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${isPro ? 'bg-white/10 text-sky-200' : isCustom ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {isCustom ? 'Custom' : isPro ? 'Most practical' : 'Start here'}
                        </div>
                        <p className={`text-right text-xs font-medium ${isPro ? 'text-slate-300' : 'text-slate-500'}`}>{plan.priceLabel}</p>
                      </div>
                      <div className="mt-4">
                        <h2 className={`text-[1.65rem] font-semibold tracking-tight ${isPro ? 'text-white' : 'text-slate-950'}`}>{plan.name}</h2>
                        <p className={`mt-2 min-h-[96px] text-sm leading-6 ${isPro ? 'text-slate-200' : 'text-slate-600'}`}>{plan.description}</p>
                      </div>
                      <div className={`mt-4 rounded-[1.2rem] border px-4 py-3 ${isPro ? 'border-white/10 bg-white/6' : 'border-slate-200 bg-slate-50/80'}`}>
                        <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${isPro ? 'text-slate-300' : 'text-slate-500'}`}>Monthly headline</p>
                        <p className={`mt-2 text-[2rem] font-semibold tracking-tight ${isPro ? 'text-white' : 'text-slate-950'}`}>{monthlyHeadline}</p>
                        <p className={`mt-1.5 text-sm ${isPro ? 'text-slate-300' : 'text-slate-600'}`}>
                          {isCustom ? 'Live quote updates as you shape the plan.' : 'Charged monthly with GST added transparently at checkout.'}
                        </p>
                      </div>
                      <div className={`mt-4 space-y-2 rounded-[1.2rem] border p-4 ${isPro ? 'border-white/10 bg-white/6' : 'border-slate-200 bg-white'}`}>
                        {[
                          `${plan.maxDocumentGenerations} monthly document runs`,
                          `${plan.maxInternalUsers || 0} internal users`,
                          `${plan.maxMailboxThreads || 0} mailbox threads`,
                          `${plan.maxTalentConnectsPerCycle || 0} talent connects`,
                          `${plan.maxGigProposalsPerCycle || 0} gig proposals`,
                          plan.id === 'workspace-trial'
                            ? `${plan.freeAiRuns || 0} AI tries free before upgrade`
                            : `${plan.monthlyAiCredits || 0} monthly AI credits`,
                        ].map((item) => (
                            <div key={item} className={`flex items-start gap-2 text-[13px] ${isPro ? 'text-slate-100' : 'text-slate-700'}`}>
                              <CheckCircle2 className={`mt-0.5 h-4 w-4 flex-none ${isPro ? 'text-emerald-300' : 'text-emerald-600'}`} />
                              <span>{item}</span>
                            </div>
                        ))}
                      </div>
                      <div className={`mt-4 rounded-[1.2rem] border p-4 ${isPro ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white'}`}>
                        <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${isPro ? 'text-slate-300' : 'text-slate-500'}`}>Best for</p>
                        <p className={`mt-2 min-h-[64px] text-[13px] leading-6 ${isPro ? 'text-slate-100' : 'text-slate-700'}`}>
                          {isCustom
                            ? 'Teams that want feature-specific pricing and a tailored monthly operating shape.'
                            : isPro
                              ? 'Teams ready to use docrud daily with full access and reliable AI headroom.'
                              : 'New workspaces that want smooth product onboarding without paying upfront.'}
                          </p>
                      </div>
                      <Button asChild className={`mt-5 h-10 w-full rounded-xl ${isPro ? 'bg-sky-500 text-white hover:bg-sky-400' : isCustom ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-slate-950 text-white hover:bg-slate-800'}`}>
                        <Link href={href}>
                          {plan.ctaLabel || 'Continue'}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card className="rounded-[1.55rem] border border-slate-200 bg-white/96 shadow-[0_20px_60px_rgba(15,23,42,0.05)] sm:rounded-[1.8rem]">
              <CardContent className="space-y-5 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-slate-950 p-3 text-white">
                <SlidersHorizontal className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Build your own plan</p>
                <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">Make the workspace fit your real operating shape.</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">Choose only what matters, watch the monthly quote update live, and move into a tailored recurring workspace without leaving pricing.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Team size</label>
                <Input type="number" min={5} value={teamSize} onChange={(event) => setTeamSize(Math.max(5, Number(event.target.value) || 5))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Monthly documents</label>
                <Input type="number" min={100} value={monthlyDocs} onChange={(event) => setMonthlyDocs(Math.max(100, Number(event.target.value) || 100))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Mailbox threads</label>
                <Input type="number" min={200} step={100} value={mailboxThreads} onChange={(event) => setMailboxThreads(Math.max(200, Number(event.target.value) || 200))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Monthly AI credits</label>
                <Input type="number" min={120} step={20} value={aiCredits} onChange={(event) => setAiCredits(Math.max(120, Number(event.target.value) || 120))} />
              </div>
            </div>

            <div className="space-y-3">
              <p className="mb-3 text-sm font-medium text-slate-700">Selected feature stack</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {featureCatalog.map((feature) => {
                  const active = selectedFeatures.includes(feature.key);
                  return (
                    <button
                      key={feature.key}
                      type="button"
                      onClick={() => setSelectedFeatures((current) => (
                        current.includes(feature.key)
                          ? current.filter((item) => item !== feature.key)
                          : [...current, feature.key]
                      ))}
                      className={`rounded-[1rem] border px-4 py-3 text-left transition ${active ? 'border-slate-900 bg-slate-950 text-white shadow-[0_16px_40px_rgba(15,23,42,0.12)]' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'}`}
                    >
                      <p className="text-sm font-semibold">{feature.label}</p>
                      <p className={`mt-1 text-xs ${active ? 'text-slate-300' : 'text-slate-500'}`}>+ {formatInr(feature.monthlyPriceInPaise)} / month</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[1.25rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,0.96))] p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                <Wand2 className="h-4 w-4" />
                Live monthly quote
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <div className="flex items-center justify-between gap-4">
                  <span>Subtotal</span>
                  <span className="font-semibold text-slate-950">{formatInr(customConfiguration?.estimatedMonthlySubtotalInPaise)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>GST 18%</span>
                  <span className="font-semibold text-slate-950">{formatInr((customConfiguration?.estimatedMonthlyTotalInPaise || 0) - (customConfiguration?.estimatedMonthlySubtotalInPaise || 0))}</span>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-3">
                  <span className="font-semibold text-slate-950">Monthly payable</span>
                  <span className="text-xl font-semibold text-slate-950">{formatInr(customConfiguration?.estimatedMonthlyTotalInPaise)}</span>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600">
                The final monthly plan remains recurring like Workspace Pro, but the entitlements and pricing are tailored to your selected modules, capacity, and AI allowance.
              </div>
              {customPlan ? (
                <Button asChild className="mt-5 h-10 w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800">
                  <Link href={getPlanHref(customPlan, isAuthenticated, customConfiguration, referralCode, signupPath)}>
                    Build this workspace
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
            </Card>
          </>
        ) : null}

        {activeSection === 'talent' ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {talentPlans.map((plan) => {
              const href = getPlanHref(plan, isAuthenticated, null, referralCode, signupPath);
              return (
                <Card key={plan.id} className="overflow-hidden rounded-[1.55rem] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.05)] sm:rounded-[1.8rem]">
                  <CardContent className="p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600">
                        Monthly plan
                      </div>
                      <p className="text-right text-xs font-medium text-slate-500">{plan.priceLabel}</p>
                    </div>
                    <h2 className="mt-4 text-[1.65rem] font-semibold tracking-tight text-slate-950">{plan.name}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{plan.description}</p>
                    <div className="mt-4 space-y-2 rounded-[1.2rem] border border-slate-200 bg-white p-4">
                      {[
                        `${plan.maxTalentConnectsPerCycle || 0} contact unlocks per cycle`,
                        'Lead tracking inside the dashboard',
                        'Notes + stages + JD matching',
                      ].map((item) => (
                        <div key={item} className="flex items-start gap-2 text-[13px] text-slate-700">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                    <Button asChild className="mt-5 h-10 w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800">
                      <Link href={href}>
                        {plan.ctaLabel || 'Continue'}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                    <p className="mt-3 text-xs leading-6 text-slate-500">
                      Prefer one-off connects? Use the one-time credit card alongside this plan.
                    </p>
                  </CardContent>
                </Card>
              );
            })}

            <Card className="overflow-hidden rounded-[1.55rem] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.05)] sm:rounded-[1.8rem]">
              <CardContent className="p-5 sm:p-6">
                <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600">
                  One-time
                </div>
                <h2 className="mt-4 text-[1.65rem] font-semibold tracking-tight text-slate-950">Single connect credit</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">₹49 · Unlock one profile contact (valid for 30 days).</p>
                <div className="mt-4 space-y-2 rounded-[1.2rem] border border-slate-200 bg-white p-4">
                  {['Use on any profile', 'Does not change your current plan', 'Great for occasional hiring'].map((item) => (
                    <div key={item} className="flex items-start gap-2 text-[13px] text-slate-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  disabled={connectPaywallBusy}
                  className="mt-5 h-10 w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                  onClick={() => void startOneTimeConnectPurchase('talent')}
                >
                  Buy one-time
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button asChild variant="outline" className="mt-3 h-10 w-full rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <Link href="/talent">Browse talent</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {activeSection === 'gigs' ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {gigsPlans.map((plan) => {
              const href = getPlanHref(plan, isAuthenticated, null, referralCode, signupPath);
              return (
                <Card key={plan.id} className="overflow-hidden rounded-[1.55rem] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.05)] sm:rounded-[1.8rem]">
                  <CardContent className="p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600">
                        Monthly plan
                      </div>
                      <p className="text-right text-xs font-medium text-slate-500">{plan.priceLabel}</p>
                    </div>
                    <h2 className="mt-4 text-[1.65rem] font-semibold tracking-tight text-slate-950">{plan.name}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{plan.description}</p>
                    <div className="mt-4 space-y-2 rounded-[1.2rem] border border-slate-200 bg-white p-4">
                      {[
                        `${plan.maxGigProposalsPerCycle || 0} proposals per cycle`,
                        'Outgoing proposals tracked in dashboard',
                        'Incoming requests in one gigs inbox',
                      ].map((item) => (
                        <div key={item} className="flex items-start gap-2 text-[13px] text-slate-700">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                    <Button asChild className="mt-5 h-10 w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800">
                      <Link href={href}>
                        {plan.ctaLabel || 'Continue'}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                    <p className="mt-3 text-xs leading-6 text-slate-500">
                      Prefer one-off outreach? Use the one-time proposal credit card.
                    </p>
                  </CardContent>
                </Card>
              );
            })}

            <Card className="overflow-hidden rounded-[1.55rem] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.05)] sm:rounded-[1.8rem]">
              <CardContent className="p-5 sm:p-6">
                <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600">
                  One-time
                </div>
                <h2 className="mt-4 text-[1.65rem] font-semibold tracking-tight text-slate-950">Single proposal credit</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">₹49 · Send one proposal (valid for 30 days).</p>
                <div className="mt-4 space-y-2 rounded-[1.2rem] border border-slate-200 bg-white p-4">
                  {['Use on any gig', 'Does not change your current plan', 'Great for occasional outreach'].map((item) => (
                    <div key={item} className="flex items-start gap-2 text-[13px] text-slate-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  disabled={connectPaywallBusy}
                  className="mt-5 h-10 w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                  onClick={() => void startOneTimeConnectPurchase('gigs')}
                >
                  Buy one-time
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button asChild variant="outline" className="mt-3 h-10 w-full rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <Link href="/gigs">Browse gigs</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </section>
    </div>
  );
}
