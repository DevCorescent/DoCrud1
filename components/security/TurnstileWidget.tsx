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
 *
 * ═══ A PARENT RE-RENDER MUST NEVER DESTROY THE CHALLENGE ═══
 *
 * `onToken` is held in a ref and is NOT a dependency of the render effect. It
 * used to be one, by way of a `useCallback` that changed whenever the prop's
 * identity changed — so a parent that passed an inline arrow function tore the
 * widget down and rebuilt it on every single render. On a form, that is every
 * keystroke: the solved challenge was destroyed as fast as it was solved, and
 * the person could never get past "please complete the verification".
 *
 * Every other prop that could restart the widget is treated the same way. The
 * ONLY things that legitimately rebuild it are the script becoming available
 * and an explicit `resetSignal` from the parent.
 *
 * ═══ IT MUST NEVER BECOME A DEAD END ═══
 *
 * Turnstile is asked to recover on its own (`retry: 'auto'`,
 * `refresh-expired: 'auto'`), so an expired token or a transient error
 * re-challenges instead of stranding the person on a widget that will never
 * produce another token.
 *
 * And when the script itself cannot load — blocked by a network, an extension,
 * or a corporate proxy — that is reported as `unavailable` rather than left as
 * a widget that silently never resolves. A form cannot sit and wait forever for
 * a challenge that is never going to appear; the server already treats an
 * absent token as "verify what you can, rate limits still apply", so the UI is
 * told, plainly, that there is nothing to wait for.
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

/* How long to wait for Cloudflare's script before declaring it unreachable.
   Long enough not to punish a slow connection, short enough that a blocked
   script does not hold a signup form hostage. */
const SCRIPT_TIMEOUT_MS = 12_000;

export type TurnstileStatus = 'ready' | 'solved' | 'expired' | 'error' | 'unavailable';

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
  const [scriptState, setScriptState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  /* Both callbacks live in refs, so neither their identity nor a parent's
     re-render can reach the effect that owns the widget's lifetime. */
  const tokenRef = useRef(onToken);
  tokenRef.current = onToken;
  const emit = useCallback((t: string) => tokenRef.current?.(t), []);

  const statusRef = useRef(onStatusChange);
  statusRef.current = onStatusChange;
  const status = useCallback((s: TurnstileStatus) => statusRef.current?.(s), []);

  /* The action is read at render time only. Holding it in a ref keeps a parent
     that computes it inline from restarting the challenge. */
  const actionRef = useRef(action);
  actionRef.current = action;

  // ── Load the Turnstile script once ────────────────────────────────────────
  useEffect(() => {
    if (!SITE_KEY) return;
    if (window.turnstile) { setScriptState('ready'); return; }

    let settled = false;
    const done = (next: 'ready' | 'unavailable') => {
      if (settled) return;
      settled = true;
      setScriptState(next);
    };

    /* Readiness is decided by POLLING for the API object, not by the script
       element's load event. `load` fires when the file has been fetched, which
       is not the same moment `window.turnstile` becomes callable — the api.js
       bootstrap assigns it a tick or more later. Treating `load` as readiness
       meant looking for the object before it existed and concluding the
       challenge was unavailable, on a page where it was about to work
       perfectly. Polling also covers the cases the load event cannot: a script
       another component already injected, and one that finished loading before
       this effect ran. */
    const poll = window.setInterval(() => {
      if (window.turnstile) {
        window.clearInterval(poll);
        done('ready');
      }
    }, 50);

    /* A hard stop, whatever the script element does or fails to do. Some
       blockers neither fire `load` nor `error`; without this the widget would
       wait forever and the form with it. */
    const timer = window.setTimeout(() => {
      window.clearInterval(poll);
      done('unavailable');
    }, SCRIPT_TIMEOUT_MS);

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement('script');

    /* Only the failure path listens to the element: a network error is worth
       reacting to immediately rather than waiting out the timeout. */
    const onError = () => { window.clearInterval(poll); done('unavailable'); };
    script.addEventListener('error', onError, { once: true });

    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    return () => {
      window.clearInterval(poll);
      window.clearTimeout(timer);
      script.removeEventListener('error', onError);
    };
  }, []);

  // ── Report a script that is never going to arrive ─────────────────────────
  useEffect(() => {
    if (scriptState === 'unavailable') {
      console.warn('[turnstile] the challenge script could not be loaded; continuing without a token');
      status('unavailable');
      /* No token is coming. Say so, rather than leaving a stale one behind. */
      emit('');
    }
  }, [scriptState, status, emit]);

  // ── Render the widget once the script is ready ────────────────────────────
  useEffect(() => {
    if (!SITE_KEY || scriptState !== 'ready') return;
    if (!containerRef.current || !window.turnstile || widgetIdRef.current) return;
    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        action: actionRef.current,
        /* Recover without being asked. An expired token refreshes itself and a
           transient failure retries, so neither can leave the form with no way
           to ever produce another token. */
        retry: 'auto',
        'retry-interval': 2000,
        'refresh-expired': 'auto',
        callback: (t: string) => { emit(t); status('solved'); },
        'expired-callback': () => { emit(''); status('expired'); },
        'error-callback': () => { emit(''); status('error'); },
      });
      status('ready');
    } catch {
      /* render failure → no token; the server fails closed when configured */
      status('error');
    }
    return () => {
      try { if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current); } catch { /* noop */ }
      widgetIdRef.current = null;
    };
    /* `emit` and `status` are stable by construction and `action` is read from
       a ref, so the ONLY thing that rebuilds the widget is the script becoming
       available. That is the point: see the note at the top of this file. */
  }, [scriptState, emit, status]);

  // ── Parent-driven reset: obtain a fresh challenge and clear any stale token ─
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
