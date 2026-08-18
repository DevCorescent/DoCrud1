'use client';

/**
 * §26 Saved services — the shortlist a customer builds before deciding whom to
 * contact. Reads from /api/services/saves; rows whose service was deleted or
 * unpublished stay visible but disabled, so a removed listing is explained
 * rather than silently vanishing.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Bookmark, Loader2, Star, Trash2 } from 'lucide-react';

interface SavedItem {
  saveId: string;
  serviceId: string;
  savedAt: string;
  available: boolean;
  title?: string;
  tagline?: string;
  category?: string;
  imageUrl?: string;
  currency?: string;
  basePrice?: number;
  pricingModel?: string;
  rating?: number;
  reviewCount?: number;
  providerId?: string;
  providerName?: string;
  href?: string | null;
}

function priceLabel(item: SavedItem) {
  if (item.pricingModel === 'contact') return 'Contact for quote';
  if (item.basePrice == null) return null;
  const c = item.currency ?? 'INR';
  const sym = c === 'INR' ? '₹' : c === 'USD' ? '$' : c === 'EUR' ? '€' : `${c} `;
  const amount = `${sym}${item.basePrice.toLocaleString()}`;
  if (item.pricingModel === 'hourly') return `${amount}/hr`;
  if (item.pricingModel === 'starting_from') return `From ${amount}`;
  return amount;
}

function savedOn(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function SavedServicesCenter() {
  const { status } = useSession();
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/services/saves');
      if (res.status === 401) { setItems([]); return; }
      const d = await res.json().catch(() => null) as { items?: SavedItem[]; error?: string } | null;
      if (!res.ok) { setError(d?.error || 'Could not load your saved services.'); return; }
      setItems(d?.items ?? []);
    } catch {
      setError('Network error while loading saved services.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') { setLoading(false); return; }
    void load();
  }, [status, load]);

  async function remove(serviceId: string) {
    setRemoving(serviceId);
    try {
      const res = await fetch(`/api/services/saves?serviceId=${encodeURIComponent(serviceId)}`, { method: 'DELETE' });
      if (!res.ok) { setError('Could not remove this saved service.'); return; }
      setItems((prev) => prev.filter((i) => i.serviceId !== serviceId));
    } catch {
      setError('Network error while removing.');
    } finally {
      setRemoving(null);
    }
  }

  if (status === 'unauthenticated') {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] border border-white/[0.08] bg-white/[0.04]">
          <Bookmark className="h-5 w-5 text-white/30" />
        </div>
        <p className="text-[15px] font-bold text-white">Sign in to see your saved services</p>
        <p className="mt-2 text-[12.5px] text-white/40">Your shortlist follows your account, not this device.</p>
        <Link
          href="/login"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-[13px] px-6 text-[13px] font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5">
        <h1 className="text-[20px] font-black tracking-tight text-white sm:text-[24px]">Saved Services</h1>
        <p className="mt-1 text-[12.5px] text-white/40">
          Your shortlist. Revisit these before deciding whom to contact.
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-[10px] border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-[96px] animate-pulse rounded-[18px] bg-white/[0.04]" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-14 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] border border-white/[0.08] bg-white/[0.04]">
            <Bookmark className="h-5 w-5 text-white/30" />
          </div>
          <p className="text-[14px] font-bold text-white/80">No saved services yet</p>
          <p className="mt-1.5 text-[12.5px] text-white/40">Save services you want to revisit later.</p>
          <Link
            href="/people"
            className="mt-5 inline-flex h-10 items-center justify-center rounded-[12px] border border-white/[0.10] bg-white/[0.05] px-5 text-[12.5px] font-semibold text-white/70 transition hover:bg-white/[0.09] hover:text-white"
          >
            Browse Services
          </Link>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => {
            const price = priceLabel(item);
            const body = (
              <div className="flex items-start gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[12px] border border-white/[0.08] bg-white/[0.04]">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt={item.title ?? 'Service'} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[18px] opacity-40">🎨</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-bold text-white/90">
                    {item.title ?? 'Service no longer available'}
                  </p>
                  {item.providerName && <p className="truncate text-[11.5px] text-white/45">{item.providerName}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-white/30">
                    {item.category && <span className="capitalize">{item.category}</span>}
                    {price && <span>· {price}</span>}
                    {item.rating != null && item.rating > 0 && (
                      <span className="inline-flex items-center gap-1">
                        · <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                        {item.rating}{item.reviewCount ? ` (${item.reviewCount})` : ''}
                      </span>
                    )}
                    <span>· Saved {savedOn(item.savedAt)}</span>
                  </div>
                  {!item.available && (
                    <p className="mt-1 text-[10.5px] text-amber-300/70">
                      This service is no longer available.
                    </p>
                  )}
                </div>
              </div>
            );

            return (
              <li
                key={item.saveId}
                className="rounded-[18px] border border-white/[0.06] bg-white/[0.02] p-4 transition-all hover:border-white/[0.12]"
              >
                {item.available && item.href ? (
                  <Link href={item.href} className="block">{body}</Link>
                ) : (
                  <div className="opacity-70">{body}</div>
                )}
                <div className="mt-3 flex items-center justify-end gap-2 border-t border-white/[0.05] pt-3">
                  {item.available && item.href && (
                    <Link
                      href={item.href}
                      className="rounded-[10px] border border-white/[0.10] bg-white/[0.05] px-3 py-1.5 text-[11.5px] font-semibold text-white/65 transition hover:text-white"
                    >
                      Open service
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => void remove(item.serviceId)}
                    disabled={removing === item.serviceId}
                    className="inline-flex items-center gap-1.5 rounded-[10px] border border-rose-500/20 bg-rose-500/[0.08] px-3 py-1.5 text-[11.5px] font-semibold text-rose-300/80 transition hover:bg-rose-500/15 disabled:opacity-50"
                  >
                    {removing === item.serviceId
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Trash2 className="h-3 w-3" />}
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
