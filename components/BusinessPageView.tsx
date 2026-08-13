'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import dynamic from 'next/dynamic';
const PublishAnythingDialog = dynamic(() => import('@/components/PublishAnythingDialog'), { ssr: false });
import { FeedCard, type FeedItem } from '@/components/ProfilePublishedFeed';
import {
  ArrowLeft, Award, BadgeCheck, BarChart3, Briefcase,
  Building2, Calendar, Camera, CheckCircle2, ChevronRight,
  Edit3, ExternalLink, Globe, Heart, Mail, MapPin, MessageCircle,
  Package, Phone, Plus, QrCode, Share2, ShieldCheck, Star, Trash2, TrendingUp,
  Twitter, Upload, Users, X, Linkedin, Instagram, Youtube, Github, Facebook,
  Zap, Target, Eye, Layers, DollarSign, TrendingDown,
} from 'lucide-react';

/* ── types ──────────────────────────────────────────────────────── */
interface Post     { id: string; content: string; mediaUrls: string[]; postType: string; likeCount: number; commentCount: number; likedBy: string[]; pinned: boolean; createdAt: string; }
interface Job      { id: string; title: string; description: string; location?: string; jobType: string; experienceLevel?: string; salaryMin?: number; salaryMax?: number; salaryCurrency: string; skills: string[]; status: string; applyUrl?: string; applicationCount: number; createdAt: string; }
interface Product  { id: string; name: string; description?: string; price?: string; category?: string; imageUrl?: string; productUrl?: string; }
interface BizEvent { id: string; title: string; description?: string; eventType: string; startAt: string; endAt?: string; location?: string; isOnline: boolean; registrationUrl?: string; coverUrl?: string; attendeeCount: number; }
interface Review   { id: string; pageId: string; userId: string; userName: string; rating: number; title: string; body: string; helpful: number; helpedBy: string[]; createdAt: string; }

interface PageData {
  id: string; slug: string; ownerUserId: string; name: string; tagline?: string; description?: string;
  industry: string; companySize?: string; foundedYear?: number; website?: string; logoUrl?: string;
  coverUrl?: string; location?: string; city?: string; state?: string; country?: string;
  pinCode?: string; fullAddress?: string; phone?: string; email?: string; supportEmail?: string; whatsapp?: string;
  verified: boolean; followerCount: number; viewCount: number; postCount: number; jobCount: number;
  socialLinks: Record<string, string>;
  companyType?: string; registrationNumber?: string; gstNumber?: string;
  revenueRange?: string; fundingStage?: string; businessModels?: string[];
  missionStatement?: string; visionStatement?: string;
  specializations?: string[]; techStack?: string[];
  workPolicy?: string; companyValues?: string[]; perks?: string[]; certifications?: string[];
  numberOfOffices?: string;
}

type Tab = 'overview' | 'posts' | 'jobs' | 'products' | 'events' | 'reviews' | 'analytics' | 'team';

type AnalyticsData = {
  totalViews: number; followerCount: number; postCount: number; jobCount: number; recentFollowers: number;
  productCount: number; eventCount: number; reviewCount: number; avgRating: number;
  totalLikes: number; totalComments: number;
  followersByWeek: { week: string; count: number }[];
  postsByWeek:     { week: string; count: number }[];
  ratingDistribution: { rating: number; count: number }[];
  topPosts: { id: string; content: string; likeCount: number; commentCount: number; createdAt: string }[];
};

const IND_LABELS: Record<string, string> = {
  technology: 'Technology', finance: 'Finance & Banking', healthcare: 'Healthcare',
  legal: 'Legal & Compliance', education: 'Education', manufacturing: 'Manufacturing',
  retail: 'Retail & E-commerce', real_estate: 'Real Estate', media: 'Media & Entertainment',
  consulting: 'Consulting', logistics: 'Logistics', hospitality: 'Hospitality & Travel',
  ngo: 'NGO / Non-profit', government: 'Government', other: 'Other',
};

const JOB_TYPES: Record<string, string> = {
  full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract',
  internship: 'Internship', freelance: 'Freelance', remote: 'Remote',
};

/* ── helpers ────────────────────────────────────────────────────── */
function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000) return 'Just now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  if (d < 7 * 86400000) return `${Math.floor(d / 86400000)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/* ── toast ──────────────────────────────────────────────────────── */
type ToastT = { id: number; msg: string; type: 'success' | 'error' | 'info' };
let _push: ((t: Omit<ToastT, 'id'>) => void) | null = null;
function toast(msg: string, type: ToastT['type'] = 'success') { _push?.({ msg, type }); }

