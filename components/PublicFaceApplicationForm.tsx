'use client';

import { useState, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Instagram,
  Mail,
  Shield,
  Star,
  Trophy,
  Twitter,
  Upload,
  X,
  Youtube,
  Zap,
} from 'lucide-react';
import InfinityUpgradeModal from '@/components/InfinityUpgradeModal';
import type { PublicFaceCategory } from '@/types/document';

/* ─── Category data ──────────────────────────────────────────────────── */
const CATEGORIES: { value: PublicFaceCategory; label: string; icon: string; desc: string }[] = [
  { value: 'actor_actress',              label: 'Actor / Actress',            icon: '🎭', desc: 'Films, TV series, theatre' },
  { value: 'singer_musician',            label: 'Singer / Musician',          icon: '🎵', desc: 'Music artist, band member' },
  { value: 'athlete_sportsperson',       label: 'Athlete / Sportsperson',     icon: '🏆', desc: 'Professional or national level' },
  { value: 'model',                      label: 'Model',                      icon: '✨', desc: 'Fashion, commercial, runway' },
  { value: 'content_creator',            label: 'Content Creator',            icon: '🎬', desc: 'YouTube, podcasts, blogs' },
  { value: 'influencer',                 label: 'Influencer',                 icon: '📱', desc: 'Social media influencer' },
  { value: 'politician',                 label: 'Politician',                 icon: '🏛️', desc: 'Elected or public office' },
  { value: 'entrepreneur_ceo',           label: 'Entrepreneur / CEO',         icon: '💼', desc: 'Founder, exec, business leader' },
  { value: 'author_writer',              label: 'Author / Writer',            icon: '📖', desc: 'Published books, journalism' },
  { value: 'academic_scientist',         label: 'Academic / Scientist',       icon: '🔬', desc: 'Researcher, professor, expert' },
  { value: 'tv_personality',             label: 'TV Personality',             icon: '📺', desc: 'Host, presenter, anchor' },
  { value: 'comedian',                   label: 'Comedian',                   icon: '😄', desc: 'Stand-up, sketches, shows' },
  { value: 'social_activist',            label: 'Social Activist',            icon: '✊', desc: 'Advocacy, movements, NGO' },
  { value: 'chef_culinary',              label: 'Chef / Culinary Expert',     icon: '👨‍🍳', desc: 'Restaurants, food media' },
  { value: 'fashion_designer',           label: 'Fashion Designer',           icon: '👗', desc: 'Clothing, accessories, brands' },
  { value: 'photographer_videographer',  label: 'Photographer / Videographer',icon: '📷', desc: 'Published photography, films' },
  { value: 'game_streamer',              label: 'Game Streamer',              icon: '🎮', desc: 'Twitch, YouTube Gaming, esports' },
  { value: 'journalist',                 label: 'Journalist',                 icon: '📰', desc: 'Reporter, editor, media' },
  { value: 'other',                      label: 'Other Public Figure',        icon: '⭐', desc: 'Other form of public recognition' },
];

/* ─── Step config ───────────────────────────────────────────────────── */
const STEPS = [
  { label: 'Category',     icon: Star },
  { label: 'Presence',     icon: Zap },
  { label: 'Background',   icon: Trophy },
  { label: 'Identity',     icon: Shield },
  { label: 'Verify',       icon: Mail },
];

