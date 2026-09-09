'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Sparkles, Users, Code2, ShieldCheck, Brain, Smartphone, Zap, FileCheck2,
  Building2, Layers, BarChart3, Wand2, Star, X, CheckCircle2, FileText,
  Mail, Loader2, Heart, AlertCircle, Send, Rocket, RefreshCw, ArrowRight,
  Check, MessageSquare, FolderKanban, PieChart, LayoutDashboard,
  Settings, LogIn, Bell, Search, ChevronRight,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Feature {
  id: string;
  title: string;
  tagline: string;
  description: string;
  category: string;
  tags: string[];
  features?: string[];
  status: 'coming_soon' | 'beta' | 'live';
  eta: string;
  icon: string;
  accentColor: string;
  featured: boolean;
  order: number;
  waitlistCount: number;
  wishCount: number;
}

// ── Icon map ──────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles, Users, Code2, ShieldCheck, Brain, Smartphone, Zap, FileCheck2,
  Building2, Layers, BarChart3, Wand2, Star, Mail, MessageSquare, FileText,
  FolderKanban, PieChart, Rocket,
};

// ── Category config ───────────────────────────────────────────────────────────

interface CatConfig {
  Icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  border: string;
  desc: string;
}

const CATEGORY_CONFIG: Record<string, CatConfig> = {
  'CRM': { Icon: Users, iconColor: 'text-sky-400', iconBg: 'bg-sky-500/[0.12]', border: 'border-sky-500/[0.15]', desc: 'Pipeline, contacts, deals & follow-up automation' },
  'HRM': { Icon: Building2, iconColor: 'text-emerald-400', iconBg: 'bg-emerald-500/[0.12]', border: 'border-emerald-500/[0.15]', desc: 'Hire, onboard, manage & offboard employees' },
  'Invoicer': { Icon: FileText, iconColor: 'text-amber-400', iconBg: 'bg-amber-500/[0.12]', border: 'border-amber-500/[0.15]', desc: 'Invoices, quotes, payments & reconciliation' },
  'Project Management': { Icon: FolderKanban, iconColor: 'text-violet-400', iconBg: 'bg-violet-500/[0.12]', border: 'border-violet-500/[0.15]', desc: 'Tasks, milestones & document-linked deliverables' },
  'AI & Automation': { Icon: Brain, iconColor: 'text-purple-400', iconBg: 'bg-purple-500/[0.12]', border: 'border-purple-500/[0.15]', desc: 'AI generation, intelligence & smart automation' },
  'Team & Collaboration': { Icon: Users, iconColor: 'text-teal-400', iconBg: 'bg-teal-500/[0.12]', border: 'border-teal-500/[0.15]', desc: 'Real-time co-editing & enterprise workspaces' },
  'Team': { Icon: Users, iconColor: 'text-teal-400', iconBg: 'bg-teal-500/[0.12]', border: 'border-teal-500/[0.15]', desc: 'Real-time co-editing & enterprise workspaces' },
  'Security & Compliance': { Icon: ShieldCheck, iconColor: 'text-blue-400', iconBg: 'bg-blue-500/[0.12]', border: 'border-blue-500/[0.15]', desc: 'eSign, Aadhaar eKYC & regulatory automation' },
  'Legal & Compliance': { Icon: ShieldCheck, iconColor: 'text-blue-400', iconBg: 'bg-blue-500/[0.12]', border: 'border-blue-500/[0.15]', desc: 'eSign, Aadhaar eKYC & regulatory automation' },
  'Mobile': { Icon: Smartphone, iconColor: 'text-pink-400', iconBg: 'bg-pink-500/[0.12]', border: 'border-pink-500/[0.15]', desc: 'Native iOS & Android apps, offline-first' },
  'Developer': { Icon: Code2, iconColor: 'text-cyan-400', iconBg: 'bg-cyan-500/[0.12]', border: 'border-cyan-500/[0.15]', desc: 'REST API, SDKs & embeddable components' },
  'Automation': { Icon: Zap, iconColor: 'text-orange-400', iconBg: 'bg-orange-500/[0.12]', border: 'border-orange-500/[0.15]', desc: 'Bulk processing & workflow automation at scale' },
  'Finance & Legal': { Icon: FileCheck2, iconColor: 'text-teal-400', iconBg: 'bg-teal-500/[0.12]', border: 'border-teal-500/[0.15]', desc: 'GST, TDS & India compliance documents' },
  'Finance & Accounting': { Icon: PieChart, iconColor: 'text-teal-400', iconBg: 'bg-teal-500/[0.12]', border: 'border-teal-500/[0.15]', desc: 'Expenses, reimbursements & accounting exports' },
  'Enterprise': { Icon: Layers, iconColor: 'text-amber-400', iconBg: 'bg-amber-500/[0.12]', border: 'border-amber-500/[0.15]', desc: 'White-label deployment under your brand' },
  'Analytics': { Icon: BarChart3, iconColor: 'text-fuchsia-400', iconBg: 'bg-fuchsia-500/[0.12]', border: 'border-fuchsia-500/[0.15]', desc: 'Document engagement & performance insights' },
  'Communication': { Icon: MessageSquare, iconColor: 'text-rose-400', iconBg: 'bg-rose-500/[0.12]', border: 'border-rose-500/[0.15]', desc: 'Client messaging, approvals & follow-ups' },
};
const DEFAULT_CAT: CatConfig = { Icon: Star, iconColor: 'text-white/50', iconBg: 'bg-white/[0.06]', border: 'border-white/[0.10]', desc: '' };

