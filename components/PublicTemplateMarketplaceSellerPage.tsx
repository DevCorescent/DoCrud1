'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import type { LandingSettings } from '@/types/document';

type MarketplaceItem = {
  id: string;
  templateSnapshot: { name: string; category: string; description?: string };
  sellerUserId: string;
  sellerName?: string;
  priceInPaise: number;
  tags: string[];
  coverImageDataUrl?: string;
  purchaseCount: number;
  updatedAt: string;
};

function formatInr(paise: number) {
  const value = Math.max(0, Number(paise || 0)) / 100;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export default function PublicTemplateMarketplaceSellerPage(props: {
  settings: LandingSettings;
  softwareName: string;
  accentLabel: string;
  sellerUserId: string;
}) {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const res = await fetch(`/api/template-marketplace/seller/${encodeURIComponent(props.sellerUserId)}`, { signal: controller.signal });
        const payload = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok) throw new Error(payload?.error || 'Unable to load seller.');
        setItems(Array.isArray(payload.items) ? payload.items : []);
      } catch (err) {
        if (!active) return;
        setItems([]);
        setError(err instanceof Error ? err.message : 'Unable to load seller.');
      } finally {
        if (!active) return;
        setLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [props.sellerUserId]);

  const sellerName = useMemo(() => items.find(Boolean)?.sellerName || 'Seller', [items]);

  return (
    <PublicSiteChrome softwareName={props.softwareName} accentLabel={props.accentLabel} settings={props.settings}>
      <section className="cloud-panel relative overflow-hidden rounded-[2rem] border border-white/60 p-5 shadow-[0_22px_60px_rgba(148,163,184,0.14)] sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(44,93,169,0.26),transparent_40%),radial-gradient(circle_at_86%_18%,rgba(232,84,69,0.20),transparent_45%),linear-gradient(135deg,rgba(255,255,255,0.92),rgba(236,244,255,0.84),rgba(255,255,255,0.80))]" />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/template-marketplace" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-950">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 backdrop-blur-xl">
              <Sparkles className="h-4 w-4 text-sky-700" />
              {sellerName}
            </div>
          </div>

          {error ? (
            <div className="mt-6 rounded-[1.5rem] border border-rose-200 bg-rose-50/80 p-6 text-sm text-rose-800">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {loading ? (
              <div className="rounded-[1.5rem] border border-white/70 bg-white/70 p-5 text-sm text-slate-600">Loading…</div>
            ) : items.length ? (
              items.map((item) => (
                <Link
                  key={item.id}
                  href={`/template-marketplace/${encodeURIComponent(item.id)}`}
                  className="group overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/72 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-2xl transition hover:bg-white/82"
                >
                  {item.coverImageDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.coverImageDataUrl} alt="" className="h-40 w-full object-cover" />
                  ) : (
                    <div className="h-40 w-full bg-[radial-gradient(circle_at_20%_20%,rgba(44,93,169,0.28),transparent_50%),radial-gradient(circle_at_80%_30%,rgba(232,84,69,0.18),transparent_55%),linear-gradient(135deg,rgba(255,255,255,0.94),rgba(236,244,255,0.76))]" />
                  )}
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full border border-white/80 bg-white/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                        {item.templateSnapshot.category}
                      </span>
                      <span className="text-sm font-semibold text-slate-950">{item.priceInPaise > 0 ? formatInr(item.priceInPaise) : 'Free'}</span>
                    </div>
                    <p className="mt-3 truncate text-base font-semibold tracking-[-0.02em] text-slate-950">{item.templateSnapshot.name}</p>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{item.templateSnapshot.description || 'Marketplace template'}</p>
                    <p className="mt-3 text-xs text-slate-500">{Math.max(0, item.purchaseCount || 0)} installs</p>
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-white/70 bg-white/70 p-5 text-sm text-slate-600">No templates yet.</div>
            )}
          </div>
        </div>
      </section>
    </PublicSiteChrome>
  );
}

