'use client';

/**
 * TelemetryTracker — mounted once in the root layout.
 *
 * Tracks (per 20-second ping):
 *  - Tab visibility (Page Visibility API)
 *  - User idle time (mouse + keyboard inactivity)
 *  - Click count delta
 *  - Keystroke count delta
 *  - Scroll event delta
 *  - navigator.onLine (browser connectivity)
 *  - Network connection type (navigator.connection)
 *  - Focus duration accumulated while tab is visible
 *
 * Offline signals (sent via sendBeacon — survives tab close):
 *  - pagehide event
 *  - beforeunload event
 *  - visibilitychange → hidden (immediate idle beacon)
 *  - navigator.onLine = false (online event listener)
 *
 * All data flows to /api/telemetry/ping which feeds the presence store
 * powering the super admin live-sessions panel.
 */

import { useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { trackTelemetry, getOrCreateVisitorId, getOrCreateSessionId } from '@/lib/telemetry-client';

const PING_INTERVAL_MS    = 20_000;   // heartbeat every 20 s (tab visible only)
const PING_ENDPOINT       = '/api/telemetry/ping';

function getSurface(path: string): 'workspace' | 'public' {
  const workspacePrefixes = [
    '/workspace', '/messages', '/documents', '/file', '/gigs', '/profile',
    '/people', '/services', '/template-studio', '/docsheet', '/docsheet-studio',
    '/schedule', '/onboarding', '/pdf-editor', '/doxpert', '/visualizer',
    '/file-transfers', '/file-directory', '/recents', '/deal-rooms',
    '/meet-workspace', '/board-room', '/support', '/forms', '/id',
    '/document-encrypter', '/resume-ats', '/talent', '/hiring',
  ];
  return workspacePrefixes.some((p) => path.startsWith(p)) ? 'workspace' : 'public';
}

function getConnectionType(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    return conn?.effectiveType || conn?.type || undefined;
  } catch { return undefined; }
}

