'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  ChevronRight,
  Copy,
  FileSignature,
  FileText,
  FormInput,
  Gift,
  Info,
  Lock,
  Mail,
  PenLine,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Zap,
} from 'lucide-react';
import { getIndustryWorkspaceProfile, industryOptions, workspacePresetOptions } from '@/lib/industry-presets';

/* ── Studios data ────────────────────────────────────────────────── */
const studios = [
  { icon: FileSignature, name: 'E‑Sign Studio',    color: '#10b981', bg: 'rgba(16,185,129,0.09)',  border: 'rgba(16,185,129,0.20)' },
  { icon: PenLine,       name: 'DocWord Studio',   color: '#6366f1', bg: 'rgba(99,102,241,0.09)',  border: 'rgba(99,102,241,0.20)' },
  { icon: Bot,           name: 'Document AI',      color: '#8b5cf6', bg: 'rgba(139,92,246,0.09)', border: 'rgba(139,92,246,0.20)' },
  { icon: FormInput,     name: 'Form Builder',     color: '#f59e0b', bg: 'rgba(245,158,11,0.09)', border: 'rgba(245,158,11,0.20)' },
  { icon: FileText,      name: 'PDF Studio',       color: '#0ea5e9', bg: 'rgba(14,165,233,0.09)', border: 'rgba(14,165,233,0.20)' },
  { icon: Shield,        name: 'Compliance Vault', color: '#f43f5e', bg: 'rgba(244,63,94,0.09)',  border: 'rgba(244,63,94,0.20)' },
];

const STEPS = [
  { id: 0, label: 'Company',   description: 'Account & organisation' },
  { id: 1, label: 'Industry',  description: 'Sector & focus area' },
  { id: 2, label: 'Workspace', description: 'Configure environment' },
];

type BusinessSignupFormProps = {
  initialPlanId?: string;
  initialConfig?: string;
  initialReferralCode?: string;
  softwareName?: string;
  /* When rendered inside the narrow onboarding column (not the wide /signup
     shell), the form's own left brand/progress panel is hidden and it collapses
     to a single column so it fits without horizontal overflow. Behaviour, OTP,
     validation and the signup API are all unchanged. */
  embedded?: boolean;
};

