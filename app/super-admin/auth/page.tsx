'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

type Stage = 'email' | 'otp' | 'success';

export default function SuperAdminAuthPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(0);
  const [checking, setChecking] = useState(true);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    fetch('/api/super-admin/auth/check')
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) router.replace('/super-admin');
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  useEffect(() => {
    if (timer <= 0) return;
    const t = setInterval(() => setTimer((p) => p - 1), 1000);
    return () => clearInterval(t);
  }, [timer]);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError('Enter your email'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/super-admin/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to send OTP'); return; }
      setSessionId(data.sessionId || '');
      setStage('otp');
      setTimer(600);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const code = otp.join('');
    if (code.length < 6) { setError('Enter the 6-digit OTP'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/super-admin/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, otp: code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Invalid OTP'); return; }
      setStage('success');
      setTimeout(() => router.push('/super-admin'), 1200);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  function handleOtpInput(idx: number, val: string) {
    const digit = val.replace(/\D/, '').slice(-1);
    const next = [...otp];
    next[idx] = digit;
    setOtp(next);
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
  }

  function handleOtpKey(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (paste.length === 6) {
      setOtp(paste.split(''));
      otpRefs.current[5]?.focus();
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-orange-500/5 rounded-full blur-3xl" />
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
      </div>

      {/* Card */}
      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-1.5 mb-6">
            <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-widest">Secure Access</span>
          </div>
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center border border-amber-500/30">
              <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 12c0 6.627 5.373 12 12 12s12-5.373 12-12c0-2.28-.637-4.41-1.748-6.212M12 9v3l1.5 1.5" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">docrud</h1>
          </div>
          <p className="text-zinc-500 text-sm">Super Admin Control Panel</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl shadow-black/50">
          {stage === 'email' && (
            <form onSubmit={sendOtp} className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">Sign in</h2>
                <p className="text-zinc-500 text-sm">Enter your super admin email to receive a one-time password.</p>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="superadmin@yourdomain.com"
                  autoFocus
                  className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all"
                />
              </div>
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">{error}</div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold rounded-lg py-3 text-sm transition-all duration-200 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Send OTP
                  </>
                )}
              </button>
            </form>
          )}

          {stage === 'otp' && (
            <form onSubmit={verifyOtp} className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">Verify your identity</h2>
                <p className="text-zinc-500 text-sm">
                  Enter the 6-digit OTP sent to <span className="text-zinc-300 font-medium">{email}</span>
                </p>
              </div>

              {/* OTP Inputs */}
              <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => { otpRefs.current[idx] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpInput(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKey(idx, e)}
                    className="w-12 h-14 text-center text-2xl font-bold bg-zinc-800 border border-zinc-700 text-white rounded-xl focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all caret-transparent"
                  />
                ))}
              </div>

              {/* Timer */}
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{timer > 0 ? `Expires in ${Math.floor(timer / 60)}:${String(timer % 60).padStart(2, '0')}` : 'OTP expired'}</span>
                <button
                  type="button"
                  onClick={() => { setStage('email'); setOtp(['', '', '', '', '', '']); setError(''); }}
                  className="text-amber-500 hover:text-amber-400 transition-colors"
                >
                  Change email
                </button>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">{error}</div>
              )}

              <button
                type="submit"
                disabled={loading || otp.join('').length < 6}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold rounded-lg py-3 text-sm transition-all duration-200 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 12c0 6.627 5.373 12 12 12s12-5.373 12-12c0-2.28-.637-4.41-1.748-6.212M12 9v3l1.5 1.5" />
                    </svg>
                    Verify & Access
                  </>
                )}
              </button>
            </form>
          )}

          {stage === 'success' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
                <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold text-lg">Access granted</p>
                <p className="text-zinc-500 text-sm mt-1">Redirecting to control panel…</p>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full animate-[progress_1.2s_ease-in-out_forwards]" style={{ width: '100%', animation: 'progress 1.2s ease-in-out forwards' }} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-zinc-700 text-xs mt-6">
          This page is not publicly linked. All access attempts are logged.
        </p>
      </div>

      <style jsx>{`
        @keyframes progress {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}
