'use client';

/**
 * Cloudflare Turnstile widget — UX only.
 *
 * It produces a one-time token the form sends to the server, which is the ONLY
 * place the token is judged (see lib/server/security/captcha.ts). This component
 * never decides anything security-relevant; a passing widget is not trust.
 *
 * Only the PUBLIC site key (NEXT_PUBLIC_TURNSTILE_SITE_KEY) is used here — the
 * secret is server-only and is never referenced in client code. When the site
 * key is not configured the widget renders nothing, so environments without
 * Turnstile keep their existing forms unchanged (the server treats captcha as
 * disabled there too).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

export type TurnstileStatus = 'ready' | 'solved' | 'expired' | 'error';

export function TurnstileWidget({
  onToken,
  onStatusChange,
  action,
  className,
  resetSignal,
}: {
  /** Called with a fresh token on success, or '' when it expires/errors. */
  onToken: (token: string) => void;
  /** Optional UX signal for the surrounding "Security verification" section. */
  onStatusChange?: (status: TurnstileStatus) => void;
  action?: string;
  className?: string;
  /** Increment to force a fresh challenge (e.g. after a successful submit). */
  resetSignal?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  const emit = useCallback((t: string) => onToken(t), [onToken]);
  // Keep the status callback in a ref so it never re-renders the widget.
  const statusRef = useRef(onStatusChange);
  statusRef.current = onStatusChange;
  const status = useCallback((s: TurnstileStatus) => statusRef.current?.(s), []);

  // Load the Turnstile script once.
  useEffect(() => {
    if (!SITE_KEY) return;
    if (window.turnstile) { setScriptReady(true); return; }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      if (window.turnstile) setScriptReady(true);
      else existing.addEventListener('load', () => setScriptReady(true), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.addEventListener('load', () => setScriptReady(true), { once: true });
    document.head.appendChild(s);
  }, []);

  // Render the widget once the script is ready.
  useEffect(() => {
    if (!SITE_KEY || !scriptReady || !containerRef.current || !window.turnstile || widgetIdRef.current) return;
    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        action,
        callback: (t: string) => { emit(t); status('solved'); },
        'expired-callback': () => { emit(''); status('expired'); },
        'error-callback': () => { emit(''); status('error'); },
      });
      status('ready');
    } catch {
      /* render failure → no token; the server fails closed when configured */
    }
    return () => {
      try { if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current); } catch { /* noop */ }
      widgetIdRef.current = null;
    };
  }, [scriptReady, action, emit, status]);

  // Parent-driven reset: obtain a fresh challenge and clear any stale token.
  useEffect(() => {
    if (!resetSignal) return;
    try {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
        emit('');
        status('ready');
      }
    } catch { /* noop */ }
  }, [resetSignal, emit, status]);

  if (!SITE_KEY) return null; // captcha disabled for this deployment
  return <div ref={containerRef} className={className} style={{ maxWidth: '100%', overflow: 'hidden' }} />;
}

export default TurnstileWidget;
