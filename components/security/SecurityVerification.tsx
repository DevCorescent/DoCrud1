'use client';

/**
 * "Security verification" section — the shared, dark-UI presentation around the
 * existing Cloudflare {@link TurnstileWidget}. It renders NOTHING when Turnstile
 * is not configured for the deployment (so forms without keys are unaffected).
 *
 * It is UX only: the widget produces a one-time token which the parent form
 * sends to the server, where it is the ONLY thing judged (lib/server/security/
 * captcha.ts). A rendered widget is never treated as trust here.
 */

import { useState } from 'react';
import { TurnstileWidget, type TurnstileStatus } from '@/components/security/TurnstileWidget';

/** Whether Turnstile is configured for the browser (public site key present). */
export function isTurnstileEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

const MESSAGES: Record<TurnstileStatus, { text: string; className: string }> = {
  ready: { text: "Verify you're human", className: 'text-white/45' },
  solved: { text: 'Verification successful', className: 'text-emerald-300/80' },
  expired: { text: 'Verification expired — please verify again', className: 'text-amber-300/80' },
  error: { text: 'Verification failed — please try again', className: 'text-rose-300/80' },
};

export function SecurityVerification({
  onToken,
  action,
  resetSignal,
  className,
}: {
  onToken: (token: string) => void;
  action?: string;
  resetSignal?: number;
  className?: string;
}) {
  const [status, setStatus] = useState<TurnstileStatus>('ready');

  if (!isTurnstileEnabled()) return null;

  const msg = MESSAGES[status];

  return (
    <div className={`rounded-[12px] border border-white/[0.08] bg-white/[0.02] px-3.5 py-3 ${className || ''}`}>
      <div className="mb-2 flex items-center gap-1.5">
        <svg className="h-3 w-3 text-white/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 4v5c0 4.4-3 8.5-7 9.5-4-1-7-5.1-7-9.5V7l7-4z" />
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Security verification</span>
      </div>

      <TurnstileWidget onToken={onToken} onStatusChange={setStatus} action={action} resetSignal={resetSignal} />

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={`text-[11px] ${msg.className}`}>{msg.text}</span>
        <span className="text-[9.5px] text-white/20">Protected by Cloudflare Turnstile</span>
      </div>
    </div>
  );
}

export default SecurityVerification;
