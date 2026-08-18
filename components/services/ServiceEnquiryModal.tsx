'use client';

/**
 * §17 Enquire Flow — standalone, self-contained enquiry modal.
 *
 * Deliberately owns no page state: mount it, pass the service, handle onClose.
 * It talks only to POST /api/services/enquiries and renders §18 on success, so
 * the catalogue / service detail / discovery pages need one import and one
 * boolean to wire up "Enquire".
 *
 * This is NOT the booking flow — no packages, no pricing, no commitment (§24).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Loader2, Paperclip, X } from 'lucide-react';
import ServiceEnquirySuccess, {
  type EnquirySuccessConversation,
  type EnquirySuccessEnquiry,
  type EnquirySuccessProvider,
} from '@/components/services/ServiceEnquirySuccess';

/* ─── contract ─────────────────────────────────────────────────────────── */

export interface ServiceEnquiryModalService {
  id: string;
  title: string;
  /** Provider user id — used only for the fallback provider label. */
  userId?: string;
  /** Provider display name, when the host already has it. */
  providerName?: string;
  /** Defaults the budget currency; falls back to INR. */
  currency?: string;
}

export interface ServiceEnquiryModalProps {
  service: ServiceEnquiryModalService;
  onClose: () => void;
  /** Called once the enquiry is stored, with the new enquiry + lead ids. */
  onSubmitted?: (result: { enquiryId: string; leadId?: string; conversationId?: string; duplicate: boolean }) => void;
  /** Optional §18 "View Enquiry" handler. Omit to hide that action. */
  onViewEnquiry?: (enquiryId: string) => void;
}

type ContactMethod = 'docrud_chat' | 'email' | 'phone';

interface Attachment {
  url: string;
  name: string;
  size?: number;
  mimeType?: string;
}

interface EnquiryResponse {
  duplicate?: boolean;
  enquiry?: EnquirySuccessEnquiry & { leadId?: string; conversationId?: string };
  lead?: { id: string } | null;
  conversation?: EnquirySuccessConversation | null;
  provider?: EnquirySuccessProvider;
  error?: string;
}

const MAX_ATTACHMENTS = 5;
const REQUIREMENT_MIN = 10;
const REQUIREMENT_MAX = 4000;

const CONTACT_OPTIONS: Array<{ id: ContactMethod; label: string; hint: string }> = [
  { id: 'docrud_chat', label: 'Docrud chat', hint: 'Keeps your details private' },
  { id: 'email', label: 'Email', hint: 'Shares your account email' },
  { id: 'phone', label: 'Phone', hint: 'Shares the number you enter' },
];

/* ─── shared field styling (matches the services surface) ──────────────── */
const fieldClass =
  'w-full rounded-[12px] border border-white/[0.09] bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-white placeholder-white/20 outline-none focus:border-violet-500/50 focus:bg-violet-500/[0.04] transition-all';
const labelClass =
  'block text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/40 mb-1.5';

