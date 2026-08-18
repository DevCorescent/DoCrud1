'use client';

/**
 * §19–21 Book Service — the structured counterpart to Enquire (§24).
 *
 * Package / Pricing → Requirements → Timeline → Review → Send Booking Request.
 * No payment step: the PDF specifies a Booking Request model initially, and the
 * product has no service-payment flow to hook into.
 *
 * Standalone by design — mount it, pass the service, handle onClose. It talks
 * only to POST /api/services/bookings.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowLeft, ArrowRight, Check, Loader2, MessageSquare, Paperclip, X } from 'lucide-react';

/* ─── contract ─────────────────────────────────────────────────────────── */

export interface BookingWizardPackage {
  name: string;
  description?: string;
  price: number;
  deliveryTime?: number;
  deliveryUnit?: string;
  features?: string[];
}

export interface ServiceBookingWizardService {
  id: string;
  title: string;
  currency?: string;
  basePrice?: number;
  pricingModel?: string;
  packages?: BookingWizardPackage[];
  providerName?: string;
  userId?: string;
}

export interface ServiceBookingWizardProps {
  service: ServiceBookingWizardService;
  onClose: () => void;
  /** Fired once the request is stored, with the booking + lead ids. */
  onSubmitted?: (result: { bookingId: string; leadId?: string; conversationId?: string; duplicate: boolean }) => void;
}

interface Attachment { url: string; name: string; size?: number; mimeType?: string }

interface BookingResponse {
  duplicate?: boolean;
  booking?: { id: string; leadId?: string; conversationId?: string };
  lead?: { id: string; type: string; status: string } | null;
  conversation?: { id: string; href: string } | null;
  provider?: { id: string; name: string };
  error?: string;
}

const STEPS = ['Package', 'Requirements', 'Timeline', 'Review'] as const;
type StepIndex = 0 | 1 | 2 | 3;

const REQUIREMENT_MIN = 10;
const REQUIREMENT_MAX = 4000;
const NOTES_MAX = 1000;
const MAX_ATTACHMENTS = 5;

const CURRENCY_SYMBOL: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

const fieldClass =
  'w-full rounded-[12px] border border-white/[0.09] bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-white placeholder-white/20 outline-none focus:border-violet-500/50 focus:bg-violet-500/[0.04] transition-all';
const labelClass = 'block text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/40 mb-1.5';