function Toaster() {
  const [list, setList] = useState<ToastT[]>([]);
  const ctr = useRef(0);
  const add = useCallback((t: Omit<ToastT, 'id'>) => {
    const id = ++ctr.current;
    setList(p => [...p.slice(-3), { ...t, id }]);
    setTimeout(() => setList(p => p.filter(x => x.id !== id)), 3000);
  }, []);
  useEffect(() => { _push = add; return () => { _push = null; }; }, [add]);
  if (typeof document === 'undefined' || !list.length) return null;
  return createPortal(
    <div className="fixed bottom-6 right-4 z-[400] flex flex-col gap-2 items-end pointer-events-none">
      {list.map(t => (
        <div key={t.id} className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-[13px] font-semibold shadow-2xl backdrop-blur-xl animate-in slide-in-from-right-4 fade-in duration-200 ${
          t.type === 'success' ? 'border-emerald-500/30 bg-[#0d1f14]/95 text-emerald-300'
          : t.type === 'error' ? 'border-red-500/30 bg-[#1f0d0d]/95 text-red-300'
          : 'border-white/20 bg-[#111114]/95 text-white/80'
        }`}>{t.msg}</div>
      ))}
    </div>,
    document.body
  );
}

/* ── star rating display ────────────────────────────────────────── */
function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(s => (
        <Star key={s} style={{ width: size, height: size }}
          className={s <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-white/15'} />
      ))}
    </div>
  );
}

/* ── image upload hook ──────────────────────────────────────────── */
function useImageUpload(pageId: string, type: 'logo' | 'cover') {
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  async function pick() { ref.current?.click(); }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>, onDone: (url: string) => void) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', type);
      fd.append('pageId', pageId);
      const res  = await fetch('/api/business-pages/upload-image', { method: 'POST', body: fd });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) { onDone(data.url); toast(`${type === 'logo' ? 'Logo' : 'Cover'} updated`); }
      else { console.error('[biz-upload] server error:', data.error); toast(data.error ?? 'Upload failed', 'error'); }
    } catch (err) { console.error('[biz-upload] fetch error:', err); toast('Upload failed — check console', 'error'); }
    finally { setUploading(false); if (ref.current) ref.current.value = ''; }
  }

  return { ref, pick, onChange, uploading };
}

/* ── QR code modal ──────────────────────────────────────────────── */
function QRModal({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const encoded = encodeURIComponent(url);
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?data=${encoded}&size=280x280&margin=12&color=ffffff&bgcolor=0a0a0e&format=png`;

  async function download() {
    try {
      const res  = await fetch(qrSrc);
      const blob = await res.blob();
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = `${name.replace(/\s+/g, '-').toLowerCase()}-qr.png`;
      a.click();
    } catch { toast('Download failed', 'error'); }
  }

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
      <div className="relative w-full max-w-xs rounded-3xl border border-white/[0.10] bg-[#111116] shadow-2xl animate-in zoom-in-95 fade-in duration-200 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-2.5">
            <QrCode className="h-4 w-4 text-indigo-400" />
            <span className="text-[14px] font-bold text-white">Company QR Code</span>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/40 hover:text-white transition">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="p-5 flex flex-col items-center gap-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a0e] p-3 shadow-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} alt="QR code" width={220} height={220} className="rounded-xl" />
          </div>
          <div className="text-center">
            <p className="text-[13px] font-semibold text-white/80">{name}</p>
            <p className="text-[11px] text-white/30 mt-0.5 break-all">{url}</p>
          </div>
          <div className="flex w-full gap-2">
            <button onClick={() => { void navigator.clipboard.writeText(url); toast('Link copied!'); }}
              className="flex-1 rounded-xl border border-white/[0.10] bg-white/[0.05] py-2.5 text-[12px] font-semibold text-white/60 hover:bg-white/[0.09] hover:text-white/90 transition">
              Copy Link
            </button>
            <button onClick={() => void download()}
              className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 py-2.5 text-[12px] font-semibold text-white transition active:scale-[0.98]">
              Download
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── inline form input ──────────────────────────────────────────── */
const inp = 'h-10 w-full rounded-xl border border-white/[0.10] bg-white/[0.04] px-3.5 text-[13px] text-white placeholder:text-white/25 outline-none transition focus:border-indigo-500/40 focus:bg-white/[0.06]';
const lbl = 'mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/30';

/* ══════════════════════════════════════════════════════════════════
   VERIFY BUSINESS BANNER + MODAL
══════════════════════════════════════════════════════════════════ */
type VerifStatus = 'pending' | 'approved' | 'rejected';
interface VerifRecord {
  id: string; status: VerifStatus; legalName?: string; submittedAt?: string; adminNotes?: string;
}

const BUSINESS_TYPES = [
  { value: 'pvt_ltd', label: 'Private Limited (Pvt. Ltd.)' },
  { value: 'llp', label: 'Limited Liability Partnership (LLP)' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'proprietorship', label: 'Sole Proprietorship' },
  { value: 'public_ltd', label: 'Public Limited' },
  { value: 'ngo', label: 'NGO / Non-Profit' },
  { value: 'other', label: 'Other' },
];
const YEARS_IN_BIZ = ['< 1 year', '1–2 years', '3–5 years', '6–10 years', '11–20 years', '20+ years'];
const EMP_COUNTS   = ['1–10', '11–50', '51–200', '201–500', '501–1000', '1000+'];
const ANNUAL_REV   = ['< ₹10L', '₹10L–₹1Cr', '₹1Cr–₹10Cr', '₹10Cr–₹100Cr', '₹100Cr+'];

function VerifyBusinessBanner({ pageId }: { pageId: string }) {
  const [verif, setVerif]     = useState<VerifRecord | null | undefined>(undefined); // undefined = loading
  const [open, setOpen]       = useState(false);
  const [step, setStep]       = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    legalName: '', businessType: 'pvt_ltd', registrationNumber: '', pan: '', gstin: '',
    registeredAddress: '', city: '', state: '', pincode: '', country: 'India', website: '',
    contactName: '', contactEmail: '', contactPhone: '',
    yearsInBusiness: '', employeeCount: '', annualRevenue: '', businessCategory: '',
  });

  useEffect(() => {
    if (!pageId) return;
    fetch(`/api/business-pages/${pageId}/verify`)
      .then(r => r.json() as Promise<{ verification: VerifRecord | null }>)
      .then(d => setVerif(d.verification))
      .catch(() => setVerif(null));
  }, [pageId]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/business-pages/${pageId}/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({})) as { verification?: VerifRecord; error?: string };
      if (res.ok && data.verification) {
        setVerif(data.verification); setOpen(false); toast('Verification request submitted!');
      } else if (res.status === 409 && data.verification) {
        // Already pending/approved — reflect the real status instead of leaving a stale banner.
        setVerif(data.verification); setOpen(false);
        toast(data.error ?? 'Verification already submitted', 'error');
      } else {
        toast(data.error ?? `Submission failed (${res.status})`, 'error');
      }
    } catch { toast('Submission failed — please check your connection', 'error'); }
    finally { setSubmitting(false); }
  }

  if (verif === undefined) return null; // loading — silent

  const fInp = 'rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/[0.18] w-full';
  const fLbl = 'block text-[10.5px] font-bold uppercase tracking-[0.12em] text-white/30 mb-1';

  return (
    <>
      {/* ── Banner ── */}
      {!verif && (
        <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.05] px-5 py-4 flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 border border-indigo-500/20">
            <ShieldCheck className="h-5 w-5 text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-white/90">Verify Your Business</p>
            <p className="text-[12px] text-white/40 mt-0.5">Get a verified badge to build trust with customers</p>
          </div>
          <button onClick={() => { setStep(1); setOpen(true); }}
            className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition">
            Start Verification
          </button>
        </div>
      )}
      {verif?.status === 'pending' && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-5 py-4 flex items-center gap-3">
          <div className="h-8 w-8 shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 flex items-center justify-center">
            <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-white/70">Verification Under Review</p>
            <p className="text-[11px] text-white/30 mt-0.5">Submitted {verif.submittedAt ? new Date(verif.submittedAt).toLocaleDateString('en-IN') : ''} · We&apos;ll notify you once reviewed</p>
          </div>
        </div>
      )}
      {verif?.status === 'approved' && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] px-5 py-3 flex items-center gap-2.5">
          <BadgeCheck className="h-4.5 w-4.5 text-emerald-400 shrink-0" style={{ width: 18, height: 18 }} />
          <p className="text-[13px] font-semibold text-emerald-300">Business Verified — your page shows a verified badge</p>
        </div>
      )}
      {verif?.status === 'rejected' && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.05] px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[13px] font-semibold text-red-300">Verification Rejected</p>
              {verif.adminNotes && <p className="text-[12px] text-white/40 mt-1">{verif.adminNotes}</p>}
            </div>
            <button onClick={() => { setStep(1); setOpen(true); }}
              className="shrink-0 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-300 hover:bg-indigo-500/20 transition">
              Resubmit
            </button>
          </div>
        </div>
      )}

      {/* ── Modal ── */}
      {open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />
          <div className="relative w-full max-w-lg rounded-3xl border border-white/[0.09] bg-[#0e0e14] shadow-2xl animate-in zoom-in-95 fade-in duration-200 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07] shrink-0">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-5 w-5 text-indigo-400" />
                <div>
                  <p className="text-[15px] font-bold text-white">Business Verification</p>
                  <p className="text-[11px] text-white/35">Step {step} of 3</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/40 hover:text-white transition">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Progress */}
            <div className="px-6 pt-4 shrink-0">
              <div className="flex gap-1.5">
                {[1,2,3].map(s => (
                  <div key={s} className={`h-1 flex-1 rounded-full transition-all ${s <= step ? 'bg-indigo-500' : 'bg-white/[0.08]'}`} />
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {step === 1 && (
                <>
                  <p className="text-[12px] font-bold uppercase tracking-widest text-indigo-400/70 mb-3">Legal Information</p>
                  <div>
                    <label className={fLbl}>Legal Business Name *</label>
                    <input className={fInp} value={form.legalName} onChange={e => set('legalName', e.target.value)} placeholder="As registered with govt." />
                  </div>
                  <div>
                    <label className={fLbl}>Business Type *</label>
                    <select className={fInp} value={form.businessType} onChange={e => set('businessType', e.target.value)} style={{ appearance: 'none' }}>
                      {BUSINESS_TYPES.map(t => <option key={t.value} value={t.value} style={{ background: '#0e0e14' }}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={fLbl}>Registration / CIN Number *</label>
                    <input className={fInp} value={form.registrationNumber} onChange={e => set('registrationNumber', e.target.value)} placeholder="CIN / Registration No." />
                  </div>
                  <div>
                    <label className={fLbl}>PAN *</label>
                    <input className={fInp} value={form.pan} onChange={e => set('pan', e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} />
                  </div>
                  <div>
                    <label className={fLbl}>GSTIN (optional)</label>
                    <input className={fInp} value={form.gstin} onChange={e => set('gstin', e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} />
                  </div>
                </>
              )}
              {step === 2 && (
                <>
                  <p className="text-[12px] font-bold uppercase tracking-widest text-indigo-400/70 mb-3">Address & Contact</p>
                  <div>
                    <label className={fLbl}>Registered Address *</label>
                    <textarea className={`${fInp} resize-none`} rows={2} value={form.registeredAddress} onChange={e => set('registeredAddress', e.target.value)} placeholder="Street / Building / Area" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={fLbl}>City *</label><input className={fInp} value={form.city} onChange={e => set('city', e.target.value)} placeholder="Mumbai" /></div>
                    <div><label className={fLbl}>State *</label><input className={fInp} value={form.state} onChange={e => set('state', e.target.value)} placeholder="Maharashtra" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={fLbl}>Pincode *</label><input className={fInp} value={form.pincode} onChange={e => set('pincode', e.target.value)} placeholder="400001" maxLength={6} /></div>
                    <div><label className={fLbl}>Country</label><input className={fInp} value={form.country} onChange={e => set('country', e.target.value)} placeholder="India" /></div>
                  </div>
                  <div>
                    <label className={fLbl}>Website (optional)</label>
                    <input className={fInp} value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://yourcompany.com" />
                  </div>
                  <div>
                    <label className={fLbl}>Contact Person Name *</label>
                    <input className={fInp} value={form.contactName} onChange={e => set('contactName', e.target.value)} placeholder="Director / Authorized Rep." />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={fLbl}>Contact Email *</label><input className={fInp} type="email" value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} placeholder="contact@company.com" /></div>
                    <div><label className={fLbl}>Contact Phone *</label><input className={fInp} type="tel" value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} placeholder="+91 9876543210" /></div>
                  </div>
                </>
              )}
              {step === 3 && (
                <>
                  <p className="text-[12px] font-bold uppercase tracking-widest text-indigo-400/70 mb-3">Business Details</p>
                  <div>
                    <label className={fLbl}>Years in Business</label>
                    <select className={fInp} value={form.yearsInBusiness} onChange={e => set('yearsInBusiness', e.target.value)} style={{ appearance: 'none' }}>
                      <option value="" style={{ background: '#0e0e14' }}>Select…</option>
                      {YEARS_IN_BIZ.map(y => <option key={y} value={y} style={{ background: '#0e0e14' }}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={fLbl}>Employee Count</label>
                    <select className={fInp} value={form.employeeCount} onChange={e => set('employeeCount', e.target.value)} style={{ appearance: 'none' }}>
                      <option value="" style={{ background: '#0e0e14' }}>Select…</option>
                      {EMP_COUNTS.map(c => <option key={c} value={c} style={{ background: '#0e0e14' }}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={fLbl}>Annual Revenue</label>
                    <select className={fInp} value={form.annualRevenue} onChange={e => set('annualRevenue', e.target.value)} style={{ appearance: 'none' }}>
                      <option value="" style={{ background: '#0e0e14' }}>Select…</option>
                      {ANNUAL_REV.map(r => <option key={r} value={r} style={{ background: '#0e0e14' }}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={fLbl}>Business Category</label>
                    <input className={fInp} value={form.businessCategory} onChange={e => set('businessCategory', e.target.value)} placeholder="e.g. B2B SaaS, Retail, Healthcare…" />
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/[0.07] flex items-center justify-between gap-3 shrink-0">
              {step > 1
                ? <button onClick={() => setStep(s => s - 1)} className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/55 hover:text-white hover:bg-white/[0.09] transition">Back</button>
                : <div />
              }
              {step < 3
                ? <button onClick={() => setStep(s => s + 1)} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition">Next →</button>
                : <button onClick={() => void handleSubmit()} disabled={submitting}
                    className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition disabled:opacity-60">
                    {submitting ? 'Submitting…' : 'Submit for Review'}
                  </button>
              }
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════ */
export default function BusinessPageView({ slug }: { slug: string }) {
  const [page,      setPage]      = useState<PageData | null>(null);
  const [posts,     setPosts]     = useState<Post[]>([]);
  const [publishedFeed, setPublishedFeed] = useState<FeedItem[]>([]);
  const [jobs,      setJobs]      = useState<Job[]>([]);
  const [products,  setProducts]  = useState<Product[]>([]);
  const [events,    setEvents]    = useState<BizEvent[]>([]);
  const [reviews,   setReviews]   = useState<Review[]>([]);
  const [revAvg,    setRevAvg]    = useState(0);
  const [revTotal,  setRevTotal]  = useState(0);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  const [following,    setFollowing]    = useState(false);
  const [isOwner,      setIsOwner]      = useState(false);
  const [activeTab,    setActiveTab]    = useState<Tab>('overview');
  const [loading,      setLoading]      = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [pageId,       setPageId]       = useState('');
  const [showQR,       setShowQR]       = useState(false);
  const [publishOpen,  setPublishOpen]  = useState(false);
  const [scrolled,     setScrolled]     = useState(false);

  /* forms */
  const [postDraft,    setPostDraft]    = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [showJobForm,  setShowJobForm]  = useState(false);
  const [showProdForm, setShowProdForm] = useState(false);
  const [showEvtForm,  setShowEvtForm]  = useState(false);
  const [showRevForm,  setShowRevForm]  = useState(false);
  const [myRating,     setMyRating]     = useState(0);
  const [hoverRating,  setHoverRating]  = useState(0);
  const [revTitle,     setRevTitle]     = useState('');
  const [revBody,      setRevBody]      = useState('');

  const [jobForm,  setJobForm]  = useState({ title: '', description: '', location: '', jobType: 'full_time', experienceLevel: '', salaryMin: '', salaryMax: '', skills: '', applyUrl: '' });
  const [prodForm, setProdForm] = useState({ name: '', description: '', price: '', category: '', productUrl: '' });
  const [evtForm,  setEvtForm]  = useState({ title: '', description: '', eventType: 'webinar', startAt: '', endAt: '', location: '', isOnline: true, registrationUrl: '' });

  /* logo/cover upload */
  const logoUpload  = useImageUpload(pageId, 'logo');
  const coverUpload = useImageUpload(pageId, 'cover');

  /* scroll detection for sticky header */
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 180);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/business-pages/${slug}`);
      if (!res.ok) return;
      const data = await res.json() as { page: PageData; posts: Post[]; jobs: Job[]; products: Product[]; events: BizEvent[]; following: boolean; isOwner: boolean };
      if (!data.page?.id) return;
      // Ensure numeric fields always have a value so the render never crashes on .toLocaleString()
      data.page.followerCount = data.page.followerCount ?? 0;
      data.page.viewCount     = data.page.viewCount ?? 0;
      data.page.postCount     = data.page.postCount ?? 0;
      data.page.jobCount      = data.page.jobCount ?? 0;
      setPage(data.page); setPageId(data.page.id);
      setPosts(data.posts || []); setJobs(data.jobs || []);
      setProducts(data.products || []); setEvents(data.events || []);
      setFollowing(data.following ?? false); setIsOwner(data.isOwner ?? false);
    } catch {
      // Prevent unhandled rejection from crashing the error boundary
    } finally { setLoading(false); }
  }, [slug]);

  useEffect(() => { void loadPage(); }, [loadPage]);

  // Fetch published items for this business (have full thumbnails/images)
  const loadPublishedFeed = useCallback(async (pageName?: string) => {
    const name = pageName || page?.name || '';
    if (!name) return;
    const params = new URLSearchParams({ businessPageSlug: slug });
    params.set('businessPageName', name);
    const url = `/api/public/published?${params}`;
    // Retry up to 3 times — dev server compiles routes lazily and may return 404
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) { await new Promise(r => setTimeout(r, 800 * (attempt + 1))); continue; }
        const data = await res.json() as { items: FeedItem[] };
        setPublishedFeed(data.items || []);
        return;
      } catch { await new Promise(r => setTimeout(r, 800)); }
    }
  }, [slug, page?.name]);
  // Load after page data is available so we have the company name for legacy fallback
  useEffect(() => { if (page?.name) void loadPublishedFeed(page.name); }, [page?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pageId) return;
    fetch(`/api/business-pages/${pageId}/reviews`)
      .then(r => r.json())
      .then((d: { reviews: Review[]; average: number; total: number }) => {
        setReviews(d.reviews || []); setRevAvg(d.average || 0); setRevTotal(d.total || 0);
      }).catch(() => {});
  }, [pageId]);

  const [analyticsRefreshing, setAnalyticsRefreshing] = useState(false);
  const [analyticsUpdatedAt,  setAnalyticsUpdatedAt]  = useState<Date | null>(null);
  const analyticsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAnalytics = useCallback(async (silent = false) => {
    if (!isOwner || !pageId) return;
    if (!silent) setAnalyticsRefreshing(true);
    try {
      const res = await fetch(`/api/business-pages/${pageId}/analytics`);
      if (!res.ok) return;
      const d = await res.json() as AnalyticsData;
      setAnalytics(d);
      setAnalyticsUpdatedAt(new Date());
    } catch { /* swallow */ }
    finally { if (!silent) setAnalyticsRefreshing(false); }
  }, [isOwner, pageId]);

  useEffect(() => {
    if (isOwner && pageId && activeTab === 'analytics') {
      void fetchAnalytics(false);                         // immediate fetch
      analyticsIntervalRef.current = setInterval(() => {
        void fetchAnalytics(true);                        // silent background refresh
      }, 15_000);                                         // every 15 s
    }
    return () => {
      if (analyticsIntervalRef.current) clearInterval(analyticsIntervalRef.current);
    };
  }, [isOwner, pageId, activeTab, fetchAnalytics]);

  async function handleFollow() {
    if (!pageId) return;
    setFollowLoading(true);
    try {
      const res = await fetch(`/api/business-pages/${pageId}/follow`, { method: 'POST' });
      const d   = await res.json() as { following: boolean };
      setFollowing(d.following);
      setPage(p => p ? { ...p, followerCount: p.followerCount + (d.following ? 1 : -1) } : p);
      toast(d.following ? 'Following!' : 'Unfollowed');
    } finally { setFollowLoading(false); }
  }

  async function submitPost() {
    if (!postDraft.trim() || !pageId) return;
    setSubmitting(true);
    try {
      // 1. Save to business page posts
      const res = await fetch(`/api/business-pages/${pageId}/posts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: postDraft }),
      });
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? 'Failed'); }
      const d = await res.json() as { post: Post };
      setPosts(prev => [d.post, ...prev]);

      // 2. Cross-publish to main published feed with company name as author
      const txt  = postDraft.trim();
      const blob = new Blob([txt], { type: 'text/plain' });
      const reader = new FileReader();
      const dataUrl: string = await new Promise(resolve => { reader.onload = e => resolve(e.target?.result as string); reader.readAsDataURL(blob); });
      fetch('/api/public/file-directory/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: txt.slice(0, 60) + (txt.length > 60 ? '…' : ''),
          fileName: 'post.txt', mimeType: 'text/plain', dataUrl,
          sizeInBytes: blob.size,
          notes: txt,
          directoryVisibility: 'public',
          directoryCategory: 'post',
          directoryTags: [page?.industry ?? ''].filter(Boolean),
          authMode: 'public',
          uploadedByName: page?.name,
          avatarUrl: page?.logoUrl || undefined,
          businessPageSlug: page?.slug || slug,
          businessPageId: pageId,
        }),
      }).catch(() => {}); // fire-and-forget

      setPostDraft('');
      toast('Posted!');
      // Refresh published feed after a short delay (cross-publish is fire-and-forget)
      setTimeout(() => void loadPublishedFeed(), 2000);
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed to post', 'error'); }
    finally { setSubmitting(false); }
  }

  async function deletePost(postId: string) {
    await fetch(`/api/business-pages/${pageId}/posts/${postId}`, { method: 'DELETE' });
    setPosts(prev => prev.filter(p => p.id !== postId));
    toast('Deleted');
  }

  async function likePost(postId: string) {
    const res = await fetch(`/api/business-pages/${pageId}/posts/${postId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'like' }),
    });
    const d = await res.json() as { likeCount: number };
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, likeCount: d.likeCount } : p));
  }

  async function submitJob() {
    if (!jobForm.title || !jobForm.description) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/business-pages/${pageId}/jobs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...jobForm, salaryMin: jobForm.salaryMin ? parseInt(jobForm.salaryMin) : undefined, salaryMax: jobForm.salaryMax ? parseInt(jobForm.salaryMax) : undefined, skills: jobForm.skills.split(',').map(s => s.trim()).filter(Boolean) }),
      });
      const d = await res.json() as { job: Job };
      setJobs(prev => [d.job, ...prev]);
      setJobForm({ title: '', description: '', location: '', jobType: 'full_time', experienceLevel: '', salaryMin: '', salaryMax: '', skills: '', applyUrl: '' });
      setShowJobForm(false); toast('Job posted!');
    } finally { setSubmitting(false); }
  }

  async function submitProduct() {
    if (!prodForm.name) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/business-pages/${pageId}/products`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prodForm),
      });
      const d = await res.json() as { product: Product };
      setProducts(prev => [...prev, d.product]);
      setProdForm({ name: '', description: '', price: '', category: '', productUrl: '' });
      setShowProdForm(false); toast('Product added!');
    } finally { setSubmitting(false); }
  }

  async function submitEvent() {
    if (!evtForm.title || !evtForm.startAt) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/business-pages/${pageId}/events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(evtForm),
      });
      const d = await res.json() as { event: BizEvent };
      setEvents(prev => [d.event, ...prev]);
      setEvtForm({ title: '', description: '', eventType: 'webinar', startAt: '', endAt: '', location: '', isOnline: true, registrationUrl: '' });
      setShowEvtForm(false); toast('Event created!');
    } finally { setSubmitting(false); }
  }

  async function submitReview() {
    if (!myRating || !revBody.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/business-pages/${pageId}/reviews`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: myRating, title: revTitle, body: revBody }),
      });
      const d = await res.json() as { review: Review };
      setReviews(prev => { const idx = prev.findIndex(r => r.id === d.review.id); return idx >= 0 ? prev.map((r, i) => i === idx ? d.review : r) : [d.review, ...prev]; });
      setShowRevForm(false); toast('Review submitted!');
    } catch { toast('Failed', 'error'); }
    finally { setSubmitting(false); }
  }

  async function helpfulReview(reviewId: string) {
    const res = await fetch(`/api/business-pages/${pageId}/reviews`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'helpful', reviewId }),
    });
    const d = await res.json() as { review: Review };
    setReviews(prev => prev.map(r => r.id === reviewId ? d.review : r));
  }

  async function saveLogoUrl(url: string) {
    await fetch(`/api/business-pages/${pageId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logoUrl: url }),
    });
    setPage(p => p ? { ...p, logoUrl: url } : p);
  }

  async function saveCoverUrl(url: string) {
    await fetch(`/api/business-pages/${pageId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coverUrl: url }),
    });
    setPage(p => p ? { ...p, coverUrl: url } : p);
  }

  /* ── loading ── */
  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[#0a0a0e]">
      <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-indigo-500/20 border-t-indigo-500" />
    </div>
  );

  if (!page) return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0e] text-white">
      <Building2 className="h-12 w-12 text-white/15" />
      <h2 className="text-xl font-bold text-white/50">Page not found</h2>
      <Link href="/businesses" className="text-indigo-400 text-sm hover:text-indigo-300 transition">← Back to directory</Link>
    </div>
  );

  const pageUrl = typeof window !== 'undefined' ? window.location.href : `https://docrud.com/businesses/${slug}`;
  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview',  label: 'Overview' },
    { id: 'posts',     label: 'Posts',     count: posts.length },
    { id: 'jobs',      label: 'Jobs',      count: jobs.filter(j => j.status === 'open').length },
    { id: 'products',  label: 'Products',  count: products.length },
    { id: 'events',    label: 'Events',    count: events.length },
    { id: 'reviews',   label: 'Reviews',   count: revTotal },
    { id: 'team' as Tab, label: 'Team' },
    ...(isOwner ? [{ id: 'analytics' as Tab, label: 'Analytics' }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#09090d] text-white">
      <Toaster />
      <PublishAnythingDialog
        open={publishOpen}
        onOpenChange={o => { setPublishOpen(o); if (!o) { void loadPage(); void loadPublishedFeed(); } }}
        isAuthenticated
        businessPageId={pageId}
        businessPageSlug={page?.slug ?? slug}
        businessPageName={page?.name}
        businessLogoUrl={page?.logoUrl}
        onPublished={async ({ title, content, category: cat }) => {
          // Cross-save the published item as a business post so it appears in Posts tab
          if (!pageId) return;
          const text = content || title;
          if (!text) return;
          try {
            const res = await fetch(`/api/business-pages/${pageId}/posts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: text.slice(0, 2000) }),
            });
            if (res.ok) {
              const d = await res.json() as { post: Post };
              setPosts(prev => [d.post, ...prev]);
            }
          } catch {}
        }}
      />

      {showQR && <QRModal url={pageUrl} name={page.name} onClose={() => setShowQR(false)} />}

      {/* hidden file inputs */}
      <input ref={logoUpload.ref}  type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => void logoUpload.onChange(e, saveLogoUrl)} />
      <input ref={coverUpload.ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => void coverUpload.onChange(e, saveCoverUrl)} />

      {/* ── Sticky floating header ── */}
      <div className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
        <div className="border-b border-white/[0.07] bg-[#09090d]/90 backdrop-blur-2xl px-4 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <Link href="/businesses" className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/50 hover:text-white transition shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg overflow-hidden border border-white/[0.08]"
            style={{ background: page.logoUrl ? `url(${page.logoUrl}) center/cover` : 'linear-gradient(135deg,rgba(99,102,241,0.4),rgba(139,92,246,0.3))' }}>
            {!page.logoUrl && <span className="text-[12px] font-bold text-white/80">{page.name.charAt(0)}</span>}
          </div>
          <p className="font-bold text-[14px] text-white/90 flex-1 truncate">{page.name}</p>
          {page.verified && <BadgeCheck className="h-4 w-4 text-indigo-400 shrink-0" />}
          {!isOwner && (
            <button onClick={() => void handleFollow()} disabled={followLoading}
              className={`h-8 rounded-xl px-4 text-[12px] font-bold transition ${following ? 'border border-white/[0.10] bg-white/[0.05] text-white/60' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}>
              {following ? 'Following' : '+ Follow'}
            </button>
          )}
        </div>
      </div>

      {/* ── Cover ── */}
      <div className="relative h-52 sm:h-64 lg:h-80 overflow-hidden">
        {page.coverUrl ? (
          <img src={page.coverUrl} alt="cover" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full" style={{ background: 'linear-gradient(135deg,rgba(63,63,120,0.6),rgba(88,28,135,0.4),rgba(30,58,138,0.5))' }} />
        )}
        {/* gradient fade */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom,rgba(0,0,0,0.1) 30%,rgba(9,9,13,0.92))' }} />

        {/* back button */}
        <Link href="/businesses" className="absolute top-4 left-4 flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-black/40 backdrop-blur-md text-white/70 hover:text-white transition">
          <ArrowLeft className="h-4 w-4" />
        </Link>

        {/* cover upload (owner) */}
        {isOwner && (
          <button onClick={() => void coverUpload.pick()} disabled={coverUpload.uploading}
            className="absolute top-4 right-4 flex items-center gap-1.5 rounded-xl border border-white/20 bg-black/40 backdrop-blur-md px-3 py-2 text-[12px] font-semibold text-white/70 hover:text-white transition">
            {coverUpload.uploading ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white" /> : <Camera className="h-3.5 w-3.5" />}
            {coverUpload.uploading ? 'Uploading…' : 'Edit Cover'}
          </button>
        )}
      </div>

      {/* ── Profile hero ── */}
      <div className="relative px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-14 sm:-mt-12 relative z-10 pb-6 border-b border-white/[0.07]">
          {/* Logo */}
          <div className="relative shrink-0 self-start">
            <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl border-4 border-[#09090d] overflow-hidden shadow-2xl"
              style={{ background: page.logoUrl ? `url(${page.logoUrl}) center/cover` : 'linear-gradient(135deg,rgba(99,102,241,0.4),rgba(139,92,246,0.3))' }}>
              {!page.logoUrl && <div className="flex h-full items-center justify-center text-[32px] font-black text-white/80">{page.name.charAt(0)}</div>}
            </div>
            {isOwner && (
              <button onClick={() => void logoUpload.pick()} disabled={logoUpload.uploading}
                className="absolute -bottom-1.5 -right-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#09090d] bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition">
                {logoUpload.uploading
                  ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  : <Camera className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 pt-2 sm:pb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[22px] sm:text-[26px] font-black tracking-tight text-white leading-none">{page.name}</h1>
              {page.verified && <BadgeCheck className="h-5 w-5 text-indigo-400 shrink-0" />}
            </div>
            {page.tagline && <p className="text-[14px] text-white/45 mt-1.5 leading-snug">{page.tagline}</p>}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5">
              <span className="rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-300">
                {IND_LABELS[page.industry] ?? page.industry}
              </span>
              {page.companySize && <span className="text-[11.5px] text-white/35 flex items-center gap-1"><Users className="h-3 w-3" />{page.companySize} employees</span>}
              {(page.city || page.country) && <span className="text-[11.5px] text-white/30 flex items-center gap-1"><MapPin className="h-3 w-3" />{[page.city, page.country].filter(Boolean).join(', ')}</span>}
              {page.foundedYear && <span className="text-[11.5px] text-white/30">Est. {page.foundedYear}</span>}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap sm:shrink-0 pb-1">
            {!isOwner && (
              <button onClick={() => void handleFollow()} disabled={followLoading}
                className={`h-9 rounded-xl px-5 text-[13px] font-bold transition active:scale-[0.97] ${following ? 'border border-white/[0.12] bg-white/[0.05] text-white/60 hover:bg-white/[0.09]' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'}`}>
                {followLoading ? '…' : following ? 'Following' : '+ Follow'}
              </button>
            )}
            <button onClick={() => { void navigator.clipboard.writeText(pageUrl); toast('Link copied!'); }}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.10] bg-white/[0.04] px-3.5 text-[12.5px] font-semibold text-white/55 hover:bg-white/[0.09] hover:text-white/85 transition">
              <Share2 className="h-3.5 w-3.5" /> Share
            </button>
            <button onClick={() => setShowQR(true)}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.10] bg-white/[0.04] px-3.5 text-[12.5px] font-semibold text-white/55 hover:bg-white/[0.09] hover:text-white/85 transition">
              <QrCode className="h-3.5 w-3.5" /> QR
            </button>
            {isOwner && (
              <Link href={`/businesses/${slug}/edit`}
                className="flex h-9 items-center gap-1.5 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-3.5 text-[12.5px] font-semibold text-indigo-300 hover:bg-indigo-500/20 transition">
                <Edit3 className="h-3.5 w-3.5" /> Edit Page
              </Link>
            )}
          </div>
        </div>

        {/* ── Stats bar ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-5 border-b border-white/[0.07]">
          {[
            { icon: Users,       value: page.followerCount.toLocaleString(), label: 'Followers',  color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
            { icon: Briefcase,   value: page.jobCount,                        label: 'Open Jobs',  color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
            { icon: TrendingUp,  value: page.viewCount.toLocaleString(),      label: 'Page Views', color: 'text-emerald-400',bg: 'bg-emerald-500/10 border-emerald-500/20' },
            { icon: MessageCircle, value: page.postCount,                      label: 'Posts',      color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
          ].map(({ icon: Icon, value, label, color, bg }) => (
            <div key={label} className={`flex items-center gap-3 rounded-2xl border ${bg} px-4 py-3`}>
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${bg}`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
              <div>
                <p className="text-[20px] font-black text-white/90 leading-none tabular-nums">{value}</p>
                <p className={`text-[10.5px] font-semibold mt-0.5 ${color}`}>{label}</p>
              </div>
            </div>
          ))}
        </div>


        {/* ── Verify Business Banner (owner only) ── */}
        {isOwner && pageId && (
          <div className="py-4">
            <VerifyBusinessBanner pageId={pageId} />
          </div>
        )}

        {/* ── Tab nav ── */}
        <div className="overflow-x-auto [scrollbar-width:none] border-b border-white/[0.07] -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-max gap-1">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3.5 text-[13px] font-semibold border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-white'
                    : 'border-transparent text-white/35 hover:text-white/65 hover:border-white/20'
                }`}>
                {tab.label}
                {typeof tab.count === 'number' && tab.count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-bold min-w-[18px] text-center tabular-nums ${activeTab === tab.id ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/[0.07] text-white/30'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════
            TAB CONTENT
        ══════════════════════════════════ */}
        <div className="py-6 pb-24 animate-in fade-in duration-200" key={activeTab}>

          {/* ── OVERVIEW ── */}
          {activeTab === 'overview' && (
            <div className="space-y-5 max-w-4xl">

              {/* About */}
              {(page.description || isOwner) && (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-6">
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-white/25 mb-3">About</p>
                  {page.description
                    ? <p className="text-[14px] text-white/60 leading-relaxed">{page.description}</p>
                    : <p className="text-[13px] text-white/25 italic">No description yet.{isOwner && <> <Link href={`/businesses/${slug}/edit`} className="text-indigo-400 not-italic">Add one →</Link></>}</p>
                  }
                  {revTotal > 0 && (
                    <div className="flex items-center gap-2.5 mt-4 pt-4 border-t border-white/[0.06]">
                      <Stars rating={revAvg} />
                      <span className="text-[13px] font-bold text-white/75">{revAvg.toFixed(1)}</span>
                      <span className="text-[12px] text-white/30">({revTotal} review{revTotal !== 1 ? 's' : ''})</span>
                    </div>
                  )}
                </div>
              )}

              {/* Mission + Vision */}
              {(page.missionStatement || page.visionStatement) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {page.missionStatement && (
                    <div className="rounded-2xl border border-violet-500/15 bg-violet-500/[0.04] p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 border border-violet-500/20"><Target className="h-3.5 w-3.5 text-violet-400" /></div>
                        <p className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-violet-400/70">Mission</p>
                      </div>
                      <p className="text-[13.5px] text-white/65 leading-relaxed italic">&ldquo;{page.missionStatement}&rdquo;</p>
                    </div>
                  )}
                  {page.visionStatement && (
                    <div className="rounded-2xl border border-indigo-500/15 bg-indigo-500/[0.04] p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/15 border border-indigo-500/20"><Eye className="h-3.5 w-3.5 text-indigo-400" /></div>
                        <p className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-indigo-400/70">Vision</p>
                      </div>
                      <p className="text-[13.5px] text-white/65 leading-relaxed italic">&ldquo;{page.visionStatement}&rdquo;</p>
                    </div>
                  )}
                </div>
              )}

              {/* Key Business Facts */}
              {(page.companyType || page.foundedYear || page.companySize || page.revenueRange || page.fundingStage || page.numberOfOffices || (page.businessModels && page.businessModels.length > 0) || page.registrationNumber || page.gstNumber) && (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-6">
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-white/25 mb-5">Company Details</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5">
                    {page.companyType && (
                      <div><p className="text-[10px] font-semibold text-white/22 uppercase tracking-wider mb-1.5">Type</p><p className="text-[13px] font-semibold text-white/75">{page.companyType}</p></div>
                    )}
                    {page.foundedYear && (
                      <div><p className="text-[10px] font-semibold text-white/22 uppercase tracking-wider mb-1.5">Founded</p><p className="text-[13px] font-semibold text-white/75">{page.foundedYear}</p></div>
                    )}
                    {page.companySize && (
                      <div><p className="text-[10px] font-semibold text-white/22 uppercase tracking-wider mb-1.5">Team Size</p><p className="text-[13px] font-semibold text-white/75">{page.companySize} employees</p></div>
                    )}
                    {page.numberOfOffices && (
                      <div><p className="text-[10px] font-semibold text-white/22 uppercase tracking-wider mb-1.5">Offices</p><p className="text-[13px] font-semibold text-white/75">{page.numberOfOffices}</p></div>
                    )}
                    {page.revenueRange && (
                      <div><p className="text-[10px] font-semibold text-white/22 uppercase tracking-wider mb-1.5">Revenue</p><p className="text-[13px] font-bold text-emerald-400/90">{page.revenueRange}</p></div>
                    )}
                    {page.fundingStage && (
                      <div><p className="text-[10px] font-semibold text-white/22 uppercase tracking-wider mb-1.5">Funding</p><p className="text-[13px] font-bold text-amber-400/90">{page.fundingStage}</p></div>
                    )}
                  </div>
                  {page.businessModels && page.businessModels.length > 0 && (
                    <div className="mt-5 pt-5 border-t border-white/[0.06]">
                      <p className="text-[10px] font-semibold text-white/22 uppercase tracking-wider mb-2.5">Business Model</p>
                      <div className="flex flex-wrap gap-2">
                        {page.businessModels.map(m => <span key={m} className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-0.5 text-[11.5px] font-semibold text-blue-300/90">{m}</span>)}
                      </div>
                    </div>
                  )}
                  {(page.registrationNumber || page.gstNumber) && (
                    <div className="mt-5 pt-5 border-t border-white/[0.06] flex flex-wrap gap-8">
                      {page.registrationNumber && <div><p className="text-[10px] font-semibold text-white/20 uppercase tracking-wider mb-1">CIN / Reg. No.</p><p className="text-[12px] font-mono text-white/45">{page.registrationNumber}</p></div>}
                      {page.gstNumber && <div><p className="text-[10px] font-semibold text-white/20 uppercase tracking-wider mb-1">GST</p><p className="text-[12px] font-mono text-white/45">{page.gstNumber}</p></div>}
                    </div>
                  )}
                </div>
              )}

              {/* Specializations + Tech Stack */}
              {((page.specializations && page.specializations.length > 0) || (page.techStack && page.techStack.length > 0)) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {page.specializations && page.specializations.length > 0 && (
                    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
                      <div className="flex items-center gap-2 mb-3"><Layers className="h-3.5 w-3.5 text-white/28" /><p className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-white/25">Specializations</p></div>
                      <div className="flex flex-wrap gap-2">{page.specializations.map(s => <span key={s} className="rounded-full border border-white/[0.10] bg-white/[0.05] px-3 py-0.5 text-[11.5px] font-medium text-white/65">{s}</span>)}</div>
                    </div>
                  )}
                  {page.techStack && page.techStack.length > 0 && (
                    <div className="rounded-2xl border border-indigo-500/15 bg-indigo-500/[0.03] p-5">
                      <div className="flex items-center gap-2 mb-3"><Zap className="h-3.5 w-3.5 text-indigo-400/60" /><p className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-indigo-400/60">Tech Stack</p></div>
                      <div className="flex flex-wrap gap-2">{page.techStack.map(t => <span key={t} className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-0.5 text-[11.5px] font-medium text-indigo-300/80">{t}</span>)}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Culture */}
              {(page.workPolicy || (page.companyValues && page.companyValues.length > 0) || (page.perks && page.perks.length > 0) || (page.certifications && page.certifications.length > 0)) && (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-6">
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-white/25 mb-5">Culture & Workplace</p>
                  <div className="space-y-5">
                    {page.workPolicy && (
                      <div className="flex items-center gap-3">
                        <span className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-bold text-emerald-400">{page.workPolicy}</span>
                        <span className="text-[12px] text-white/35">Work Policy</span>
                      </div>
                    )}
                    {page.companyValues && page.companyValues.length > 0 && (
                      <div><p className="text-[10px] font-semibold text-white/22 uppercase tracking-wider mb-2.5">Core Values</p>
                        <div className="flex flex-wrap gap-2">{page.companyValues.map(v => <span key={v} className="rounded-full border border-violet-500/20 bg-violet-500/[0.08] px-3 py-0.5 text-[11.5px] font-medium text-violet-300/80">{v}</span>)}</div>
                      </div>
                    )}
                    {page.perks && page.perks.length > 0 && (
                      <div><p className="text-[10px] font-semibold text-white/22 uppercase tracking-wider mb-2.5">Perks & Benefits</p>
                        <div className="flex flex-wrap gap-2">{page.perks.map(p => <span key={p} className="rounded-full border border-emerald-500/18 bg-emerald-500/[0.07] px-3 py-0.5 text-[11.5px] font-medium text-emerald-300/75">{p}</span>)}</div>
                      </div>
                    )}
                    {page.certifications && page.certifications.length > 0 && (
                      <div><p className="text-[10px] font-semibold text-white/22 uppercase tracking-wider mb-2.5">Certifications & Awards</p>
                        <div className="flex flex-wrap gap-2">{page.certifications.map(c => <span key={c} className="rounded-full border border-amber-500/22 bg-amber-500/[0.07] px-3 py-0.5 text-[11.5px] font-medium text-amber-300/80">{c}</span>)}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Contact & Location + Social */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {(page.fullAddress || page.city || page.email || page.phone || page.website) && (
                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-white/25 mb-4">Contact & Location</p>
                    <div className="space-y-3">
                      {(page.fullAddress || page.city) && (
                        <div className="flex items-start gap-2.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-white/25 mt-0.5" />
                          <div>
                            {page.fullAddress && <p className="text-[12.5px] text-white/55">{page.fullAddress}</p>}
                            <p className="text-[12px] text-white/38">{[page.city, page.state, page.pinCode, page.country].filter(Boolean).join(', ')}</p>
                          </div>
                        </div>
                      )}
                      {page.website && (
                        <a href={page.website.startsWith('http') ? page.website : `https://${page.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 text-[12.5px] text-indigo-400 hover:text-indigo-300 transition group">
                          <Globe className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{page.website.replace(/^https?:\/\//, '')}</span><ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition" />
                        </a>
                      )}
                      {page.email && <a href={`mailto:${page.email}`} className="flex items-center gap-2.5 text-[12.5px] text-white/40 hover:text-white/70 transition"><Mail className="h-3.5 w-3.5 shrink-0" />{page.email}</a>}
                      {page.supportEmail && page.supportEmail !== page.email && (
                        <a href={`mailto:${page.supportEmail}`} className="flex items-center gap-2.5 text-[12.5px] text-white/35 hover:text-white/60 transition">
                          <Mail className="h-3.5 w-3.5 shrink-0" /><span>{page.supportEmail}</span>
                          <span className="text-[10px] text-white/22 border border-white/[0.08] rounded px-1.5 py-0.5">Support</span>
                        </a>
                      )}
                      {page.phone && <a href={`tel:${page.phone}`} className="flex items-center gap-2.5 text-[12.5px] text-white/40 hover:text-white/70 transition"><Phone className="h-3.5 w-3.5 shrink-0" />{page.phone}</a>}
                      {page.whatsapp && (
                        <a href={`https://wa.me/${page.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 text-[12.5px] text-emerald-400/70 hover:text-emerald-400 transition">
                          <Phone className="h-3.5 w-3.5 shrink-0" /><span>{page.whatsapp}</span>
                          <span className="text-[10px] text-emerald-400/50 border border-emerald-500/20 rounded px-1.5 py-0.5">WhatsApp</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}
                {Object.values(page.socialLinks || {}).some(Boolean) && (
                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-white/25 mb-4">Social & Web</p>
                    <div className="grid grid-cols-2 gap-2.5">
                      {page.socialLinks?.linkedin  && <a href={page.socialLinks.linkedin}  target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-[12px] font-semibold text-white/45 hover:text-blue-400 hover:border-blue-500/25 hover:bg-blue-500/[0.06] transition"><Linkedin  className="h-3.5 w-3.5 shrink-0" /> LinkedIn</a>}
                      {page.socialLinks?.twitter   && <a href={page.socialLinks.twitter}   target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-[12px] font-semibold text-white/45 hover:text-sky-400  hover:border-sky-500/25  hover:bg-sky-500/[0.06]  transition"><Twitter   className="h-3.5 w-3.5 shrink-0" /> Twitter / X</a>}
                      {page.socialLinks?.instagram && <a href={page.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-[12px] font-semibold text-white/45 hover:text-pink-400 hover:border-pink-500/25 hover:bg-pink-500/[0.06] transition"><Instagram  className="h-3.5 w-3.5 shrink-0" /> Instagram</a>}
                      {page.socialLinks?.youtube   && <a href={page.socialLinks.youtube}   target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-[12px] font-semibold text-white/45 hover:text-red-400  hover:border-red-500/25  hover:bg-red-500/[0.06]  transition"><Youtube    className="h-3.5 w-3.5 shrink-0" /> YouTube</a>}
                      {page.socialLinks?.github    && <a href={page.socialLinks.github}    target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-[12px] font-semibold text-white/45 hover:text-white/80 hover:border-white/20    hover:bg-white/[0.06]   transition"><Github     className="h-3.5 w-3.5 shrink-0" /> GitHub</a>}
                      {page.socialLinks?.facebook  && <a href={page.socialLinks.facebook}  target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-[12px] font-semibold text-white/45 hover:text-blue-500 hover:border-blue-600/25 hover:bg-blue-600/[0.06] transition"><Facebook   className="h-3.5 w-3.5 shrink-0" /> Facebook</a>}
                    </div>
                  </div>
                )}
              </div>

              {/* Edit CTA for owners with empty page */}
              {isOwner && !page.description && !page.missionStatement && (
                <div className="rounded-2xl border border-dashed border-white/[0.10] bg-white/[0.02] p-8 flex flex-col items-center gap-3 text-center">
                  <Building2 className="h-8 w-8 text-white/20" />
                  <p className="text-[14px] font-semibold text-white/40">Your Overview is empty</p>
                  <p className="text-[12px] text-white/25">Fill in your company profile to make a strong first impression</p>
                  <Link href={`/businesses/${slug}/edit`} className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 text-[13px] font-bold text-white transition">
                    <Edit3 className="h-3.5 w-3.5" /> Complete Profile
                  </Link>
                </div>
              )}

            </div>
          )}

          {/* ── POSTS ── */}
          {activeTab === 'posts' && (
            <div className="max-w-2xl space-y-5">
              {/* owner create panel */}
              {isOwner && (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-9 w-9 rounded-full overflow-hidden border border-white/[0.08] bg-white/[0.06] flex items-center justify-center shrink-0"
                      style={{ background: page.logoUrl ? `url(${page.logoUrl}) center/cover` : 'linear-gradient(135deg,rgba(99,102,241,0.3),rgba(139,92,246,0.2))' }}>
                      {!page.logoUrl && <span className="text-[12px] font-bold text-white/60">{page.name.charAt(0)}</span>}
                    </div>
                    <textarea
                      value={postDraft} onChange={e => setPostDraft(e.target.value)}
                      placeholder={`Share an update from ${page.name}…`} rows={postDraft ? 3 : 1}
                      className="flex-1 resize-none rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-[13.5px] text-white placeholder:text-white/25 outline-none transition focus:border-indigo-500/40 focus:bg-white/[0.06] leading-relaxed"
                    />
                  </div>
                  {postDraft && (
                    <div className="flex items-center justify-between">
                      <button onClick={() => { setPublishOpen(true); setPostDraft(''); }}
                        className="flex items-center gap-1.5 rounded-xl border border-white/[0.09] bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-white/45 hover:text-white/80 transition">
                        <Upload className="h-3.5 w-3.5" /> Publish to Feed
                      </button>
                      <div className="flex gap-2">
                        <button onClick={() => setPostDraft('')} className="rounded-xl border border-white/[0.09] bg-white/[0.04] px-3.5 py-1.5 text-[12px] font-semibold text-white/40 hover:text-white/70 transition">Cancel</button>
                        <button onClick={() => void submitPost()} disabled={submitting || !postDraft.trim()}
                          className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-1.5 text-[12px] font-bold text-white transition disabled:opacity-40">
                          {submitting ? 'Posting…' : 'Post'}
                        </button>
                      </div>
                    </div>
                  )}
                  {!postDraft && (
                    <div className="flex justify-end">
                      <button onClick={() => setPublishOpen(true)}
                        className="flex items-center gap-1.5 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-3.5 py-1.5 text-[12px] font-semibold text-indigo-300 hover:bg-indigo-500/20 transition">
                        <Plus className="h-3.5 w-3.5" /> Publish to Feed
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Posts feed:
                  - publishedFeed items: real file-transfer IDs → like/comment/trend APIs work ✓
                  - unpublishedPosts: raw business posts shown as temp cards (isReal:false)
                    until cross-publish catches up; use business post like API directly */}
              {(() => {
                const publishedIds = new Set(publishedFeed.map(f => f.id));
                const unpublishedPosts = posts.filter(p => !publishedIds.has(p.id));

                if (publishedFeed.length === 0 && unpublishedPosts.length === 0) return (
                  <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03]">
                      <MessageCircle className="h-6 w-6 text-white/20" />
                    </div>
                    <p className="text-[14px] font-semibold text-white/40">No posts yet</p>
                    {isOwner && <p className="text-[12px] text-white/25">Share your first company update above</p>}
                  </div>
                );

                return (
                  <div className="divide-y divide-white/[0.05]">
                    {/* ── Published feed items: all APIs work, delete via onDelete prop ── */}
                    {publishedFeed.map(item => (
                      <FeedCard
                        key={item.id}
                        item={item}
                        isOwn={isOwner}
                        onDelete={isOwner ? () => {
                          // For published items we don't delete the published post,
                          // just remove from local state (owner can manage from profile)
                          setPublishedFeed(prev => prev.filter(f => f.id !== item.id));
                          toast('Removed from view');
                        } : undefined}
                      />
                    ))}

                    {/* ── Unpublished raw posts: temporary cards until cross-publish ── */}
                    {unpublishedPosts.map(post => {
                      /* isReal:false — prevents FeedCard from calling wrong published API.
                         Like/unlike wired directly to the business post API via wrapper. */
                      const feedItem: FeedItem = {
                        id:             post.id,
                        category:       'post',
                        badge:          'Post',
                        title:          post.content.replace(/^\[POST\]\s*/i, '').slice(0, 80),
                        byline:         page.name,
                        body:           post.content.replace(/^\[POST\]\s*/i, ''),
                        postedAt:       post.createdAt,
                        isReal:         false,    // prevents wrong published-API calls
                        likesCount:     post.likeCount,
                        likedByViewer:  false,
                        commentsCount:  post.commentCount,
                        thumbnailUrl:   post.mediaUrls?.[0] || undefined,
                        uploadedByName: page.name,
                        uploadedByUserId: page.ownerUserId,
                      };
                      return (
                        <FeedCard
                          key={post.id}
                          item={feedItem}
                          isOwn={isOwner}
                          onDelete={isOwner ? () => void deletePost(post.id) : undefined}
                        />
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── JOBS ── */}
          {activeTab === 'jobs' && (
            <div className="max-w-2xl space-y-4">
              {isOwner && !showJobForm && (
                <button onClick={() => setShowJobForm(true)}
                  className="flex w-full items-center gap-2.5 rounded-2xl border border-dashed border-white/[0.10] bg-white/[0.02] p-4 text-[13px] font-semibold text-white/35 hover:border-white/20 hover:text-white/60 transition">
                  <Plus className="h-4 w-4" /> Post a Job Opening
                </button>
              )}
              {isOwner && showJobForm && (
                <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.04] p-5 space-y-4">
                  <h4 className="text-[14px] font-bold text-white/80">New Job Opening</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[{ k: 'title', l: 'Job Title *', p: 'e.g. Senior Engineer' }, { k: 'location', l: 'Location', p: 'e.g. Bengaluru / Remote' }, { k: 'applyUrl', l: 'Apply URL', p: 'https://…' }, { k: 'skills', l: 'Skills (comma-separated)', p: 'React, Node, Go' }].map(({ k, l, p }) => (
                      <div key={k} className={k === 'title' || k === 'skills' ? 'sm:col-span-2' : ''}>
                        <label className={lbl}>{l}</label>
                        <input value={(jobForm as Record<string,string>)[k]} onChange={e => setJobForm(f => ({ ...f, [k]: e.target.value }))} placeholder={p} className={inp} />
                      </div>
                    ))}
                    <div>
                      <label className={lbl}>Job Type</label>
                      <select value={jobForm.jobType} onChange={e => setJobForm(f => ({ ...f, jobType: e.target.value }))} className={`${inp} cursor-pointer`} style={{ background: '#0f1015' }}>
                        {Object.entries(JOB_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Experience</label>
                      <select value={jobForm.experienceLevel} onChange={e => setJobForm(f => ({ ...f, experienceLevel: e.target.value }))} className={`${inp} cursor-pointer`} style={{ background: '#0f1015' }}>
                        <option value="">Any level</option>
                        {['entry','junior','mid','senior','lead','executive'].map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase()+v.slice(1)}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={lbl}>Description *</label>
                      <textarea value={jobForm.description} onChange={e => setJobForm(f => ({ ...f, description: e.target.value }))} placeholder="Responsibilities, requirements…" rows={3}
                        className="w-full resize-none rounded-xl border border-white/[0.10] bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-white placeholder:text-white/25 outline-none transition focus:border-indigo-500/40" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowJobForm(false)} className="rounded-xl border border-white/[0.09] bg-white/[0.04] px-4 py-2 text-[12px] font-semibold text-white/45 hover:text-white/70 transition">Cancel</button>
                    <button onClick={() => void submitJob()} disabled={submitting} className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-2 text-[12px] font-bold text-white transition disabled:opacity-40">{submitting ? 'Posting…' : 'Post Job'}</button>
                  </div>
                </div>
              )}

              {jobs.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03]"><Briefcase className="h-6 w-6 text-white/20" /></div>
                  <p className="text-[14px] font-semibold text-white/40">No open positions</p>
                </div>
              ) : jobs.map(job => (
                <div key={job.id} className="group rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 hover:border-indigo-500/20 hover:bg-indigo-500/[0.03] transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-4 items-start flex-1 min-w-0">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10">
                        <Briefcase className="h-5 w-5 text-indigo-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[15px] font-bold text-white/90 leading-tight">{job.title}</h3>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                          <span className="text-[11.5px] text-white/40 font-medium">{JOB_TYPES[job.jobType] ?? job.jobType}</span>
                          {job.location && <span className="flex items-center gap-1 text-[11.5px] text-white/35"><MapPin className="h-3 w-3" />{job.location}</span>}
                          {job.experienceLevel && <span className="text-[11.5px] text-white/30 capitalize">{job.experienceLevel}</span>}
                          {(job.salaryMin || job.salaryMax) && <span className="text-[11.5px] font-semibold text-emerald-400/80">₹{job.salaryMin?.toLocaleString()}–{job.salaryMax?.toLocaleString()}/yr</span>}
                        </div>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">OPEN</span>
                  </div>
                  <p className="mt-3 text-[13px] text-white/40 leading-relaxed line-clamp-2">{job.description}</p>
                  {job.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {job.skills.slice(0, 6).map(s => (
                        <span key={s} className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-0.5 text-[10.5px] font-medium text-violet-400/80">{s}</span>
                      ))}
                    </div>
                  )}
                  {job.applyUrl && (
                    <a href={job.applyUrl} target="_blank" rel="noopener noreferrer"
                      className="mt-3.5 inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-4 py-2 text-[12px] font-bold text-indigo-300 hover:bg-indigo-500/20 transition">
                      Apply Now <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── PRODUCTS ── */}
          {activeTab === 'products' && (
            <div>
              {isOwner && !showProdForm && (
                <button onClick={() => setShowProdForm(true)}
                  className="mb-5 flex items-center gap-2.5 rounded-2xl border border-dashed border-white/[0.10] bg-white/[0.02] px-4 py-3 text-[13px] font-semibold text-white/35 hover:border-white/20 hover:text-white/60 transition">
                  <Plus className="h-4 w-4" /> Add Product / Service
                </button>
              )}
              {isOwner && showProdForm && (
                <div className="mb-5 rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.04] p-5 space-y-4">
                  <h4 className="text-[14px] font-bold text-white/80">Add Product / Service</h4>
                  {[{ k: 'name', l: 'Name *', p: 'Product or service name' }, { k: 'description', l: 'Description', p: 'Brief description' }, { k: 'price', l: 'Price', p: 'e.g. ₹2,999/mo or Free' }, { k: 'category', l: 'Category', p: 'SaaS, Hardware, Consulting…' }, { k: 'productUrl', l: 'URL', p: 'https://…' }].map(({ k, l, p }) => (
                    <div key={k}><label className={lbl}>{l}</label><input value={(prodForm as Record<string,string>)[k]} onChange={e => setProdForm(f => ({ ...f, [k]: e.target.value }))} placeholder={p} className={inp} /></div>
                  ))}
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowProdForm(false)} className="rounded-xl border border-white/[0.09] bg-white/[0.04] px-4 py-2 text-[12px] font-semibold text-white/45 hover:text-white/70 transition">Cancel</button>
                    <button onClick={() => void submitProduct()} disabled={submitting} className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-2 text-[12px] font-bold text-white transition disabled:opacity-40">{submitting ? 'Saving…' : 'Add'}</button>
                  </div>
                </div>
              )}
              {products.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03]"><Package className="h-6 w-6 text-white/20" /></div>
                  <p className="text-[14px] font-semibold text-white/40">No products listed</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {products.map(p => (
                    <div key={p.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 hover:border-emerald-500/20 hover:bg-emerald-500/[0.03] transition-all group">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 mb-4">
                        <Package className="h-5 w-5 text-emerald-400" />
                      </div>
                      <p className="text-[15px] font-bold text-white/90 mb-1">{p.name}</p>
                      {p.category && <p className="text-[10.5px] text-white/30 font-semibold uppercase tracking-wider mb-2">{p.category}</p>}
                      {p.description && <p className="text-[12.5px] text-white/45 leading-relaxed mb-3">{p.description}</p>}
                      {p.price && <p className="text-[14px] font-bold text-emerald-400 mb-3">{p.price}</p>}
                      {p.productUrl && (
                        <a href={p.productUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[12px] font-semibold text-indigo-400 hover:text-indigo-300 transition">
                          Learn more <ChevronRight className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── EVENTS ── */}
          {activeTab === 'events' && (
            <div className="max-w-2xl space-y-4">
              {isOwner && !showEvtForm && (
                <button onClick={() => setShowEvtForm(true)}
                  className="flex w-full items-center gap-2.5 rounded-2xl border border-dashed border-white/[0.10] bg-white/[0.02] p-4 text-[13px] font-semibold text-white/35 hover:border-white/20 hover:text-white/60 transition">
                  <Plus className="h-4 w-4" /> Create Event
                </button>
              )}
              {isOwner && showEvtForm && (
                <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.04] p-5 space-y-4">
                  <h4 className="text-[14px] font-bold text-white/80">Create Event</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[{ k: 'title', l: 'Title *', p: 'Event name' }, { k: 'description', l: 'Description', p: 'Event details' }, { k: 'location', l: 'Location', p: 'Venue or platform' }, { k: 'registrationUrl', l: 'Registration URL', p: 'https://…' }].map(({ k, l, p }) => (
                      <div key={k} className={k === 'title' || k === 'description' ? 'sm:col-span-2' : ''}>
                        <label className={lbl}>{l}</label>
                        <input value={(evtForm as Record<string,unknown>)[k] as string} onChange={e => setEvtForm(f => ({ ...f, [k]: e.target.value }))} placeholder={p} className={inp} />
                      </div>
                    ))}
                    <div><label className={lbl}>Start *</label><input type="datetime-local" value={evtForm.startAt} onChange={e => setEvtForm(f => ({ ...f, startAt: e.target.value }))} className={`${inp} [color-scheme:dark]`} /></div>
                    <div><label className={lbl}>End</label><input type="datetime-local" value={evtForm.endAt} onChange={e => setEvtForm(f => ({ ...f, endAt: e.target.value }))} className={`${inp} [color-scheme:dark]`} /></div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowEvtForm(false)} className="rounded-xl border border-white/[0.09] bg-white/[0.04] px-4 py-2 text-[12px] font-semibold text-white/45 hover:text-white/70 transition">Cancel</button>
                    <button onClick={() => void submitEvent()} disabled={submitting} className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-2 text-[12px] font-bold text-white transition disabled:opacity-40">{submitting ? 'Creating…' : 'Create'}</button>
                  </div>
                </div>
              )}
              {events.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03]"><Calendar className="h-6 w-6 text-white/20" /></div>
                  <p className="text-[14px] font-semibold text-white/40">No upcoming events</p>
                </div>
              ) : events.map(ev => (
                <div key={ev.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 flex gap-4 hover:border-amber-500/20 hover:bg-amber-500/[0.03] transition-all">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10">
                    <Calendar className="h-5 w-5 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-bold text-white/90">{ev.title}</p>
                    <p className="text-[12px] font-semibold text-amber-400 mt-1">{fmtDate(ev.startAt)}{ev.endAt ? ` → ${fmtDate(ev.endAt)}` : ''}</p>
                    {ev.description && <p className="text-[13px] text-white/40 mt-2 leading-relaxed">{ev.description}</p>}
                    <div className="flex flex-wrap items-center gap-2 mt-2.5">
                      {ev.isOnline && <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">Online</span>}
                      {ev.location && <span className="flex items-center gap-1 text-[11.5px] text-white/30"><MapPin className="h-3 w-3" />{ev.location}</span>}
                    </div>
                    {ev.registrationUrl && (
                      <a href={ev.registrationUrl} target="_blank" rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-1.5 text-[12px] font-bold text-amber-400 hover:bg-amber-500/20 transition">
                        Register <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── REVIEWS ── */}
          {activeTab === 'reviews' && (
            <div className="max-w-2xl space-y-5">
              {/* rating summary */}
              {revTotal > 0 && (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 flex flex-col sm:flex-row items-center gap-5">
                  <div className="text-center shrink-0">
                    <p className="text-[52px] font-black text-white/90 leading-none tabular-nums">{revAvg.toFixed(1)}</p>
                    <Stars rating={revAvg} size={16} />
                    <p className="text-[11.5px] text-white/30 mt-1">{revTotal} review{revTotal !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex-1 w-full space-y-1.5">
                    {[5,4,3,2,1].map(star => {
                      const count = reviews.filter(r => r.rating === star).length;
                      const pct   = revTotal ? (count / revTotal) * 100 : 0;
                      return (
                        <div key={star} className="flex items-center gap-2">
                          <span className="w-3 text-[11px] font-bold text-white/40 tabular-nums text-right">{star}</span>
                          <Star className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />
                          <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <div className="h-full rounded-full bg-amber-400/70 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-5 text-[11px] text-white/25 tabular-nums text-right">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* write review */}
              {!showRevForm ? (
                <button onClick={() => setShowRevForm(true)}
                  className="flex w-full items-center gap-2.5 rounded-2xl border border-dashed border-white/[0.10] bg-white/[0.02] p-4 text-[13px] font-semibold text-white/35 hover:border-white/20 hover:text-white/60 transition">
                  <Star className="h-4 w-4" /> Write a Review
                </button>
              ) : (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-5 space-y-4">
                  <h4 className="text-[14px] font-bold text-white/80">Your Review</h4>
                  {/* star picker */}
                  <div>
                    <label className={lbl}>Rating *</label>
                    <div className="flex items-center gap-1.5 mt-2">
                      {[1,2,3,4,5].map(s => (
                        <button key={s} type="button"
                          onMouseEnter={() => setHoverRating(s)}
                          onMouseLeave={() => setHoverRating(0)}
                          onClick={() => setMyRating(s)}
                          className="transition-transform hover:scale-110 active:scale-95">
                          <Star className={`h-7 w-7 transition-colors ${s <= (hoverRating || myRating) ? 'fill-amber-400 text-amber-400' : 'text-white/15'}`} />
                        </button>
                      ))}
                      {(hoverRating || myRating) > 0 && (
                        <span className="ml-2 text-[13px] font-semibold text-amber-400/80">
                          {['','Poor','Fair','Good','Very Good','Excellent'][hoverRating || myRating]}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className={lbl}>Title</label>
                    <input value={revTitle} onChange={e => setRevTitle(e.target.value)} placeholder="Summary of your experience" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Review *</label>
                    <textarea value={revBody} onChange={e => setRevBody(e.target.value)} placeholder="Share your experience with this company…" rows={4}
                      className="w-full resize-none rounded-xl border border-white/[0.10] bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-white placeholder:text-white/25 outline-none transition focus:border-amber-500/40" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setShowRevForm(false); setMyRating(0); setRevTitle(''); setRevBody(''); }}
                      className="rounded-xl border border-white/[0.09] bg-white/[0.04] px-4 py-2 text-[12px] font-semibold text-white/45 hover:text-white/70 transition">Cancel</button>
                    <button onClick={() => void submitReview()} disabled={submitting || !myRating || !revBody.trim()}
                      className="rounded-xl bg-amber-500 hover:bg-amber-400 px-6 py-2 text-[12px] font-bold text-[#0a0a0e] transition disabled:opacity-40">{submitting ? 'Submitting…' : 'Submit Review'}</button>
                  </div>
                </div>
              )}

              {reviews.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03]"><Award className="h-6 w-6 text-white/20" /></div>
                  <p className="text-[14px] font-semibold text-white/40">No reviews yet</p>
                  <p className="text-[12px] text-white/25">Be the first to review this company</p>
                </div>
              ) : reviews.map(rev => (
                <div key={rev.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[12px] font-bold text-white/60">
                        {rev.userName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-[13px] font-bold text-white/85">{rev.userName}</p>
                        <p className="text-[10.5px] text-white/30">{timeAgo(rev.createdAt)}</p>
                      </div>
                    </div>
                    <Stars rating={rev.rating} size={13} />
                  </div>
                  {rev.title && <p className="text-[14px] font-bold text-white/80 mb-1.5">{rev.title}</p>}
                  <p className="text-[13px] text-white/55 leading-relaxed">{rev.body}</p>
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.05]">
                    <button onClick={() => void helpfulReview(rev.id)}
                      className="flex items-center gap-1.5 text-[11.5px] font-semibold text-white/30 hover:text-amber-400 transition">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Helpful {rev.helpful > 0 && `(${rev.helpful})`}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── TEAM ── */}
          {activeTab === 'team' && (
            <TeamTab pageId={page.id} pageSlug={page.slug} pageName={page.name} isOwner={isOwner} />
          )}

          {/* ── ANALYTICS (owner) ── */}
          {activeTab === 'analytics' && isOwner && (
            <div className="space-y-5 pb-10">

              {/* Header bar */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-[16px] font-bold text-white/85 leading-none">Analytics</h2>
                  {analyticsUpdatedAt && (
                    <p className="text-[11px] text-white/28 mt-1 flex items-center gap-1.5">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Live · updated {analyticsUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => void fetchAnalytics(false)}
                  disabled={analyticsRefreshing}
                  className="flex items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.04] px-3.5 py-2 text-[12px] font-semibold text-white/50 hover:bg-white/[0.08] hover:text-white/80 transition disabled:opacity-40"
                >
                  <TrendingUp className={`h-3.5 w-3.5 ${analyticsRefreshing ? 'animate-spin' : ''}`} />
                  {analyticsRefreshing ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              {!analytics ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-white/[0.025] animate-pulse" />)}
                </div>
              ) : (() => {
                /* ── helpers ── */
                const fmtK = (n: number) => n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n);
                const wkLabel = (iso: string) => { const d = new Date(iso); return `${d.getDate()}/${d.getMonth()+1}`; };
                const avgPost = analytics.postCount > 0 ? (analytics.totalLikes / analytics.postCount).toFixed(1) : '0';
                const engageRate = analytics.followerCount > 0 ? ((analytics.totalLikes + analytics.totalComments) / analytics.followerCount * 100).toFixed(2) : '0.00';
                const profileFields = [page.description, page.missionStatement, page.visionStatement, page.website, page.email, page.phone, page.logoUrl, page.coverUrl, page.city, page.companyType, (page.specializations?.length ?? 0) > 0, (page.techStack?.length ?? 0) > 0];
                const profileScore = Math.round((profileFields.filter(Boolean).length / profileFields.length) * 100);

                /* ── SVG line chart ── */
                function LineChart({ data, color, gradId }: { data: { label: string; value: number }[]; color: string; gradId: string }) {
                  if (data.length < 2) return <div className="flex items-center justify-center h-[110px] text-[12px] text-white/20">No data yet</div>;
                  const W = 500, H = 90, pad = 8;
                  const max = Math.max(...data.map(d => d.value), 1);
                  const pts = data.map((d, i) => ({ x: pad + (i / (data.length - 1)) * (W - pad*2), y: pad + (1 - d.value / max) * (H - pad*2) }));
                  const line = pts.reduce((a, p, i) => { if (i===0) return `M${p.x},${p.y}`; const pv=pts[i-1]; const mx=(pv.x+p.x)/2; return `${a} C${mx},${pv.y} ${mx},${p.y} ${p.x},${p.y}`; }, '');
                  const area = `${line} L${pts[pts.length-1].x},${H} L${pts[0].x},${H} Z`;
                  return (
                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 110 }} preserveAspectRatio="none">
                      <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity="0.35"/>
                          <stop offset="100%" stopColor={color} stopOpacity="0.01"/>
                        </linearGradient>
                      </defs>
                      <path d={area} fill={`url(#${gradId})`}/>
                      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      {pts.map((p, i) => data[i].value > 0 && <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} opacity="0.9"/>)}
                    </svg>
                  );
                }

                /* ── SVG bar chart ── */
                function BarChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
                  if (!data.length) return <div className="flex items-center justify-center h-[90px] text-[12px] text-white/20">No data</div>;
                  const W = 500, H = 80;
                  const max = Math.max(...data.map(d => d.value), 1);
                  const bw = Math.max(6, (W / data.length) * 0.55);
                  const gap = W / data.length;
                  return (
                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 90 }} preserveAspectRatio="none">
                      {data.map((d, i) => {
                        const bh = Math.max(2, (d.value / max) * (H - 6));
                        const x = i * gap + gap / 2 - bw / 2;
                        return <rect key={i} x={x} y={H - bh} width={bw} height={bh} fill={color} opacity={d.value > 0 ? '0.75' : '0.15'} rx="3"/>;
                      })}
                    </svg>
                  );
                }

                /* ── donut ── */
                function Donut({ pct, color, size = 72 }: { pct: number; color: string; size?: number }) {
                  const r = 28, c = 2 * Math.PI * r, stroke = Math.min(pct, 100) / 100 * c;
                  return (
                    <svg width={size} height={size} viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7"/>
                      <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="7"
                        strokeDasharray={`${stroke} ${c}`} strokeLinecap="round" transform="rotate(-90 32 32)"
                        style={{ transition: 'stroke-dasharray 1s ease' }}/>
                      <text x="32" y="36" textAnchor="middle" fontSize="12" fontWeight="800" fill="rgba(255,255,255,0.85)">{pct}%</text>
                    </svg>
                  );
                }

                const followerChartData = analytics.followersByWeek.map(w => ({ label: wkLabel(w.week), value: w.count }));
                const postChartData     = analytics.postsByWeek.map(w => ({ label: wkLabel(w.week), value: w.count }));
                const totalRatings      = analytics.ratingDistribution.reduce((s, r) => s + r.count, 0);

                /* ── insight strings ── */
                const insights: string[] = [];
                if (analytics.recentFollowers > 0) insights.push(`+${analytics.recentFollowers} new follower${analytics.recentFollowers !== 1 ? 's' : ''} in the last 30 days.`);
                if (parseFloat(engageRate) > 5) insights.push(`Strong engagement rate of ${engageRate}% — above industry average.`);
                else if (analytics.followerCount > 0) insights.push(`Engagement rate is ${engageRate}%. Posting consistently can improve it.`);
                if (analytics.avgRating >= 4.5) insights.push(`Excellent average rating of ${analytics.avgRating.toFixed(1)} ⭐ — keep it up.`);
                else if (analytics.reviewCount > 0) insights.push(`Average rating: ${analytics.avgRating.toFixed(1)} across ${analytics.reviewCount} review${analytics.reviewCount !== 1 ? 's' : ''}.`);
                if (profileScore < 70) insights.push(`Profile is ${profileScore}% complete. A richer profile attracts more followers.`);
                if (analytics.postCount === 0) insights.push('No posts yet — start sharing updates to boost visibility.');
                if (analytics.jobCount === 0) insights.push('No open job listings. Posting roles increases page traffic.');
                if (analytics.totalLikes > 0) insights.push(`Your posts have earned ${fmtK(analytics.totalLikes)} like${analytics.totalLikes !== 1 ? 's' : ''} and ${fmtK(analytics.totalComments)} comment${analytics.totalComments !== 1 ? 's' : ''}.`);

                return (
                  <>
                    {/* ── KPI strip ── */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Page Views',       value: fmtK(analytics.totalViews),     sub: 'All time',          color: '#818cf8' },
                        { label: 'Followers',         value: fmtK(analytics.followerCount),  sub: `+${analytics.recentFollowers} this month`, color: '#34d399' },
                        { label: 'Engagement Rate',   value: `${engageRate}%`,               sub: 'Likes + comments / followers', color: '#f472b6' },
                        { label: 'Avg Likes / Post',  value: avgPost,                        sub: `${fmtK(analytics.totalLikes)} total likes`, color: '#fbbf24' },
                        { label: 'Posts',             value: String(analytics.postCount),    sub: `${fmtK(analytics.totalComments)} comments`, color: '#60a5fa' },
                        { label: 'Open Jobs',         value: String(analytics.jobCount),     sub: 'Active listings',   color: '#a78bfa' },
                        { label: 'Avg Rating',        value: analytics.reviewCount > 0 ? analytics.avgRating.toFixed(1) : '—', sub: `${analytics.reviewCount} review${analytics.reviewCount !== 1 ? 's' : ''}`, color: '#fb923c' },
                        { label: 'Profile Complete',  value: `${profileScore}%`,             sub: 'Fill more to rank higher', color: profileScore >= 80 ? '#34d399' : profileScore >= 50 ? '#fbbf24' : '#f87171' },
                      ].map(({ label, value, sub, color }) => (
                        <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                          <p className="text-[10px] font-bold uppercase tracking-[0.10em] mb-2" style={{ color: 'rgba(255,255,255,0.28)' }}>{label}</p>
                          <p className="text-[26px] font-black tabular-nums leading-none" style={{ color }}>{value}</p>
                          <p className="text-[10.5px] mt-1.5" style={{ color: 'rgba(255,255,255,0.28)' }}>{sub}</p>
                        </div>
                      ))}
                    </div>

                    {/* ── Charts row ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Follower growth */}
                      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
                        <div className="flex items-center justify-between mb-1">
                          <div>
                            <p className="text-[13px] font-bold text-white/80">Follower Growth</p>
                            <p className="text-[11px] text-white/30 mt-0.5">New followers per week · last 12 weeks</p>
                          </div>
                          <span className="text-[11px] font-semibold rounded-full px-2.5 py-1 border" style={{ color: '#34d399', borderColor: 'rgba(52,211,153,0.25)', background: 'rgba(52,211,153,0.07)' }}>
                            +{analytics.followersByWeek.reduce((s, w) => s + w.count, 0)} total
                          </span>
                        </div>
                        <div className="mt-3">
                          <LineChart data={followerChartData} color="#34d399" gradId="grad-followers"/>
                        </div>
                        <div className="flex justify-between mt-1">
                          {followerChartData.filter((_, i) => i % 3 === 0).map((d, i) => (
                            <span key={i} className="text-[9px] text-white/20">{d.label}</span>
                          ))}
                        </div>
                      </div>

                      {/* Post activity */}
                      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
                        <div className="flex items-center justify-between mb-1">
                          <div>
                            <p className="text-[13px] font-bold text-white/80">Post Activity</p>
                            <p className="text-[11px] text-white/30 mt-0.5">Posts published per week · last 10 weeks</p>
                          </div>
                          <span className="text-[11px] font-semibold rounded-full px-2.5 py-1 border" style={{ color: '#60a5fa', borderColor: 'rgba(96,165,250,0.25)', background: 'rgba(96,165,250,0.07)' }}>
                            {analytics.postCount} total
                          </span>
                        </div>
                        <div className="mt-3">
                          <BarChart data={postChartData} color="#60a5fa"/>
                        </div>
                        <div className="flex justify-between mt-1">
                          {postChartData.filter((_, i) => i % 2 === 0).map((d, i) => (
                            <span key={i} className="text-[9px] text-white/20">{d.label}</span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* ── Engagement + Ratings + Profile health ── */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* Engagement breakdown */}
                      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
                        <p className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-white/25 mb-4">Engagement</p>
                        <div className="space-y-3">
                          {[
                            { label: 'Total Likes',    value: analytics.totalLikes,    color: '#f472b6', max: Math.max(analytics.totalLikes, analytics.totalComments, 1) },
                            { label: 'Total Comments', value: analytics.totalComments, color: '#818cf8', max: Math.max(analytics.totalLikes, analytics.totalComments, 1) },
                          ].map(({ label, value, color, max }) => (
                            <div key={label}>
                              <div className="flex justify-between mb-1">
                                <span className="text-[11.5px] text-white/45">{label}</span>
                                <span className="text-[11.5px] font-bold text-white/70">{fmtK(value)}</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(value / max) * 100}%`, background: color }}/>
                              </div>
                            </div>
                          ))}
                          <div className="pt-3 border-t border-white/[0.06]">
                            <p className="text-[10px] text-white/25 uppercase tracking-wider mb-1">Avg per post</p>
                            <p className="text-[22px] font-black text-white/80 tabular-nums">{avgPost} <span className="text-[13px] font-normal text-white/30">likes</span></p>
                          </div>
                        </div>
                      </div>

                      {/* Rating distribution */}
                      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
                        <p className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-white/25 mb-4">Rating Breakdown</p>
                        {analytics.reviewCount === 0 ? (
                          <div className="flex flex-col items-center justify-center h-24 gap-2">
                            <Star className="h-6 w-6 text-white/15"/>
                            <p className="text-[11.5px] text-white/25">No reviews yet</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {[5,4,3,2,1].map(star => {
                              const row = analytics.ratingDistribution.find(r => r.rating === star);
                              const cnt = row?.count ?? 0;
                              const pct = totalRatings > 0 ? (cnt / totalRatings) * 100 : 0;
                              return (
                                <div key={star} className="flex items-center gap-2">
                                  <span className="text-[10.5px] text-white/40 w-4 shrink-0">{star}★</span>
                                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: star >= 4 ? '#34d399' : star === 3 ? '#fbbf24' : '#f87171', transition: 'width 0.7s ease' }}/>
                                  </div>
                                  <span className="text-[10px] text-white/30 w-5 text-right shrink-0">{cnt}</span>
                                </div>
                              );
                            })}
                            <div className="pt-3 border-t border-white/[0.06] flex items-center gap-2">
                              <p className="text-[22px] font-black text-white/85 tabular-nums">{analytics.avgRating.toFixed(1)}</p>
                              <div>
                                <Stars rating={analytics.avgRating} size={12}/>
                                <p className="text-[10px] text-white/28 mt-0.5">{analytics.reviewCount} review{analytics.reviewCount !== 1 ? 's' : ''}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Profile health */}
                      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
                        <p className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-white/25 mb-4">Profile Health</p>
                        <div className="flex items-center gap-4 mb-4">
                          <Donut pct={profileScore} color={profileScore >= 80 ? '#34d399' : profileScore >= 50 ? '#fbbf24' : '#f87171'}/>
                          <div>
                            <p className="text-[13px] font-bold text-white/75">{profileScore >= 80 ? 'Excellent' : profileScore >= 60 ? 'Good' : profileScore >= 40 ? 'Fair' : 'Needs work'}</p>
                            <p className="text-[11px] text-white/30 mt-0.5">Profile completeness</p>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          {[
                            { label: 'About / Description', done: !!page.description },
                            { label: 'Mission & Vision',    done: !!(page.missionStatement || page.visionStatement) },
                            { label: 'Logo & Cover',        done: !!(page.logoUrl && page.coverUrl) },
                            { label: 'Contact info',        done: !!(page.email && page.phone) },
                            { label: 'Specializations',     done: (page.specializations?.length ?? 0) > 0 },
                            { label: 'Social links',        done: Object.values(page.socialLinks || {}).some(Boolean) },
                          ].map(({ label, done }) => (
                            <div key={label} className="flex items-center gap-2">
                              <div className={`h-3.5 w-3.5 rounded-full border flex items-center justify-center shrink-0 ${done ? 'border-emerald-500/40 bg-emerald-500/15' : 'border-white/[0.10] bg-transparent'}`}>
                                {done && <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400"/>}
                              </div>
                              <span className={`text-[11px] ${done ? 'text-white/50' : 'text-white/28'}`}>{label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* ── Top posts + Insights row ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Top posts */}
                      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
                        <p className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-white/25 mb-4">Top Performing Posts</p>
                        {analytics.topPosts.length === 0 ? (
                          <div className="flex flex-col items-center justify-center gap-2 py-8">
                            <MessageCircle className="h-7 w-7 text-white/15"/>
                            <p className="text-[12px] text-white/25">No posts published yet</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {analytics.topPosts.map((post, i) => (
                              <div key={post.id} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-black" style={{ background: i === 0 ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.05)', color: i === 0 ? '#fbbf24' : 'rgba(255,255,255,0.35)' }}>#{i+1}</div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[12px] text-white/60 leading-snug line-clamp-2">{post.content.replace(/^\[POST\]\s*/i, '')}</p>
                                  <div className="flex items-center gap-3 mt-1.5">
                                    <span className="flex items-center gap-1 text-[10.5px] text-pink-400/70"><Heart className="h-3 w-3"/> {post.likeCount}</span>
                                    <span className="flex items-center gap-1 text-[10.5px] text-indigo-400/70"><MessageCircle className="h-3 w-3"/> {post.commentCount}</span>
                                    <span className="text-[10px] text-white/22">{timeAgo(post.createdAt)}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* AI-style insights */}
                      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 border border-violet-500/20">
                            <Zap className="h-3.5 w-3.5 text-violet-400"/>
                          </div>
                          <p className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-white/25">Insights & Recommendations</p>
                        </div>
                        {insights.length === 0 ? (
                          <p className="text-[12px] text-white/25 italic">Keep building your page to unlock insights.</p>
                        ) : (
                          <div className="space-y-3">
                            {insights.map((txt, i) => (
                              <div key={i} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                                <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
                                  <span className="text-[9px] font-black text-violet-400">{i+1}</span>
                                </div>
                                <p className="text-[12.5px] text-white/55 leading-relaxed">{txt}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Page summary counters */}
                        <div className="mt-4 pt-4 border-t border-white/[0.06] grid grid-cols-3 gap-3">
                          {[
                            { label: 'Products', value: analytics.productCount },
                            { label: 'Events',   value: analytics.eventCount },
                            { label: 'Reviews',  value: analytics.reviewCount },
                          ].map(({ label, value }) => (
                            <div key={label} className="text-center">
                              <p className="text-[18px] font-black text-white/70 tabular-nums">{value}</p>
                              <p className="text-[10px] text-white/28 mt-0.5">{label}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

        </div>{/* end tab content */}
      </div>{/* end max-w container */}
    </div>
  );
}

/* ─── Team Tab ──────────────────────────────────────────────────── */
interface TeamMember {
  id: string; userId: string; role: string; title?: string; department?: string;
  name?: string; avatarUrl?: string; headline?: string; location?: string;
  profileSetupDone?: boolean; joinedAt: string;
}

function TeamTab({ pageId, pageSlug, pageName, isOwner }: { pageId: string; pageSlug: string; pageName: string; isOwner: boolean }) {
  const [members, setMembers] = React.useState<TeamMember[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch(`/api/business-pages/${pageId}/members`)
      .then(r => r.json())
      .then((d: { members?: TeamMember[] }) => { setMembers(d.members ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [pageId]);

  if (loading) return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] animate-pulse" style={{ height: 140 }} />
      ))}
    </div>
  );

  if (members.length === 0) return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="text-4xl">👥</div>
      <div>
        <p className="text-[14px] font-bold text-white/50 mb-1">No team members yet</p>
        <p className="text-[12px] text-white/25">
          {isOwner
            ? <>Go to <Link href={`/businesses/${pageSlug}/edit`} className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">edit page</Link> to invite employees.</>
            : 'This company hasn\'t added any team members yet.'}
        </p>
      </div>
    </div>
  );

  const byDept = members.reduce<Record<string, TeamMember[]>>((acc, m) => {
    const d = m.department || 'Team';
    if (!acc[d]) acc[d] = [];
    acc[d].push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      {isOwner && (
        <div className="flex items-center justify-between">
          <p className="text-[12.5px] text-white/35">{members.length} member{members.length !== 1 ? 's' : ''} across {Object.keys(byDept).length} department{Object.keys(byDept).length !== 1 ? 's' : ''}</p>
          <Link href={`/businesses/${pageSlug}/edit`}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors">
            <Users className="h-3.5 w-3.5" />Manage team
          </Link>
        </div>
      )}

      {Object.entries(byDept).map(([dept, deptMembers]) => (
        <div key={dept}>
          {Object.keys(byDept).length > 1 && (
            <h3 className="text-[11px] font-black uppercase tracking-widest text-white/30 mb-4">{dept}</h3>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {deptMembers.map(m => (
              <Link key={m.userId} href={`/u/${m.userId}`}
                className="group block rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 hover:border-indigo-500/30 hover:bg-indigo-500/[0.04] transition-all duration-200 text-decoration-none"
                style={{ textDecoration: 'none' }}>
                {/* Avatar */}
                <div className="mb-3">
                  {m.avatarUrl
                    ? <img src={m.avatarUrl} alt={m.name || ''} className="w-12 h-12 rounded-full object-cover border-2 border-white/10 group-hover:border-indigo-500/30 transition-colors" />
                    : <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-black text-white/80 border border-indigo-500/25" style={{ background: 'linear-gradient(135deg,#4f46e5,#818cf8)' }}>
                        {(m.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                  }
                </div>
                {/* Name */}
                <p className="text-[13px] font-bold text-white/88 truncate mb-0.5 group-hover:text-white transition-colors" style={{ margin: 0 }}>
                  {m.name || 'Team Member'}
                </p>
                {/* Title / Headline */}
                <p className="text-[11px] text-white/35 truncate mb-2" style={{ margin: '2px 0 8px' }}>
                  {m.title || m.headline || pageName}
                </p>
                {/* Role chip */}
                <span className="inline-block text-[9.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border"
                  style={{ background: 'rgba(99,102,241,0.10)', borderColor: 'rgba(99,102,241,0.22)', color: 'rgba(165,180,252,0.65)' }}>
                  {m.role}
                </span>
                {!m.profileSetupDone && (
                  <span className="ml-1.5 inline-block text-[9.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border"
                    style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.18)', color: 'rgba(251,191,36,0.55)' }}>
                    Setup pending
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