export function TelemetryTracker() {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  const pingTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPathRef       = useRef<string>('');

  // Focus / visibility tracking
  const focusStartRef     = useRef<number>(Date.now());
  const focusAccRef       = useRef<number>(0);

  // Interaction counters (reset each ping)
  const clickDeltaRef     = useRef<number>(0);
  const keystrokeDeltaRef = useRef<number>(0);
  const scrollDeltaRef    = useRef<number>(0);

  // Idle tracking — last time user moved mouse or pressed a key
  const lastInteractionRef = useRef<number>(Date.now());

  const userId   = (session?.user as { id?: string }   | undefined)?.id;
  const userRole = (session?.user as { role?: string } | undefined)?.role;

  // ── Payload builder ──────────────────────────────────────────────────
  const buildPayload = useCallback((opts: {
    path?: string;
    tabVisible: boolean;
    offline?: boolean;
    isPageView?: boolean;
    focusDeltaMs?: number;
    consumeCounters?: boolean; // true → include & reset click/key/scroll deltas
  }) => {
    const idleMs = Date.now() - lastInteractionRef.current;
    const payload: Record<string, unknown> = {
      sessionId:        getOrCreateSessionId() || '',
      visitorId:        getOrCreateVisitorId() || undefined,
      userId:           userId   || undefined,
      userRole:         userRole || undefined,
      path:             opts.path ?? window.location.pathname,
      surface:          getSurface(opts.path ?? window.location.pathname),
      tabVisible:       opts.tabVisible,
      navigatorOnline:  navigator.onLine,
      offline:          opts.offline ?? false,
      isPageView:       opts.isPageView ?? false,
      focusDeltaMs:     opts.focusDeltaMs ?? 0,
      idleMs,
      connectionType:   getConnectionType(),
    };

    if (opts.consumeCounters) {
      payload.clickDelta     = clickDeltaRef.current;
      payload.keystrokeDelta = keystrokeDeltaRef.current;
      payload.scrollDelta    = scrollDeltaRef.current;
      clickDeltaRef.current     = 0;
      keystrokeDeltaRef.current = 0;
      scrollDeltaRef.current    = 0;
    }

    return payload;
  }, [userId, userRole]);

  // ── Beacon (sendBeacon — works on pagehide / beforeunload) ───────────
  const beacon = useCallback((payload: Record<string, unknown>) => {
    try {
      navigator.sendBeacon(PING_ENDPOINT, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    } catch { /* ignore */ }
  }, []);

  // ── Fetch ping (normal heartbeat) ────────────────────────────────────
  const fetchPing = useCallback((payload: Record<string, unknown>) => {
    fetch(PING_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  }, []);

  // ── Heartbeat start / stop ───────────────────────────────────────────
  const startPing = useCallback(() => {
    if (pingTimerRef.current) return;
    focusStartRef.current = Date.now();
    pingTimerRef.current = setInterval(() => {
      const now = Date.now();
      const focusDelta = now - focusStartRef.current;
      focusAccRef.current += focusDelta;
      focusStartRef.current = now;
      fetchPing(buildPayload({
        tabVisible:    true,
        focusDeltaMs:  focusAccRef.current,
        consumeCounters: true,
      }));
      focusAccRef.current = 0;
    }, PING_INTERVAL_MS);
  }, [buildPayload, fetchPing]);

  const stopPing = useCallback(() => {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (focusStartRef.current) {
      focusAccRef.current += Date.now() - focusStartRef.current;
    }
  }, []);

  // ── Interaction event listeners (increment deltas + update idle ref) ─
  useEffect(() => {
    function onMouseMove() { lastInteractionRef.current = Date.now(); }
    function onClick()     { lastInteractionRef.current = Date.now(); clickDeltaRef.current++; }
    function onKeyDown()   { lastInteractionRef.current = Date.now(); keystrokeDeltaRef.current++; }
    function onScroll()    { lastInteractionRef.current = Date.now(); scrollDeltaRef.current++; }

    document.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('click',     onClick,     { passive: true });
    document.addEventListener('keydown',   onKeyDown,   { passive: true });
    document.addEventListener('scroll',    onScroll,    { passive: true, capture: true });
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('click',     onClick);
      document.removeEventListener('keydown',   onKeyDown);
      document.removeEventListener('scroll',    onScroll, { capture: true } as EventListenerOptions);
    };
  }, []);

  // ── Page Visibility API ──────────────────────────────────────────────
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        focusStartRef.current = Date.now();
        startPing();
        fetchPing(buildPayload({ tabVisible: true, consumeCounters: false }));
      } else {
        stopPing();
        // Tab hidden — send idle beacon immediately (no fetch, beacon only)
        beacon(buildPayload({ tabVisible: false, consumeCounters: true }));
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [startPing, stopPing, buildPayload, beacon, fetchPing]);

  // ── pagehide — most reliable signal for tab close / navigate away ────
  useEffect(() => {
    function handlePagehide() {
      stopPing();
      beacon({ ...buildPayload({ tabVisible: false, consumeCounters: true }), offline: true });
    }
    window.addEventListener('pagehide', handlePagehide);
    return () => window.removeEventListener('pagehide', handlePagehide);
  }, [stopPing, buildPayload, beacon]);

  // ── beforeunload — second safety net for browsers that skip pagehide ─
  useEffect(() => {
    function handleBeforeUnload() {
      stopPing();
      beacon({ ...buildPayload({ tabVisible: false, consumeCounters: false }), offline: true });
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [stopPing, buildPayload, beacon]);

  // ── navigator.onLine = false → evict immediately ─────────────────────
  useEffect(() => {
    function handleOffline() {
      stopPing();
      beacon({ ...buildPayload({ tabVisible: false, consumeCounters: false }), offline: true, navigatorOnline: false });
    }
    function handleOnline() {
      // Reconnected — resume pinging
      if (document.visibilityState === 'visible') {
        startPing();
        fetchPing(buildPayload({ tabVisible: true, consumeCounters: false }));
      }
    }
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online',  handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online',  handleOnline);
    };
  }, [startPing, stopPing, buildPayload, beacon, fetchPing]);

  // ── Initial mount ────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      // Start the heartbeat timer only. The route-change effect below fires an
      // immediate ping ~100 ms from now carrying isPageView, which is strictly
      // more informative — sending one here too meant two identical requests on
      // the page's critical path on every cold load.
      startPing();
    }
    return () => stopPing();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only

  // ── Page view on route change ────────────────────────────────────────
  useEffect(() => {
    if (!pathname || pathname === lastPathRef.current) return;
    lastPathRef.current = pathname;

    const t = setTimeout(() => {
      const surface    = getSurface(pathname);
      const visitorId  = getOrCreateVisitorId();
      const sessionId  = getOrCreateSessionId();

      trackTelemetry({
        type: 'page_view',
        surface,
        path:      pathname,
        userId:    userId    || undefined,
        userRole:  userRole  || undefined,
        visitorId: visitorId || undefined,
        sessionId: sessionId || undefined,
        referrer:  typeof document !== 'undefined' ? document.referrer   : undefined,
        title:     typeof document !== 'undefined' ? document.title      : undefined,
      });

      fetchPing(buildPayload({
        path:       pathname,
        tabVisible: document.visibilityState === 'visible',
        isPageView: true,
        consumeCounters: false,
      }));
    }, 100);

    return () => clearTimeout(t);
  }, [pathname, userId, userRole, buildPayload, fetchPing]);

  // ── Re-ping when session loads (attach userId to existing session) ────
  useEffect(() => {
    if (status === 'authenticated' && userId) {
      fetchPing(buildPayload({
        path:       lastPathRef.current || window.location.pathname,
        tabVisible: document.visibilityState === 'visible',
        consumeCounters: false,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, userId]);

  return null;
}