/* ─── Field wrapper ─────────────────────────────────────────────────── */
function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-white/35">
          {label}{required && <span className="ml-1 text-indigo-400">*</span>}
        </label>
        {hint && <span className="text-[10.5px] text-white/20">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const INPUT_CLS = 'w-full rounded-[10px] bg-white/[0.04] border border-white/[0.08] px-3.5 py-2.5 text-[13px] text-white/80 placeholder-white/20 outline-none transition focus:border-indigo-500/50 focus:bg-white/[0.06]';
const TEXTAREA_CLS = `${INPUT_CLS} resize-none leading-relaxed`;

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function PublicFaceApplicationForm({ onClose, onSuccess }: Props) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showInfinityModal, setShowInfinityModal] = useState(false);

  /* form state */
  const [category, setCategory]                         = useState<PublicFaceCategory | ''>('');
  const [instagramHandle, setInstagramHandle]           = useState('');
  const [twitterHandle, setTwitterHandle]               = useState('');
  const [youtubeChannel, setYoutubeChannel]             = useState('');
  const [facebookPage, setFacebookPage]                 = useState('');
  const [tiktokHandle, setTiktokHandle]                 = useState('');
  const [websiteUrl, setWebsiteUrl]                     = useState('');
  const [totalFollowers, setTotalFollowers]             = useState('');
  const [monthlyReach, setMonthlyReach]                 = useState('');
  const [mediaFeatures, setMediaFeatures]               = useState('');
  const [awardsRecognitions, setAwardsRecognitions]     = useState('');
  const [notableProjects, setNotableProjects]           = useState('');
  const [publicStatement, setPublicStatement]           = useState('');
  const [identityProofDataUrl, setIdentityProofDataUrl] = useState('');
  const [identityProofFileName, setIdentityProofFileName] = useState('');
  const [identityProofMimeType, setIdentityProofMimeType] = useState('');
  const [otp, setOtp]                                   = useState('');
  const [otpSent, setOtpSent]                           = useState(false);
  const [otpLoading, setOtpLoading]                     = useState(false);
  const [submitted, setSubmitted]                       = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const otpRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);

  const otpValue = otpDigits.join('');

  const handleOtpDigit = (i: number, val: string) => {
    const d = val.replace(/\D/g, '').slice(-1);
    const next = [...otpDigits];
    next[i] = d;
    setOtpDigits(next);
    setOtp(next.join(''));
    if (d && i < 5) otpRefs[i + 1].current?.focus();
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[i] && i > 0) otpRefs[i - 1].current?.focus();
  };

  /* ── validation per step ── */
  const canNext = useCallback(() => {
    if (step === 0) return !!category;
    if (step === 1) return !!(instagramHandle || twitterHandle || youtubeChannel || facebookPage || tiktokHandle || websiteUrl);
    if (step === 2) return publicStatement.trim().length >= 50;
    if (step === 3) return !!identityProofDataUrl;
    if (step === 4) return otpValue.length === 6;
    return false;
  }, [step, category, instagramHandle, twitterHandle, youtubeChannel, facebookPage, tiktokHandle, websiteUrl, publicStatement, identityProofDataUrl, otpValue]);

  /* ── file upload ── */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('File size must be under 5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setIdentityProofDataUrl(reader.result as string);
      setIdentityProofFileName(file.name);
      setIdentityProofMimeType(file.type);
      setError('');
    };
    reader.readAsDataURL(file);
  };

  /* ── send OTP ── */
  const sendOtp = async () => {
    setOtpLoading(true); setError('');
    try {
      const res = await fetch('/api/public-face/send-otp', { method: 'POST' });
      const data = await res.json();
      if (res.status === 403 && data.code === 'INFINITY_REQUIRED') { setShowInfinityModal(true); return; }
      if (!res.ok) throw new Error(data.error || 'Failed to send OTP.');
      setOtpSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send OTP.');
    } finally { setOtpLoading(false); }
  };

  /* ── submit ── */
  const handleSubmit = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/public-face/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          otp: otpValue, category, instagramHandle, twitterHandle, youtubeChannel,
          facebookPage, tiktokHandle, websiteUrl, totalFollowers, monthlyReach,
          mediaFeatures, awardsRecognitions, notableProjects, publicStatement,
          identityProofDataUrl, identityProofFileName, identityProofMimeType,
        }),
      });
      const data = await res.json();
      if (res.status === 403 && data.code === 'INFINITY_REQUIRED') { setShowInfinityModal(true); return; }
      if (!res.ok) throw new Error(data.error || 'Failed to submit.');
      setSubmitted(true);
      setTimeout(() => onSuccess(), 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit.');
    } finally { setLoading(false); }
  };

  /* ── success screen ── */
  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-8 text-center gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
          <CheckCircle2 className="h-8 w-8 text-indigo-400" />
        </div>
        <div>
          <h3 className="text-[20px] font-bold text-white tracking-[-0.02em] mb-2">Application Submitted</h3>
          <p className="text-[13px] text-white/40 leading-relaxed max-w-xs">
            We&apos;ve received your Public Face application. Check your email for a confirmation.
            Our team reviews within 3–5 business days.
          </p>
        </div>
      </div>
    );
  }

  const stepProgress = ((step) / (STEPS.length - 1)) * 100;

  return (
    <>
    {showInfinityModal && <InfinityUpgradeModal feature="public_face" onClose={() => setShowInfinityModal(false)} />}
    <div className="flex flex-col" style={{ maxHeight: '88vh' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <defs><linearGradient id="pfform" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#818cf8"/><stop offset="100%" stopColor="#a78bfa"/></linearGradient></defs>
              <circle cx="10" cy="10" r="9" fill="url(#pfform)"/>
              <path d="M10 4.5l1.4 3.1 3.4.3-2.5 2.2.8 3.3L10 11.8l-3.1 1.6.8-3.3-2.5-2.2 3.4-.3z" fill="#0e0e12" opacity="0.9"/>
            </svg>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-white/85 tracking-[-0.01em]">Public Face Application</p>
            <p className="text-[11px] text-white/25 mt-px">{STEPS[step].label} — Step {step + 1} of {STEPS.length}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-white/[0.07]">
          <X className="h-3.5 w-3.5 text-white/35" />
        </button>
      </div>

      {/* ── Step nav + progress bar ── */}
      <div className="px-6 pt-4 pb-3 border-b border-white/[0.05] shrink-0">
        <div className="flex items-center gap-0 mb-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done   = i < step;
            const active = i === step;
            return (
              <div key={i} className="flex items-center flex-1 min-w-0">
                <div className="flex flex-col items-center">
                  <div className={[
                    'flex h-6 w-6 items-center justify-center rounded-full transition-all',
                    done   ? 'bg-indigo-500' : '',
                    active ? '' : '',
                  ].join(' ')}
                  style={active ? { background: 'rgba(99,102,241,0.15)', border: '1.5px solid rgba(99,102,241,0.5)' }
                    : done ? {} : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    {done
                      ? <Check className="h-3 w-3 text-white" />
                      : <Icon className={`h-3 w-3 ${active ? 'text-indigo-400' : 'text-white/20'}`} />}
                  </div>
                  <span className={`text-[9px] font-semibold mt-1 tracking-[0.04em] ${active ? 'text-indigo-400' : done ? 'text-white/35' : 'text-white/18'}`}>
                    {s.label.toUpperCase()}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-px mx-1.5 mb-4" style={{ background: i < step ? 'rgba(99,102,241,0.45)' : 'rgba(255,255,255,0.07)' }} />
                )}
              </div>
            );
          })}
        </div>
        {/* Thin progress bar */}
        <div className="h-[2px] rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${stepProgress}%`, background: 'linear-gradient(90deg,#4f46e5,#818cf8)' }} />
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.08)_transparent]">

        {/* ═══ STEP 0 — Category ═══ */}
        {step === 0 && (
          <div className="space-y-4">
            <p className="text-[12.5px] text-white/35 leading-relaxed">
              Select the category that best describes your public identity. This determines how you appear in the Public Faces directory.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className="group flex items-center gap-3 rounded-[12px] px-4 py-3 text-left transition-all"
                  style={category === cat.value ? {
                    background: 'rgba(99,102,241,0.1)',
                    border: '1px solid rgba(99,102,241,0.35)',
                  } : {
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.07)',
                  }}
                >
                  <span className="text-[18px] shrink-0 leading-none">{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[12px] font-semibold leading-tight ${category === cat.value ? 'text-indigo-200' : 'text-white/65'}`}>
                      {cat.label}
                    </p>
                    <p className="text-[10.5px] text-white/25 mt-0.5 truncate">{cat.desc}</p>
                  </div>
                  {category === cat.value && (
                    <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-500">
                      <Check className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ═══ STEP 1 — Social Presence ═══ */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-[12.5px] text-white/35 leading-relaxed">
              Provide at least one active social profile or website that demonstrates your public presence.
            </p>

            <Field label="Instagram Handle">
              <div className="flex items-center gap-2.5 rounded-[10px] px-3.5 py-2.5 transition focus-within:border-indigo-500/50 focus-within:bg-white/[0.06]" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <Instagram className="h-3.5 w-3.5 shrink-0 text-pink-400/60" />
                <input className="flex-1 bg-transparent text-[13px] text-white/80 placeholder-white/20 outline-none" placeholder="@yourhandle" value={instagramHandle} onChange={e => setInstagramHandle(e.target.value)} />
              </div>
            </Field>

            <Field label="X / Twitter Handle">
              <div className="flex items-center gap-2.5 rounded-[10px] px-3.5 py-2.5 transition focus-within:border-indigo-500/50 focus-within:bg-white/[0.06]" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <Twitter className="h-3.5 w-3.5 shrink-0 text-sky-400/60" />
                <input className="flex-1 bg-transparent text-[13px] text-white/80 placeholder-white/20 outline-none" placeholder="@yourhandle" value={twitterHandle} onChange={e => setTwitterHandle(e.target.value)} />
              </div>
            </Field>

            <Field label="YouTube Channel">
              <div className="flex items-center gap-2.5 rounded-[10px] px-3.5 py-2.5 transition focus-within:border-indigo-500/50 focus-within:bg-white/[0.06]" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <Youtube className="h-3.5 w-3.5 shrink-0 text-red-400/60" />
                <input className="flex-1 bg-transparent text-[13px] text-white/80 placeholder-white/20 outline-none" placeholder="https://youtube.com/@channel" value={youtubeChannel} onChange={e => setYoutubeChannel(e.target.value)} />
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Facebook Page">
                <input className={INPUT_CLS} placeholder="https://facebook.com/page" value={facebookPage} onChange={e => setFacebookPage(e.target.value)} />
              </Field>
              <Field label="TikTok Handle">
                <input className={INPUT_CLS} placeholder="@yourhandle" value={tiktokHandle} onChange={e => setTiktokHandle(e.target.value)} />
              </Field>
            </div>

            <Field label="Website / Portfolio">
              <input className={INPUT_CLS} placeholder="https://yourwebsite.com" value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} />
            </Field>
          </div>
        )}

        {/* ═══ STEP 2 — Background ═══ */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-[12.5px] text-white/35 leading-relaxed">
              Help us understand the scale and nature of your public recognition. All fields below are optional except the statement.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Total Followers">
                <input className={INPUT_CLS} placeholder="e.g. 500K" value={totalFollowers} onChange={e => setTotalFollowers(e.target.value)} />
              </Field>
              <Field label="Monthly Reach">
                <input className={INPUT_CLS} placeholder="e.g. 2M / month" value={monthlyReach} onChange={e => setMonthlyReach(e.target.value)} />
              </Field>
            </div>

            <Field label="Media Coverage" hint="Links preferred">
              <textarea className={TEXTAREA_CLS} rows={3} placeholder="Press mentions, interviews, TV appearances, news articles…" value={mediaFeatures} onChange={e => setMediaFeatures(e.target.value)} />
            </Field>

            <Field label="Awards & Recognitions">
              <textarea className={TEXTAREA_CLS} rows={3} placeholder="Awards, honours, certifications, official recognitions…" value={awardsRecognitions} onChange={e => setAwardsRecognitions(e.target.value)} />
            </Field>

            <Field label="Notable Projects / Work">
              <textarea className={TEXTAREA_CLS} rows={3} placeholder="Films, albums, books, campaigns, startups, major works…" value={notableProjects} onChange={e => setNotableProjects(e.target.value)} />
            </Field>

            <Field label="Public Statement" required hint={`${publicStatement.trim().length} / 50 min`}>
              <textarea
                className={TEXTAREA_CLS}
                rows={5}
                placeholder="Describe who you are, what you do, and why you are a recognised public figure. Be specific and authentic."
                value={publicStatement}
                onChange={e => setPublicStatement(e.target.value)}
              />
              {publicStatement.trim().length > 0 && publicStatement.trim().length < 50 && (
                <p className="text-[11px] text-amber-400/80 mt-1">Minimum 50 characters required.</p>
              )}
            </Field>
          </div>
        )}

        {/* ═══ STEP 3 — Identity ═══ */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Notice */}
            <div className="rounded-[11px] px-4 py-3.5 flex gap-3" style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)' }}>
              <Shield className="h-4 w-4 text-amber-400/70 shrink-0 mt-0.5" />
              <div>
                <p className="text-[12px] font-semibold text-amber-300/80 mb-1">Confidential Identity Check</p>
                <p className="text-[11.5px] text-white/35 leading-relaxed">
                  Upload a government-issued photo ID to confirm your identity. This document is reviewed only by our verification team
                  and is never stored or shared publicly.
                </p>
              </div>
            </div>

            {!identityProofDataUrl ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-3 rounded-[14px] py-10 transition-all hover:bg-white/[0.03]"
                style={{ border: '1.5px dashed rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.03)' }}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-[12px]" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                  <Upload className="h-4.5 w-4.5 text-indigo-400" />
                </div>
                <div className="text-center">
                  <p className="text-[13px] font-semibold text-white/55">Click to upload document</p>
                  <p className="text-[11px] text-white/25 mt-1">JPG, PNG, or PDF · Max 5 MB</p>
                </div>
              </button>
            ) : (
              <div className="rounded-[12px] px-4 py-3.5 flex items-center gap-3" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.18)' }}>
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-emerald-300/90">Document uploaded</p>
                  <p className="text-[11px] text-white/30 mt-0.5 truncate">{identityProofFileName}</p>
                </div>
                <button type="button" onClick={() => { setIdentityProofDataUrl(''); setIdentityProofFileName(''); setIdentityProofMimeType(''); }}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition hover:bg-white/[0.08]">
                  <X className="h-3 w-3 text-white/30" />
                </button>
              </div>
            )}

            <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} />

            {/* Accepted docs */}
            <div className="rounded-[11px] px-4 py-3.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/25 mb-2.5">Accepted Documents</p>
              <div className="grid grid-cols-2 gap-1.5">
                {['Passport', 'Aadhaar Card', "Driver's Licence", 'National ID Card', 'Voter ID', 'Any Govt. Photo ID'].map(doc => (
                  <div key={doc} className="flex items-center gap-2">
                    <div className="h-1 w-1 rounded-full bg-indigo-400/40 shrink-0" />
                    <span className="text-[11.5px] text-white/30">{doc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ STEP 4 — Email Verify ═══ */}
        {step === 4 && (
          <div className="space-y-5">
            <div className="rounded-[14px] px-5 py-5 flex flex-col items-center text-center gap-3" style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
                <Mail className="h-5 w-5 text-indigo-400" />
              </div>
              <div>
                <p className="text-[13.5px] font-semibold text-white/80 mb-1 tracking-[-0.01em]">Email Verification</p>
                <p className="text-[12px] text-white/35 leading-relaxed max-w-xs mx-auto">
                  We need to verify your email before submitting. Click below to receive a one-time code at your registered address.
                </p>
              </div>
            </div>

            {!otpSent ? (
              <button
                type="button"
                onClick={() => void sendOtp()}
                disabled={otpLoading}
                className="w-full flex items-center justify-center gap-2 rounded-[11px] py-3 text-[13px] font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#6366f1)', boxShadow: '0 4px 16px rgba(79,70,229,0.28)' }}
              >
                {otpLoading ? (
                  <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white" />Sending…</>
                ) : (
                  <>Send verification code<ArrowRight className="h-3.5 w-3.5" /></>
                )}
              </button>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <p className="text-[12px] text-emerald-300/80">Code sent — check your inbox.</p>
                </div>

                {/* 6-box OTP input */}
                <div>
                  <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-white/30 mb-3">Enter 6-digit code</p>
                  <div className="flex gap-2 justify-center">
                    {otpRefs.map((ref, i) => (
                      <input
                        key={i}
                        ref={ref}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={otpDigits[i]}
                        onChange={e => handleOtpDigit(i, e.target.value)}
                        onKeyDown={e => handleOtpKeyDown(i, e)}
                        className="h-12 w-10 rounded-[10px] text-center text-[18px] font-bold text-white/85 outline-none transition"
                        style={{
                          background: otpDigits[i] ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)',
                          border: otpDigits[i] ? '1.5px solid rgba(99,102,241,0.45)' : '1px solid rgba(255,255,255,0.09)',
                        }}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void sendOtp()}
                  disabled={otpLoading}
                  className="text-[11.5px] text-indigo-400/70 hover:text-indigo-400 transition disabled:opacity-40"
                >
                  {otpLoading ? 'Resending…' : 'Resend code'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-[10px] px-4 py-3 flex items-start gap-2.5" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}>
            <X className="h-3.5 w-3.5 text-red-400/80 shrink-0 mt-px" />
            <p className="text-[12px] text-red-300/80 leading-relaxed">{error}</p>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-white/[0.06]">
        <button
          type="button"
          onClick={() => step === 0 ? onClose() : setStep(s => s - 1)}
          className="flex items-center gap-1.5 rounded-[10px] px-4 py-2.5 text-[12.5px] font-semibold text-white/35 transition hover:text-white/60 hover:bg-white/[0.04]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {step === 0 ? 'Cancel' : 'Back'}
        </button>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => { setError(''); setStep(s => s + 1); if (step === 3) void sendOtp(); }}
            disabled={!canNext()}
            className="flex items-center gap-1.5 rounded-[11px] px-5 py-2.5 text-[13px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-30"
            style={canNext() ? { background: 'linear-gradient(135deg,#4f46e5,#6366f1)', boxShadow: '0 4px 14px rgba(79,70,229,0.28)' } : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.25)' }}
          >
            Continue <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canNext() || loading}
            className="flex items-center gap-1.5 rounded-[11px] px-5 py-2.5 text-[13px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-30"
            style={{ background: 'linear-gradient(135deg,#4f46e5,#6366f1)', boxShadow: '0 4px 14px rgba(79,70,229,0.28)' }}
          >
            {loading ? (
              <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white" />Submitting…</>
            ) : (
              <>Submit Application <CheckCircle2 className="h-3.5 w-3.5" /></>
            )}
          </button>
        )}
      </div>
    </div>
    </>
  );
}
