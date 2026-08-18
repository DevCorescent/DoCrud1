'use client';

/**
 * Book Service dialog.
 *
 * Distinct from EnquireDialog: this one proposes work, so it selects a package
 * and collects dates. Prices shown here come from the service record and are
 * display-only — the server re-resolves the real price from the chosen package
 * name, so what the user sees can never become what the user pays.
 *
 * No payment step exists, and nothing here implies one. The dialog says the
 * provider will confirm.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X, Check, Loader2 } from 'lucide-react';
import { currencySymbol, formatServicePrice } from '@/lib/services-ui';

export type BookablePackage = {
  name: string; description: string; price: number;
  deliveryTime: number; deliveryUnit: string; features: string[];
};

type Props = {
  serviceId: string;
  serviceTitle: string;
  providerName: string;
  packages: BookablePackage[] | null;
  pricing: { pricingModel: string; basePrice: number; currency: string };
  onClose: () => void;
};

type Sent = {
  reference: string; serviceTitle: string;
  packageName: string | null; price: number | null; currency: string; status: string;
};

const inputCls =
  'h-10 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] text-white placeholder:text-white/25 focus:border-white/25 focus:outline-none';
const labelCls = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-white/35';

export function BookServiceDialog({
  serviceId, serviceTitle, providerName, packages, pricing, onClose,
}: Props) {
  const [pkg, setPkg] = useState<string | null>(packages?.[0]?.name ?? null);
  const [requirements, setRequirements] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);

  /* setState is async, so a second click can land before `busy` re-renders. */
  const submitting = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    setNeedsAuth(false);
    try {
      const res = await fetch('/api/services/booking-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        /* Only the package NAME is sent. The price is the server's to decide. */
        body: JSON.stringify({
          serviceId,
          packageName: pkg || undefined,
          requirements,
          preferredStartDate: startDate || undefined,
          expectedCompletionDate: endDate || undefined,
          phone: phone || undefined,
          notes: notes || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401) { setNeedsAuth(true); return; }
      if (!res.ok) { setError(data?.error || 'Could not send your booking request.'); return; }
      setSent(data.booking);
    } catch {
      setError('Could not send your booking request. Check your connection and try again.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const sym = currencySymbol(pricing.currency);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/65" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Book ${serviceTitle}`}
        className="relative max-h-[88vh] w-full overflow-y-auto rounded-t-[20px] border border-white/[0.08] bg-[#0d0d10] sm:max-w-lg sm:rounded-[20px]"
      >
        <div className="sticky top-0 flex items-center gap-3 border-b border-white/[0.06] bg-[#0d0d10] px-5 py-3.5">
          <p className="text-[14px] font-bold text-white">{sent ? 'Booking requested' : 'Book service'}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto text-white/40 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {sent ? (
          <div className="px-5 py-6 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15">
              <Check className="h-5 w-5 text-emerald-400" />
            </div>
            <p className="mt-3 text-[15px] font-bold text-white">Booking request sent</p>
            <p className="mx-auto mt-1.5 max-w-xs text-[12.5px] leading-relaxed text-white/45">
              <span className="text-white/70">{providerName}</span> will review your request for{' '}
              <span className="text-white/70">{sent.serviceTitle}</span>
              {sent.packageName && <> — <span className="text-white/70">{sent.packageName}</span></>}.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11.5px] font-semibold tracking-wide text-white/60">
                {sent.reference}
              </span>
              <span className="rounded-full border border-amber-200/[0.18] bg-amber-200/[0.10] px-3 py-1 text-[11.5px] font-semibold text-amber-200/90">
                Requested
              </span>
              {sent.price !== null && (
                <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11.5px] font-semibold text-white/60">
                  {currencySymbol(sent.currency)}{sent.price.toLocaleString()}
                </span>
              )}
            </div>
            {/* No payment was taken and no booking-detail screen exists, so
                neither is implied and no link pretends to be one. */}
            <p className="mx-auto mt-3 max-w-xs text-[11px] leading-relaxed text-white/30">
              Nothing has been charged. The provider confirms before any work starts.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-full bg-white px-4 py-2.5 text-[12.5px] font-bold text-[#0D0D0F] hover:bg-white/90"
            >
              Continue browsing
            </button>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-4">
            <div className="rounded-[14px] border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">Service</p>
              <p className="mt-1 truncate text-[13.5px] font-semibold text-white">{serviceTitle}</p>
              <p className="mt-0.5 truncate text-[12px] text-white/40">with {providerName}</p>
            </div>

            {/* Real packages only. With none, the service's own pricing shows. */}
            {packages && packages.length > 0 ? (
              <div>
                <span className={labelCls}>Choose a package</span>
                <div className="space-y-2">
                  {packages.map(p => {
                    const on = pkg === p.name;
                    return (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => setPkg(p.name)}
                        aria-pressed={on}
                        className={`w-full rounded-[14px] border p-3 text-left transition ${
                          on ? 'border-white/30 bg-white/[0.07]' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]'
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[13px] font-bold text-white">{p.name}</span>
                          <span className="text-[13px] font-bold text-white">{sym}{p.price.toLocaleString()}</span>
                        </div>
                        {p.description && <p className="mt-0.5 text-[11.5px] text-white/45">{p.description}</p>}
                        {p.deliveryTime > 0 && (
                          <p className="mt-1 text-[11.5px] text-white/40">{p.deliveryTime} {p.deliveryUnit} delivery</p>
                        )}
                        {p.features?.length > 0 && (
                          <p className="mt-1 line-clamp-2 text-[11.5px] text-white/40">{p.features.join(' · ')}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-[14px] border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">Pricing</p>
                <p className="mt-1 text-[15px] font-bold text-white">{formatServicePrice(pricing)}</p>
              </div>
            )}

            <div>
              <label htmlFor="bk-req" className={labelCls}>Project requirements *</label>
              <textarea
                id="bk-req"
                value={requirements}
                onChange={e => setRequirements(e.target.value)}
                rows={4}
                placeholder="What needs doing, and what does success look like?"
                className="w-full resize-y rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] leading-relaxed text-white placeholder:text-white/25 focus:border-white/25 focus:outline-none"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="bk-start" className={labelCls}>Preferred start</label>
                <input id="bk-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="bk-end" className={labelCls}>Needed by</label>
                <input id="bk-end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls} />
              </div>
            </div>

            <div>
              <label htmlFor="bk-phone" className={labelCls}>Contact number</label>
              <input id="bk-phone" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="Optional" className={inputCls} />
            </div>

            <div>
              <label htmlFor="bk-notes" className={labelCls}>Additional notes</label>
              <textarea
                id="bk-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Optional"
                className="w-full resize-y rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] leading-relaxed text-white placeholder:text-white/25 focus:border-white/25 focus:outline-none"
              />
            </div>

            {needsAuth && (
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2.5">
                <p className="text-[12.5px] text-amber-200/90">
                  Sign in to book this service.{' '}
                  <Link href="/onboarding" className="font-semibold underline">Sign in</Link>
                </p>
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-red-500/25 bg-red-500/[0.07] px-3 py-2.5">
                <p className="text-[12.5px] text-red-200/90">{error}</p>
              </div>
            )}

            <p className="text-[11px] leading-relaxed text-white/30">
              Sending a request does not charge you. The provider reviews and confirms first.
            </p>

            <div className="flex gap-2 pb-1">
              <button type="button" onClick={onClose} className="flex-1 rounded-full border border-white/[0.10] py-2.5 text-[12.5px] font-semibold text-white/60 hover:bg-white/[0.04]">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white py-2.5 text-[12.5px] font-bold text-[#0D0D0F] hover:bg-white/90 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Request booking
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
