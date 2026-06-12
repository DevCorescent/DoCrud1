'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, DollarSign, Eye, Landmark, Loader2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type PublishedItem = {
  id: string;
  status: 'published' | 'archived';
  templateSnapshot: { name: string; category: string; description?: string };
  priceInPaise: number;
  purchaseCount: number;
  updatedAt: string;
};

type IncomeRecord = {
  id: string;
  itemId: string;
  grossAmountInPaise: number;
  commissionAmountInPaise: number;
  sellerNetAmountInPaise: number;
  status: 'pending' | 'paid_out' | 'void';
  createdAt: string;
};

type WithdrawalRecord = {
  id: string;
  amountInPaise: number;
  status: 'requested' | 'approved' | 'paid' | 'rejected' | 'cancelled';
  payoutMethod: { label: string; details: string };
  transactionRef?: string;
  adminNote?: string;
  requestedAt: string;
};

type WithdrawalSummary = {
  earnedNetInPaise: number;
  paidOutInPaise: number;
  reservedInPaise: number;
  availableToWithdrawInPaise: number;
  minimumWithdrawInPaise: number;
};

function formatInr(paise: number) {
  const value = Math.max(0, Number(paise || 0)) / 100;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export default function TemplatePublisherCenter() {
  const [tab, setTab] = useState<'published' | 'income' | 'withdrawals'>('published');
  const [scopeFilter, setScopeFilter] = useState<'public' | 'private'>('public');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PublishedItem[]>([]);
  const [incomeLoading, setIncomeLoading] = useState(false);
  const [income, setIncome] = useState<IncomeRecord[]>([]);
  const [incomeTotals, setIncomeTotals] = useState<{ gross: number; commission: number; net: number; pending: number } | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid_out' | 'void'>('all');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [withdrawalSummary, setWithdrawalSummary] = useState<WithdrawalSummary | null>(null);
  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);
  const [withdrawalBusy, setWithdrawalBusy] = useState(false);
  const [withdrawalError, setWithdrawalError] = useState('');
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [payoutMethodLabel, setPayoutMethodLabel] = useState('UPI');
  const [payoutMethodDetails, setPayoutMethodDetails] = useState('');

  const publicItems = useMemo(() => items.filter((i) => i.status === 'published'), [items]);
  const privateItems = useMemo(() => items.filter((i) => i.status !== 'published'), [items]);
  const visibleItems = scopeFilter === 'public' ? publicItems : privateItems;

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/template-marketplace/seller/dashboard', { cache: 'no-store' });
      const payload = await res.json().catch(() => null);
      setItems(Array.isArray(payload?.items) ? payload.items : []);
    } finally {
      setLoading(false);
    }
  };

  const fetchIncome = async () => {
    setIncomeLoading(true);
    try {
      const params = new URLSearchParams({ scope: 'income', status: statusFilter });
      if (selectedItemId) params.set('itemId', selectedItemId);
      const res = await fetch(`/api/template-marketplace/seller/dashboard?${params.toString()}`, { cache: 'no-store' });
      const payload = await res.json().catch(() => null);
      setIncome(Array.isArray(payload?.records) ? payload.records : []);
      setIncomeTotals(payload?.totals || null);
      const summaryRes = await fetch('/api/template-marketplace/withdrawals', { cache: 'no-store' });
      const summaryPayload = await summaryRes.json().catch(() => null);
      if (summaryRes.ok) {
        setWithdrawalSummary(summaryPayload?.summary || null);
      }
    } finally {
      setIncomeLoading(false);
    }
  };

  const fetchWithdrawals = async () => {
    setWithdrawalsLoading(true);
    try {
      const res = await fetch('/api/template-marketplace/withdrawals', { cache: 'no-store' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Unable to load withdrawals.');
      setWithdrawalSummary(payload?.summary || null);
      setWithdrawals(Array.isArray(payload?.withdrawals) ? payload.withdrawals : []);
    } catch (err) {
      setWithdrawalError(err instanceof Error ? err.message : 'Unable to load withdrawals.');
      setWithdrawalSummary(null);
      setWithdrawals([]);
    } finally {
      setWithdrawalsLoading(false);
    }
  };

  useEffect(() => {
    void fetchItems();
  }, []);

  useEffect(() => {
    if (tab !== 'income') return;
    void fetchIncome();
  }, [selectedItemId, statusFilter, tab]);

  useEffect(() => {
    if (tab !== 'withdrawals') return;
    void fetchWithdrawals();
  }, [tab]);

  const submitWithdrawal = async () => {
    const amountRupees = Math.round(Number(withdrawalAmount));
    const amountInPaise = Number.isFinite(amountRupees) ? amountRupees * 100 : 0;
    try {
      setWithdrawalBusy(true);
      setWithdrawalError('');
      const res = await fetch('/api/template-marketplace/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountInPaise,
          payoutMethodLabel,
          payoutMethodDetails,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Unable to create withdrawal request.');
      setWithdrawalDialogOpen(false);
      setWithdrawalAmount('');
      setPayoutMethodDetails('');
      await fetchWithdrawals();
    } catch (err) {
      setWithdrawalError(err instanceof Error ? err.message : 'Unable to create withdrawal request.');
    } finally {
      setWithdrawalBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="border-white/60 bg-white/80 backdrop-blur">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-base">Template Publisher</CardTitle>
            <p className="mt-1 text-sm text-slate-600">Manage your marketplace listings, analytics, and income.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => void fetchItems()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button asChild className="rounded-full bg-slate-950 text-white hover:bg-slate-800">
              <Link href="/template-marketplace">Open marketplace</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab('published')}
              className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${
                tab === 'published' ? 'bg-slate-950 text-white' : 'bg-white/70 text-slate-700 hover:bg-white'
              }`}
            >
              <Eye className="h-4 w-4" />
              Published templates
            </button>
            <button
              type="button"
              onClick={() => setTab('income')}
              className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${
                tab === 'income' ? 'bg-slate-950 text-white' : 'bg-white/70 text-slate-700 hover:bg-white'
              }`}
            >
              <DollarSign className="h-4 w-4" />
              Income
            </button>
            <button
              type="button"
              onClick={() => setTab('withdrawals')}
              className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${
                tab === 'withdrawals' ? 'bg-slate-950 text-white' : 'bg-white/70 text-slate-700 hover:bg-white'
              }`}
            >
              <Landmark className="h-4 w-4" />
              Withdraw
            </button>
          </div>

          {tab === 'published' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 rounded-full bg-white/70 p-1">
                  <button
                    type="button"
                    onClick={() => setScopeFilter('public')}
                    className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                      scopeFilter === 'public' ? 'bg-slate-950 text-white' : 'text-slate-700 hover:bg-white'
                    }`}
                  >
                    Public
                  </button>
                  <button
                    type="button"
                    onClick={() => setScopeFilter('private')}
                    className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                      scopeFilter === 'private' ? 'bg-slate-950 text-white' : 'text-slate-700 hover:bg-white'
                    }`}
                  >
                    Private
                  </button>
                </div>
                <span className="rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                  {visibleItems.length} items
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {loading ? (
                  <div className="rounded-[1.4rem] border border-white/70 bg-white/70 p-5 text-sm text-slate-600">Loading…</div>
                ) : visibleItems.length ? (
                  visibleItems.map((item) => (
                    <div key={item.id} className="rounded-[1.6rem] border border-white/60 bg-white/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{item.templateSnapshot?.name || 'Template'}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {item.templateSnapshot?.category || 'General'} · {item.priceInPaise > 0 ? formatInr(item.priceInPaise) : 'Free'}
                          </p>
                        </div>
                        <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                          {item.status === 'published' ? 'Live' : 'Hidden'}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-[1.1rem] bg-white/70 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Installs</p>
                          <p className="mt-1 font-semibold text-slate-950">{item.purchaseCount || 0}</p>
                        </div>
                        <div className="rounded-[1.1rem] bg-white/70 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Updated</p>
                          <p className="mt-1 font-semibold text-slate-950">
                            {new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short' }).format(new Date(item.updatedAt))}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button asChild size="sm" variant="outline" className="rounded-full bg-white/70">
                          <Link href={`/template-marketplace/${encodeURIComponent(item.id)}`}>Open</Link>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-full bg-white/70"
                          onClick={async () => {
                            await fetch(`/api/template-marketplace/seller/dashboard?scope=analytics&itemId=${encodeURIComponent(item.id)}`);
                          }}
                        >
                          <BarChart3 className="mr-2 h-4 w-4" />
                          Analytics
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.6rem] border border-dashed border-white/70 bg-white/60 p-6 text-sm text-slate-600 md:col-span-2 xl:col-span-3">
                    No templates in this tab yet.
                  </div>
                )}
              </div>
            </div>
          ) : tab === 'income' ? (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="rounded-[1.1rem] border border-white/70 bg-white/70 p-3">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Status</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="mt-2 h-10 w-full rounded-full border border-white/70 bg-white/70 px-4 text-sm font-semibold text-slate-900"
                  >
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="paid_out">Paid out</option>
                    <option value="void">Void</option>
                  </select>
                </label>
                <label className="rounded-[1.1rem] border border-white/70 bg-white/70 p-3 md:col-span-2">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Template</span>
                  <select
                    value={selectedItemId}
                    onChange={(e) => setSelectedItemId(e.target.value)}
                    className="mt-2 h-10 w-full rounded-full border border-white/70 bg-white/70 px-4 text-sm font-semibold text-slate-900"
                  >
                    <option value="">All templates</option>
                    {items.map((i) => (
                      <option key={`income-item-${i.id}`} value={i.id}>{i.templateSnapshot?.name || i.id}</option>
                    ))}
                  </select>
                </label>
              </div>

              {incomeTotals ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-[1.3rem] border border-white/70 bg-white/70 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Gross</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{formatInr(incomeTotals.gross)}</p>
                  </div>
                  <div className="rounded-[1.3rem] border border-white/70 bg-white/70 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Commission (25%)</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{formatInr(incomeTotals.commission)}</p>
                  </div>
                  <div className="rounded-[1.3rem] border border-white/70 bg-white/70 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Net (after withdrawals)</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {formatInr(Math.max((withdrawalSummary?.earnedNetInPaise ?? incomeTotals.net) - (withdrawalSummary?.paidOutInPaise ?? 0), 0))}
                    </p>
                  </div>
                  <div className="rounded-[1.3rem] border border-white/70 bg-white/70 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pending payout</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{formatInr(incomeTotals.pending)}</p>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                {incomeLoading ? (
                  <div className="rounded-[1.4rem] border border-white/70 bg-white/70 p-5 text-sm text-slate-600">Loading income…</div>
                ) : income.length ? (
                  income.slice(0, 20).map((r) => (
                    <div key={r.id} className="rounded-[1.4rem] border border-white/70 bg-white/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950">{formatInr(r.sellerNetAmountInPaise)} net</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Gross {formatInr(r.grossAmountInPaise)} · Commission {formatInr(r.commissionAmountInPaise)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">{new Date(r.createdAt).toLocaleString()}</p>
                        </div>
                        <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                          {r.status}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.4rem] border border-dashed border-white/70 bg-white/60 p-6 text-sm text-slate-600 md:col-span-2">
                    No income records yet.
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Earnings are tracked with a 25% docrud commission. Payout transfer requires payout rails (manual or RazorpayX).
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.3rem] border border-white/70 bg-white/70 p-4 sm:col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Available</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">{formatInr(withdrawalSummary?.availableToWithdrawInPaise || 0)}</p>
                  <p className="mt-1 text-xs text-slate-600">Min {formatInr(withdrawalSummary?.minimumWithdrawInPaise || 100000)}</p>
                </div>
                <div className="rounded-[1.3rem] border border-white/70 bg-white/70 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Reserved</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">{formatInr(withdrawalSummary?.reservedInPaise || 0)}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-950">Requests</p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    className="rounded-full bg-slate-950 text-white hover:bg-slate-800"
                    onClick={() => {
                      setWithdrawalError('');
                      setWithdrawalDialogOpen(true);
                    }}
                    disabled={(withdrawalSummary?.availableToWithdrawInPaise || 0) < (withdrawalSummary?.minimumWithdrawInPaise || 100000)}
                  >
                    Request
                  </Button>
                  <Button type="button" variant="outline" className="rounded-full" onClick={() => void fetchWithdrawals()}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>
                </div>
              </div>

              {withdrawalError ? (
                <div className="rounded-[1.1rem] border border-rose-200 bg-rose-50/70 px-3 py-2 text-sm text-rose-800">
                  {withdrawalError}
                </div>
              ) : null}

              <div className="grid gap-3">
                {withdrawalsLoading ? (
                  <div className="flex items-center gap-2 rounded-[1.6rem] border border-white/70 bg-white/60 p-6 text-sm text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </div>
                ) : withdrawals.length ? (
                  withdrawals.slice(0, 120).map((w) => (
                    <div key={w.id} className="rounded-[1.6rem] border border-white/70 bg-white/70 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950">{formatInr(w.amountInPaise)}</p>
                          <p className="mt-1 text-xs text-slate-600">{w.payoutMethod.label}</p>
                          <p className="mt-2 line-clamp-2 text-xs text-slate-600">{w.payoutMethod.details}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                            w.status === 'paid'
                              ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800'
                              : w.status === 'approved'
                                ? 'border-sky-200 bg-sky-50/70 text-sky-800'
                                : w.status === 'rejected'
                                  ? 'border-rose-200 bg-rose-50/70 text-rose-800'
                                  : w.status === 'cancelled'
                                    ? 'border-slate-200 bg-slate-50/70 text-slate-700'
                                    : 'border-amber-200 bg-amber-50/70 text-amber-900'
                          }`}>
                            {w.status}
                          </span>
                          <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700">
                            {new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short' }).format(new Date(w.requestedAt))}
                          </span>
                        </div>
                      </div>
                      {w.transactionRef ? (
                        <div className="mt-3 rounded-2xl border border-white/70 bg-white/70 px-3 py-2 text-xs text-slate-700">
                          <span className="font-semibold text-slate-950">Ref:</span> {w.transactionRef}
                        </div>
                      ) : null}
                      {w.adminNote ? (
                        <div className="mt-2 rounded-2xl border border-white/70 bg-white/70 px-3 py-2 text-xs text-slate-700">
                          {w.adminNote}
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.4rem] border border-dashed border-white/70 bg-white/60 p-6 text-sm text-slate-600">
                    No withdrawals yet.
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={withdrawalDialogOpen} onOpenChange={setWithdrawalDialogOpen}>
        <DialogContent className="max-w-lg overflow-hidden rounded-[1.6rem] border border-white/70 bg-white/85 p-0 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3 border-b border-white/60 px-5 pb-4 pt-5">
              <div>
                <DialogTitle className="text-base font-semibold tracking-[-0.02em] text-slate-950">
                  Request withdrawal
                </DialogTitle>
                <p className="mt-1 text-sm text-slate-600">
                  Min {formatInr(withdrawalSummary?.minimumWithdrawInPaise || 100000)}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWithdrawalDialogOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </DialogHeader>
          <div className="space-y-4 px-5 py-5">
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Amount (INR)</span>
              <Input
                value={withdrawalAmount}
                onChange={(e) => setWithdrawalAmount(e.target.value)}
                inputMode="numeric"
                className="mt-2 rounded-[1.1rem] border-slate-200 bg-white"
                placeholder="1000"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Payment method</span>
              <select
                value={payoutMethodLabel}
                onChange={(e) => setPayoutMethodLabel(e.target.value)}
                className="mt-2 h-11 w-full rounded-[1.1rem] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900"
              >
                <option value="UPI">UPI</option>
                <option value="Bank transfer">Bank transfer</option>
                <option value="PayPal">PayPal</option>
                <option value="Any">Any</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Details</span>
              <textarea
                value={payoutMethodDetails}
                onChange={(e) => setPayoutMethodDetails(e.target.value)}
                className="mt-2 min-h-[120px] w-full rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none"
                placeholder="UPI ID / bank account / wallet details"
              />
            </label>
            {withdrawalError ? (
              <div className="rounded-[1.1rem] border border-rose-200 bg-rose-50/70 px-3 py-2 text-sm text-rose-800">
                {withdrawalError}
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" className="h-10 rounded-xl border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setWithdrawalDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-900"
                onClick={() => void submitWithdrawal()}
                disabled={withdrawalBusy}
              >
                {withdrawalBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Landmark className="mr-2 h-4 w-4" />}
                Submit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
