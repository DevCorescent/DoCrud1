'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  BadgePercent,
  Building2,
  ClipboardList,
  FileText,
  Gavel,
  GraduationCap,
  Landmark,
  Search,
  ShoppingCart,
  Sparkles,
  Star,
  Tag,
  Users,
  Share2,
  Check,
} from 'lucide-react';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { Button } from '@/components/ui/button';
import type { LandingSettings } from '@/types/document';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

type MarketplaceItem = {
  id: string;
  templateSnapshot: { id: string; name: string; category: string; description?: string };
  sellerName?: string;
  priceInPaise: number;
  currency: 'INR';
  tags: string[];
  coverImageDataUrl?: string;
  purchaseCount: number;
  openCount?: number;
  rating?: { average: number; count: number };
  updatedAt: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

function formatInr(paise: number) {
  const value = Math.max(0, Number(paise || 0)) / 100;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

async function loadRazorpayScript() {
  if (typeof window === 'undefined') return false;
  if (window.Razorpay) return true;
  return await new Promise<boolean>((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function PublicTemplateMarketplacePage(props: {
  settings: LandingSettings;
  softwareName: string;
  accentLabel: string;
}) {
  const { data: session, status } = useSession();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<'recent' | 'popular'>('recent');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(12);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [error, setError] = useState('');
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item) => map.set(item.templateSnapshot.category, (map.get(item.templateSnapshot.category) || 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 10);
  }, [items]);

  const categoryIcon = useMemo(() => {
    const map: Record<string, React.ComponentType<{ className?: string }>> = {
      Business: Building2,
      Legal: Gavel,
      Finance: Landmark,
      'HR': Users,
      'HR & Payroll': Users,
      Operations: ClipboardList,
      Sales: BadgePercent,
      Education: GraduationCap,
      General: FileText,
    };
    return (categoryName: string) => map[categoryName] || FileText;
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const url = new URL('/api/template-marketplace/items', window.location.origin);
        if (q.trim()) url.searchParams.set('q', q.trim());
        if (category.trim()) url.searchParams.set('category', category.trim());
        url.searchParams.set('limit', String(limit));
        url.searchParams.set('page', String(page));
        url.searchParams.set('sort', sort);
        const res = await fetch(url.toString(), { signal: controller.signal });
        const payload = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok) throw new Error(payload?.error || 'Unable to load marketplace.');
        const nextItems = Array.isArray(payload?.items) ? payload.items : [];
        setItems(nextItems);
        setTotal(Number(payload?.total || nextItems.length || 0));
        setLimit(Number(payload?.limit || limit));
      } catch (err) {
        if (!active) return;
        setItems([]);
        setError(err instanceof Error ? err.message : 'Unable to load marketplace.');
        setTotal(0);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }, 180);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [category, limit, page, q, sort]);

  useEffect(() => {
    setPage(1);
  }, [q, category, sort]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, limit))), [limit, total]);
  const visibleItems = items;

  const groupedItems = useMemo(() => {
    const groups = new Map<string, MarketplaceItem[]>();
    for (const item of visibleItems) {
      const key = item.templateSnapshot.category || 'General';
      groups.set(key, [...(groups.get(key) || []), item]);
    }
    // Stable order: category with more items first, then name.
    return Array.from(groups.entries())
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([categoryName, list]) => {
        const sorted = [...list].sort((x, y) => (y.purchaseCount || 0) - (x.purchaseCount || 0));
        const bestSellerId = sorted[0]?.id || '';
        return { categoryName, items: list, bestSellerId };
      });
  }, [visibleItems]);

  const purchase = async (item: MarketplaceItem) => {
    if (status !== 'authenticated' || !session?.user?.id) {
      window.location.href = '/login';
      return;
    }

    setPurchasingId(item.id);
    setError('');
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) throw new Error('Razorpay checkout is unavailable on this device.');

      const createRes = await fetch('/api/template-marketplace/purchase/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });
      const createPayload = await createRes.json().catch(() => null);
      if (!createRes.ok) throw new Error(createPayload?.error || 'Unable to start checkout.');

      const checkout = createPayload?.checkout as any;
      const purchaseId = String(createPayload?.purchase?.id || '');

      const instance = new window.Razorpay({
        key: checkout.keyId,
        amount: checkout.amountInPaise,
        currency: checkout.currency,
        name: checkout.name,
        description: checkout.description,
        order_id: checkout.orderId,
        prefill: checkout.prefill || {},
        notes: checkout.notes || {},
        theme: { color: '#2C5DA9' },
        handler: async (response: any) => {
          try {
            const verifyRes = await fetch('/api/template-marketplace/purchase/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                purchaseId,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verifyPayload = await verifyRes.json().catch(() => null);
            if (!verifyRes.ok) throw new Error(verifyPayload?.error || 'Payment verification failed.');
            window.location.href = '/workspace?tab=generate';
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Payment verification failed.');
          }
        },
      });
      instance.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to purchase template.');
    } finally {
      setPurchasingId(null);
    }
  };

  const shareMarketplaceItem = async (item: MarketplaceItem) => {
    const path = `/template-marketplace/${encodeURIComponent(item.id)}`;
    const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;
    const priceLabel = item.priceInPaise > 0 ? formatInr(item.priceInPaise) : 'Free';
    const text = `${item.templateSnapshot.name} · ${item.templateSnapshot.category} · ${priceLabel}\n${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: item.templateSnapshot.name, text, url });
        return;
      }
    } catch {
      // fallback to copy
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiedShareId(item.id);
      window.setTimeout(() => setCopiedShareId(null), 1600);
    } catch {
      // ignore
    }
  };

  const installFree = async (item: MarketplaceItem) => {
    if (status !== 'authenticated' || !session?.user?.id) {
      window.location.href = '/login';
      return;
    }
    setPurchasingId(item.id);
    setError('');
    try {
      const res = await fetch('/api/template-marketplace/install-free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Unable to install template.');
      window.location.href = '/workspace?tab=generate';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to install template.');
    } finally {
      setPurchasingId(null);
    }
  };

  return (
    <PublicSiteChrome softwareName={props.softwareName} accentLabel={props.accentLabel} settings={props.settings}>
      <section className="relative overflow-hidden rounded-[2rem] p-5 sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_16%,rgba(44,93,169,0.20),transparent_42%),radial-gradient(circle_at_86%_18%,rgba(200,218,249,0.68),transparent_44%),radial-gradient(circle_at_70%_82%,rgba(245,158,11,0.10),transparent_46%),linear-gradient(135deg,rgba(255,255,255,0.92),rgba(238,245,255,0.92))]" />

        <div className="relative">
          

          <div className="mt-6 grid gap-4">
            <div className="min-w-0">
              <h1 className="text-[clamp(1.65rem,4vw,2.6rem)] font-semibold leading-[1.05] tracking-[-0.08em] text-slate-950">
                Find the <span className="heading-accent-soft">perfect</span> template.
              </h1>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search templates..."
                    className="h-11 w-full rounded-full border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(244,248,255,0.74))] pl-11 pr-4 text-sm font-medium text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_36px_rgba(148,163,184,0.10)] outline-none backdrop-blur-2xl transition placeholder:text-slate-500 focus:border-slate-300"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSort((current) => (current === 'recent' ? 'popular' : 'recent'))}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 text-[12px] font-semibold text-slate-700 backdrop-blur-xl transition hover:bg-white/80"
                    title="Toggle sort"
                  >
                    <Tag className="h-4 w-4" />
                    {sort === 'popular' ? 'Popular' : 'Recent'}
                  </button>

                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 text-[12px] font-semibold text-slate-700 backdrop-blur-xl transition hover:bg-white/80"
                        title="Categories"
                      >
                        <FileText className="h-4 w-4" />
                        <span className="max-w-[8.5rem] truncate">{category || 'Categories'}</span>
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        align="end"
                        sideOffset={10}
                        collisionPadding={16}
                        className="navbar-glass z-[95] w-[min(calc(100vw-1.5rem),20rem)] rounded-[1.35rem] border-0 p-2 text-slate-950 shadow-[0_26px_64px_rgba(15,23,42,0.14)] backdrop-blur-2xl"
                      >
                        <div className="px-2 pb-2 pt-1">
                          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500">Categories</p>
                        </div>
                        <div className="space-y-1">
                          <DropdownMenu.Item asChild>
                            <button
                              type="button"
                              onClick={() => setCategory('')}
                              className={`flex w-full items-center justify-between gap-3 rounded-[1rem] px-3 py-3 text-left text-sm font-semibold outline-none transition hover:bg-white/70 focus:bg-white/70 ${
                                !category ? 'text-slate-950' : 'text-slate-700'
                              }`}
                            >
                              <span className="inline-flex items-center gap-2">
                                <Tag className="h-4 w-4 text-slate-500" />
                                All
                              </span>
                              {!category ? <span className="h-2 w-2 rounded-full bg-emerald-500" /> : null}
                            </button>
                          </DropdownMenu.Item>
                          {categories.map((c) => {
                            const Icon = categoryIcon(c);
                            return (
                              <DropdownMenu.Item key={c} asChild>
                                <button
                                  type="button"
                                  onClick={() => setCategory(c)}
                                  className={`flex w-full items-center justify-between gap-3 rounded-[1rem] px-3 py-3 text-left text-sm font-semibold outline-none transition hover:bg-white/70 focus:bg-white/70 ${
                                    category === c ? 'text-slate-950' : 'text-slate-700'
                                  }`}
                                >
                                  <span className="inline-flex items-center gap-2">
                                    <Icon className="h-4 w-4 text-slate-500" />
                                    {c}
                                  </span>
                                  {category === c ? <span className="h-2 w-2 rounded-full bg-emerald-500" /> : null}
                                </button>
                              </DropdownMenu.Item>
                            );
                          })}
                        </div>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>
              </div>
            </div>
          </div>

          {/* Categories are intentionally kept inside the dropdown for a cleaner marketplace surface. */}

          {error ? (
            <div className="mt-4 rounded-[1.25rem] border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-800">
              {error}
            </div>
          ) : null}

          <div className="mt-6 space-y-7">
            {loading ? (
	              <div className="-mx-4 sm:mx-0">
	                <div className="no-scrollbar mobile-slider-edge flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:snap-none sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
	                  {Array.from({ length: 6 }).map((_, idx) => (
	                    <div
	                      key={`tpl-skeleton-${idx}`}
	                      className="w-[76vw] max-w-[20rem] shrink-0 snap-start overflow-hidden rounded-[1.55rem] border border-white/65 bg-white/70 shadow-[0_14px_40px_rgba(15,23,42,0.05)] backdrop-blur-2xl sm:w-auto sm:max-w-none sm:shrink"
	                    >
	                      <div className="h-40 w-full animate-pulse bg-[linear-gradient(90deg,rgba(148,163,184,0.10),rgba(148,163,184,0.18),rgba(148,163,184,0.10))] sm:h-44" />
	                      <div className="space-y-3 p-4">
	                        <div className="flex items-center justify-between gap-3">
	                          <div className="h-6 w-24 animate-pulse rounded-full bg-slate-200/50" />
	                          <div className="h-6 w-16 animate-pulse rounded-full bg-slate-200/50" />
	                        </div>
                        <div className="h-5 w-3/4 animate-pulse rounded-full bg-slate-200/50" />
                        <div className="h-4 w-full animate-pulse rounded-full bg-slate-200/40" />
                        <div className="h-4 w-5/6 animate-pulse rounded-full bg-slate-200/40" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : groupedItems.length ? (
              groupedItems.map((group) => {
                const Icon = categoryIcon(group.categoryName);
                return (
                  <section key={`tplcat-${group.categoryName}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/70 bg-white/70 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-xl">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold tracking-[-0.02em] text-slate-950">{group.categoryName}</p>
                          <p className="text-xs text-slate-500">{group.items.length} templates</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCategory(group.categoryName);
                        }}
                        className="rounded-full bg-white/70 px-4 py-2 text-xs font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-xl transition hover:bg-white hover:text-slate-950"
                      >
                        View all
                      </button>
                    </div>

                    <div className="-mx-4 sm:mx-0">
                      <div className="no-scrollbar mobile-slider-edge mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:snap-none sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
                        {group.items
                          .slice()
                          .sort((a, b) => (b.purchaseCount || 0) - (a.purchaseCount || 0))
                          .slice(0, 8)
	                          .map((item) => {
	                            const isBestSeller = item.id === group.bestSellerId && (item.purchaseCount || 0) >= 20;
	                            return (
	                              <Link
	                                key={item.id}
	                                href={`/template-marketplace/${encodeURIComponent(item.id)}`}
	                                className="group relative w-[76vw] max-w-[20rem] shrink-0 snap-start overflow-hidden rounded-[1.55rem] border border-white/65 bg-white/70 shadow-[0_14px_40px_rgba(15,23,42,0.06)] backdrop-blur-2xl transition hover:bg-white/80 hover:shadow-[0_18px_56px_rgba(15,23,42,0.08)] sm:w-auto sm:max-w-none sm:shrink"
	                              >
	                              <div className="relative">
	                                {item.coverImageDataUrl ? (
	                                  // eslint-disable-next-line @next/next/no-img-element
	                                  <img src={item.coverImageDataUrl} alt="" className="h-40 w-full object-cover sm:h-44" />
	                                ) : (
	                                  <div className="relative h-40 w-full bg-[radial-gradient(circle_at_18%_22%,rgba(44,93,169,0.72),transparent_56%),radial-gradient(circle_at_86%_28%,rgba(245,158,11,0.38),transparent_62%),linear-gradient(135deg,rgba(2,6,23,0.96),rgba(15,23,42,0.96))] sm:h-44">
	                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_70%,rgba(200,218,249,0.16),transparent_58%)]" />
	                                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.15),rgba(0,0,0,0.50))]" />
	                                    <div className="absolute inset-x-4 bottom-4">
	                                      <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-white drop-shadow-[0_10px_26px_rgba(0,0,0,0.55)]">
	                                        {item.templateSnapshot.name}
	                                      </p>
	                                    </div>
	                                  </div>
	                                )}
	                                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.00),rgba(2,6,23,0.08),rgba(2,6,23,0.20))]" />

	                                <div className="absolute left-4 top-4 flex flex-wrap gap-2">
	                                  {isBestSeller ? (
	                                    <span className="inline-flex items-center rounded-full bg-amber-500/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white shadow-[0_12px_28px_rgba(245,158,11,0.18)]">
	                                      Bestseller
	                                    </span>
	                                  ) : null}
	                                </div>

	                                <button
	                                  type="button"
	                                  onClick={(e) => {
	                                    e.preventDefault();
	                                    e.stopPropagation();
	                                    void shareMarketplaceItem(item);
	                                  }}
	                                  className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/60 bg-white/80 text-slate-700 shadow-[0_16px_46px_rgba(15,23,42,0.10)] backdrop-blur-2xl transition hover:bg-white hover:text-slate-950"
	                                  aria-label="Share template"
	                                  title={copiedShareId === item.id ? 'Copied' : 'Share'}
	                                >
	                                  {copiedShareId === item.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
	                                </button>
	                              </div>
	
	                              <div className="p-4 sm:p-4">
	                                <div className="flex flex-wrap items-center justify-between gap-2">
	                                  <span className="rounded-full border border-white/75 bg-white/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
	                                    {item.templateSnapshot.category}
	                                  </span>
	                                  <span className="text-sm font-semibold text-slate-950">
	                                    {item.priceInPaise > 0 ? formatInr(item.priceInPaise) : 'Free'}
	                                  </span>
	                                </div>
	                                {item.coverImageDataUrl ? (
	                                  <p className="mt-2 truncate text-[15px] font-semibold tracking-[-0.02em] text-slate-950">
	                                    {item.templateSnapshot.name}
	                                  </p>
	                                ) : null}
	                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
	                                  <span className="inline-flex items-center gap-1">
	                                    <Star className="h-3.5 w-3.5 text-amber-500" />
	                                    {item.rating?.count ? `${item.rating.average} (${item.rating.count})` : 'New'}
	                                  </span>
	                                  <span>{Math.max(0, item.openCount || 0)} views</span>
	                                </div>
	                                <div className="mt-3 flex items-center justify-between gap-3">
	                                  <p className="truncate text-xs text-slate-500">{item.sellerName ? `by ${item.sellerName}` : 'Verified publisher'}</p>
	                                  <Button
	                                    type="button"
	                                    className="h-9 rounded-full bg-slate-950 px-4 text-[13px] font-semibold text-white hover:bg-slate-800"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      if (item.priceInPaise > 0) void purchase(item);
                                      else void installFree(item);
                                    }}
                                    disabled={purchasingId === item.id}
                                  >
                                    <ShoppingCart className="mr-2 h-4 w-4" />
                                    {purchasingId === item.id ? 'Starting…' : item.priceInPaise > 0 ? 'Buy' : 'Install'}
                                  </Button>
                                </div>
                              </div>
                              </Link>
                            );
                          })}
                      </div>
                    </div>
                  </section>
                );
              })
            ) : (
              <div className="rounded-[1.5rem] border border-white/70 bg-white/70 p-5 text-sm text-slate-600">
                No templates found yet.
              </div>
            )}
          </div>

          {!loading && pageCount > 1 ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-600">
                Page <span className="font-semibold text-slate-900">{page}</span> of{' '}
                <span className="font-semibold text-slate-900">{pageCount}</span>
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-full border-0 bg-white/70 px-4 text-sm font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] hover:bg-white hover:text-slate-950"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Prev
                </Button>
                <Button
                  type="button"
                  className="h-10 rounded-full bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page >= pageCount}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </PublicSiteChrome>
  );
}