export default function ServiceEnquiryModal({
  service,
  onClose,
  onSubmitted,
  onViewEnquiry,
}: ServiceEnquiryModalProps) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated';

  const [requirement, setRequirement] = useState('');
  const [contactMethod, setContactMethod] = useState<ContactMethod>('docrud_chat');
  const [contactPhone, setContactPhone] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [expectedStartDate, setExpectedStartDate] = useState('');
  const [expectedCompletionDate, setExpectedCompletionDate] = useState('');
  const [companyInfo, setCompanyInfo] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<EnquiryResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currency = service.currency || 'INR';
  const providerLabel = service.providerName || 'the provider';

  /* Escape closes; body scroll locked while open. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError('');
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      setError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    setUploading(true);
    try {
      const picked = Array.from(files).slice(0, room);
      const uploaded: Attachment[] = [];
      for (const file of picked) {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/messages/upload', { method: 'POST', body: form });
        const data = await res.json().catch(() => null) as (Attachment & { error?: string }) | null;
        if (!res.ok || !data?.url) {
          setError(data?.error || `Could not upload ${file.name}.`);
          break;
        }
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const trimmed = requirement.trim();
    if (trimmed.length < REQUIREMENT_MIN) {
      setError(`Please describe what you need in at least ${REQUIREMENT_MIN} characters.`);
      return;
    }
    if (contactMethod === 'phone' && contactPhone.replace(/\D/g, '').length < 7) {
      setError('Enter a valid phone number, or choose another contact method.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/services/enquiries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          serviceId: service.id,
          requirement: trimmed,
          contactMethod,
          ...(contactMethod === 'phone' ? { contactPhone } : {}),
          ...(budgetMin ? { budgetMin: Number(budgetMin) } : {}),
          ...(budgetMax ? { budgetMax: Number(budgetMax) } : {}),
          budgetCurrency: currency,
          ...(expectedStartDate ? { expectedStartDate } : {}),
          ...(expectedCompletionDate ? { expectedCompletionDate } : {}),
          ...(companyInfo.trim() ? { companyInfo: companyInfo.trim() } : {}),
          ...(attachments.length ? { attachments } : {}),
        }),
      });
      const data = await res.json().catch(() => null) as EnquiryResponse | null;
      if (!res.ok || !data?.enquiry) {
        setError(data?.error || 'Failed to send enquiry. Please try again.');
        return;
      }
      setResult(data);
      onSubmitted?.({
        enquiryId: data.enquiry.id,
        leadId: data.lead?.id,
        conversationId: data.conversation?.id,
        duplicate: Boolean(data.duplicate),
      });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const remaining = REQUIREMENT_MAX - requirement.length;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Enquire about ${service.title}`}
        className="relative z-10 w-full sm:max-w-lg max-h-[92vh] sm:max-h-[90vh] flex flex-col bg-[#0E0E10] border border-white/[0.09] rounded-t-[24px] sm:rounded-[24px] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.95)]"
      >
        {/* Header */}
        <div
          className="relative shrink-0 px-5 sm:px-6 py-4 border-b border-white/[0.07]"
          style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.13) 0%, rgba(139,92,246,0.07) 100%)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-violet-400/70 mb-1">Enquire</p>
              <h2 className="font-bold text-white text-[15.5px] leading-tight line-clamp-2">{service.title}</h2>
              <p className="text-[11.5px] text-white/35 mt-0.5 truncate">
                to {providerLabel}
                {session?.user?.name ? ` · from ${session.user.name}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 h-8 w-8 rounded-full border border-white/[0.10] bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.12] transition-colors"
            >
              <X className="h-4 w-4 text-white/60" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
          {/* Success (§18) */}
          {result?.enquiry && result.provider ? (
            <ServiceEnquirySuccess
              provider={result.provider}
              enquiryId={result.enquiry.id}
              conversation={result.conversation}
              enquiry={result.enquiry}
              duplicate={Boolean(result.duplicate)}
              onViewEnquiry={onViewEnquiry}
              onContinue={onClose}
            />
          ) : status === 'loading' ? (
            <div className="py-14 flex items-center justify-center">
              <Loader2 className="h-5 w-5 text-white/30 animate-spin" />
            </div>
          ) : !isAuthenticated ? (
            /* §25 — login required before enquiry */
            <div className="py-10 text-center">
              <p className="font-bold text-white text-[15px]">Sign in to send an enquiry</p>
              <p className="text-[12.5px] text-white/40 mt-2 leading-relaxed px-4">
                Enquiries are sent through Docrud so your contact details stay private.
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
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Requirement — required */}
              <div>
                <label htmlFor="enq-requirement" className={labelClass}>What do you need? *</label>
                <textarea
                  id="enq-requirement"
                  rows={4}
                  required
                  maxLength={REQUIREMENT_MAX}
                  value={requirement}
                  onChange={(e) => setRequirement(e.target.value)}
                  placeholder="Describe your requirement, goals, and anything the provider should know…"
                  className={`${fieldClass} resize-none`}
                />
                <p className="text-[10px] text-white/25 mt-1 text-right">{remaining} characters left</p>
              </div>

              {/* Preferred contact method — required */}
              <div>
                <span className={labelClass}>Preferred contact method *</span>
                <div className="grid grid-cols-3 gap-2">
                  {CONTACT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setContactMethod(opt.id)}
                      aria-pressed={contactMethod === opt.id}
                      className={`rounded-[12px] border px-2.5 py-2.5 text-left transition-all ${
                        contactMethod === opt.id
                          ? 'border-violet-500/50 bg-violet-500/10'
                          : 'border-white/[0.07] bg-white/[0.03] hover:border-white/[0.13]'
                      }`}
                    >
                      <span className="block text-[12px] font-bold text-white/85">{opt.label}</span>
                      <span className="block text-[9.5px] text-white/30 mt-0.5 leading-tight">{opt.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {contactMethod === 'phone' && (
                <div>
                  <label htmlFor="enq-phone" className={labelClass}>Phone number *</label>
                  <input
                    id="enq-phone"
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className={fieldClass}
                  />
                </div>
              )}

              {/* Optional details */}
              <button
                type="button"
                onClick={() => setShowOptional((v) => !v)}
                className="w-full text-left text-[11.5px] font-semibold text-white/45 hover:text-white/70 transition-colors"
              >
                {showOptional ? '▲ Hide optional details' : '▼ Add budget, timeline, files (optional)'}
              </button>

              {showOptional && (
                <div className="space-y-4 rounded-[16px] border border-white/[0.06] bg-white/[0.02] p-4">
                  <div>
                    <span className={labelClass}>Budget range ({currency})</span>
                    <div className="grid grid-cols-2 gap-2.5">
                      <input
                        type="number" min={0} inputMode="numeric"
                        value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)}
                        placeholder="Min" className={fieldClass} aria-label="Minimum budget"
                      />
                      <input
                        type="number" min={0} inputMode="numeric"
                        value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)}
                        placeholder="Max" className={fieldClass} aria-label="Maximum budget"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="enq-start" className={labelClass}>Expected start</label>
                      <input
                        id="enq-start" type="date" value={expectedStartDate}
                        onChange={(e) => setExpectedStartDate(e.target.value)}
                        className={`${fieldClass} text-white/70`}
                      />
                    </div>
                    <div>
                      <label htmlFor="enq-end" className={labelClass}>Expected completion</label>
                      <input
                        id="enq-end" type="date" value={expectedCompletionDate}
                        onChange={(e) => setExpectedCompletionDate(e.target.value)}
                        className={`${fieldClass} text-white/70`}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="enq-company" className={labelClass}>Company / project information</label>
                    <input
                      id="enq-company" value={companyInfo} maxLength={600}
                      onChange={(e) => setCompanyInfo(e.target.value)}
                      placeholder="Company, team, or project context"
                      className={fieldClass}
                    />
                  </div>

                  {/* Attachments / reference files */}
                  <div>
                    <span className={labelClass}>Reference files / images</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => void handleFiles(e.target.files)}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || attachments.length >= MAX_ATTACHMENTS}
                      className="flex items-center gap-2 rounded-[11px] border border-white/[0.09] bg-white/[0.04] px-3.5 py-2 text-[12px] font-semibold text-white/60 hover:text-white hover:bg-white/[0.07] transition-all disabled:opacity-50"
                    >
                      {uploading
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</>
                        : <><Paperclip className="h-3.5 w-3.5" /> Attach files</>}
                    </button>
                    {attachments.length > 0 && (
                      <ul className="mt-2.5 space-y-1.5">
                        {attachments.map((file) => (
                          <li key={file.url} className="flex items-center justify-between gap-2 rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
                            <span className="text-[11.5px] text-white/60 truncate">{file.name}</span>
                            <button
                              type="button"
                              aria-label={`Remove ${file.name}`}
                              onClick={() => setAttachments((prev) => prev.filter((f) => f.url !== file.url))}
                              className="shrink-0 text-white/30 hover:text-white/70 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-[10px] text-white/25 mt-1.5">Up to {MAX_ATTACHMENTS} files.</p>
                  </div>
                </div>
              )}

              {error && (
                <p role="alert" className="text-[12px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-[10px] px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 h-11 rounded-[13px] border border-white/[0.09] text-white/55 text-[13px] font-semibold hover:bg-white/[0.05] hover:text-white/80 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || uploading}
                  className="flex-1 h-11 rounded-[13px] font-black text-[13px] text-white transition-all active:scale-[0.98] disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.45)' }}
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sending…
                    </span>
                  ) : 'Send Enquiry'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
