'use client';

/**
 * Create account — the gate that follows the value pages.
 *
 * ═══ IT AUTHENTICATES THROUGH THE EXISTING SYSTEM ═══
 *
 * Nothing here is a second implementation. Google goes through
 * /api/auth/oauth-intent then NextAuth's Google provider; email goes through
 * /api/individual/signup (which hashes the password server-side and enforces
 * the challenge), then NextAuth credentials, then the existing
 * send-otp / verify-otp pair. No password is stored, logged, or put in a
 * cookie — it is posted once, over HTTPS, and dropped.
 *
 * ═══ THE CHALLENGE GATES BOTH PATHS ═══
 *
 * Neither button does anything until Turnstile has produced a token, and the
 * token is only ever judged on the server: /api/individual/signup and
 * /api/onboarding/send-otp both call enforceCaptcha. Hiding a button is UX,
 * not security, which is why the server checks anyway.
 *
 * When Turnstile is not configured for a deployment, the widget renders
 * nothing and the gate stays usable — the server then decides on its own terms.
 *
 * ═══ A FAILURE NEVER COSTS THE PERSON THEIR ANSWERS ═══
 *
 * Every error path returns to this screen with the onboarding state intact.
 * The flow only leaves for Home once authentication AND the profile write have
 * both actually succeeded.
 */

