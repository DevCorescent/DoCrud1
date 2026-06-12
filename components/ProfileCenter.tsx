'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Clock3, CreditCard, Gauge, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProfileOverview } from '@/types/document';

function formatNumber(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function ProgressBar({ value, tone }: { value: number; tone: 'emerald' | 'sky' | 'amber' | 'rose' }) {
  const clamped = Math.max(0, Math.min(100, value));
  const bar = tone === 'rose'
    ? 'bg-rose-500'
    : tone === 'amber'
      ? 'bg-amber-500'
      : tone === 'sky'
        ? 'bg-sky-500'
        : 'bg-emerald-500';

  return (
    <div className="h-2 w-full rounded-full bg-slate-100">
      <div className={`h-2 rounded-full ${bar}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

function UsageRing({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'sky' | 'amber' | 'rose' }) {
  const clamped = Math.max(0, Math.min(100, Number(value.replace(/[^0-9.]/g, '')) || 0));
  const color = tone === 'rose'
    ? '#f43f5e'
    : tone === 'amber'
      ? '#f59e0b'
      : tone === 'sky'
        ? '#0ea5e9'
        : '#10b981';

  return (
    <div className="flex items-center gap-4">
      <div
        className="h-14 w-14 rounded-full"
        style={{ background: `conic-gradient(${color} ${clamped}%, rgba(148,163,184,0.22) ${clamped}% 100%)` }}
      >
        <div className="m-[7px] flex h-10 w-10 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-900">
          {`${clamped}%`}
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
      </div>
    </div>
  );
}

export default function ProfileCenter() {
  const [overview, setOverview] = useState<ProfileOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/profile/overview');
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to load profile overview.');
        }
        setOverview(payload);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load profile overview.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  if (loading) {
    return (
      <Card className="border-white/60 bg-white/82 backdrop-blur">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading profile dashboard...
        </CardContent>
      </Card>
    );
  }

  if (error || !overview) {
    return (
      <Card className="border-white/60 bg-white/82 backdrop-blur">
        <CardContent className="p-6 text-sm text-rose-600">{error || 'Unable to load profile dashboard.'}</CardContent>
      </Card>
    );
  }

  const isUnlimited = !overview.subscription.maxDocumentGenerations;
  const planTone: 'emerald' | 'sky' | 'amber' | 'rose' = isUnlimited
    ? 'emerald'
    : overview.threshold.state === 'limit_reached'
      ? 'rose'
      : overview.threshold.state === 'critical'
        ? 'amber'
        : overview.threshold.state === 'watch'
          ? 'sky'
          : 'emerald';

  const percentUsed = isUnlimited ? 0 : Math.max(0, Math.min(100, overview.threshold.percentUsed || 0));
  const usedLabel = isUnlimited ? 'Unlimited access' : `${percentUsed}% used`;
  const runwayLabel = overview.usage.projectedExhaustionDate
    ? new Date(overview.usage.projectedExhaustionDate).toLocaleDateString()
    : 'No fixed date';
  const aiCreditsLabel = overview.subscription.monthlyAiCredits
    ? `${overview.subscription.remainingAiCredits ?? 0} / ${overview.subscription.monthlyAiCredits} credits`
    : `${overview.subscription.remainingAiTrialRuns ?? 0} free AI tries`;

  const insights = [
    isUnlimited
      ? { title: 'No plan cap', detail: 'This role is not limited by monthly generation quotas.', tone: 'positive' as const }
      : overview.threshold.state === 'limit_reached'
        ? { title: 'Plan limit reached', detail: overview.threshold.recommendation || 'Upgrade to avoid interrupted work.', tone: 'warning' as const }
        : overview.threshold.state === 'critical'
          ? { title: 'Plan usage is critical', detail: overview.threshold.recommendation || 'You’re close to the limit. Consider upgrading.', tone: 'warning' as const }
          : overview.threshold.state === 'watch'
            ? { title: 'Usage is trending up', detail: overview.threshold.recommendation || 'Keep an eye on usage to avoid hitting the cap.', tone: 'neutral' as const }
            : { title: 'Plan health is good', detail: 'You have enough runway for the current usage pattern.', tone: 'positive' as const },
    {
      title: 'AI access',
      detail: overview.subscription.monthlyAiCredits
        ? `Credits remaining: ${overview.subscription.remainingAiCredits ?? 0}.`
        : `Free tries remaining: ${overview.subscription.remainingAiTrialRuns ?? 0}.`,
      tone: (overview.subscription.remainingAiCredits ?? overview.subscription.remainingAiTrialRuns ?? 0) === 0 ? 'warning' as const : 'neutral' as const,
    },
    {
      title: 'Operational velocity',
      detail: `${formatNumber(overview.usage.averageDocumentsPerDay)} docs/day · ${formatNumber(overview.usage.averageDocumentsPerWeek)} docs/week.`,
      tone: 'neutral' as const,
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="border-white/60 bg-white/82 backdrop-blur">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-lg">Profile</CardTitle>
            <p className="mt-1 text-sm text-slate-500">{overview.name} · {overview.email}</p>
            <p className="mt-1 text-xs text-slate-500">{overview.organizationName || overview.role}</p>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white">
              <CreditCard className="h-4 w-4" />
              {overview.subscription.planName}
            </div>
            <div className="text-xs text-slate-500">{overview.subscription.status} · {overview.subscription.priceLabel || 'Custom access'}</div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-4">
            <div className="rounded-[1.25rem] border border-white/70 bg-white/70 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Plan usage</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{usedLabel}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {isUnlimited
                      ? 'No fixed generation limit for this role.'
                      : `${overview.usage.remainingGenerations} remaining · ${overview.subscription.maxDocumentGenerations || 0} total`}
                  </p>
                </div>
                <UsageRing label="Capacity" value={String(percentUsed)} tone={planTone} />
              </div>
              <div className="mt-3">
                <ProgressBar value={percentUsed} tone={planTone} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[1.25rem] border border-white/70 bg-white/70 p-4">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-slate-900" />
                  <p className="text-sm font-semibold text-slate-950">Runway</p>
                </div>
                <p className="mt-2 text-sm text-slate-700">{runwayLabel}</p>
                <p className="mt-1 text-xs text-slate-500">{overview.usage.projectedExhaustionLabel}</p>
              </div>
              <div className="rounded-[1.25rem] border border-white/70 bg-white/70 p-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-slate-900" />
                  <p className="text-sm font-semibold text-slate-950">AI usage</p>
                </div>
                <p className="mt-2 text-sm text-slate-700">{aiCreditsLabel}</p>
                <p className="mt-1 text-xs text-slate-500">{overview.subscription.overagePriceLabel ? `Overage ${overview.subscription.overagePriceLabel}` : 'Upgrade for more AI.'}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {[
              { label: 'Documents', value: overview.usage.totalDocuments, icon: Gauge },
              { label: 'This month', value: overview.usage.documentsThisMonth, icon: Gauge },
              { label: 'Transfers', value: overview.usage.totalFileTransfers, icon: ShieldCheck },
              { label: 'Downloads', value: overview.usage.fileTransferDownloads, icon: ShieldCheck },
            ].map((item) => (
              <div key={item.label} className="rounded-[1.2rem] border border-white/70 bg-white/82 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</p>
                  </div>
                  <item.icon className="h-5 w-5 text-slate-900" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card className="border-white/60 bg-white/82 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-base">Usage charts</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {[
              { label: 'Docs per day', value: overview.usage.averageDocumentsPerDay, max: 10, tone: 'sky' as const },
              { label: 'Docs per week', value: overview.usage.averageDocumentsPerWeek, max: 50, tone: 'emerald' as const },
              { label: 'Docs this month', value: overview.usage.documentsThisMonth, max: Math.max(1, overview.subscription.maxDocumentGenerations || overview.usage.documentsThisMonth || 1), tone: planTone },
              { label: 'Transfers this month', value: overview.usage.totalFileTransfers, max: Math.max(1, overview.usage.totalFileTransfers || 1), tone: 'amber' as const },
            ].map((item) => {
              const pct = item.max ? Math.round((item.value / item.max) * 100) : 0;
              return (
                <div key={item.label} className="rounded-[1.25rem] border border-white/70 bg-white/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                  <p className="mt-2 text-xl font-semibold text-slate-950">{formatNumber(item.value)}</p>
                  <div className="mt-3">
                    <ProgressBar value={Math.max(0, Math.min(100, pct))} tone={item.tone} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-white/82 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-base">Insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {insights.map((item) => (
              <div
                key={item.title}
                className={`rounded-[1.15rem] border px-4 py-3 text-sm ${
                  item.tone === 'warning'
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : item.tone === 'positive'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 bg-slate-50 text-slate-900'
                }`}
              >
                <div className="flex items-start gap-3">
                  {item.tone === 'warning' ? <AlertTriangle className="mt-0.5 h-4 w-4 flex-none opacity-80" /> : <Sparkles className="mt-0.5 h-4 w-4 flex-none opacity-80" />}
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 leading-6 opacity-90">{item.detail}</p>
                  </div>
                </div>
              </div>
            ))}

            {overview.limitations.length ? (
              <details className="rounded-[1.15rem] border border-white/70 bg-white/70 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-950">Plan limitations</summary>
                <div className="mt-3 space-y-2">
                  {overview.limitations.map((item) => (
                    <div key={item} className="rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-sm text-slate-700">
                      {item}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
