'use client';

/**
 * Create account — the gate that follows the value pages.
 *
 * ═══ THE CODE COMES FIRST; THE ACCOUNT COMES SECOND ═══
 *
 * Email + password go to /api/onboarding/signup/start, which creates NOTHING.
 * It stages the signup behind an opaque handle, hashes the password on the
 * server, and mails a six-digit code. Only when that code is typed back does
 * /api/onboarding/signup/verify create the account, mark the address verified,
 * and store the onboarding answers — in one server-side step, from the record
 * staged when the code was sent.
 *
 * This is the fix for two failures that shared a cause. The gate used to create
 * the account, sign in, and only then try to mail a code: a delivery failure
 * left a real, signed-in, unverified account behind, and the business branch
 * never mailed anything at all, because /api/saas/signup refuses to create a
 * workspace without a verified-OTP session it was never given. Neither can
 * happen now — there is no account to leave behind, and both kinds take the
 * same, single, code-first path.
 *
 * Google is unchanged: it goes through /api/auth/oauth-intent and NextAuth's
 * Google provider, and Google has already verified the address.
 *
 * ═══ THE PASSWORD ═══
 *
 * Posted once over HTTPS to be hashed server-side, and held in component state
 * only so the sign-in that follows verification can present it. It is never
 * stored, logged, or put in a cookie, and never hashed in the browser.
 *
 * ═══ THE CHALLENGE GATES BOTH PATHS ═══
 *
 * Neither button does anything until Turnstile has produced a token, and the
 * token is only ever judged on the server: /api/onboarding/signup/start calls
 * enforceCaptcha. Hiding a button is UX, not security, which is why the server
 * checks anyway. The resend carries no token — the widget is long gone by then
 * — and is guarded instead by the unguessable handle plus the server's rate
 * limits.
 *
 * When Turnstile is not configured for a deployment, the widget renders nothing
 * and the gate stays usable — the server then decides on its own terms.
 *
 * ═══ A FAILURE NEVER COSTS THE PERSON THEIR ANSWERS ═══
 *
 * Every error path returns to this screen with the onboarding state intact.
 * The flow only leaves for Home once verification, account creation AND
 * sign-in have all actually succeeded.
 */
import { useEffect, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Loader2, Mail } from 'lucide-react';
import { SecurityVerification, isTurnstileEnabled } from '@/components/security/SecurityVerification';
import { OnboardingProgress, StepHeading } from './StepChrome';

/* A courtesy wait before Resend lights up. The SERVER's limit (three sends per
   ten minutes, answered as 429 + Retry-After) is the real constraint; this only
   stops the button being mashed between allowed sends. */
const RESEND_COOLDOWN_SECONDS = 30;

/* A FLOOR on how long "Code verified" stays on screen, not a delay added to it.
   The sign-in that follows runs at the same time, so this costs nothing
   whenever that takes longer — it only stops the confirmation flashing past
   unread when the server answers quickly. */
const VERIFIED_HOLD_MS = 700;

type Mode = 'choose' | 'email' | 'otp';

