'use client';

/**
 * Forgot password.
 *
 * Three steps on one card, styled as the login card is:
 *   1. identifier  → POST /api/account/forgot-password  (a code is emailed)
 *   2. code + new password → POST /api/account/reset-password
 *   3. done → back to /login, which shows a "password updated" notice.
 *
 * The server answers step 1 identically whether or not the account exists, so
 * this page never tells anyone which emails are registered; it only says where
 * to look. Step 2 needs the email the code was sent to, so a login ID in step 1
 * still means typing the email here.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle, Eye, EyeOff, KeyRound, LockKeyhole, MailCheck, Users } from 'lucide-react';
import AnimatedLoginBackground from '@/components/AnimatedLoginBackground';
import { SecurityVerification, isTurnstileEnabled } from '@/components/security/SecurityVerification';

type Step = 'request' | 'reset' | 'done';

const RESEND_SECONDS = 45;
const MIN_PASSWORD_LENGTH = 8;

const INPUT =
  'h-9 w-full rounded-[11px] border border-white/[0.08] bg-white/[0.04] pl-10 pr-4 text-[13px] text-white placeholder:text-white/18 outline-none transition-all duration-200 focus:border-white/[0.18] focus:bg-white/[0.06] focus:shadow-[0_0_0_3px_rgba(255,255,255,0.05)] sm:h-10 sm:rounded-[13px] sm:text-sm';
const LABEL = 'block text-[10px] font-bold uppercase tracking-[0.18em] text-white/28 sm:text-[11px]';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>('request');

  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [emailHint, setEmailHint] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);

  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resendIn, setResendIn] = useState(0);

  const identifierRef = useRef<HTMLInputElement>(null);
  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); identifierRef.current?.focus(); }, []);
  useEffect(() => { if (step === 'reset') otpRef.current?.focus(); }, [step]);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const identifierLooksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim());

  const requestCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(''); setNotice('');
    const id = identifier.trim();
    if (!id) { setError('Enter the email or login ID of your account.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/account/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier: id, captchaToken }),
      });
      setCaptchaToken(''); setCaptchaResetSignal((n) => n + 1);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : (res.status === 429
          ? 'Too many requests. Please wait a few minutes and try again.'
          : 'We could not send a reset code right now. Please try again.'));
        return;
      }
      setSessionId(String(data.sessionId || ''));
      setEmailHint(String(data.emailHint || ''));
      if (identifierLooksLikeEmail) setEmail(id.toLowerCase());
      setResendIn(RESEND_SECONDS);
      setOtp('');
      if (step === 'reset') setNotice('A new code has been sent if the account exists.');
      setStep('reset');
    } catch {
      setError('Unable to reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setNotice('');
    const mail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { setError('Enter the email address the code was sent to.'); return; }
    if (!/^\d{6}$/.test(otp.trim())) { setError('Enter the 6-digit code from the email.'); return; }
    if (password.length < MIN_PASSWORD_LENGTH) { setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/account/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, email: mail, otp: otp.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : (res.status === 429
          ? 'Too many attempts. Please wait a few minutes and try again.'
          : 'We could not update your password right now. Please try again.'));
        return;
      }
      setPassword(''); setConfirm(''); setOtp('');
      setStep('done');
    } catch {
      setError('Unable to reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const heading = step === 'request' ? 'Reset your password'
    : step === 'reset' ? 'Check your email'
    : 'Password updated';
  const sub = step === 'request' ? 'Enter your email or login ID and we will send you a 6-digit code.'
    : step === 'reset' ? `We sent a code${emailHint ? ` to ${emailHint}` : ' to the email on this account'}. It is valid for 10 minutes.`
    : 'Your new password is ready to use. Sign in to continue.';

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-[#060608] text-white">
      <AnimatedLoginBackground className="z-0" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(5,5,8,0.55) 0%, rgba(5,5,8,0.30) 55%, rgba(5,5,8,0.10) 80%, transparent 100%)' }}
      />

      <div className="relative z-10 mx-auto flex h-[100dvh] max-w-[1380px] flex-col items-center justify-center px-4 py-3 sm:px-8 sm:py-6">
        <div
          className="relative w-full max-w-[420px]"
          style={{ animation: mounted ? 'obSlideUp 0.55s 0.15s ease both' : 'none', opacity: mounted ? undefined : 0 }}
        >
          <div
            className="relative z-10 overflow-hidden rounded-[22px]"
            style={{
              background: 'rgba(20, 20, 24, 0.42)',
              backdropFilter: 'blur(28px) saturate(115%)',
              WebkitBackdropFilter: 'blur(28px) saturate(115%)',
              border: '1px solid rgba(255,255,255,0.09)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            <div className="p-4 sm:p-6">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-white/[0.08] bg-white/[0.04] text-white/60">
                  {step === 'done' ? <CheckCircle className="h-4 w-4 text-emerald-300" /> : step === 'reset' ? <MailCheck className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <h1 className="text-[15px] font-black tracking-tight text-white sm:text-base">{heading}</h1>
                  <p className="mt-0.5 text-[11.5px] leading-4 text-white/38 sm:text-[12px] sm:leading-5">{sub}</p>
                </div>
              </div>

              {step === 'request' && (
                <form onSubmit={(e) => void requestCode(e)} className="space-y-3" noValidate>
                  <div className="space-y-1">
                    <label className={LABEL} htmlFor="fp-identifier">Email or login ID</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20"><Users className="h-3.5 w-3.5" /></span>
                      <input
                        id="fp-identifier"
                        ref={identifierRef}
                        type="text"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="name@company.com"
                        className={INPUT}
                        autoComplete="username"
                        required
                      />
                    </div>
                  </div>

                  <SecurityVerification onToken={setCaptchaToken} action="forgot_password" resetSignal={captchaResetSignal} />

                  {error && <Alert kind="error">{error}</Alert>}

                  <SubmitButton busy={busy} disabled={isTurnstileEnabled() && !captchaToken} label="Send reset code" busyLabel="Sending…" />
                </form>
              )}

              {step === 'reset' && (
                <form onSubmit={(e) => void resetPassword(e)} className="space-y-3" noValidate>
                  {!identifierLooksLikeEmail && (
                    <div className="space-y-1">
                      <label className={LABEL} htmlFor="fp-email">Account email</label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20"><Users className="h-3.5 w-3.5" /></span>
                        <input id="fp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                          placeholder="The email on this account" className={INPUT} autoComplete="email" required />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className={LABEL} htmlFor="fp-otp">6-digit code</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20"><MailCheck className="h-3.5 w-3.5" /></span>
                      <input
                        id="fp-otp"
                        ref={otpRef}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="••••••"
                        className={`${INPUT} tracking-[0.35em]`}
                        autoComplete="one-time-code"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className={LABEL} htmlFor="fp-password">New password</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20"><LockKeyhole className="h-3.5 w-3.5" /></span>
                      <input
                        id="fp-password"
                        type={passwordVisible ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                        className={`${INPUT} pr-10`}
                        autoComplete="new-password"
                        minLength={MIN_PASSWORD_LENGTH}
                        required
                      />
                      <button type="button" onClick={() => setPasswordVisible((v) => !v)}
                        aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-lg text-white/25 transition hover:bg-white/[0.07] hover:text-white/55">
                        {passwordVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className={LABEL} htmlFor="fp-confirm">Confirm new password</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20"><LockKeyhole className="h-3.5 w-3.5" /></span>
                      <input
                        id="fp-confirm"
                        type={passwordVisible ? 'text' : 'password'}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Type it again"
                        className={INPUT}
                        autoComplete="new-password"
                        minLength={MIN_PASSWORD_LENGTH}
                        required
                      />
                    </div>
                  </div>

                  {notice && !error && <Alert kind="notice">{notice}</Alert>}
                  {error && <Alert kind="error">{error}</Alert>}

                  <SubmitButton busy={busy} label="Set new password" busyLabel="Updating…" />

                  <div className="flex items-center justify-between pt-0.5 text-[11.5px] text-white/35">
                    <button type="button" onClick={() => { setStep('request'); setError(''); setNotice(''); }}
                      className="inline-flex items-center gap-1 transition-colors hover:text-white/60">
                      <ArrowLeft className="h-3 w-3" /> Use a different account
                    </button>
                    <button type="button" disabled={busy || resendIn > 0} onClick={() => void requestCode()}
                      className="transition-colors hover:text-white/60 disabled:cursor-not-allowed disabled:hover:text-white/35">
                      {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                    </button>
                  </div>
                </form>
              )}

              {step === 'done' && (
                <div className="space-y-3">
                  <Alert kind="notice">You can now sign in with your new password. We have also emailed you a confirmation.</Alert>
                  <button type="button" onClick={() => { router.replace('/login?reset=done'); }}
                    className="group relative flex h-9 w-full items-center justify-center gap-2 overflow-hidden rounded-[11px] bg-white text-[13px] font-black text-[#070709] sm:h-10 sm:rounded-[13px]">
                    <span className="relative">Back to sign in</span>
                    <ArrowRight className="relative h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </button>
                </div>
              )}

              {step !== 'done' && (
                <p className="mt-4 text-center text-[11.5px] text-white/35">
                  Remembered it?{' '}
                  <Link href="/login" className="font-semibold text-white/60 transition-colors hover:text-white">Back to sign in</Link>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Alert({ kind, children }: { kind: 'error' | 'notice'; children: React.ReactNode }) {
  if (kind === 'error') {
    return (
      <div role="alert" className="rounded-[11px] border border-rose-500/20 bg-rose-500/[0.07] px-4 py-3 text-[12.5px] text-rose-300/85">
        {children}
      </div>
    );
  }
  return (
    <div role="status" className="rounded-[11px] border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-[12.5px] text-white/50">
      {children}
    </div>
  );
}

function SubmitButton({ busy, disabled, label, busyLabel }: { busy: boolean; disabled?: boolean; label: string; busyLabel: string }) {
  return (
    <button type="submit" disabled={busy || disabled}
      className="group relative flex h-9 w-full items-center justify-center gap-2 overflow-hidden rounded-[11px] bg-white text-[13px] font-black text-[#070709] shadow-[0_0_40px_rgba(255,255,255,0.08)] transition-all duration-200 hover:bg-white/95 disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:rounded-[13px]">
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      <span className="relative">{busy ? busyLabel : label}</span>
      {!busy && <ArrowRight className="relative h-3.5 w-3.5 transition group-hover:translate-x-0.5" />}
      {busy && (
        <svg className="relative h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
          <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