import { useEffect, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import { ArrowLeft, ArrowRight, Loader2, Mail } from 'lucide-react';
import { SecurityVerification, isTurnstileEnabled } from '@/components/security/SecurityVerification';
import { OnboardingProgress, StepHeading } from './StepChrome';

/* A courtesy wait before Resend lights up. The SERVER's limit (three sends per
   ten minutes, answered as 429 + Retry-After) is the real constraint; this only
   stops the button being mashed between allowed sends. */
const RESEND_COOLDOWN_SECONDS = 30;

type Mode = 'choose' | 'email' | 'otp';

export type OnboardingAnswers = {
  name?: string;
  roles?: string[];
  customRoles?: string[];
  skills?: string[];
  businessSpace?: string;
  businessSkills?: string[];
};

export default function AuthGate({
  firstName,
  answers,
  accountKind = 'individual',
  onDone,
  step = 7,
  total = 7,
}: {
  firstName: string;
  /** The edited answers, carried into the profile once there is a user. */
  answers: OnboardingAnswers;
  /** Decides which existing signup endpoint runs. Never read from a request. */
  accountKind?: 'individual' | 'business';
  /** Called only after authentication AND persistence have both succeeded. */
  onDone: () => void;
  step?: number;
  total?: number;
}) {
  const [mode, setMode] = useState<Mode>('choose');
  const [captcha, setCaptcha] = useState('');
  const [captchaNonce, setCaptchaNonce] = useState(0);
  // Snapshot of the captcha token taken the moment the user clicks "Continue with Email".
  // The Turnstile widget unmounts on mode change and may fire expired-callback which
  // clears captcha state — the snapshot is immune to that race condition.
  const captchaSnapshotRef = useRef('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [organization, setOrganization] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /* Seconds until a resend is offered. Counts down in the effect below and is
     re-armed from the SERVER's Retry-After whenever it refuses one. */
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  /* A token is required only when Turnstile is actually configured. */
  const verified = !isTurnstileEnabled() || Boolean(captcha);
  const isBusiness = accountKind === 'business';
  const who = firstName.trim() ? `${firstName.trim()}, save` : 'Save';

  /* A used token cannot be replayed, so the widget is reset after every
     attempt that spent one. */
  const resetCaptcha = () => { setCaptcha(''); setCaptchaNonce(n => n + 1); };

  const needVerification = () => {
    setError('Please complete the verification above to continue.');
    return false;
  };

  /** Writes the answers onto the now-authenticated profile. */
  const persist = async () => {
    const res = await fetch('/api/onboarding/handoff', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ onboarding: answers }),
    });
    if (!res.ok) throw new Error('We signed you in but could not save your answers.');
  };

  const startGoogle = async () => {
    if (!verified) return needVerification();
    setBusy(true); setError('');
    try {
      /* The answers ride the httpOnly intent cookie, set server-side, because
         the browser is about to leave for Google. */
      await fetch('/api/auth/oauth-intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountType: accountKind, onboarding: answers }),
      });
      await signIn('google', { callbackUrl: '/onboarding?authed=1' });
    } catch {
      setBusy(false);
      setError('We could not start Google sign-in. Please try again.');
    }
  };

  /* One interval while a cooldown is running, cleared when it reaches zero. */
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => setCooldown(c => (c <= 1 ? 0 : c - 1)), 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  /**
   * Ask the existing OTP endpoint to send a code.
   *
   * ONE function for both the automatic first send and the manual resend —
   * they are the same server operation, differing only in what triggers them.
   * The first code is sent by `submitEmail` as part of signing in; resend is a
   * deliberate second action the person takes on the OTP screen. Resend is
   * never what STARTS the flow, and it is never called on mount.
   *
   * The cooldown is the SERVER's, not ours. `/api/onboarding/send-otp` allows
   * three sends per ten minutes per account and answers 429 with `Retry-After`;
   * when that happens the real wait is read from the header rather than guessed
   * at, so the button can never invite a request the server will refuse.
   */
  const requestOtp = async (): Promise<void> => {
    const res = await fetch('/api/onboarding/send-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), captchaToken: captchaSnapshotRef.current || captcha }),
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get('Retry-After')) || 60;
      setCooldown(wait);
      throw new Error(`Too many codes requested. Try again in ${wait} seconds.`);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || 'We could not send your code.');
    }
    /* A short courtesy wait before the resend button lights up. Purely UX —
       the server's limit above is the real constraint. */
    setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  /** The OTP screen's secondary action. Never runs by itself. */
  const resendOtp = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true); setError('');
    try {
      await requestOtp();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not resend your code.');
    } finally {
      setResending(false);
    }
  };

  /** Email + password → account → session → OTP sent. */
  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) { setError('Use a password of at least 8 characters.'); return; }
    if (isBusiness && !organization.trim()) {
      setError('Tell us your organization name.');
      return;
    }
    // Use the snapshot taken at transition time — the widget may have unmounted
    // and fired expired-callback which clears the live captcha state.
    const captchaToken = captchaSnapshotRef.current || captcha;
    setBusy(true); setError('');
    try {
      /* Each account kind goes to the signup endpoint that already owns it.
         Both hash the password server-side and both enforce the challenge. */
      const signup = await fetch(
        isBusiness ? '/api/saas/signup' : '/api/individual/signup',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: answers.name?.trim() || email.split('@')[0],
            email: email.trim(),
            password,
            policyAccepted: true,
            captchaToken,
            ...(isBusiness
              ? { organizationName: organization.trim(), industry: answers.businessSpace }
              : {}),
          }),
        },
      );
      const signupBody = await signup.json().catch(() => null);
      /* An existing account is not an error — it signs in below instead. */
      if (!signup.ok && signup.status !== 409) {
        throw new Error(signupBody?.error || 'We could not create your account.');
      }

      const result = await signIn('credentials', {
        email: email.trim(),
        password,
        policyAccepted: 'accepted',
        redirect: false,
        // loginGrant is a one-shot HMAC token minted by the signup endpoint
        // so the credentials provider can skip captcha for the immediate
        // post-signup auto-login (no fresh Turnstile token available here).
        loginGrant: signupBody?.loginGrant || '',
        captchaToken,
      });
      if (!result?.ok) throw new Error('That email and password did not match.');

      /* Session in hand, so this send is the authenticated path. The FIRST
         code is sent here, automatically — reaching the OTP screen is never
         something the person has to trigger by pressing Resend. */
      await requestOtp();
      setMode('otp');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      resetCaptcha();
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/onboarding/verify-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ otp: otp.trim(), email: email.trim() }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'That code did not work.');
      await persist();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="step-panel">
      <OnboardingProgress step={step} total={total} />

      {mode === 'choose' && (
        <>
          <StepHeading
            eyebrow="Account / 07"
            title={`${who} your matches`}
            description="Create your account to apply, keep these results, and let employers find you."
          />
          <SecurityVerification
            onToken={setCaptcha}
            action="onboarding"
            resetSignal={captchaNonce}
            className="auth-captcha"
          />
          <div className="auth-options">
            <button type="button" className="primary-button" onClick={startGoogle} disabled={busy}>
              {busy ? <Loader2 className="auth-spin" aria-hidden="true" />
                    : <span className="logo-mark docrud-cta-mark" aria-hidden="true">G</span>}
              <span>Continue with Google</span>
            </button>
            <button
              type="button"
              className="continue-without-resume"
              onClick={() => {
                if (!verified) { needVerification(); return; }
                captchaSnapshotRef.current = captcha; // immune to widget expired-callback after unmount
                setError('');
                setMode('email');
              }}
              disabled={busy}
            >
              <Mail aria-hidden="true" />
              <span>Continue with Email</span>
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </>
      )}

      {mode === 'email' && (
        <form onSubmit={submitEmail}>
          <StepHeading
            eyebrow="Account / 07"
            title="Create your account"
            description="We'll email you a code to confirm it's you."
          />
          {isBusiness && (
            <label className="name-field" htmlFor="onboarding-organization">
              <span className="field-label">Organization name</span>
              <div className="name-field-control">
                <input id="onboarding-organization" className="glass-input auth-input" required
                  value={organization} onChange={e => setOrganization(e.target.value)}
                  placeholder="Acme Ltd" autoComplete="organization" />
              </div>
            </label>
          )}
          <label className="name-field" htmlFor="onboarding-email">
            <span className="field-label">Email</span>
            <div className="name-field-control">
              <input id="onboarding-email" className="glass-input auth-input" type="email" required
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" autoComplete="email" />
            </div>
          </label>
          <label className="name-field" htmlFor="onboarding-password">
            <span className="field-label">Password</span>
            <div className="name-field-control">
              <input id="onboarding-password" className="glass-input auth-input" type="password" required
                minLength={8} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters" autoComplete="new-password" />
            </div>
          </label>
          <div className="auth-options">
            <button type="submit" className="primary-button" disabled={busy}>
              {busy && <Loader2 className="auth-spin" aria-hidden="true" />}
              <span>{busy ? 'Sending your code…' : 'Continue'}</span>
            </button>
            <button type="button" className="back-button auth-back"
              onClick={() => { setError(''); setMode('choose'); }} disabled={busy}>
              <ArrowLeft aria-hidden="true" />
              <span>Back</span>
            </button>
          </div>
        </form>
      )}

      {mode === 'otp' && (
        <form onSubmit={submitOtp}>
          <StepHeading
            eyebrow="Account / 07"
            title="Check your email"
            description={`We sent a 6-digit code to ${email}.`}
          />
          <label className="name-field" htmlFor="onboarding-otp">
            <span className="field-label">Verification code</span>
            <div className="name-field-control">
              <input id="onboarding-otp" className="glass-input auth-input auth-otp"
                inputMode="numeric" pattern="\d{6}" maxLength={6} required
                value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="000000" autoComplete="one-time-code" />
            </div>
          </label>
          <p className="auth-resend">
            {cooldown > 0 ? (
              /* Not a disabled button with a tooltip: the wait itself is the
                 information, so it is stated in words. */
              <span className="auth-resend-wait">Resend code in {cooldown}s</span>
            ) : (
              <button type="button" className="auth-resend-button"
                onClick={resendOtp} disabled={resending || busy}>
                {resending ? 'Sending a new code…' : 'Resend code'}
              </button>
            )}
          </p>
          <div className="auth-options">
            <button type="submit" className="primary-button" disabled={busy || otp.length !== 6}>
              {busy && <Loader2 className="auth-spin" aria-hidden="true" />}
              <span>{busy ? 'Verifying…' : 'Verify'}</span>
            </button>
            <button type="button" className="back-button auth-back"
              onClick={() => { setError(''); setMode('email'); }} disabled={busy}>
              <ArrowLeft aria-hidden="true" />
              <span>Back</span>
            </button>
          </div>
        </form>
      )}

      {error && <p className="resume-error auth-error" role="alert">{error}</p>}

      <p className="demo-note auth-note">
        We&apos;ll keep what you told us — your name, what you are looking for and
        your skills — and put it on your profile once you are in.
      </p>
    </div>
  );
}