const CATEGORY_ORDER = [
  'CRM', 'HRM', 'Invoicer', 'Project Management',
  'AI & Automation', 'Team & Collaboration', 'Team', 'Security & Compliance',
  'Legal & Compliance', 'Mobile', 'Developer', 'Automation',
  'Finance & Legal', 'Finance & Accounting', 'Enterprise', 'Analytics', 'Communication',
];

const HERO_SUBTITLES = [
  'Shape the future of document workflow.',
  'Exclusive early access — limited spots.',
  'Your voice decides what we build next.',
  'Join the inner circle of docrud builders.',
];

// Sidebar nav items
const SIDEBAR_NAV = [
  { id: 'home', label: 'Home', Icon: LayoutDashboard, href: '/workspace' },
  { id: 'early-access', label: 'Early Access', Icon: Rocket, href: '/early-access', active: true },
];

// ── OTP Input ─────────────────────────────────────────────────────────────────

function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.padEnd(6, '').split('').slice(0, 6);

  const focus = (i: number) => refs.current[i]?.focus();

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[i]) { const n = [...digits]; n[i] = ''; onChange(n.join('')); }
      else if (i > 0) focus(i - 1);
    } else if (e.key === 'ArrowLeft' && i > 0) focus(i - 1);
    else if (e.key === 'ArrowRight' && i < 5) focus(i + 1);
  };

  const handleChange = (i: number, raw: string) => {
    const ch = raw.replace(/\D/g, '').slice(-1);
    if (!ch) return;
    const n = [...digits]; n[i] = ch; onChange(n.join(''));
    if (i < 5) focus(i + 1);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (t) { onChange(t.padEnd(6, '').slice(0, 6)); focus(Math.min(t.length, 5)); }
    e.preventDefault();
  };

  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text" inputMode="numeric" maxLength={1} value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          style={{
            width: 46, height: 56, borderRadius: 12, textAlign: 'center',
            background: d ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
            border: `2px solid ${d ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.10)'}`,
            color: '#fff', fontSize: 22, fontWeight: 700, outline: 'none',
            transition: 'all 0.15s', caretColor: 'transparent',
          }}
        />
      ))}
    </div>
  );
}

// ── Countdown ─────────────────────────────────────────────────────────────────

function Countdown({ expiresAt, onExpire }: { expiresAt: string; onExpire?: () => void }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => {
      setSecs((s) => { if (s <= 1) { clearInterval(t); onExpire?.(); return 0; } return s - 1; });
    }, 1000);
    return () => clearInterval(t);
  }, [onExpire]);
  const m = Math.floor(secs / 60), s = secs % 60;
  return <span style={{ fontVariantNumeric: 'tabular-nums', color: secs < 60 ? '#f87171' : 'rgba(255,255,255,0.45)' }}>{m}:{String(s).padStart(2, '0')}</span>;
}

// ── Waitlist Modal — 3 clear steps ────────────────────────────────────────────

