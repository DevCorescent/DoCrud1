'use client';

/**
 * Create account — the gate that follows the value pages.
 *
 * ═══ IT DOES NOT AUTHENTICATE ANYONE ═══
 *
 * Both buttons hand off to the existing /login route, which already owns Google
 * OAuth, email OTP and the Turnstile challenge. Nothing here calls signIn,
 * issues an OTP, or validates a captcha, because a second implementation of any
 * of those is exactly what must not exist — and a decorative one would be worse
 * than none.
 *
 * `intent` tells /login which method the person picked, so they land on the
 * right control instead of choosing twice. It is a hint about the UI, never a
 * claim about identity.
 *
 * The onboarding answers are NOT written anywhere yet. Associating them with
 * the authenticated user is the handoff step, and doing it from here would mean
 * writing a profile for someone who has not signed in.
 */

import { ArrowRight, Mail } from 'lucide-react';
import { OnboardingProgress, StepHeading } from './StepChrome';

export default function AuthGate({
  firstName,
  onGoogle,
  onEmail,
  step = 7,
  total = 7,
}: {
  firstName: string;
  onGoogle: () => void;
  onEmail: () => void;
  step?: number;
  total?: number;
}) {
  const who = firstName.trim() ? `${firstName.trim()}, save` : 'Save';

  return (
    <div className="step-panel">
      <OnboardingProgress step={step} total={total} />
      <StepHeading
        eyebrow="Account / 07"
        title={`${who} your matches`}
        description="Create your account to apply, keep these results, and let employers find you."
      />

      <div className="auth-options">
        <button type="button" className="primary-button" onClick={onGoogle}>
          <span className="logo-mark docrud-cta-mark" aria-hidden="true">G</span>
          <span>Continue with Google</span>
        </button>
        <button type="button" className="login-option" onClick={onEmail}>
          <Mail aria-hidden="true" />
          <span>Continue with Email</span>
          <ArrowRight aria-hidden="true" />
        </button>
      </div>

      <p className="demo-note auth-note">
        We&apos;ll keep what you told us — your name, what you are looking for and
        your skills — and put it on your profile once you are in.
      </p>
    </div>
  );
}
