'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { BrainCircuit, CreditCard, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const individualPlanCards: Array<{
  id: 'workspace-trial' | 'workspace-pro' | 'workspace-build-your-own';
  title: string;
  note: string;
  description: string;
  cta: string;
}> = [
  {
    id: 'workspace-trial',
    title: 'docrud Workspace Trial',
    note: 'Best way to start',
    description: 'Create your login-based workspace, use admin-enabled non-AI features immediately, and get a few AI tries before upgrading.',
    cta: 'Start Trial',
  },
  {
    id: 'workspace-pro',
    title: 'docrud Workspace Pro',
    note: 'Best for regular usage',
    description: 'Upgrade smoothly to ₹299/month for full feature access and recurring AI credits across the workspace.',
    cta: 'Upgrade to Pro',
  },
  {
    id: 'workspace-build-your-own',
    title: 'Build Your Own Workspace',
    note: 'Best for tailored usage',
    description: 'Choose the exact features, AI allowance, and capacity you need and pay a recurring monthly amount accordingly.',
    cta: 'Build Plan',
  },
];

type IndividualSignupFormProps = {
  initialPlanId?: string;
  initialConfig?: string;
  initialReferralCode?: string;
};

export default function IndividualSignupForm({ initialPlanId, initialConfig, initialReferralCode }: IndividualSignupFormProps) {
  const router = useRouter();
  const requestedPlanId = (['workspace-trial', 'workspace-pro', 'workspace-build-your-own'] as const).includes(
    (initialPlanId as typeof individualPlanCards[number]['id']) || 'workspace-trial',
  )
    ? (initialPlanId as typeof individualPlanCards[number]['id'])
    : 'workspace-trial';
  const referralCode = (initialReferralCode || '').trim();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    profession: '',
    primaryUseCase: '',
    selectedPlanId: requestedPlanId,
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);

  const isBuildYourOwn = form.selectedPlanId === 'workspace-build-your-own';
  const buildYourOwnReady = !isBuildYourOwn || Boolean(initialConfig);
  const builderHref = `/pricing?tab=workspace&flow=individual${referralCode ? `&ref=${encodeURIComponent(referralCode)}` : ''}`;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!policyAccepted) {
      setError('You must accept the required policies before creating a profile.');
      return;
    }
    if (!buildYourOwnReady) {
      router.push(builderHref);
      return;
    }
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/individual/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, policyAccepted: true }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to create individual profile');
      }

      const checkoutRef = referralCode ? `&ref=${encodeURIComponent(referralCode)}` : '';
      const configQuery = initialConfig ? `&config=${initialConfig}` : '';
      const checkoutUrl = form.selectedPlanId
        ? `/checkout?plan=${form.selectedPlanId}${configQuery}${checkoutRef}`
        : '/welcome';

      const loginResult = await signIn('credentials', {
        email: form.email.trim(),
        password: form.password,
        policyAccepted: 'accepted',
        redirect: false,
        callbackUrl: checkoutUrl,
      });

      if (!loginResult || loginResult.error) {
        setSuccess('Individual profile created successfully. Please log in to continue.');
        router.push('/login');
        return;
      }

      setSuccess(payload?.message || 'Individual profile created successfully.');
      router.replace(checkoutUrl);
      router.refresh();
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : 'Failed to create individual profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="rounded-[2.35rem] border border-white/80 bg-white/88 shadow-[0_24px_90px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
      <CardHeader className="border-b border-slate-200/70 bg-[radial-gradient(circle_at_18%_22%,rgba(99,102,241,0.12),transparent_55%),radial-gradient(circle_at_82%_10%,rgba(245,158,11,0.10),transparent_60%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.88))] px-6 py-6 sm:px-8">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/60 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 shadow-sm backdrop-blur-2xl">
              <UserRound className="h-4 w-4 text-slate-700" />
              Individual Access
            </div>
            <CardTitle className="mt-3 text-2xl tracking-tight sm:text-3xl">Create your personal docrud profile.</CardTitle>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
              This path now starts the same clean docrud workspace journey: trial first, then a smooth upgrade to Pro or a tailored monthly workspace when needed.
            </p>
          </div>
          <div className="rounded-[28px] bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_48%,#2563eb_100%)] p-5 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">
              <BrainCircuit className="h-4 w-4" />
              Personal AI workflow
            </div>
            <p className="mt-3 text-lg font-semibold">Use DoXpert, generate documents, and keep private history.</p>
            <div className="mt-4 space-y-2">
              <div className="rounded-2xl bg-white/10 px-3 py-2 text-sm">30-day workspace trial</div>
              <div className="rounded-2xl bg-white/10 px-3 py-2 text-sm">Non-AI features open immediately</div>
              <div className="rounded-2xl bg-white/10 px-3 py-2 text-sm">A few AI tries before upgrade</div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="min-w-0 px-5 py-6 sm:px-8 sm:py-8">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Full Name</label>
              <Input className="h-12 rounded-2xl border-slate-200 bg-slate-50/70" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
              <Input className="h-12 rounded-2xl border-slate-200 bg-slate-50/70" type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Profession</label>
              <Input className="h-12 rounded-2xl border-slate-200 bg-slate-50/70" value={form.profession} onChange={(event) => setForm((prev) => ({ ...prev, profession: event.target.value }))} placeholder="Freelancer, consultant, student, lawyer" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
              <Input className="h-12 rounded-2xl border-slate-200 bg-slate-50/70" type="password" value={form.password} onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">Primary Use Case</label>
              <textarea value={form.primaryUseCase} onChange={(event) => setForm((prev) => ({ ...prev, primaryUseCase: event.target.value }))} className="min-h-[110px] w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm" placeholder="Example: review agreements before signing, generate proposals, analyze notices with DoXpert" />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {individualPlanCards.map((plan) => {
              const selected = form.selectedPlanId === plan.id;
              const tone = selected
                ? 'border-slate-950 bg-slate-950 text-white shadow-[0_28px_90px_rgba(15,23,42,0.18)]'
                : 'border-slate-200 bg-white text-slate-950 shadow-[0_20px_60px_rgba(15,23,42,0.05)] hover:border-slate-300';
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, selectedPlanId: plan.id }))}
                  className={`flex h-full flex-col rounded-[1.65rem] border p-5 text-left transition ${tone}`}
                >
                  <div className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${selected ? 'bg-white/10 text-sky-200' : 'bg-slate-100 text-slate-600'}`}>
                    <CreditCard className="h-4 w-4" />
                    {plan.note}
                  </div>
                  <p className={`mt-4 text-[1.15rem] font-semibold tracking-tight ${selected ? 'text-white' : 'text-slate-950'}`}>{plan.title}</p>
                  <p className={`mt-2 flex-1 text-sm leading-6 ${selected ? 'text-slate-200' : 'text-slate-600'}`}>{plan.description}</p>
                  <div className={`mt-4 inline-flex items-center rounded-2xl px-4 py-2 text-sm font-semibold ${selected ? 'bg-white/10 text-white' : 'bg-slate-950 text-white'}`}>
                    {plan.id === 'workspace-build-your-own' && !initialConfig ? 'Build Your Plan' : plan.cta}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
              <ShieldCheck className="h-4 w-4" />
              Business plans stay stronger
            </div>
            <p className="mt-3 text-sm leading-6 text-amber-900">
              Every new user now starts from the same docrud Workspace journey so the upgrade path stays simple: trial first, Pro next, and a tailored recurring build when your operating needs expand.
            </p>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
            <label className="flex items-start gap-3 text-sm leading-6 text-slate-700">
              <input type="checkbox" checked={policyAccepted} onChange={(event) => setPolicyAccepted(event.target.checked)} className="mt-1" />
              <span>
                I agree to docrud’s <Link href="/terms-and-conditions" className="font-medium text-slate-950 underline underline-offset-4">Terms & Conditions</Link>, <Link href="/privacy-policy" className="font-medium text-slate-950 underline underline-offset-4">Privacy Policy</Link>, <Link href="/refund-and-cancellation-policy" className="font-medium text-slate-950 underline underline-offset-4">Refund & Cancellation Policy</Link>, and all linked product policies before using the software.
              </span>
            </label>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-emerald-700">{success}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              Need a team workspace instead? <Link href="/signup" className="font-medium text-slate-950 underline underline-offset-4">Create a business account</Link>
            </p>
            <div className="flex items-center gap-2">
              {!buildYourOwnReady ? (
                <Button type="button" variant="outline" className="h-11 rounded-2xl border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50" onClick={() => router.push(builderHref)}>
                  Build plan
                </Button>
              ) : null}
              <Button type="submit" disabled={isSubmitting || !policyAccepted || !buildYourOwnReady} className="h-11 rounded-2xl bg-slate-950 px-6 text-sm font-semibold text-white hover:bg-slate-800">
                {isSubmitting ? 'Creating profile...' : 'Create Individual Profile'}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