export default function ServiceBookingWizard({ service, onClose, onSubmitted }: ServiceBookingWizardProps) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated';

  const packages = useMemo(() => service.packages ?? [], [service.packages]);
  const hasPackages = packages.length > 0;
  const currency = service.currency || 'INR';
  const sym = CURRENCY_SYMBOL[currency] ?? `${currency} `;

  /* Services without packages skip straight to requirements (§20 graceful case). */
  const firstStep: StepIndex = hasPackages ? 0 : 1;
  const [step, setStep] = useState<StepIndex>(firstStep);

  const [packageName, setPackageName] = useState(hasPackages ? packages[0].name : '');
  const [requirement, setRequirement] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [startDate, setStartDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');

  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BookingResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Guards a double-tapped submit before the server's duplicate window sees it. */
  const submitLock = useRef(false);

  const selectedPackage = packages.find((p) => p.name === packageName);
  const price = selectedPackage ? selectedPackage.price : service.basePrice ?? 0;
  const isQuoteOnly = service.pricingModel === 'contact';
  const providerLabel = service.providerName || 'the provider';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [onClose]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError('');
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) { setError(`You can attach up to ${MAX_ATTACHMENTS} files.`); return; }
    setUploading(true);
    try {
      const uploaded: Attachment[] = [];
      for (const file of Array.from(files).slice(0, room)) {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/messages/upload', { method: 'POST', body: form });
        const data = await res.json().catch(() => null) as (Attachment & { error?: string }) | null;
        if (!res.ok || !data?.url) { setError(data?.error || `Could not upload ${file.name}.`); break; }
        uploaded.push({ url: data.url, name: data.name || file.name, size: data.size, mimeType: data.mimeType });
      }
      if (uploaded.length) setAttachments((prev) => [...prev, ...uploaded].slice(0, MAX_ATTACHMENTS));
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [attachments.length]);

  /** Per-step gate — Next stays disabled until the step is valid. */
  function stepError(target: StepIndex): string {
    if (target === 0 && hasPackages && !packageName) return 'Choose a package to continue.';
    if (target === 1 && requirement.trim().length < REQUIREMENT_MIN) {
      return `Describe your requirements in at least ${REQUIREMENT_MIN} characters.`;
    }
    if (target === 2) {
      if (startDate && deliveryDate && startDate > deliveryDate) return 'Expected delivery cannot be before the start date.';
      if (budgetMin && budgetMax && Number(budgetMin) > Number(budgetMax)) return 'Budget minimum cannot exceed the maximum.';
    }
    return '';
  }

  function goNext() {
    const err = stepError(step);
    if (err) { setError(err); return; }
    setError('');
    setStep((s) => Math.min(3, s + 1) as StepIndex);
  }

  function goBack() {
    setError('');
    setStep((s) => Math.max(firstStep, s - 1) as StepIndex);
  }

  async function handleSubmit() {
    if (submitting || submitLock.current) return;
    for (const s of [0, 1, 2] as StepIndex[]) {
      const err = stepError(s);
      if (err) { setError(err); setStep(s); return; }
    }
    submitLock.current = true;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/services/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          serviceId: service.id,
          requirement: requirement.trim(),
          ...(packageName ? { packageName } : {}),
          ...(startDate ? { scheduledDate: startDate } : {}),
          ...(deliveryDate ? { expectedDeliveryDate: deliveryDate } : {}),
          ...(budgetMin ? { budgetMin: Number(budgetMin) } : {}),
          ...(budgetMax ? { budgetMax: Number(budgetMax) } : {}),
          ...(clientPhone.trim() ? { clientPhone: clientPhone.trim() } : {}),
          ...(additionalNotes.trim() ? { additionalNotes: additionalNotes.trim() } : {}),
          ...(attachments.length ? { attachments } : {}),
        }),
      });
      const data = await res.json().catch(() => null) as BookingResponse | null;
      if (!res.ok || !data?.booking) {
        setError(data?.error || 'Failed to send booking request. Please try again.');
        submitLock.current = false;
        return;
      }
      setResult(data);
      onSubmitted?.({
        bookingId: data.booking.id,
        leadId: data.lead?.id,
        conversationId: data.conversation?.id,
        duplicate: Boolean(data.duplicate),
      });
    } catch {
      setError('Network error. Please try again.');
      submitLock.current = false;
    } finally {
      setSubmitting(false);
    }
  }

  const reviewRows: Array<[string, string]> = [
    ['Service', service.title],
    ['Provider', providerLabel],
    ['Package', selectedPackage?.name ?? (hasPackages ? '—' : 'Standard service')],
    ['Price', isQuoteOnly ? 'Contact for quote' : `${sym}${price.toLocaleString()}`],
    ['Start date', startDate || 'Flexible'],
    ['Expected delivery', deliveryDate || 'To be agreed'],
    ['Budget', budgetMin || budgetMax
      ? `${sym}${(budgetMin || '0')}${budgetMax ? ` – ${sym}${budgetMax}` : '+'}`
      : '—'],
    ['Contact', [session?.user?.name, session?.user?.email, clientPhone].filter(Boolean).join(' · ') || '—'],
    ['Attachments', attachments.length ? `${attachments.length} file${attachments.length === 1 ? '' : 's'}` : 'None'],
  ];

  const activeStepNumber = STEPS.indexOf(STEPS[step]) + 1;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Book ${service.title}`}
        className="relative z-10 w-full sm:max-w-lg max-h-[92vh] sm:max-h-[90vh] flex flex-col bg-[#0E0E10] border border-white/[0.09] rounded-t-[24px] sm:rounded-[24px] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.95)]"
      >
        {/* Header */}
        <div
          className="relative shrink-0 px-5 sm:px-6 py-4 border-b border-white/[0.07]"
          style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.08) 100%)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-violet-400/70 mb-1">Book Service</p>
              <h2 className="font-bold text-white text-[15.5px] leading-tight line-clamp-2">{service.title}</h2>
              <p className="text-[11.5px] text-white/35 mt-0.5 truncate">
                with {providerLabel}
                {!isQuoteOnly && price > 0 ? ` · ${sym}${price.toLocaleString()}` : ''}
              </p>
            </div>
            <button
              type="button" onClick={onClose} aria-label="Close"
              className="shrink-0 h-8 w-8 rounded-full border border-white/[0.10] bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.12] transition-colors"
            >
              <X className="h-4 w-4 text-white/60" />
            </button>
          </div>

          {/* Step rail */}
          {!result && isAuthenticated && (
            <div className="mt-3.5 flex items-center gap-1.5" aria-label={`Step ${activeStepNumber} of ${STEPS.length}`}>
              {STEPS.map((label, i) => {
                const done = i < step;
                const active = i === step;
                const skipped = i === 0 && !hasPackages;
                return (
                  <div key={label} className="flex-1 min-w-0">
                    <div
                      className="h-1 rounded-full transition-all"
                      style={{ background: done || active ? 'linear-gradient(90deg,#6366f1,#8b5cf6)' : 'rgba(255,255,255,0.09)', opacity: skipped ? 0.3 : 1 }}
                    />
                    <span className={`mt-1 block truncate text-[9.5px] font-semibold ${active ? 'text-white/70' : 'text-white/25'}`}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
          {/* Success (§19 — Booking Request sent) */}
          {result?.booking ? (
            <div className="py-8 text-center">
              <div
                className="h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-5 shadow-[0_0_30px_rgba(16,185,129,0.35)]"
                style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}
              >
                <Check className="h-8 w-8 text-white" />
              </div>
              <p className="font-black text-white text-[17px] leading-tight px-4">
                {result.duplicate
                  ? 'This booking request was already sent.'
                  : `Booking request sent to ${result.provider?.name ?? providerLabel}.`}
              </p>
              <p className="text-[12.5px] text-white/40 mt-2 px-6 leading-relaxed">
                No payment is needed now. {result.provider?.name ?? 'The provider'} will review your request and respond through Docrud.
              </p>

              <div className="mt-6 flex flex-col gap-2.5 px-2">
                {result.conversation && (
                  <Link
                    href={result.conversation.href}
                    className="flex items-center justify-center gap-2 h-11 rounded-[13px] font-bold text-[13px] text-white transition-all active:scale-[0.98]"
                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.35)' }}
                  >
                    <MessageSquare className="h-4 w-4" />
                    View Conversation
                  </Link>
                )}
                <button
                  type="button" onClick={onClose}
                  className="flex items-center justify-center gap-2 h-11 rounded-[13px] border border-white/[0.10] bg-white/[0.05] text-[13px] font-semibold text-white/70 hover:text-white hover:bg-white/[0.09] transition-all"
                >
                  Continue Browsing
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-4 text-[10px] text-white/25">Reference: {result.booking.id}</p>
            </div>
          ) : status === 'loading' ? (
            <div className="py-14 flex items-center justify-center">
              <Loader2 className="h-5 w-5 text-white/30 animate-spin" />
            </div>
          ) : !isAuthenticated ? (
            /* §25 — login required before booking */
            <div className="py-10 text-center">
              <p className="font-bold text-white text-[15px]">Sign in to book this service</p>
              <p className="text-[12.5px] text-white/40 mt-2 leading-relaxed px-4">
                Booking requests are sent through Docrud so both sides can track them.
              </p>
              <Link
                href="/login"
                className="mt-5 inline-flex items-center justify-center h-11 px-6 rounded-[13px] font-bold text-[13px] text-white transition-all active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
              >
                Sign In
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {/* ── Step 1: Package / pricing ── */}
              {step === 0 && (
                <div>
                  <span className={labelClass}>Choose a package</span>
                  <div className="space-y-2">
                    {packages.map((pkg) => {
                      const active = packageName === pkg.name;
                      return (
                        <button
                          key={pkg.name} type="button" aria-pressed={active}
                          onClick={() => setPackageName(pkg.name)}
                          className={`w-full text-left rounded-[16px] border px-4 py-3.5 transition-all ${
                            active ? 'border-violet-500/50 bg-violet-500/10' : 'border-white/[0.07] bg-white/[0.03] hover:border-white/[0.13]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[13.5px] font-bold text-white/90">{pkg.name}</span>
                                <span className={`h-4 w-4 rounded-full border flex items-center justify-center ${active ? 'border-violet-500 bg-violet-500' : 'border-white/[0.20]'}`}>
                                  {active && <Check className="h-2.5 w-2.5 text-white" />}
                                </span>
                              </div>
                              {pkg.description && <p className="text-[11px] text-white/40 line-clamp-2">{pkg.description}</p>}
                              {pkg.features && pkg.features.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {pkg.features.slice(0, 3).map((f) => (
                                    <span key={f} className="flex items-center gap-1 text-[9.5px] text-emerald-400/70">
                                      <Check className="h-2 w-2" /> {f}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-[14px] font-black text-white/90">{sym}{pkg.price.toLocaleString()}</p>
                              {pkg.deliveryTime != null && (
                                <p className="text-[9.5px] text-white/30 mt-0.5">{pkg.deliveryTime} {pkg.deliveryUnit ?? 'days'}</p>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Step 2: Requirements ── */}
              {step === 1 && (
                <>
                  {!hasPackages && (
                    <p className="rounded-[12px] border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5 text-[11.5px] text-white/45">
                      This service has no packages. {isQuoteOnly ? 'The provider will quote based on your requirements.' : `Standard price: ${sym}${price.toLocaleString()}.`}
                    </p>
                  )}
                  <div>
                    <label htmlFor="bk-requirement" className={labelClass}>What exactly do you need? *</label>
                    <textarea
                      id="bk-requirement" rows={5} required maxLength={REQUIREMENT_MAX}
                      value={requirement} onChange={(e) => setRequirement(e.target.value)}
                      placeholder="Describe the scope, deliverables and anything the provider must know…"
                      className={`${fieldClass} resize-none`}
                    />
                    <p className="text-[10px] text-white/25 mt-1 text-right">{REQUIREMENT_MAX - requirement.length} characters left</p>
                  </div>

                  <div>
                    <span className={labelClass}>Attachments (images, documents, PDFs)</span>
                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
                    <button
                      type="button" onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || attachments.length >= MAX_ATTACHMENTS}
                      className="flex items-center gap-2 rounded-[11px] border border-white/[0.09] bg-white/[0.04] px-3.5 py-2 text-[12px] font-semibold text-white/60 hover:text-white hover:bg-white/[0.07] transition-all disabled:opacity-50"
                    >
                      {uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</> : <><Paperclip className="h-3.5 w-3.5" /> Attach files</>}
                    </button>
                    {attachments.length > 0 && (
                      <ul className="mt-2.5 space-y-1.5">
                        {attachments.map((file) => (
                          <li key={file.url} className="flex items-center justify-between gap-2 rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
                            <span className="text-[11.5px] text-white/60 truncate">{file.name}</span>
                            <button
                              type="button" aria-label={`Remove ${file.name}`}
                              onClick={() => setAttachments((prev) => prev.filter((f) => f.url !== file.url))}
                              className="shrink-0 text-white/30 hover:text-white/70 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}

              {/* ── Step 3: Timeline + budget + contact ── */}
              {step === 2 && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="bk-start" className={labelClass}>Preferred start date</label>
                      <input id="bk-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${fieldClass} text-white/70`} />
                    </div>
                    <div>
                      <label htmlFor="bk-delivery" className={labelClass}>Expected delivery date</label>
                      <input id="bk-delivery" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={`${fieldClass} text-white/70`} />
                    </div>
                  </div>

                  <div>
                    <span className={labelClass}>Budget ({currency})</span>
                    <div className="grid grid-cols-2 gap-2.5">
                      <input type="number" min={0} inputMode="numeric" aria-label="Minimum budget" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} placeholder="Min" className={fieldClass} />
                      <input type="number" min={0} inputMode="numeric" aria-label="Maximum budget" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} placeholder="Max" className={fieldClass} />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="bk-phone" className={labelClass}>Phone (optional)</label>
                    <input id="bk-phone" type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="+91 98765 43210" className={fieldClass} />
                    <p className="text-[10px] text-white/25 mt-1">
                      Your name and email come from your profile{session?.user?.email ? ` (${session.user.email})` : ''}.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="bk-notes" className={labelClass}>Additional notes</label>
                    <textarea id="bk-notes" rows={3} maxLength={NOTES_MAX} value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} placeholder="Anything else worth mentioning" className={`${fieldClass} resize-none`} />
                  </div>
                </>
              )}

              {/* ── Step 4: Review (§21) ── */}
              {step === 3 && (
                <div>
                  <p className="text-[12px] text-white/40 mb-3">Check everything before sending. No payment is taken.</p>
                  <div className="rounded-[16px] border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                    {reviewRows.map(([label, value]) => (
                      <div key={label} className="flex items-start justify-between gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
                        <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-[0.12em] text-white/30">{label}</span>
                        <span className="text-right text-[12px] text-white/70 break-words">{value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 rounded-[16px] border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-white/30">Requirements</span>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/65 whitespace-pre-wrap">{requirement.trim()}</p>
                    {additionalNotes.trim() && (
                      <>
                        <span className="mt-3 block text-[10.5px] font-bold uppercase tracking-[0.12em] text-white/30">Notes</span>
                        <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/65 whitespace-pre-wrap">{additionalNotes.trim()}</p>
                      </>
                    )}
                    {attachments.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {attachments.map((f) => (
                          <li key={f.url} className="text-[11.5px] text-white/45 truncate">📎 {f.name}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <p role="alert" className="text-[12px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-[10px] px-3 py-2">
                  {error}
                </p>
              )}

              {/* Navigation */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={step === firstStep ? onClose : goBack}
                  className="flex items-center justify-center gap-1.5 flex-1 h-11 rounded-[13px] border border-white/[0.09] text-white/55 text-[13px] font-semibold hover:bg-white/[0.05] hover:text-white/80 transition-all"
                >
                  {step === firstStep ? 'Cancel' : <><ArrowLeft className="h-3.5 w-3.5" /> Back</>}
                </button>
                {step < 3 ? (
                  <button
                    type="button" onClick={goNext}
                    className="flex items-center justify-center gap-1.5 flex-1 h-11 rounded-[13px] font-black text-[13px] text-white transition-all active:scale-[0.98]"
                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.45)' }}
                  >
                    Continue <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button" onClick={handleSubmit} disabled={submitting || uploading}
                    className="flex-1 h-11 rounded-[13px] font-black text-[13px] text-white transition-all active:scale-[0.98] disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.45)' }}
                  >
                    {submitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…
                      </span>
                    ) : 'Send Booking Request'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