/** The code screen's own outcome, shown beneath the input. */
type VerifyState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  /** The code was right. `detail` says what is happening next. */
  | { kind: 'verified'; detail: string }
  /** The code was refused. `attemptsLeft` is present when the server said. */
  | { kind: 'failed'; detail: string; attemptsLeft?: number };

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
  /** Called only after verification, account creation AND sign-in succeed. */
  onDone: () => void;
  step?: number;
  total?: number;
}) {
  const [mode, setMode] = useState<Mode>('choose');
  const [captcha, setCaptcha] = useState('');
  const [captchaNonce, setCaptchaNonce] = useState(0);
  /* Last token the widget produced. The widget now stays mounted through the
     email form, so `captcha` is normally the live, current token; this covers
     only the brief window where Turnstile has fired expired-callback (clearing
     the live value) but has not yet handed over a replacement. It is cleared
     whenever a token is spent, so a used token can never be resent. */
  const captchaSnapshotRef = useRef('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  /* The handle for the staged signup. Opaque, server-issued, and the only
     thing that ties the code screen to what was typed on the form — the
     answers, the password hash and the account kind all live on the server
     against it, so nothing here can be swapped between the two steps. */
  const pendingIdRef = useRef('');
  const [organization, setOrganization] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /* Set when the server says the address is already registered. The message
     alone is a dead end — the person needs somewhere to go. */
  const [existingAccount, setExistingAccount] = useState(false);
  /* What the code screen says about the code. It owns its own outcome rather
     than pushing it to the panel-wide error line at the bottom: the answer to
     "did my code work?" belongs next to the box the code was typed into. */
  const [verify, setVerify] = useState<VerifyState>({ kind: 'idle' });
  /* Seconds until a resend is offered. Counts down in the effect below and is
     re-armed from the SERVER's Retry-After whenever it refuses one. */
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  /* A token is required only when Turnstile is actually configured. */
  const verified = !isTurnstileEnabled() || Boolean(captcha);
  const isBusiness = accountKind === 'business';
  const who = firstName.trim() ? `${firstName.trim()}, save` : 'Save';

  /* Every token the widget produces, remembered as it arrives. `captcha` is
     the live value and is what gets sent; this is only the fallback for the
     window between Turnstile's expired-callback and the widget re-arming. */
  const takeCaptcha = (token: string) => {
    captchaSnapshotRef.current = token || captchaSnapshotRef.current;
    setCaptcha(token);
  };

  /* A used token cannot be replayed, so the widget is reset after every attempt
     that spent one. This only produces a new token because the widget is still
     MOUNTED on the screen the retry happens on — resetting an unmounted widget
     would leave the person with no way to ever get a fresh token, and every
     retry rejected by enforceCaptcha. */
  const resetCaptcha = () => {
    setCaptcha('');
    captchaSnapshotRef.current = '';
    setCaptchaNonce(n => n + 1);
  };

  const needVerification = () => {
    setError('Please complete the verification above to continue.');
    return false;
  };

  /* There is no separate "save my answers" call on the email path any more.
     /api/onboarding/signup/verify writes them from the record staged when the
     code was sent, in the same step that creates the account — so answers can
     no longer be lost between authentication and persistence, and cannot be
     re-sent by the browser after the fact. The Google path still hands off
     through /api/onboarding/handoff, from the flow's return leg, because its
     answers travelled in the intent cookie. */

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

  /** Reads a 429's Retry-After and arms the countdown from it. */
  const armServerCooldown = (res: Response) => {
    const wait = Number(res.headers.get('Retry-After')) || 60;
    setCooldown(wait);
    return wait;
  };

  /**
   * Step one: stage the signup and have the server mail a code.
   *
   * Nothing is created by this call. It is also the only call in the flow that
   * spends the Turnstile token, so the widget's single-use token is enough.
   */
  const startSignup = async (): Promise<void> => {
    const res = await fetch('/api/onboarding/signup/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        password,
        name: answers.name?.trim() || email.split('@')[0],
        accountKind,
        organizationName: isBusiness ? organization.trim() : undefined,
        industry: isBusiness ? answers.businessSpace : undefined,
        onboarding: answers,
        policyAccepted: true,
        /* The LIVE token first. The widget stays mounted through this screen
           (see the render below) precisely so there is always a fresh one; the
           snapshot is only a last-known-good fallback for the moment between
           an expired-callback and the widget re-arming itself. */
        captchaToken: captcha || captchaSnapshotRef.current,
      }),
    });
    if (res.status === 429) {
      const wait = armServerCooldown(res);
      throw new Error(`Too many attempts. Please try again in ${wait} seconds.`);
    }
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.pendingId) {
      if (body?.code === 'account_exists') setExistingAccount(true);
      throw new Error(body?.error || 'We could not send your code.');
    }
    pendingIdRef.current = String(body.pendingId);
    /* A short courtesy wait before the resend button lights up. Purely UX —
       the server's limit is the real constraint. */
    setCooldown(Number(body.resendInSeconds) || RESEND_COOLDOWN_SECONDS);
  };

  /**
   * The OTP screen's secondary action. Never runs by itself, and never on
   * mount: reaching the code screen is something `submitEmail` did.
   *
   * The address is not sent — the server mails whatever address the handle was
   * staged with, so this cannot be pointed anywhere else.
   */
  const resendOtp = async () => {
    if (cooldown > 0 || resending || !pendingIdRef.current) return;
    if (verify.kind === 'checking' || verify.kind === 'verified') return;
    setResending(true); setError(''); setVerify({ kind: 'idle' });
    try {
      const res = await fetch('/api/onboarding/signup/resend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pendingId: pendingIdRef.current }),
      });
      if (res.status === 429) {
        const wait = armServerCooldown(res);
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Too many codes requested. Try again in ${wait} seconds.`);
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'We could not resend your code.');
      setCooldown(Number(body?.resendInSeconds) || RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not resend your code.');
    } finally {
      setResending(false);
    }
  };

  /** Email + password → a code in the inbox. No account yet. */
  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!verified) { needVerification(); return; }
    if (password.length < 8) { setError('Use a password of at least 8 characters.'); return; }
    if (isBusiness && !organization.trim()) {
      setError('Tell us your organization name.');
      return;
    }
    setBusy(true); setError(''); setExistingAccount(false);
    try {
      await startSignup();
      /* The code screen is only ever reached once a code has actually been
         sent — a delivery failure throws above and leaves the form up. */
      setMode('otp');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      resetCaptcha();
    } finally {
      setBusy(false);
    }
  };

  /**
   * Step two: the code creates the account, and the session follows it.
   *
   * The server does the creating, the verifying and the saving of answers in
   * one call; this then signs in with the password already in hand, using the
   * one-shot grant the server minted so the credentials CAPTCHA gate passes
   * without a fresh widget token.
   */
  const submitOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(''); setExistingAccount(false);
    setVerify({ kind: 'checking' });
    try {
      const res = await fetch('/api/onboarding/signup/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pendingId: pendingIdRef.current,
          email: email.trim(),
          otp: otp.trim(),
        }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        /* An expired or spent session cannot be rescued by another code — send
           the person back to the form with their answers intact. The reason
           travels to the panel error there, because the code screen they were
           told it on is no longer the screen they are looking at. */
        if (body?.code === 'restart') {
          pendingIdRef.current = '';
          setOtp('');
          setVerify({ kind: 'idle' });
          setMode('email');
          resetCaptcha();
          setError(body?.error || 'That code has expired. Please start again.');
          return;
        }
        if (body?.code === 'account_exists') setExistingAccount(true);
        setVerify({
          kind: 'failed',
          detail: body?.error || 'That code did not work.',
          /* The server counts the guesses, so the count shown is the real one
             rather than something the browser keeps its own tally of. */
          attemptsLeft: typeof body?.attemptsLeft === 'number' ? body.attemptsLeft : undefined,
        });
        return;
      }

      /* Said before the sign-in rather than after it: the code IS verified at
         this point and the account exists, and that is worth confirming even
         if the step that follows goes wrong. */
      setVerify({ kind: 'verified', detail: 'Signing you in…' });

      const [result] = await Promise.all([
        signIn('credentials', {
          email: email.trim(),
          password,
          policyAccepted: 'accepted',
          redirect: false,
          loginGrant: body?.loginGrant || '',
        }),
        new Promise((resolve) => window.setTimeout(resolve, VERIFIED_HOLD_MS)),
      ]);

      if (!result?.ok) {
        /* The account exists and is verified either way; only the session did
           not take. Signing in is one step, so say so rather than implying the
           verification failed — the tick above stays exactly as it is. */
        setVerify({ kind: 'verified', detail: 'Your account is ready.' });
        setError('We could not sign you in automatically. Please sign in to continue.');
        return;
      }

      onDone();
    } catch (e) {
      setVerify({
        kind: 'failed',
        detail: e instanceof Error ? e.message : 'We could not reach the server. Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="step-panel">
      <OnboardingProgress step={step} total={total} />

      {mode === 'choose' && (
        <StepHeading
          eyebrow="Account / 07"
          title={`${who} your matches`}
          description="Create your account to apply, keep these results, and let employers find you."
        />
      )}
      {mode === 'email' && (
        <StepHeading
          eyebrow="Account / 07"
          title="Create your account"
          description="We'll email you a code to confirm it's you. Your account is created when you enter it — not before."
        />
      )}

      {/* ONE widget, rendered in ONE position, for both the choose screen and
          the email form. It is deliberately outside the mode blocks: React
          keeps the same instance across the transition, so the token survives
          the move to the form AND — the part that matters — a failed attempt
          can reset the widget and actually get a new token. When it lived
          inside the choose block it unmounted on the way to the form, and
          every retry then sent a spent token that the server refuses, with no
          way for the person to produce a fresh one. */}
      {mode !== 'otp' && (
        <SecurityVerification
          onToken={takeCaptcha}
          action="onboarding"
          resetSignal={captchaNonce}
          className="auth-captcha"
        />
      )}

      {mode === 'choose' && (
        <>
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
                setError('');
                /* The widget comes along to the form — see the render above —
                   so nothing has to be snapshotted across the transition. */
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
            description={`We sent a 6-digit code to ${email}. Entering it is what creates your account — nothing is saved until then.`}
          />
          <label className="name-field" htmlFor="onboarding-otp">
            <span className="field-label">Verification code</span>
            <div className="name-field-control">
              <input id="onboarding-otp" className="glass-input auth-input auth-otp"
                inputMode="numeric" pattern="\d{6}" maxLength={6} required
                value={otp}
                onChange={e => {
                  setOtp(e.target.value.replace(/\D/g, ''));
                  /* A refusal describes the code that was submitted, not the
                     one being typed now. It clears the moment they differ. */
                  if (verify.kind === 'failed') setVerify({ kind: 'idle' });
                }}
                aria-invalid={verify.kind === 'failed'}
                aria-describedby="onboarding-otp-status"
                placeholder="000000" autoComplete="one-time-code"
                disabled={verify.kind === 'verified'} />
            </div>
          </label>

          {/* The answer to "did my code work?", next to the box the code went
              into. Announced politely while checking and assertively on a
              refusal, so it is not a colour-only signal. */}
          <p
            id="onboarding-otp-status"
            className={`auth-verify-status is-${verify.kind}`}
            role={verify.kind === 'failed' ? 'alert' : 'status'}
            aria-live={verify.kind === 'failed' ? 'assertive' : 'polite'}
          >
            {verify.kind === 'checking' && (
              <>
                <Loader2 className="auth-spin" aria-hidden="true" />
                <span>Checking your code…</span>
              </>
            )}
            {verify.kind === 'verified' && (
              <>
                <CheckCircle2 aria-hidden="true" />
                <span>
                  <strong>OTP verified</strong>
                  {verify.detail ? ` — ${verify.detail}` : ''}
                </span>
              </>
            )}
            {verify.kind === 'failed' && (
              <>
                <AlertCircle aria-hidden="true" />
                <span>
                  <strong>Verification failed</strong> — {verify.detail}
                  {typeof verify.attemptsLeft === 'number' && verify.attemptsLeft > 0 && (
                    <> {verify.attemptsLeft} attempt{verify.attemptsLeft === 1 ? '' : 's'} left.</>
                  )}
                </span>
              </>
            )}
          </p>
          {/* Nothing to resend once the code has been accepted — a countdown
              ticking beneath a green tick invites a pointless second code. */}
          {verify.kind !== 'verified' && (
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
          )}
          <div className="auth-options">
            <button type="submit" className="primary-button"
              disabled={busy || otp.length !== 6 || verify.kind === 'verified'}>
              {verify.kind === 'verified'
                ? <CheckCircle2 aria-hidden="true" />
                : busy && <Loader2 className="auth-spin" aria-hidden="true" />}
              <span>
                {verify.kind === 'verified' ? 'Verified' : busy ? 'Verifying…' : 'Verify'}
              </span>
            </button>
            <button type="button" className="back-button auth-back"
              onClick={() => { setError(''); setVerify({ kind: 'idle' }); setMode('email'); }}
              disabled={busy || verify.kind === 'verified'}>
              <ArrowLeft aria-hidden="true" />
              <span>Back</span>
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="resume-error auth-error" role="alert">
          {error}
          {existingAccount && (
            <>
              {' '}
              <a href="/login" className="auth-error-link">Go to sign in</a>
            </>
          )}
        </p>
      )}

      <p className="demo-note auth-note">
        We&apos;ll keep what you told us — your name, what you are looking for and
        your skills — and put it on your profile once you are in.
      </p>
    </div>
  );
}