/* ══════════════════════════════════════════════════════════════════════
   POST-SIGNUP REFERRAL SHARE PANEL
   Shown after account creation, before redirect to workspace.
══════════════════════════════════════════════════════════════════════ */
function ReferralSharePanel({
  onContinue,
  destination,
}: {
  onContinue: () => void;
  destination: string;
}) {
  const router = useRouter();
  const [referralLink, setReferralLink] = useState('');
  const [code, setCode]                 = useState('');
  const [loading, setLoading]           = useState(true);
  const [copied, setCopied]             = useState(false);
  const [inviteEmail, setInviteEmail]   = useState('');
  const [sending, setSending]           = useState(false);
  const [sentMsg, setSentMsg]           = useState('');
  const [sendErr, setSendErr]           = useState('');

  useEffect(() => {
    fetch('/api/referrals/stats')
      .then((r) => r.json())
      .then((d: { link?: string; code?: string }) => {
        setReferralLink(d.link || '');
        setCode(d.code || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = useCallback(() => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  }, [referralLink]);

  const handleSendInvite = async () => {
    setSendErr('');
    setSentMsg('');
    if (!inviteEmail.trim()) { setSendErr('Enter an email address.'); return; }
    try {
      setSending(true);
      const res = await fetch('/api/referrals/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to send invite');
      setSentMsg(`Invite sent to ${inviteEmail.trim()} ✓`);
      setInviteEmail('');
    } catch (err) {
      setSendErr(err instanceof Error ? err.message : 'Failed to send invite.');
    } finally {
      setSending(false);
    }
  };

  const handleContinue = () => {
    onContinue();
    router.replace(destination);
    router.refresh();
  };

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center px-6 py-10 sm:px-8 xl:px-10"
      style={{ animation: 'obSlideUp 0.45s ease both' }}
    >
      {/* ── Gold shimmer header ── */}
      <div className="mb-6 text-center">
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{
            background: 'linear-gradient(135deg,#4f46e5,#818cf8,#4f46e5)',
            boxShadow: '0 8px 32px rgba(99,102,241,0.40)',
            animation: 'obCardGlow 4s ease-in-out infinite',
          }}
        >
          <Gift className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-[1.55rem] font-black tracking-[-0.04em] text-white">
          Workspace Created! 🎉
        </h2>
        <p className="mt-1.5 text-[13px] text-white/45 max-w-xs mx-auto">
          Now earn your first month of{' '}
          <span style={{ color: '#a5b4fc' }} className="font-bold">Docrud Infinity ∞</span>{' '}
          for free — just refer a friend.
        </p>
      </div>

      {/* ── How it works strip ── */}
      <div className="mb-5 w-full max-w-sm">
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Send,        label: 'Share your link' },
            { icon: Users,       label: 'Friend signs up' },
            { icon: Star,        label: 'Infinity badge, free' },
          ].map(({ icon: Icon, label }, i) => (
            <div
              key={label}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-2 py-3"
              style={{ animation: `obSlideUp 0.3s ${0.05 + i * 0.07}s ease both` }}
            >
              <Icon className="h-4 w-4 text-amber-400/70" />
              <span className="text-center text-[10px] font-semibold text-white/50 leading-tight">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Referral link card ── */}
      <div
        className="mb-4 w-full max-w-sm rounded-2xl p-[1.5px]"
        style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.45),rgba(165,180,252,0.30),rgba(99,102,241,0.45))' }}
      >
        <div className="rounded-[15px] bg-[#06060f] px-4 py-4">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: '#818cf8' }}>
            Your Referral Link
          </p>
          {loading ? (
            <div className="h-10 animate-pulse rounded-xl bg-white/[0.06]" />
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex-1 truncate rounded-xl border border-white/[0.09] bg-white/[0.04] px-3 py-2.5 font-mono text-[11px] text-white/70">
                {referralLink || '—'}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!referralLink}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.06] transition hover:bg-white/[0.12] disabled:opacity-30"
                title="Copy link"
              >
                {copied
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  : <Copy className="h-4 w-4 text-white/60" />
                }
              </button>
            </div>
          )}
          {code && (
            <p className="mt-1.5 text-[10px] text-white/30">
              Code: <span className="font-mono font-bold text-white/55">{code}</span>
            </p>
          )}
        </div>
      </div>

      {/* ── Email invite ── */}
      <div className="mb-4 w-full max-w-sm">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
          Or send a direct invite
        </p>
        <div className="flex gap-2">
          <SInput
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="colleague@company.com"
            icon={<Mail className="h-3.5 w-3.5 text-white/30" />}
            onKeyDown={(e) => { if (e.key === 'Enter') { void handleSendInvite(); } }}
          />
          <button
            type="button"
            onClick={() => void handleSendInvite()}
            disabled={sending || !inviteEmail.trim()}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-indigo-500/25 bg-indigo-500/[0.10] px-3.5 text-[12px] font-bold text-indigo-300 transition hover:bg-indigo-500/[0.18] disabled:opacity-40"
          >
            {sending ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-300/30 border-t-indigo-300" /> : <Send className="h-3.5 w-3.5" />}
            {sending ? 'Sending…' : 'Invite'}
          </button>
        </div>
        {sentMsg && (
          <p className="mt-1.5 text-[11.5px] text-emerald-400" style={{ animation: 'obScaleIn 0.2s ease both' }}>
            ✓ {sentMsg}
          </p>
        )}
        {sendErr && (
          <p className="mt-1.5 text-[11.5px] text-rose-400" style={{ animation: 'obScaleIn 0.2s ease both' }}>
            {sendErr}
          </p>
        )}
      </div>

      {/* ── Fine print ── */}
      <p className="mb-6 max-w-sm text-center text-[10.5px] leading-5 text-white/25">
        Referrals can be sent multiple times. Docrud Infinity activates only once per referrer, the moment a referred profile is created.
      </p>

      {/* ── Continue button ── */}
      <button
        type="button"
        onClick={handleContinue}
        className="group relative flex h-11 w-full max-w-sm items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 text-[13px] font-bold text-white shadow-[0_4px_24px_rgba(99,102,241,0.3)] transition hover:from-indigo-500 hover:to-emerald-500 active:scale-[0.98]"
      >
        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
        <span className="relative">Continue to workspace</span>
        <ArrowRight className="relative h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={handleContinue}
        className="mt-3 text-[11px] text-white/20 transition hover:text-white/45"
      >
        Skip for now →
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN FORM
══════════════════════════════════════════════════════════════════════ */
export default function BusinessSignupForm({
  initialPlanId,
  initialConfig,
  initialReferralCode = '',
  softwareName = 'docrud',
  embedded = false,
}: BusinessSignupFormProps) {
  const router = useRouter();

  // step -1 = post-signup referral share panel
  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    organizationName: '',
    organizationDomain: '',
    industry: 'technology',
    companySize: '1-25',
    primaryUseCase: '',
    workspacePreset: 'executive_control',
  });

  const [referralCode, setReferralCode] = useState(
    typeof initialReferralCode === 'string' ? initialReferralCode.trim().toUpperCase() : '',
  );

  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);

  /* OTP state */
  const [otpSessionId, setOtpSessionId] = useState('');
  const [otpCode, setOtpCode]           = useState('');
  const [otpStatus, setOtpStatus]       = useState<'idle' | 'sent' | 'verified'>('idle');
  const [otpBusy, setOtpBusy]           = useState(false);
  const [otpMessage, setOtpMessage]     = useState('');

  /* Post-signup destination */
  const [postSignupDest, setPostSignupDest] = useState('/welcome');
  const [showReferralPanel, setShowReferralPanel] = useState(false);

  const selectedPlanId = initialPlanId;

  useEffect(() => { setMounted(true); }, []);

  const industryProfile = useMemo(() => getIndustryWorkspaceProfile(form.industry), [form.industry]);

  /* Reset OTP when email changes */
  useEffect(() => {
    setOtpSessionId('');
    setOtpCode('');
    setOtpStatus('idle');
    setOtpMessage('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.email]);

  const nextStep = () => setStep((p) => Math.min(p + 1, STEPS.length - 1));
  const previousStep = () => setStep((p) => Math.max(p - 1, 0));

  const canMoveForward = useMemo(() => {
    if (step === 0) return Boolean(form.name.trim() && form.email.trim() && form.password.trim() && form.organizationName.trim() && otpStatus === 'verified');
    if (step === 1) return Boolean(form.industry && form.companySize && form.primaryUseCase.trim());
    return Boolean(form.workspacePreset);
  }, [form, otpStatus, step]);

  const sendOtp = async () => {
    setOtpMessage('');
    setError('');
    const email = form.email.trim();
    if (!email) { setOtpMessage('Enter your business email first.'); return; }
    try {
      setOtpBusy(true);
      const response = await fetch('/api/saas/signup/otp/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Failed to send OTP');
      setOtpSessionId(String(payload?.sessionId || ''));
      setOtpStatus('sent');
      setOtpMessage('Code sent — check your inbox.');
    } catch (err) {
      setOtpMessage(err instanceof Error ? err.message : 'Failed to send OTP.');
    } finally { setOtpBusy(false); }
  };

  const verifyOtp = async () => {
    setOtpMessage('');
    setError('');
    const email = form.email.trim();
    if (!otpSessionId) { setOtpMessage('Request a code first.'); return; }
    try {
      setOtpBusy(true);
      const response = await fetch('/api/saas/signup/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: otpSessionId, email, otp: otpCode.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Failed to verify OTP');
      setOtpStatus('verified');
      setOtpMessage('Email verified successfully.');
    } catch (err) {
      setOtpStatus('sent');
      setOtpMessage(err instanceof Error ? err.message : 'Incorrect code. Try again.');
    } finally { setOtpBusy(false); }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!policyAccepted) { setError('Please accept the required policies to continue.'); return; }
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/saas/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          policyAccepted: true,
          otpSessionId,
          referralCode: referralCode || undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Failed to create business profile');

      const loginResult = await signIn('credentials', {
        email: form.email.trim(),
        password: form.password,
        policyAccepted: 'accepted',
        redirect: false,
        callbackUrl: selectedPlanId
          ? `/checkout?plan=${selectedPlanId}${initialConfig ? `&config=${initialConfig}` : ''}`
          : '/welcome',
      });

      if (!loginResult || loginResult.error) {
        setSuccess('Workspace created. Redirecting to login…');
        setTimeout(() => router.push('/login'), 1200);
        return;
      }

      const dest = loginResult.url
        ? `${new URL(loginResult.url, window.location.origin).pathname}${new URL(loginResult.url, window.location.origin).search}`
        : (selectedPlanId ? `/checkout?plan=${selectedPlanId}${initialConfig ? `&config=${initialConfig}` : ''}` : '/welcome');

      setPostSignupDest(dest);
      setShowReferralPanel(true);
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : 'Failed to create business profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── If post-signup referral panel is active, render it full-screen ── */
  if (showReferralPanel) {
    return (
      <div
        className="overflow-hidden rounded-[2rem] border border-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_40px_120px_rgba(0,0,0,0.7)] backdrop-blur-3xl"
        style={{ background: 'rgba(10,11,13,0.90)' }}
      >
        <div className="flex min-h-[540px] flex-col">
          <ReferralSharePanel
            onContinue={() => setShowReferralPanel(false)}
            destination={postSignupDest}
          />
        </div>
      </div>
    );
  }

  const stepKey = `step-${step}`;

  return (
    <div
      className="overflow-hidden rounded-[2rem] border border-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_40px_120px_rgba(0,0,0,0.7)] backdrop-blur-3xl"
      style={{ background: 'rgba(10,11,13,0.90)' }}
    >
      <div className={`flex flex-col ${embedded ? 'min-h-0' : 'min-h-[620px] xl:flex-row'}`}>

        {/* ════════════════════════════════════════
            LEFT: Brand / progress panel
        ════════════════════════════════════════ */}
        <div className={`relative ${embedded ? 'hidden' : 'hidden xl:flex'} xl:w-[320px] shrink-0 flex-col border-r border-white/[0.06] bg-[rgba(255,255,255,0.015)] px-8 py-10`}>
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-l-[2rem]" aria-hidden>
            <div className="absolute -left-16 -top-16 h-64 w-64 rounded-full bg-indigo-600/[0.08] blur-[80px]"
              style={{ animation: 'obDrift1 20s ease-in-out infinite' }} />
            <div className="absolute -bottom-8 right-0 h-48 w-48 rounded-full bg-emerald-600/[0.07] blur-[60px]"
              style={{ animation: 'obDrift2 25s ease-in-out infinite 5s' }} />
          </div>

          {/* Logo */}
          <Link href="/" className="relative flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/[0.12] bg-white/[0.07] transition group-hover:bg-white/[0.12]"
              style={{ animation: 'obGlow 4s ease-in-out infinite' }}>
              <div className="h-3.5 w-3.5 rotate-45 rounded-[3px] bg-gradient-to-br from-white to-white/70" />
            </div>
            <span className="text-[15px] font-bold tracking-[-0.03em] text-white">Docrud</span>
          </Link>

          {/* Progress */}
          <div className="relative mt-12 space-y-1">
            <p className="mb-4 text-[9.5px] font-bold uppercase tracking-[0.3em] text-white/22">Setup progress</p>
            <div className="relative mb-5 h-0.5 rounded-full bg-white/[0.06]">
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-700 ease-out"
                style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              />
            </div>
            {STEPS.map((s, i) => {
              const active = i === step;
              const done   = i < step;
              return (
                <div key={s.id} className={['relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-300', active ? 'bg-white/[0.06]' : ''].join(' ')}>
                  {i < STEPS.length - 1 && <div className="absolute left-[22px] top-full h-1 w-px bg-white/[0.08]" />}
                  <div className={['flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition-all duration-300',
                    done   ? 'border-emerald-500/30 bg-emerald-500/[0.12] text-emerald-400'
                    : active ? 'border-indigo-500/30 bg-indigo-500/[0.12] text-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.2)]'
                    : 'border-white/[0.08] bg-white/[0.03] text-white/25'].join(' ')}>
                    {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <div>
                    <p className={['text-[12px] font-semibold transition-colors duration-300', active ? 'text-white' : done ? 'text-emerald-400' : 'text-white/30'].join(' ')}>{s.label}</p>
                    <p className="text-[10.5px] text-white/22">{s.description}</p>
                  </div>
                  {active && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400" style={{ animation: 'obPulse 2s ease-in-out infinite' }} />}
                </div>
              );
            })}
          </div>

          {/* Referral reward teaser in sidebar */}
          <div className="mt-8 rounded-2xl p-[1px]" style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.44),rgba(165,180,252,0.28),rgba(99,102,241,0.44))' }}>
            <div className="rounded-[15px] bg-[#06060f]/90 px-3 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Gift className="h-3.5 w-3.5 shrink-0" style={{ color: '#818cf8' }} />
                <span className="text-[9.5px] font-black uppercase tracking-[0.2em]" style={{ color: '#6366f1' }}>Referral Reward</span>
              </div>
              <p className="text-[10.5px] leading-4 text-white/40">
                Refer a colleague after signup → they activate → you get{' '}
                <span style={{ color: '#a5b4fc' }}>Docrud Infinity ∞</span> free for 1 month.
              </p>
            </div>
          </div>

          {/* Studio pills */}
          <div className="mt-auto space-y-2 pt-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-white/18">Included studios</p>
            <div className="flex flex-wrap gap-1.5">
              {studios.map((s, i) => (
                <span
                  key={s.name}
                  className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] font-semibold transition-all duration-300"
                  style={{
                    borderColor: s.border,
                    background: s.bg,
                    color: s.color,
                    animation: mounted ? `obSlideUp 0.4s ${0.1 + i * 0.05}s ease both` : 'none',
                    opacity: mounted ? undefined : 0,
                  }}
                >
                  <s.icon className="h-2.5 w-2.5" />{s.name}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2">
              <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-400/50" />
              <p className="text-[10px] text-white/25">SOC 2 · GDPR · 99.9% SLA</p>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════
            RIGHT: Form content
        ════════════════════════════════════════ */}
        <div className="flex flex-1 flex-col">

          {/* Mobile step rail */}
          <div className="flex items-stretch border-b border-white/[0.06] xl:hidden">
            {STEPS.map((s, i) => {
              const active = i === step;
              const done   = i < step;
              return (
                <div key={s.id} className={['relative flex flex-1 flex-col gap-0.5 px-4 py-3.5 transition-colors', active ? 'bg-white/[0.04]' : ''].join(' ')}>
                  {active && <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500" />}
                  <div className="flex items-center gap-2">
                    <span className={['flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all',
                      done ? 'bg-emerald-500/20 text-emerald-400' : active ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/[0.08] text-white/35'].join(' ')}>
                      {done ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
                    </span>
                    <span className={['text-[12px] font-semibold', active ? 'text-white' : done ? 'text-emerald-400' : 'text-white/35'].join(' ')}>{s.label}</span>
                  </div>
                  <p className={['pl-7 text-[10px] leading-tight', active ? 'text-white/50' : 'hidden sm:block text-white/25'].join(' ')}>{s.description}</p>
                </div>
              );
            })}
          </div>

          {/* Form body */}
          <div className="flex-1 px-6 py-8 sm:px-8 sm:py-9 xl:px-10">
            <form onSubmit={(e) => void handleSubmit(e)}>
              <div key={stepKey} style={{ animation: mounted ? 'obSlideUp 0.3s ease both' : 'none' }}>

                {/* ═══ STEP 0: Company ═══ */}
                {step === 0 && (
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/20 text-[10px] font-bold text-indigo-400">1</span>
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/25">Step 1 of 3</p>
                      </div>
                      <h2 className="text-[1.4rem] font-bold tracking-[-0.04em] text-white">Account details</h2>
                      <p className="mt-1 text-[13px] text-white/40">Set up the primary admin account for your workspace.</p>
                    </div>

                    {/* ── Referred-by banner ── */}
                    {referralCode && (
                      <div
                        className="flex items-center gap-3 rounded-2xl border p-3.5"
                        style={{
                          borderColor: 'rgba(99,102,241,0.25)',
                          background: 'rgba(99,102,241,0.06)',
                          animation: 'obScaleIn 0.25s ease both',
                        }}
                      >
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                          style={{ background: 'linear-gradient(135deg,#4f46e5,#818cf8)', boxShadow: '0 0 12px rgba(99,102,241,0.4)' }}
                        >
                          <Gift className="h-4 w-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-bold" style={{ color: '#a5b4fc' }}>
                            You were referred! ∞
                          </p>
                          <p className="text-[11px] text-white/40 truncate">
                            Referral code: <span className="font-mono font-semibold text-white/60">{referralCode}</span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReferralCode('')}
                          className="shrink-0 text-[10px] text-white/20 hover:text-white/50 transition"
                          title="Remove referral"
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Full name">
                        <SInput value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Rahul Sharma" />
                      </Field>
                      <Field label="Business email">
                        <div className="flex gap-2">
                          <SInput
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                            placeholder="admin@company.com"
                            icon={<Mail className="h-3.5 w-3.5 text-white/30" />}
                            suffix={otpStatus === 'verified' && (
                              <span className="flex items-center gap-1 text-[10.5px] font-bold text-emerald-400">
                                <CheckCircle2 className="h-3 w-3" /> Verified
                              </span>
                            )}
                          />
                          <button
                            type="button"
                            onClick={() => void sendOtp()}
                            disabled={otpBusy || !form.email.trim()}
                            className="h-10 shrink-0 rounded-xl border border-white/[0.10] bg-white/[0.05] px-3.5 text-[11.5px] font-semibold text-white/75 transition hover:bg-white/[0.09] hover:text-white disabled:opacity-35 whitespace-nowrap"
                          >
                            {otpBusy && otpStatus === 'idle' ? 'Sending…' : otpStatus !== 'idle' ? 'Resend' : 'Send code'}
                          </button>
                        </div>
                      </Field>
                    </div>

                    {/* OTP panel */}
                    {(otpStatus === 'sent' || otpStatus === 'verified') && (
                      <div className="rounded-2xl border border-indigo-500/[0.15] bg-indigo-500/[0.05] p-4"
                        style={{ animation: 'obScaleIn 0.25s ease both' }}>
                        <div className="flex items-center justify-between">
                          <p className="text-[13px] font-semibold text-white/80">Email verification</p>
                          <span className={['rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]',
                            otpStatus === 'verified' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'].join(' ')}>
                            {otpStatus === 'verified' ? '✓ Verified' : 'Pending'}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] text-white/45">Enter the 6-digit code sent to your email.</p>
                        <div className="mt-3 flex gap-2">
                          <SInput
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value)}
                            placeholder="000000"
                            inputMode="numeric"
                            className="max-w-[150px] tracking-[0.3em] font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => void verifyOtp()}
                            disabled={otpBusy || !otpSessionId || otpCode.trim().length < 6}
                            className="h-10 rounded-xl bg-white px-4 text-[12px] font-bold text-slate-950 transition hover:bg-white/90 disabled:opacity-40"
                          >
                            {otpBusy ? 'Verifying…' : 'Verify'}
                          </button>
                        </div>
                        {otpMessage && (
                          <p className={['mt-2 text-[12px]', otpStatus === 'verified' ? 'text-emerald-400' : 'text-white/50'].join(' ')}>
                            {otpMessage}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="border-t border-white/[0.06] pt-5">
                      <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-white/30">Organisation</p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Organisation name">
                          <SInput value={form.organizationName} onChange={(e) => setForm((p) => ({ ...p, organizationName: e.target.value }))} placeholder="Acme Technologies Pvt. Ltd." />
                        </Field>
                        <Field label="Domain (optional)">
                          <SInput value={form.organizationDomain} onChange={(e) => setForm((p) => ({ ...p, organizationDomain: e.target.value }))} placeholder="acme.com" />
                        </Field>
                        <Field label="Password" className="sm:col-span-2">
                          <SInput type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} placeholder="Create a secure password" icon={<Lock className="h-3.5 w-3.5 text-white/30" />} />
                        </Field>
                      </div>
                    </div>

                    {/* Referral code entry (if not pre-filled) */}
                    {!referralCode && (
                      <div className="border-t border-white/[0.06] pt-4">
                        <Field label="Referral code (optional)">
                          <SInput
                            value={referralCode}
                            onChange={(e) => setReferralCode(e.target.value.trim().toUpperCase())}
                            placeholder="e.g. A3F9B2C1"
                            className="font-mono tracking-[0.15em]"
                            icon={<Gift className="h-3.5 w-3.5 text-amber-400/60" />}
                          />
                        </Field>
                        <p className="mt-1.5 text-[10.5px] text-white/25">
                          Got a referral code? Enter it here — your referrer gets Docrud Infinity free when you activate.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ═══ STEP 1: Industry ═══ */}
                {step === 1 && (
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/20 text-[10px] font-bold text-indigo-400">2</span>
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/25">Step 2 of 3</p>
                      </div>
                      <h2 className="text-[1.4rem] font-bold tracking-[-0.04em] text-white">Industry &amp; focus</h2>
                      <p className="mt-1 text-[13px] text-white/40">Help us tailor {softwareName} to your workflow.</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Industry">
                        <SSelect value={form.industry} onChange={(e) => setForm((p) => ({ ...p, industry: e.target.value }))}>
                          {industryOptions.map((o) => <option key={o.key} value={o.key} className="bg-[#0a0b0d]">{o.label}</option>)}
                        </SSelect>
                      </Field>
                      <Field label="Company size">
                        <SSelect value={form.companySize} onChange={(e) => setForm((p) => ({ ...p, companySize: e.target.value }))}>
                          {[['1-25','1–25 employees'],['26-100','26–100 employees'],['101-500','101–500 employees'],['500+','500+ employees']].map(([v,l]) => (
                            <option key={v} value={v} className="bg-[#0a0b0d]">{l}</option>
                          ))}
                        </SSelect>
                      </Field>
                      <Field label="Primary use case" className="sm:col-span-2">
                        <textarea
                          value={form.primaryUseCase}
                          onChange={(e) => setForm((p) => ({ ...p, primaryUseCase: e.target.value }))}
                          rows={4}
                          className="w-full resize-none rounded-xl border border-white/[0.09] bg-white/[0.04] px-3.5 py-3 text-sm text-white placeholder:text-white/22 outline-none transition focus:border-indigo-500/30 focus:ring-2 focus:ring-indigo-500/[0.08]"
                          placeholder="e.g. contract approvals, vendor onboarding, recurring client agreements, employee documentation…"
                        />
                      </Field>
                    </div>
                    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4" style={{ animation: 'obFadeIn 0.4s ease both' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="h-3.5 w-3.5 text-amber-400/70" />
                        <p className="text-[11px] font-bold text-white/40">Recommended for {form.industry}</p>
                      </div>
                      <p className="text-[13px] font-semibold text-white">{industryProfile.heroTitle}</p>
                      <p className="mt-1.5 text-[12px] leading-5 text-white/45">{industryProfile.summary}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {industryProfile.recommendedModules.map((item) => (
                          <span key={item} className="flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11.5px] text-white/55">
                            <ChevronRight className="h-2.5 w-2.5 text-amber-400/50" />{item}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ STEP 2: Workspace + Referral OR card ═══ */}
                {step === 2 && (
                  <div className="space-y-5">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-400">3</span>
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/25">Step 3 of 3 — Final</p>
                      </div>
                      <h2 className="text-[1.4rem] font-bold tracking-[-0.04em] text-white">Workspace setup</h2>
                      <p className="mt-1 text-[13px] text-white/40">Choose a preset that matches how your team operates.</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {workspacePresetOptions.map((preset, i) => {
                        const active = form.workspacePreset === preset.key;
                        return (
                          <button
                            key={preset.key}
                            type="button"
                            onClick={() => setForm((p) => ({ ...p, workspacePreset: preset.key }))}
                            className="group rounded-2xl border p-4 text-left transition-all duration-300"
                            style={{
                              borderColor: active ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.07)',
                              background: active ? 'rgba(99,102,241,0.07)' : 'rgba(255,255,255,0.02)',
                              animation: mounted ? `obSlideUp 0.3s ${i * 0.05}s ease both` : 'none',
                            }}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <p className={['text-[13px] font-semibold', active ? 'text-white' : 'text-white/60'].join(' ')}>{preset.label}</p>
                              {active && <span className="h-2 w-2 rounded-full bg-indigo-400" style={{ animation: 'obPulse 2s ease-in-out infinite' }} />}
                            </div>
                            <p className={['text-[12px] leading-5', active ? 'text-white/55' : 'text-white/35'].join(' ')}>{preset.description}</p>
                          </button>
                        );
                      })}
                    </div>

                    {/* What's included */}
                    <div className="rounded-2xl border border-emerald-500/[0.12] bg-emerald-500/[0.04] p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Zap className="h-3.5 w-3.5 text-emerald-400/70" />
                        <p className="text-[11px] font-bold text-emerald-400/70">Included on day one</p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {['Industry-aligned dashboard','Starter document templates','Step-by-step workspace guide','Plan-aware usage reporting'].map((item, i) => (
                          <div key={item} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[12px] text-white/60"
                            style={{ animation: mounted ? `obSlideUp 0.3s ${0.05 + i * 0.05}s ease both` : 'none' }}>
                            <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400/60" />{item}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ── ₹299/mo Docrud Infinity upgrade card ── */}
                    <div
                      className="relative overflow-hidden rounded-2xl p-[1.5px]"
                      style={{ background: 'linear-gradient(135deg,#4f46e5,#818cf8 40%,#4f46e5 70%,#3730a3)', animation: 'obCardGlow 4s ease-in-out infinite' }}
                    >
                      <div className="relative overflow-hidden rounded-[15px] bg-[#06060f] px-4 py-4">
                        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 90% 70% at 50% -10%,rgba(99,102,241,0.08) 0%,transparent 60%)' }} />
                        <div className="relative flex items-start justify-between gap-3 mb-2">
                          <div>
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[9px] font-black uppercase tracking-[0.28em]" style={{ color: '#6366f1' }}>Upgrade after signup</span>
                            </div>
                            <p className="text-[15px] font-black tracking-[-0.03em] text-white leading-tight">
                              Docrud Infinity <span style={{ color: '#a5b4fc' }}>∞</span>
                            </p>
                            <p className="text-[10.5px] text-white/35">Infinity badge + all features unlocked</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[20px] font-black leading-none" style={{ color: '#a5b4fc' }}>₹299</div>
                            <div className="text-[9px] text-white/30">/month</div>
                          </div>
                        </div>
                        <div className="relative grid grid-cols-3 gap-1 mb-2">
                          {[['∞','Infinity badge'],['3×','More views'],['★','Premium gigs']].map(([icon, label]) => (
                            <div key={label} className="flex items-center gap-1 rounded-lg px-2 py-1.5" style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.12)' }}>
                              <span className="text-[10px] font-bold" style={{ color: '#818cf8' }}>{icon}</span>
                              <span className="text-[9.5px] font-semibold text-white/55 truncate">{label}</span>
                            </div>
                          ))}
                        </div>

                        {/* ── OR Divider ── */}
                        <div className="relative flex items-center gap-2 my-3">
                          <div className="flex-1 h-px" style={{ background: 'rgba(99,102,241,0.20)' }} />
                          <span className="text-[10px] font-black uppercase tracking-[0.25em] px-2" style={{ color: 'rgba(99,102,241,0.55)' }}>OR</span>
                          <div className="flex-1 h-px" style={{ background: 'rgba(99,102,241,0.20)' }} />
                        </div>

                        {/* ── Referral earn-free strip ── */}
                        <div className="relative rounded-xl px-3 py-2.5" style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.14)' }}>
                          <div className="flex items-center gap-2 mb-1">
                            <Gift className="h-3.5 w-3.5 shrink-0" style={{ color: '#818cf8' }} />
                            <p className="text-[11px] font-black" style={{ color: '#a5b4fc' }}>Earn Docrud Infinity FREE</p>
                          </div>
                          <p className="text-[10.5px] text-white/40 leading-4">
                            Refer a colleague → they sign up → you get Docrud Infinity for <strong className="text-white/65">1 month free</strong>, no payment needed.
                          </p>
                          <div className="mt-2 flex items-center gap-2 text-[10px] text-white/30">
                            <span className="flex items-center gap-1"><Send className="h-2.5 w-2.5" /> Share your link after signup</span>
                            <span>·</span>
                            <span className="flex items-center gap-1"><CheckCircle2 className="h-2.5 w-2.5 text-emerald-400/60" /> One-time bonus</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Policy ── */}
              <div className="mt-7 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5">
                <label className="flex cursor-pointer items-start gap-3">
                  <div className="relative mt-0.5 shrink-0">
                    <input
                      type="checkbox"
                      checked={policyAccepted}
                      onChange={(e) => setPolicyAccepted(e.target.checked)}
                      className="peer h-4 w-4 cursor-pointer appearance-none rounded-[5px] border border-white/20 bg-transparent transition checked:border-indigo-400/50 checked:bg-indigo-500/20"
                    />
                    <CheckCircle2 className="pointer-events-none absolute inset-0 h-4 w-4 scale-0 text-indigo-400 transition peer-checked:scale-100" />
                  </div>
                  <span className="text-[12px] leading-5 text-white/45">
                    I agree to {softwareName}&apos;s{' '}
                    <Link href="/terms-and-conditions" className="text-white/70 underline underline-offset-2 hover:text-white transition">Terms</Link>,{' '}
                    <Link href="/privacy-policy" className="text-white/70 underline underline-offset-2 hover:text-white transition">Privacy Policy</Link>, and{' '}
                    <Link href="/refund-and-cancellation-policy" className="text-white/70 underline underline-offset-2 hover:text-white transition">Refund Policy</Link>.
                  </span>
                </label>
              </div>

              {/* Error / success */}
              {error && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/[0.07] px-4 py-3 text-[12.5px] text-rose-400"
                  style={{ animation: 'obScaleIn 0.2s ease both' }}>
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />{error}
                </div>
              )}
              {success && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-3 text-[12.5px] text-emerald-400"
                  style={{ animation: 'obScaleIn 0.2s ease both' }}>
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{success}
                </div>
              )}

              {/* ── Footer nav ── */}
              <div className="mt-7 flex items-center justify-between border-t border-white/[0.05] pt-5">
                <div>
                  {step > 0 && (
                    <button type="button" onClick={previousStep}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.03] px-5 text-[13px] font-semibold text-white/55 transition hover:bg-white/[0.07] hover:text-white">
                      <ArrowLeft className="h-3.5 w-3.5" /> Back
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex items-center gap-1">
                    {STEPS.map((_, i) => (
                      <div key={i} className={['rounded-full transition-all duration-300',
                        i === step ? 'h-1.5 w-4 bg-indigo-400' : i < step ? 'h-1.5 w-1.5 bg-emerald-400' : 'h-1.5 w-1.5 bg-white/[0.12]'].join(' ')} />
                    ))}
                  </div>
                  {step < STEPS.length - 1 ? (
                    <button type="button" onClick={nextStep} disabled={!canMoveForward}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.12] bg-white px-6 text-[13px] font-bold text-slate-950 shadow-[0_4px_16px_rgba(255,255,255,0.08)] transition hover:bg-white/90 active:scale-[0.98] disabled:opacity-35 disabled:cursor-not-allowed">
                      Continue <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={isSubmitting || !canMoveForward || !policyAccepted}
                      className="group relative inline-flex h-10 items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 px-6 text-[13px] font-bold text-white shadow-[0_4px_24px_rgba(99,102,241,0.3)] transition hover:from-indigo-500 hover:to-emerald-500 active:scale-[0.98] disabled:opacity-35 disabled:cursor-not-allowed"
                    >
                      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                      <span className="relative">{isSubmitting ? 'Creating workspace…' : 'Create workspace'}</span>
                      <ArrowRight className="relative h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Reusable form primitives ───────────────────────────────────── */
function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/30">{label}</label>
      {children}
    </div>
  );
}

function SInput({ icon, suffix, className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode; suffix?: React.ReactNode }) {
  return (
    <div className="relative flex items-center">
      {icon && <span className="pointer-events-none absolute left-3.5">{icon}</span>}
      <input
        className={[
          'h-10 w-full rounded-xl border border-white/[0.09] bg-white/[0.04] px-3.5 text-sm text-white placeholder:text-white/22 outline-none transition',
          'focus:border-indigo-500/30 focus:ring-2 focus:ring-indigo-500/[0.08] focus:bg-white/[0.06]',
          icon ? 'pl-9' : '',
          suffix ? 'pr-24' : '',
          className,
        ].join(' ')}
        {...props}
      />
      {suffix && <span className="absolute right-3 flex items-center">{suffix}</span>}
    </div>
  );
}

function SSelect({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select
      className="h-10 w-full cursor-pointer appearance-none rounded-xl border border-white/[0.09] bg-white/[0.04] px-3.5 text-sm text-white outline-none transition focus:border-indigo-500/30 focus:ring-2 focus:ring-indigo-500/[0.08]"
      {...props}
    >
      {children}
    </select>
  );
}
