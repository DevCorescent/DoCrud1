'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, CreditCard, Download, Loader2, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BillingOverview, ProfileOverview } from '@/types/document';

const emptyTransactions: BillingOverview['transactions'] = [];

const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

function formatAmountInPaise(value?: number) {
  return money.format((value || 0) / 100);
}

type BillingCenterProps = {
  initialPlanId?: string;
};

const INFINITY_MONTHLY_PAISE = 29900;
const INFINITY_ANNUAL_PAISE  = 249900;

export default function BillingCenter({ initialPlanId }: BillingCenterProps) {
  const router = useRouter();
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [profile, setProfile] = useState<ProfileOverview | null>(null);
  const [referral, setReferral] = useState<{ code: string; link: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [tab, setTab] = useState<'overview' | 'plans' | 'invoices'>('overview');
  const [infinityPeriod, setInfinityPeriod] = useState<'monthly' | 'annual'>('annual');
  const [infinityBusy, setInfinityBusy] = useState(false);
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState<'all' | 'paid' | 'created' | 'failed' | 'cancelled'>('all');
  const [invoicePage, setInvoicePage] = useState(1);
  const invoicesPerPage = 8;

  const loadState = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [billingResponse, profileResponse, referralResponse] = await Promise.all([
        fetch('/api/billing/overview', { cache: 'no-store' }),
        fetch('/api/profile/overview', { cache: 'no-store' }),
        fetch('/api/referrals/me', { cache: 'no-store' }),
      ]);
      const billingPayload = await billingResponse.json().catch(() => null);
      const profilePayload = await profileResponse.json().catch(() => null);
      const referralPayload = await referralResponse.json().catch(() => null);

      if (!billingResponse.ok) {
        throw new Error(billingPayload?.error || 'Unable to load billing overview.');
      }
      if (!profileResponse.ok) {
        throw new Error(profilePayload?.error || 'Unable to load subscription profile.');
      }

      setBilling(billingPayload);
      setProfile(profilePayload);
      setReferral(referralResponse.ok && referralPayload?.code && referralPayload?.link ? referralPayload : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load billing.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const handleInfinityCheckout = useCallback(async () => {
    try {
      setInfinityBusy(true);
      setError('');
      router.push(`/checkout?plan=docrud-infinity&period=${infinityPeriod}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start checkout.');
      setInfinityBusy(false);
    }
  }, [router, infinityPeriod]);

  const transactions = billing?.transactions ?? emptyTransactions;

  const sortedTransactions = useMemo(() => (
    [...transactions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  ), [transactions]);

  const filteredTransactions = useMemo(() => {
    const query = invoiceQuery.trim().toLowerCase();
    return sortedTransactions.filter((txn) => {
      if (invoiceStatus !== 'all' && txn.status !== invoiceStatus) return false;
      if (!query) return true;
      return (
        (txn.planName || txn.productLabel || '').toLowerCase().includes(query)
        || (txn.providerOrderId || '').toLowerCase().includes(query)
        || (txn.invoiceNumber || '').toLowerCase().includes(query)
        || (txn.receipt || '').toLowerCase().includes(query)
      );
    });
  }, [invoiceQuery, invoiceStatus, sortedTransactions]);

  const totalInvoicePages = Math.max(1, Math.ceil(filteredTransactions.length / invoicesPerPage));
  const pagedTransactions = filteredTransactions.slice((invoicePage - 1) * invoicesPerPage, invoicePage * invoicesPerPage);

  useEffect(() => {
    setInvoicePage(1);
  }, [invoiceQuery, invoiceStatus]);

  if (loading) {
    return (
      <Card className="cloud-panel">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading subscriptions and billing...
        </CardContent>
      </Card>
    );
  }

  if (error || !billing || !profile) {
    return (
      <Card className="cloud-panel">
        <CardContent className="space-y-4 p-6">
          <p className="text-sm text-rose-600">{error || 'Unable to load subscriptions and billing.'}</p>
          <Button variant="outline" onClick={() => void loadState()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const thresholdTone = billing.threshold.state === 'limit_reached'
    ? 'border-rose-200 bg-rose-50/80 text-rose-900'
    : billing.threshold.state === 'critical'
      ? 'border-amber-200 bg-amber-50/80 text-amber-900'
      : billing.threshold.state === 'watch'
        ? 'border-sky-200 bg-sky-50/80 text-sky-900'
        : 'border-emerald-200 bg-emerald-50/80 text-emerald-900';

  const aiRemainingLabel = billing.aiAllowance
    ? `${billing.aiAllowance.remainingCredits} credits · ${billing.aiAllowance.remainingTrialRuns} tries`
    : `${profile.subscription.remainingAiCredits ?? 0} credits · ${profile.subscription.remainingAiTrialRuns ?? 0} tries`;

  const runwayLabel = billing.threshold.state === 'limit_reached'
    ? 'Limit reached'
    : billing.threshold.state === 'critical'
      ? 'Critical'
      : billing.threshold.state === 'watch'
        ? 'Watch'
        : 'Healthy';

  const currentPlanLabel = billing.currentPlan?.name || profile.subscription.planName || 'Current plan';
  const periodEndRaw = profile.subscription.currentPeriodEnd;
  const daysLeft = (() => {
    if (!periodEndRaw) return null;
    const end = new Date(periodEndRaw);
    if (Number.isNaN(end.getTime())) return null;
    return Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  })();
  const renewalNeeded = profile.subscription.status === 'upgrade_required';
  const renewalSoon = typeof daysLeft === 'number' && daysLeft >= 0 && daysLeft <= 3;

  return (
    <div className="space-y-6">
      <Card className="cloud-panel">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-950">
              <CreditCard className="h-5 w-5 text-slate-900" />
              Billing
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5 text-slate-900" />
                {currentPlanLabel}
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium backdrop-blur ${thresholdTone}`}>
                {runwayLabel} · {Math.round(billing.threshold.percentUsed)}%
              </span>
              <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 backdrop-blur">
                AI {aiRemainingLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 backdrop-blur">
                Gateway {billing.publishableKeyAvailable ? 'Razorpay ready' : 'Config needed'}
              </span>
            </div>
          </div>

          {(successMessage || error) ? (
            <div className={`mt-3 rounded-2xl border px-4 py-3 text-sm backdrop-blur ${successMessage ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900' : 'border-rose-200 bg-rose-50/70 text-rose-800'}`}>
              {successMessage || error}
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="pt-0">
          {billing.infinity?.active && billing.infinity.expiresAt ? (
            (() => {
              const daysToExpiry = Math.ceil((new Date(billing.infinity.expiresAt).getTime() - Date.now()) / 86400000);
              return daysToExpiry <= 7 ? (
                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-4 backdrop-blur">
                  <p className="text-sm font-semibold text-slate-950">Infinity renewing soon</p>
                  <p className="mt-1 text-sm text-slate-700">
                    Your Docrud Infinity subscription expires in {Math.max(0, daysToExpiry)} day{daysToExpiry === 1 ? '' : 's'}. Renew to keep access uninterrupted.
                  </p>
                  <Button className="mt-3 rounded-xl bg-slate-950 text-white hover:bg-slate-900" onClick={() => setTab('plans')}>
                    Renew Infinity
                  </Button>
                </div>
              ) : null;
            })()
          ) : null}

          <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <TabsList className="w-full justify-start rounded-2xl bg-white/60 p-1 backdrop-blur sm:w-auto">
                <TabsTrigger value="overview" className="rounded-xl">Overview</TabsTrigger>
                <TabsTrigger value="plans" className="rounded-xl">Plans</TabsTrigger>
                <TabsTrigger value="invoices" className="rounded-xl">Invoices</TabsTrigger>
              </TabsList>

              {tab === 'invoices' ? (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                  <div className="relative w-full sm:w-[320px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={invoiceQuery}
                      onChange={(event) => setInvoiceQuery(event.target.value)}
                      placeholder="Search invoices"
                      className="pl-9"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(['all', 'paid', 'created', 'failed', 'cancelled'] as const).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setInvoiceStatus(key)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${invoiceStatus === key ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white/70 text-slate-700'}`}
                      >
                        {key === 'all' ? 'All' : key}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <Button variant="outline" className="rounded-xl" onClick={() => setTab('plans')}>
                  {billing.infinity?.active ? 'Manage Infinity' : 'Get Infinity'}
                </Button>
              )}
            </div>

            <TabsContent value="overview" className="mt-4 space-y-4">
              <div className="grid gap-3 lg:grid-cols-3">
                <div className="cloud-panel rounded-2xl p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Plan</p>
                  <p className="mt-2 text-base font-semibold text-slate-950">{currentPlanLabel}</p>
                  <p className="mt-1 text-sm text-slate-600">{profile.subscription.priceLabel || 'Custom recurring access'}</p>
                </div>
                <div className="cloud-panel rounded-2xl p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Usage</p>
                  <p className="mt-2 text-base font-semibold text-slate-950">{Math.round(billing.threshold.percentUsed)}% used</p>
                  <p className="mt-1 text-sm text-slate-600">{billing.threshold.recommendation}</p>
                </div>
                <div className="cloud-panel rounded-2xl p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">AI</p>
                  <p className="mt-2 text-base font-semibold text-slate-950">{aiRemainingLabel}</p>
                  <p className="mt-1 text-sm text-slate-600">Monthly {billing.aiAllowance?.monthlyCredits ?? 0} credits</p>
                </div>
              </div>

              {profile.limitations?.length ? (
                <div className="cloud-panel rounded-2xl p-5">
                  <p className="text-sm font-semibold text-slate-950">Limits</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {profile.limitations.slice(0, 6).map((item) => (
                      <div key={item} className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-700 backdrop-blur">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {referral ? (
                <div className="cloud-panel rounded-2xl p-5">
                  <p className="text-sm font-semibold text-slate-950">Referral</p>
                  <p className="mt-1 text-sm text-slate-600">Share 50% OFF link · You get +1 month on successful purchase.</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="min-w-[240px] flex-1 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-700 backdrop-blur">
                      {referral.link}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(referral.link);
                        } catch {
                          // ignore
                        }
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy
                    </Button>
                  </div>
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="plans" className="mt-4 space-y-4">
              {/* Infinity status card (if active) */}
              {billing.infinity?.active ? (
                <div className="cloud-panel rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-amber-500" />
                        <p className="text-sm font-semibold text-slate-950">Docrud Infinity</p>
                        <span className="rounded-full border border-emerald-200 bg-emerald-50/70 px-2.5 py-0.5 text-xs font-medium text-emerald-800">Active</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {billing.infinity.period === 'annual' ? '₹2,499 / year' : '₹299 / month'} · Renews{' '}
                        {billing.infinity.expiresAt
                          ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(billing.infinity.expiresAt))
                          : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm">
                    {[
                      { label: 'Period', value: billing.infinity.period === 'annual' ? 'Annual' : 'Monthly' },
                      { label: 'Drive storage', value: '5 GB' },
                      { label: 'Renewals', value: String(billing.infinity.renewalCount ?? 0) },
                      { label: 'Purchased', value: billing.infinity.purchasedAt ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(billing.infinity.purchasedAt)) : '—' },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">{label}</span>
                        <span className="font-semibold text-slate-950">{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <div className="flex rounded-2xl border border-slate-200 bg-white/60 p-1 text-xs">
                      {(['monthly', 'annual'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setInfinityPeriod(p)}
                          className={`rounded-xl px-3 py-1.5 font-semibold transition ${infinityPeriod === p ? 'bg-slate-950 text-white' : 'text-slate-600 hover:text-slate-950'}`}
                        >
                          {p === 'monthly' ? '₹299 / mo' : '₹2,499 / yr'}
                        </button>
                      ))}
                    </div>
                    <Button
                      className="rounded-xl bg-slate-950 text-white hover:bg-slate-900"
                      onClick={() => void handleInfinityCheckout()}
                      disabled={infinityBusy}
                    >
                      {infinityBusy ? 'Opening...' : 'Renew Infinity'}
                    </Button>
                  </div>
                </div>
              ) : (
                /* Infinity upgrade card (if not active) */
                <div className="cloud-panel rounded-2xl p-6">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <p className="text-base font-semibold text-slate-950">Docrud Infinity</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    Unlock business pages, unlimited services, direct messaging, public face badge, e-sign, and 5 GB drive storage.
                  </p>

                  <div className="mt-5 grid gap-2 text-sm">
                    {[
                      '✓ Business Pages',
                      '✓ Unlimited Services',
                      '✓ Direct Messaging',
                      '✓ Public Face Badge',
                      '✓ E-Sign Documents',
                      '✓ 5 GB Drive Storage',
                    ].map((perk) => (
                      <p key={perk} className="text-slate-700">{perk}</p>
                    ))}
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <div className="flex rounded-2xl border border-slate-200 bg-white/60 p-1 text-xs">
                      {(['monthly', 'annual'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setInfinityPeriod(p)}
                          className={`rounded-xl px-3 py-1.5 font-semibold transition ${infinityPeriod === p ? 'bg-slate-950 text-white' : 'text-slate-600 hover:text-slate-950'}`}
                        >
                          {p === 'monthly' ? '₹299 / mo' : '₹2,499 / yr'}
                        </button>
                      ))}
                    </div>
                    <Button
                      className="rounded-xl bg-slate-950 text-white hover:bg-slate-900"
                      onClick={() => void handleInfinityCheckout()}
                      disabled={infinityBusy}
                    >
                      {infinityBusy ? 'Opening...' : 'Get Infinity'}
                    </Button>
                  </div>

                  {infinityPeriod === 'annual' && (
                    <p className="mt-3 text-xs text-emerald-700 font-medium">
                      Save ₹{((INFINITY_MONTHLY_PAISE * 12 - INFINITY_ANNUAL_PAISE) / 100).toFixed(0)} with annual billing (30% off)
                    </p>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="invoices" className="mt-4 space-y-3">
              <div className="cloud-panel overflow-hidden rounded-2xl p-0">
                <div className="hidden grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr_1.1fr_auto] gap-0 border-b border-slate-200 bg-white/70 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 backdrop-blur sm:grid">
                  <div>Item</div>
                  <div>Status</div>
                  <div>Total</div>
                  <div>GST</div>
                  <div>Created</div>
                  <div className="text-right">Invoice</div>
                </div>

                {pagedTransactions.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-slate-600">No invoices found.</div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {pagedTransactions.map((transaction) => (
                      <div
                        key={transaction.id}
                        className="grid grid-cols-1 gap-2 px-4 py-4 sm:grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr_1.1fr_auto] sm:items-center sm:gap-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{transaction.planName || transaction.productLabel || 'Purchase'}</p>
                          <p className="mt-1 truncate text-xs text-slate-500">{transaction.providerOrderId || transaction.receipt}</p>
                        </div>
                        <div>
                          <span className="rounded-full border border-slate-200 bg-slate-50/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                            {transaction.status}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-slate-950">
                          {formatAmountInPaise(transaction.totalAmountInPaise || transaction.amountInPaise)}
                        </div>
                        <div className="text-sm text-slate-700">
                          {formatAmountInPaise(transaction.gstAmountInPaise || 0)}
                        </div>
                        <div className="text-sm text-slate-700">
                          {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(transaction.createdAt))}
                        </div>
                        <div className="flex justify-start sm:justify-end">
                          {transaction.status === 'paid' ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-xl"
                              onClick={() => window.open(`/api/billing/invoice/${transaction.id}`, '_blank', 'noopener,noreferrer')}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Invoice
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-500">{transaction.invoiceNumber || 'Pending'}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  Showing {(invoicePage - 1) * invoicesPerPage + (pagedTransactions.length ? 1 : 0)}-{(invoicePage - 1) * invoicesPerPage + pagedTransactions.length} of {filteredTransactions.length}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => setInvoicePage((p) => Math.max(1, p - 1))}
                    disabled={invoicePage <= 1}
                  >
                    Previous
                  </Button>
                  <span className="text-xs font-medium text-slate-700">Page {invoicePage} / {totalInvoicePages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => setInvoicePage((p) => Math.min(totalInvoicePages, p + 1))}
                    disabled={invoicePage >= totalInvoicePages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
