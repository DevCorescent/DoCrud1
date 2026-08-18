'use client';

/**
 * Enquiry dialog for a service.
 *
 * The service and provider are passed in from the page the user is already
 * looking at and are shown read-only — the person never retypes them, and the
 * server re-resolves both from the service record regardless of what arrives.
 *
 * On a validation or server error the form stays exactly as the user left it,
 * submit re-enables, and nothing claims success.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X, Check, Loader2 } from 'lucide-react';

type Props = {
  serviceId: string;
  serviceTitle: string;
  providerName: string;
  onClose: () => void;
};

type Sent = { id: string; reference: string; serviceTitle: string };

const CONTACT_OPTIONS: Array<{ id: 'platform' | 'email' | 'phone'; label: string }> = [
  { id: 'platform', label: 'On Docrud' },
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone' },
];

const inputCls =
  'h-10 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] text-white placeholder:text-white/25 focus:border-white/25 focus:outline-none';
const labelCls = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-white/35';

export function EnquireDialog({ serviceId, serviceTitle, providerName, onClose }: Props) {
  const [message, setMessage] = useState('');
  const [budget, setBudget] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [contactMethod, setContactMethod] = useState<'platform' | 'email' | 'phone'>('platform');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);

  /* setState is async, so a second click can land before `busy` re-renders.
     The ref closes that window — one submission per click, always. */
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
      const res = await fetch('/api/services/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId,
          message,
          budget: budget || undefined,
          preferredStartDate: startDate || undefined,
          expectedCompletionDate: endDate || undefined,
          contactMethod,
          phone: phone || undefined,
          company: company || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401) { setNeedsAuth(true); return; }
      if (!res.ok) { setError(data?.error || 'Could not send your enquiry.'); return; }
      setSent({
        id: data.enquiry.id,
        reference: data.enquiry.reference,
        serviceTitle: data.enquiry.serviceTitle,
      });
    } catch {
      setError('Could not send your enquiry. Check your connection and try again.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/65" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Enquire about ${serviceTitle}`}
        className="relative max-h-[88vh] w-full overflow-y-auto rounded-t-[20px] border border-white/[0.08] bg-[#0d0d10] sm:max-w-lg sm:rounded-[20px]"
      >
        <div className="sticky top-0 flex items-center gap-3 border-b border-white/[0.06] bg-[#0d0d10] px-5 py-3.5">
          <p className="text-[14px] font-bold text-white">{sent ? 'Enquiry sent' : 'Enquire'}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto text-white/40 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {sent ? (
          <div className="px-5 py-6 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15">
              <Check className="h-5 w-5 text-emerald-400" />
            </div>
            <p className="mt-3 text-[15px] font-bold text-white">Enquiry sent successfully</p>
            <p className="mx-auto mt-1.5 max-w-xs text-[12.5px] leading-relaxed text-white/45">
              <span className="text-white/70">{providerName}</span> has your enquiry about{' '}
              <span className="text-white/70">{sent.serviceTitle}</span>.
            </p>
            <p className="mt-2.5 inline-block rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11.5px] font-semibold tracking-wide text-white/60">
              {sent.reference}
            </p>
            {/* Only one destination is offered, because only one exists.
                There is no enquiry-detail screen yet, so no link pretends to be one. */}
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
            {/* Read-only context — never retyped, never client-trusted. */}
            <div className="rounded-[14px] border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">Service</p>
              <p className="mt-1 truncate text-[13.5px] font-semibold text-white">{serviceTitle}</p>
              <p className="mt-0.5 truncate text-[12px] text-white/40">with {providerName}</p>
            </div>

            <div>
              <label htmlFor="enq-message" className={labelCls}>What do you need? *</label>
              <textarea
                id="enq-message"
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={4}
                placeholder="Describe what you're looking for, and anything the provider should know."
                className="w-full resize-y rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] leading-relaxed text-white placeholder:text-white/25 focus:border-white/25 focus:outline-none"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="enq-budget" className={labelCls}>Budget</label>
                <input id="enq-budget" value={budget} onChange={e => setBudget(e.target.value)} placeholder="e.g. ₹40,000" className={inputCls} />
              </div>
              <div>
                <label htmlFor="enq-company" className={labelCls}>Company / project</label>
                <input id="enq-company" value={company} onChange={e => setCompany(e.target.value)} placeholder="Optional" className={inputCls} />
              </div>
              <div>
                <label htmlFor="enq-start" className={labelCls}>Preferred start</label>
                <input id="enq-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="enq-end" className={labelCls}>Needed by</label>
                <input id="enq-end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls} />
              </div>
            </div>

            <div>
              <span className={labelCls}>Preferred contact</span>
              <div className="flex flex-wrap gap-1.5">
                {CONTACT_OPTIONS.map(o => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setContactMethod(o.id)}
                    aria-pressed={contactMethod === o.id}
                    className={`rounded-full border px-3 py-1.5 text-[12px] transition ${
                      contactMethod === o.id
                        ? 'border-white/25 bg-white/[0.08] text-white'
                        : 'border-white/[0.08] text-white/55 hover:bg-white/[0.04]'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {contactMethod === 'phone' && (
              <div>
                <label htmlFor="enq-phone" className={labelCls}>Phone *</label>
                <input id="enq-phone" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="Where they should call you" className={inputCls} />
              </div>
            )}

            {needsAuth && (
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2.5">
                <p className="text-[12.5px] text-amber-200/90">
                  Sign in to send this enquiry.{' '}
                  <Link href="/onboarding" className="font-semibold underline">Sign in</Link>
                </p>
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-red-500/25 bg-red-500/[0.07] px-3 py-2.5">
                <p className="text-[12.5px] text-red-200/90">{error}</p>
              </div>
            )}

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
                Send enquiry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