function WaitlistModal({ feature, onClose }: { feature: Feature; onClose: () => void }) {
  const [step, setStep] = useState<'email' | 'otp' | 'success'>('email');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [canResend, setCanResend] = useState(false);
  const [otpExpired, setOtpExpired] = useState(false);

  async function sendOtp() {
    const trimmedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.'); return;
    }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/early-access/waitlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_otp', featureId: feature.id, email: trimmedEmail, name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send verification code');
      setSessionId(data.sessionId);
      setExpiresAt(data.expiresAt);
      setOtpExpired(false);
      setOtp('');
      setStep('otp');
      setCanResend(false);
      setTimeout(() => setCanResend(true), 45_000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally { setLoading(false); }
  }

  async function verifyOtp() {
    if (otp.replace(/\D/g, '').length < 6) { setError('Please enter the full 6-digit code.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/early-access/waitlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_otp', sessionId, otp: otp.replace(/\D/g, '') }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Incorrect code. Please try again.');
      setStep('success');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Verification failed. Please try again.');
      setOtp('');
    } finally { setLoading(false); }
  }

  const STEPS = ['email', 'otp', 'success'] as const;
  const stepIdx = STEPS.indexOf(step);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)' }}>
      <div style={{ width: '100%', maxWidth: 420, background: 'linear-gradient(160deg,rgba(18,18,24,0.99),rgba(12,12,16,0.99))', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 22, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.70)' }}>
        {/* Top accent line */}
        <div style={{ height: 2, background: 'linear-gradient(90deg,transparent,rgba(167,139,250,0.8),transparent)' }} />

        <div style={{ padding: '24px 24px 28px' }}>
          {/* Step indicator */}
          {step !== 'success' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              {['Email', 'Verify', 'Done'].map((label, i) => (
                <React.Fragment key={label}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, background: i < stepIdx ? 'rgba(134,239,172,0.20)' : i === stepIdx ? 'rgba(167,139,250,0.20)' : 'rgba(255,255,255,0.05)', border: `1px solid ${i < stepIdx ? 'rgba(134,239,172,0.40)' : i === stepIdx ? 'rgba(167,139,250,0.45)' : 'rgba(255,255,255,0.10)'}`, color: i < stepIdx ? '#86efac' : i === stepIdx ? '#c4b5fd' : 'rgba(255,255,255,0.30)' }}>
                      {i < stepIdx ? <Check className="w-3 h-3" /> : i + 1}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: i === stepIdx ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.28)' }}>{label}</span>
                  </div>
                  {i < 2 && <div style={{ flex: 1, height: 1, background: i < stepIdx ? 'rgba(134,239,172,0.25)' : 'rgba(255,255,255,0.08)' }} />}
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Close button */}
          <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.45)' }}>
            <X className="w-3.5 h-3.5" />
          </button>

          {/* ── Step: Email ── */}
          {step === 'email' && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 9.5, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', marginBottom: 5 }}>Early Bird Waitlist</p>
                <h2 style={{ fontSize: 19, fontWeight: 700, color: '#fafafa', lineHeight: 1.2, marginBottom: 4 }}>{feature.title}</h2>
                <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.42)' }}>{feature.tagline}</p>
              </div>

              {error && (
                <div style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 10, padding: '9px 12px', marginBottom: 14, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#fca5a5' }} />
                  <span style={{ fontSize: 13, color: '#fca5a5', lineHeight: 1.5 }}>{error}</span>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', display: 'block', marginBottom: 5 }}>Your name <span style={{ color: 'rgba(255,255,255,0.25)' }}>(optional)</span></label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" style={{ width: '100%', padding: '10px 13px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#fafafa', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', display: 'block', marginBottom: 5 }}>Email address <span style={{ color: '#f87171' }}>*</span></label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !loading && sendOtp()} type="email" placeholder="you@company.com" style={{ width: '100%', padding: '10px 13px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#fafafa', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <button onClick={sendOtp} disabled={loading} style={{ width: '100%', padding: '12px 16px', borderRadius: 11, background: loading ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.92)', color: loading ? 'rgba(255,255,255,0.5)' : '#0a0a0b', fontSize: 14, fontWeight: 700, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2 }}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  {loading ? 'Sending verification code…' : 'Send Verification Code'}
                </button>
              </div>

              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
                A 6-digit code will be sent to your email.<br />No spam — only updates on this feature.
              </p>
            </div>
          )}

          {/* ── Step: OTP ── */}
          {step === 'otp' && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 22 }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <Mail className="w-6 h-6" style={{ color: '#c4b5fd' }} />
                </div>
                <h2 style={{ fontSize: 19, fontWeight: 700, color: '#fafafa', marginBottom: 6 }}>Check your email</h2>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                  We sent a 6-digit code to<br />
                  <strong style={{ color: '#fafafa' }}>{email}</strong>
                </p>
              </div>

              {error && (
                <div style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 10, padding: '9px 12px', marginBottom: 16, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#fca5a5' }} />
                  <span style={{ fontSize: 13, color: '#fca5a5', lineHeight: 1.5 }}>{error}</span>
                </div>
              )}

              <OtpInput value={otp} onChange={setOtp} />

              {!otpExpired ? (
                <p style={{ textAlign: 'center', fontSize: 12.5, color: 'rgba(255,255,255,0.32)', margin: '12px 0 18px' }}>
                  Code expires in <Countdown expiresAt={expiresAt} onExpire={() => setOtpExpired(true)} />
                </p>
              ) : (
                <p style={{ textAlign: 'center', fontSize: 12.5, color: '#f87171', margin: '12px 0 18px' }}>Code expired. Please resend.</p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={verifyOtp}
                  disabled={loading || otp.replace(/\D/g, '').length < 6 || otpExpired}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 11, background: otp.replace(/\D/g, '').length === 6 && !otpExpired ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.07)', color: otp.replace(/\D/g, '').length === 6 && !otpExpired ? '#0a0a0b' : 'rgba(255,255,255,0.30)', fontSize: 14, fontWeight: 700, border: 'none', cursor: otp.replace(/\D/g, '').length < 6 || loading || otpExpired ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s' }}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {loading ? 'Verifying…' : 'Confirm & Join Waitlist'}
                </button>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setStep('email'); setOtp(''); setError(''); }} style={{ flex: 1, padding: '9px 12px', borderRadius: 10, background: 'transparent', color: 'rgba(255,255,255,0.38)', fontSize: 12.5, fontWeight: 600, border: '1px solid rgba(255,255,255,0.09)', cursor: 'pointer' }}>
                    ← Change email
                  </button>
                  {(canResend || otpExpired) && (
                    <button onClick={() => { setOtp(''); setError(''); sendOtp(); }} disabled={loading} style={{ flex: 1, padding: '9px 12px', borderRadius: 10, background: 'transparent', color: 'rgba(255,255,255,0.38)', fontSize: 12.5, fontWeight: 600, border: '1px solid rgba(255,255,255,0.09)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <RefreshCw className="w-3 h-3" /> Resend code
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Step: Success ── */}
          {step === 'success' && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ width: 60, height: 60, borderRadius: 16, background: 'rgba(134,239,172,0.12)', border: '1px solid rgba(134,239,172,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                <CheckCircle2 className="w-7 h-7" style={{ color: '#86efac' }} />
              </div>
              <h2 style={{ fontSize: 21, fontWeight: 700, color: '#fafafa', marginBottom: 10 }}>You're on the list! 🎉</h2>
              <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.42)', lineHeight: 1.65, maxWidth: 300, margin: '0 auto 6px' }}>
                We'll notify <strong style={{ color: '#fafafa' }}>{email}</strong> the moment <strong style={{ color: '#fafafa' }}>{feature.title}</strong> opens for early access.
              </p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.28)', margin: '0 auto 24px' }}>Stay tuned — limited spots.</p>
              <button onClick={onClose} style={{ padding: '10px 28px', borderRadius: 11, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#fafafa', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Wish Modal ────────────────────────────────────────────────────────────────

function WishModal({ feature, onClose }: { feature: Feature; onClose: () => void }) {
  const [form, setForm] = useState({ email: '', name: '', currentSoftware: '', painPoints: '', expectedFeatures: '', excitement: 3 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError('Please enter a valid email.'); return; }
    if (form.painPoints.trim().length < 10) { setError('Please describe your pain points (min 10 characters).'); return; }
    if (form.expectedFeatures.trim().length < 10) { setError('Please describe what you expect (min 10 characters).'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/early-access/wishes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ featureId: feature.id, ...form }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setSuccess(true);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Something went wrong'); }
    finally { setLoading(false); }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: '#fafafa', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ width: '100%', maxWidth: 500, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'linear-gradient(160deg,rgba(18,18,24,0.99),rgba(12,12,16,0.99))', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '22px 22px 0 0', boxShadow: '0 -40px 100px rgba(0,0,0,0.70)' }}>
        <div style={{ height: 2, background: 'linear-gradient(90deg,transparent,rgba(244,114,182,0.7),transparent)', borderRadius: '22px 22px 0 0' }} />
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.14)' }} />
        </div>
        <div style={{ padding: '12px 22px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <p style={{ fontSize: 9.5, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', marginBottom: 4 }}>Make a Wish · {feature.title}</p>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#fafafa' }}>Share your vision</h2>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>Your feedback directly shapes what we build</p>
          </div>
          <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.45)', flexShrink: 0, marginLeft: 12 }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
          {success ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(244,114,182,0.12)', border: '1px solid rgba(244,114,182,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Heart className="w-6 h-6" style={{ color: '#f472b6' }} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fafafa', marginBottom: 8 }}>Wish received! ✨</h3>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.42)', lineHeight: 1.65 }}>Our product team reviews every wish. You'll hear from us if we need more details.</p>
              <button onClick={onClose} style={{ marginTop: 20, padding: '9px 24px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#fafafa', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
            </div>
          ) : (
            <>
              {error && <div style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 9, padding: '8px 12px', display: 'flex', gap: 7, alignItems: 'flex-start' }}><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#fca5a5' }} /><span style={{ fontSize: 12.5, color: '#fca5a5', lineHeight: 1.5 }}>{error}</span></div>}
              {[
                { label: 'Your name', key: 'name', placeholder: 'Optional', type: 'text', req: false },
                { label: 'Email address', key: 'email', placeholder: 'you@company.com', type: 'email', req: true },
                { label: 'Software you currently use', key: 'currentSoftware', placeholder: 'e.g. Notion, Google Docs, Zoho…', type: 'text', req: false },
              ].map(({ label, key, placeholder, type, req }) => (
                <div key={key}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', display: 'block', marginBottom: 5 }}>{label} {req && <span style={{ color: '#f87171' }}>*</span>}</label>
                  <input value={(form as Record<string, string | number>)[key] as string} onChange={(e) => set(key, e.target.value)} type={type} placeholder={placeholder} style={inp} />
                </div>
              ))}
              {[
                { label: 'What problems do you face today?', key: 'painPoints', placeholder: 'What frustrates you most about current tools?', req: true },
                { label: 'What do you expect from this feature?', key: 'expectedFeatures', placeholder: 'Describe the must-have capabilities…', req: true },
              ].map(({ label, key, placeholder, req }) => (
                <div key={key}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', display: 'block', marginBottom: 5 }}>{label} {req && <span style={{ color: '#f87171' }}>*</span>}</label>
                  <textarea value={(form as Record<string, string | number>)[key] as string} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} rows={3} style={{ ...inp, resize: 'vertical' }} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', display: 'block', marginBottom: 8 }}>How excited are you? (1–5)</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {([1, 2, 3, 4, 5] as const).map((n) => (
                    <button key={n} type="button" onClick={() => set('excitement', n)} style={{ flex: 1, height: 40, borderRadius: 9, background: form.excitement >= n ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${form.excitement >= n ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.08)'}`, color: form.excitement >= n ? '#fafafa' : 'rgba(255,255,255,0.30)', fontSize: 16, cursor: 'pointer', transition: 'all 0.14s' }}>
                      {['😐', '🙂', '😊', '🤩', '🚀'][n - 1]}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {!success && (
          <div style={{ padding: '13px 22px', borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, paddingBottom: 'max(13px, env(safe-area-inset-bottom, 13px))' }}>
            <button onClick={submit} disabled={loading} style={{ width: '100%', padding: '12px 16px', borderRadius: 11, background: loading ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.92)', color: loading ? 'rgba(255,255,255,0.5)' : '#0a0a0b', fontSize: 14, fontWeight: 700, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {loading ? 'Submitting…' : 'Submit My Wish'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Feature Detail Drawer ─────────────────────────────────────────────────────

function FeatureDetailDrawer({ feature, onClose, onWaitlist, onWish }: { feature: Feature; onClose: () => void; onWaitlist: () => void; onWish: () => void }) {
  const IconComp = ICON_MAP[feature.icon] || Star;
  const catCfg = CATEGORY_CONFIG[feature.category] || DEFAULT_CAT;
  const subItems = feature.features?.length ? feature.features : feature.tags;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 190, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(12px)' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ width: '100%', maxWidth: 560, maxHeight: '82vh', display: 'flex', flexDirection: 'column', background: 'linear-gradient(160deg,rgba(16,16,22,0.99),rgba(10,10,14,0.99))', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '24px 24px 0 0', boxShadow: '0 -40px 100px rgba(0,0,0,0.72)' }}>
        <div style={{ height: 2, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)', borderRadius: '24px 24px 0 0' }} />
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 2, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.14)' }} />
        </div>
        <div style={{ padding: '10px 22px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'flex-start', gap: 14, flexShrink: 0 }}>
          <div style={{ width: 48, height: 48, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <IconComp className={`w-5 h-5 ${catCfg.iconColor}`} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 9.5, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase', marginBottom: 3 }}>{feature.category} · {feature.eta}</p>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fafafa', lineHeight: 1.25 }}>{feature.title}</h2>
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.42)', marginTop: 3 }}>{feature.tagline}</p>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.45)', flexShrink: 0 }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: '18px 22px', flex: 1 }}>
          <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.48)', lineHeight: 1.72, marginBottom: 20 }}>{feature.description}</p>
          <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', marginBottom: 12 }}>
            {feature.features?.length ? "What's included" : 'Capabilities'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 20 }}>
            {subItems.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 18, height: 18, borderRadius: 5, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  <Check className="w-2.5 h-2.5" style={{ color: 'rgba(255,255,255,0.55)' }} />
                </div>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.60)', lineHeight: 1.55 }}>{item}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 18 }}>
            {feature.tags.map((t) => <span key={t} style={{ padding: '3px 9px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', fontSize: 10.5, fontWeight: 600, color: 'rgba(255,255,255,0.40)' }}>{t}</span>)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ v: feature.waitlistCount, l: 'On waitlist' }, { v: feature.wishCount, l: 'Wishes' }, { v: feature.eta, l: 'Est. release', sm: true }].map((s) => (
              <div key={s.l} style={{ flex: 1, padding: '10px 12px', borderRadius: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', textAlign: 'center' }}>
                <div style={{ fontSize: s.sm ? 12 : 17, fontWeight: 700, color: '#fafafa' }}>{s.v}</div>
                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.30)', marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: '13px 22px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 9, flexShrink: 0, paddingBottom: 'max(13px, env(safe-area-inset-bottom, 13px))' }}>
          <button onClick={onWaitlist} style={{ flex: 1, padding: '11px 14px', borderRadius: 11, background: 'rgba(255,255,255,0.92)', color: '#0a0a0b', fontSize: 13.5, fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Rocket className="w-4 h-4" />Join Waitlist
          </button>
          <button onClick={onWish} style={{ flex: 1, padding: '11px 14px', borderRadius: 11, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.70)', fontSize: 13.5, fontWeight: 600, border: '1px solid rgba(255,255,255,0.10)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Heart className="w-4 h-4" />Make a Wish
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Feature Card ──────────────────────────────────────────────────────────────

function FeatureCard({ feature, onClick }: { feature: Feature; onClick: () => void }) {
  const IconComp = ICON_MAP[feature.icon] || Star;
  const catCfg = CATEGORY_CONFIG[feature.category] || DEFAULT_CAT;
  return (
    <button type="button" onClick={onClick} className="shrink-0 text-left group" style={{ width: 'min(260px,78vw)', padding: 16, borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)', transition: 'all 0.2s', cursor: 'pointer' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.13)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <IconComp className={`w-4 h-4 ${catCfg.iconColor}`} />
        </div>
        <span style={{ padding: '3px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.40)', whiteSpace: 'nowrap' as const }}>{feature.eta}</span>
      </div>
      <p style={{ fontSize: 13, fontWeight: 700, color: '#fafafa', lineHeight: 1.3, marginBottom: 4 }}>{feature.title}</p>
      <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.40)', lineHeight: 1.55, marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>{feature.tagline}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {feature.tags.slice(0, 3).map((t) => <span key={t} style={{ padding: '2px 7px', borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.32)' }}>{t}</span>)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.26)' }}>{feature.waitlistCount} waiting</span>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(255,255,255,0.32)', display: 'flex', alignItems: 'center', gap: 3 }}>
          Details <ChevronRight className="w-3 h-3" />
        </span>
      </div>
    </button>
  );
}

// ── Category Slider ───────────────────────────────────────────────────────────

function CategorySection({ category, features, onFeatureClick, idx }: { category: string; features: Feature[]; onFeatureClick: (f: Feature) => void; idx: number }) {
  const catCfg = CATEGORY_CONFIG[category] || DEFAULT_CAT;
  const IconComp = catCfg.Icon;
  return (
    <section id={`ea-cat-${idx}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <IconComp className={`w-3.5 h-3.5 ${catCfg.iconColor}`} />
          <h2 style={{ fontSize: 13.5, fontWeight: 700, color: '#fafafa' }}>{category}</h2>
          <span style={{ padding: '1px 7px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', fontSize: 9.5, fontWeight: 600, color: 'rgba(255,255,255,0.32)' }}>{features.length}</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.28)', display: 'flex', alignItems: 'center', gap: 3 }}>Coming Soon <ArrowRight className="w-2.5 h-2.5" /></span>
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{ pointerEvents: 'none', position: 'absolute', inset: '0 auto 0 0', width: 32, background: 'linear-gradient(to right,#0d0e11,transparent)', zIndex: 1 }} />
        <div style={{ pointerEvents: 'none', position: 'absolute', inset: '0 0 0 auto', width: 32, background: 'linear-gradient(to left,#0d0e11,transparent)', zIndex: 1 }} />
        <div data-auto-slider="true" data-auto-speed="0.40" data-auto-loop="end" style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 4 }}>
          {features.map((f) => <FeatureCard key={f.id} feature={f} onClick={() => onFeatureClick(f)} />)}
        </div>
      </div>
    </section>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EarlyAccessPage() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroDot, setHeroDot] = useState(0);
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [waitlistFeature, setWaitlistFeature] = useState<Feature | null>(null);
  const [wishFeature, setWishFeature] = useState<Feature | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetch('/api/early-access/features')
      .then((r) => r.json())
      .then((d) => setFeatures(Array.isArray(d.features) ? d.features : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setHeroDot((d) => (d + 1) % HERO_SUBTITLES.length), 3400);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (loading || features.length === 0) return;
    const sliders = Array.from(document.querySelectorAll<HTMLElement>('[data-auto-slider="true"]'));
    if (!sliders.length) return;
    const ctrls: Array<{ rafId: number; cleanup: () => void }> = [];
    for (const node of sliders) {
      let paused = false;
      const onEnter = () => { paused = true; };
      const onLeave = () => { paused = false; };
      node.addEventListener('mouseenter', onEnter);
      node.addEventListener('mouseleave', onLeave);
      node.addEventListener('touchstart', onEnter, { passive: true });
      node.addEventListener('touchend', onLeave, { passive: true });
      let scroll = 0;
      const speed = Number(node.getAttribute('data-auto-speed') || '0.40');
      let ctrl: { rafId: number; cleanup: () => void };
      const step = () => {
        if (!paused) { scroll += speed; const max = Math.max(0, node.scrollWidth - node.clientWidth); if (scroll >= max) scroll = 0; node.scrollLeft = scroll; } else { scroll = node.scrollLeft; }
        ctrl.rafId = requestAnimationFrame(step);
      };
      ctrl = { rafId: 0, cleanup: () => { node.removeEventListener('mouseenter', onEnter); node.removeEventListener('mouseleave', onLeave); node.removeEventListener('touchstart', onEnter as EventListener); node.removeEventListener('touchend', onLeave as EventListener); } };
      ctrls.push(ctrl);
      ctrl.rafId = requestAnimationFrame(step);
    }
    return () => { for (const c of ctrls) { cancelAnimationFrame(c.rafId); c.cleanup(); } };
  }, [loading, features]);

  // Group by category
  const grouped: Array<{ cat: string; items: Feature[] }> = [];
  const seen = new Set<string>();
  const cats = [...CATEGORY_ORDER.filter((c) => features.some((f) => f.category === c)), ...features.map((f) => f.category).filter((c) => !CATEGORY_ORDER.includes(c))];
  for (const cat of cats) { if (seen.has(cat)) continue; seen.add(cat); const items = features.filter((f) => f.category === cat); if (items.length) grouped.push({ cat, items }); }

  const heroCatCards = grouped.slice(0, 4);

  const sidebar = (
    <aside style={{ width: 62, background: '#090a0d', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0', gap: 0, flexShrink: 0, height: '100%' }}>
      {/* Logo */}
      <Link href="/" style={{ display: 'block', textDecoration: 'none', marginBottom: 18, position: 'relative', width: 38, height: 38, borderRadius: 12, flexShrink: 0 }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: -1.5, borderRadius: 13.5, background: 'conic-gradient(from 0deg, transparent 0%, transparent 62%, rgba(170,128,40,0.55) 74%, rgba(232,204,122,1.0) 83%, rgba(232,204,122,0.95) 88%, rgba(170,128,40,0.50) 96%, transparent 100%)', animation: 'goldenRingSpin 3.2s linear infinite', zIndex: 0 }} />
        <img src="/icons/logo-192.png" alt="Docrud" width={38} height={38} style={{ borderRadius: 11, display: 'block', position: 'relative', zIndex: 1, width: 38, height: 38, objectFit: 'cover' }} />
      </Link>
      {/* Nav items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', flex: 1 }}>
        {SIDEBAR_NAV.map(({ id, label, Icon, href, active }) => (
          <Link key={id} href={href} title={label} style={{ width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', background: active ? 'rgba(255,255,255,0.10)' : 'transparent', border: active ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent', transition: 'all 0.15s', position: 'relative' }}
            onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            {active && <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 18, borderRadius: '0 3px 3px 0', background: 'rgba(167,139,250,0.8)' }} />}
            <Icon style={{ width: 17, height: 17, color: active ? '#fafafa' : 'rgba(255,255,255,0.38)', flexShrink: 0 }} />
          </Link>
        ))}
      </div>
      {/* Bottom */}
      <Link href="/workspace" title="Workspace Settings" style={{ width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', transition: 'all 0.15s' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <Settings style={{ width: 16, height: 16, color: 'rgba(255,255,255,0.30)', flexShrink: 0 }} />
      </Link>
    </aside>
  );

  return (
    <div style={{ display: 'flex', height: '100dvh', background: '#0d0e11', overflow: 'hidden', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>

      {/* ── Sidebar (desktop) ── */}
      <div className="hidden md:flex" style={{ flexShrink: 0 }}>
        {sidebar}
      </div>

      {/* ── Mobile sidebar drawer ── */}
      {sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setSidebarOpen(false)} />
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 62, zIndex: 1 }}>
            {sidebar}
          </div>
        </div>
      )}

      {/* ── Main column ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Top bar ── */}
        <header style={{ height: 56, background: 'rgba(13,14,17,0.95)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', paddingLeft: 16, paddingRight: 20, gap: 12, flexShrink: 0, zIndex: 50 }}>
          {/* Mobile menu toggle */}
          <button className="md:hidden" onClick={() => setSidebarOpen(true)} style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.60)', flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M1.5 3h12M1.5 7.5h12M1.5 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>

          {/* Branding */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
            <div style={{ position: 'relative', width: 26, height: 26, borderRadius: 8, flexShrink: 0 }}>
              <div aria-hidden="true" style={{ position: 'absolute', inset: -1.5, borderRadius: 10, background: 'conic-gradient(from 0deg, transparent 0%, transparent 62%, rgba(170,128,40,0.55) 74%, rgba(232,204,122,1.0) 83%, rgba(232,204,122,0.95) 88%, rgba(170,128,40,0.50) 96%, transparent 100%)', animation: 'goldenRingSpin 3.2s linear infinite', zIndex: 0 }} />
              <img src="/icons/logo-192.png" alt="Docrud" width={26} height={26} style={{ borderRadius: 7, display: 'block', position: 'relative', zIndex: 1, width: 26, height: 26, objectFit: 'cover' }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fafafa', letterSpacing: '-0.03em' }}>docrud</span>
          </Link>

          {/* Page badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
            <Rocket style={{ width: 11, height: 11, color: '#a78bfa' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>Early Bird Access</span>
          </div>

          {/* Search — desktop */}
          <div className="hidden sm:flex" style={{ flex: 1, maxWidth: 320, alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Search style={{ width: 13, height: 13, color: 'rgba(255,255,255,0.30)', flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.28)' }}>Search upcoming features…</span>
          </div>

          <div style={{ flex: 1 }} />

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link href="/workspace" style={{ padding: '6px 13px', borderRadius: 9, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.09)', fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.65)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }} className="hidden sm:flex">
              <LayoutDashboard style={{ width: 13, height: 13 }} />Workspace
            </Link>
            <Link href="/login" style={{ padding: '6px 13px', borderRadius: 9, background: 'rgba(255,255,255,0.92)', fontSize: 12.5, fontWeight: 700, color: '#0a0a0b', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
              <LogIn style={{ width: 13, height: 13 }} />Login
            </Link>
          </div>
        </header>

        {/* ── Scrollable content ── */}
        <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 20px 80px', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Hero row */}
            <div style={{ display: 'flex', gap: 12, minHeight: 220 }}>

              {/* Hero card */}
              <div style={{ flex: 1.5, minWidth: 0, borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)', background: '#0d0e11', position: 'relative', boxShadow: '0 8px 40px rgba(0,0,0,0.55)' }}>
                <div style={{ position: 'absolute', inset: 0, opacity: 0.04, backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.5) 1px,transparent 1px)', backgroundSize: '32px 32px', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', right: '-6%', top: '50%', transform: 'translateY(-50%)', width: '50%', aspectRatio: '1', borderRadius: '50%', background: 'radial-gradient(circle,rgba(139,92,246,0.22) 0%,transparent 68%)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right,#0d0e11,rgba(13,14,17,0.72) 60%,transparent)', pointerEvents: 'none' }} />
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', padding: '24px 28px' }}>
                  <div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 12, padding: '3px 10px 3px 6px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(134,239,172,0.85)', boxShadow: '0 0 6px rgba(134,239,172,0.6)', display: 'inline-block' }} />
                      <span style={{ fontSize: 9, letterSpacing: '0.17em', color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', fontWeight: 700 }}>Early Bird · Limited Spots</span>
                    </div>
                    <h1 style={{ fontSize: 'clamp(1.3rem,3vw,2.5rem)', fontWeight: 800, color: '#fafafa', lineHeight: 1.08, letterSpacing: '-0.04em', margin: 0 }}>
                      The future of{' '}
                      <span style={{ color: 'rgba(255,255,255,0.42)' }}>docrud</span>{' '}
                      is being{' '}
                      <span style={{ color: '#a78bfa', filter: 'drop-shadow(0 0 18px rgba(139,92,246,0.45))' }}>built.</span>
                    </h1>
                    <div style={{ position: 'relative', overflow: 'hidden', height: '1.35rem', maxWidth: 380, marginTop: 10 }}>
                      {HERO_SUBTITLES.map((s, i) => {
                        const off = i - heroDot;
                        return <p key={i} style={{ position: 'absolute', inset: '0 0 auto', fontSize: 13.5, color: 'rgba(255,255,255,0.48)', transform: `translateY(${off * 110}%)`, opacity: off === 0 ? 1 : 0, transition: 'transform 0.58s cubic-bezier(0.4,0,0.2,1),opacity 0.5s ease', margin: 0, whiteSpace: 'nowrap' }}>{s}</p>;
                      })}
                    </div>
                    <a href="#ea-features" style={{ marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.08)', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.80)', textDecoration: 'none', backdropFilter: 'blur(8px)' }}>
                      Explore features <ArrowRight style={{ width: 13, height: 13 }} />
                    </a>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
                    {HERO_SUBTITLES.map((_, i) => (
                      <button key={i} type="button" onClick={() => setHeroDot(i)} style={{ height: 5, borderRadius: 3, background: heroDot === i ? '#fff' : 'rgba(255,255,255,0.20)', width: heroDot === i ? 20 : 5, border: 'none', cursor: 'pointer', transition: 'all 0.4s', padding: 0 }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Category 2×2 grid — desktop */}
              {!loading && heroCatCards.length > 0 && (
                <div className="hidden sm:grid" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gridTemplateRows: 'repeat(2,minmax(0,1fr))', gap: 10, width: 340, flexShrink: 0 }}>
                  {heroCatCards.map(({ cat, items }, ci) => {
                    const cfg = CATEGORY_CONFIG[cat] || DEFAULT_CAT;
                    const IconComp = cfg.Icon;
                    return (
                      <button key={cat} type="button" onClick={() => document.getElementById(`ea-cat-${grouped.findIndex((g) => g.cat === cat)}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                        style={{ borderRadius: 16, border: `1px solid rgba(255,255,255,${ci % 2 === 0 ? '0.07' : '0.06'})`, background: 'rgba(255,255,255,0.04)', padding: 14, textAlign: 'left', cursor: 'pointer', backdropFilter: 'blur(20px)', transition: 'all 0.18s', display: 'flex', flexDirection: 'column' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
                      >
                        <div className={`flex h-8 w-8 items-center justify-center rounded-[9px] ${cfg.iconBg}`}>
                          <IconComp className={`h-4 w-4 ${cfg.iconColor}`} />
                        </div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#fafafa', marginTop: 10, lineHeight: 1.3 }}>{cat}</p>
                        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.36)', marginTop: 3, lineHeight: 1.4, flex: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>{cfg.desc}</p>
                        <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.26)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 3 }}>
                          {items.length} feature{items.length !== 1 ? 's' : ''} <ArrowRight style={{ width: 10, height: 10 }} />
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Category sliders */}
            <div id="ea-features" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'rgba(255,255,255,0.25)' }} />
                </div>
              ) : (
                grouped.map(({ cat, items }, i) => (
                  <CategorySection key={cat} category={cat} features={items} onFeatureClick={setSelectedFeature} idx={i} />
                ))
              )}
            </div>

            {/* Footer CTA */}
            {!loading && features.length > 0 && (
              <div style={{ padding: '28px 24px', borderRadius: 20, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', textAlign: 'center' }}>
                <p style={{ fontSize: 9.5, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.26)', textTransform: 'uppercase', marginBottom: 10 }}>Have an idea?</p>
                <h2 style={{ fontSize: 'clamp(1.2rem,2.8vw,1.8rem)', fontWeight: 700, color: '#fafafa', lineHeight: 1.2, marginBottom: 8 }}>Shape what docrud builds next</h2>
                <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.38)', maxWidth: 460, margin: '0 auto 18px', lineHeight: 1.65 }}>Click any feature to join its waitlist or share your vision. Every wish is read by our product team.</p>
                <a href="#ea-features" style={{ padding: '9px 22px', borderRadius: 10, background: 'rgba(255,255,255,0.90)', color: '#0a0a0b', fontSize: 13.5, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles style={{ width: 14, height: 14 }} />Browse All Features
                </a>
              </div>
            )}
          </div>

          {/* Page footer */}
          <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative', width: 26, height: 26, borderRadius: 8, flexShrink: 0 }}>
                <div aria-hidden="true" style={{ position: 'absolute', inset: -1.5, borderRadius: 10, background: 'conic-gradient(from 0deg, transparent 0%, transparent 62%, rgba(170,128,40,0.55) 74%, rgba(232,204,122,1.0) 83%, rgba(232,204,122,0.95) 88%, rgba(170,128,40,0.50) 96%, transparent 100%)', animation: 'goldenRingSpin 3.2s linear infinite', zIndex: 0 }} />
                <img src="/icons/logo-192.png" alt="Docrud" width={26} height={26} style={{ borderRadius: 7, display: 'block', position: 'relative', zIndex: 1, width: 26, height: 26, objectFit: 'cover' }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '-0.02em' }}>docrud</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.20)' }}>·</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>Built In Bharat for the World</span>
            </div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              {[['/', 'Home'], ['/pricing', 'Pricing'], ['/contact', 'Contact'], ['/login', 'Login']].map(([href, label]) => (
                <Link key={href} href={href} style={{ fontSize: 12, color: 'rgba(255,255,255,0.28)', textDecoration: 'none' }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.65)'; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.28)'; }}>{label}</Link>
              ))}
            </div>
          </footer>
        </main>
      </div>

      {/* Modals */}
      {selectedFeature && (
        <FeatureDetailDrawer
          feature={selectedFeature}
          onClose={() => setSelectedFeature(null)}
          onWaitlist={() => { setWaitlistFeature(selectedFeature); setSelectedFeature(null); }}
          onWish={() => { setWishFeature(selectedFeature); setSelectedFeature(null); }}
        />
      )}
      {waitlistFeature && <WaitlistModal feature={waitlistFeature} onClose={() => setWaitlistFeature(null)} />}
      {wishFeature && <WishModal feature={wishFeature} onClose={() => setWishFeature(null)} />}
    </div>
  );
}
