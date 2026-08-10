'use client';

/**
 * PresenceProvider — mounted once in the root layout.
 *
 * Two responsibilities:
 *
 *  1. Heartbeat. While this tab is visible AND the user has interacted
 *     recently, POST /api/presence/ping every 30 s. The server stamps
 *     lastSeenAt from the session — the client never names the user.
 *
 *  2. Shared presence store. Every PresenceBadge / PresenceDot on the page
 *     subscribes to one store, which batch-fetches all subscribed user ids in
 *     a single /api/presence?ids=… request per poll. Without this, a feed of
 *     40 cards would issue 40 requests every 30 s.
 *
 * Cross-tab: heartbeats are guarded by a short-lived localStorage lease, so N
 * open tabs still produce one heartbeat stream. The lease is only claimed by a
 * visible, non-idle tab, which means whichever tab you are actually looking at
 * is the one reporting.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSession } from 'next-auth/react';
import {
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  PRESENCE_IDLE_THRESHOLD_MS,
  PRESENCE_POLL_INTERVAL_MS,
  type PresenceState,
} from '@/lib/presence';

/* ─── cross-tab heartbeat lease ─────────────────────────────────────── */

const LEASE_KEY = 'docrud:presence:lease';
/** A lease older than this is considered abandoned (tab closed or crashed). */
const LEASE_TTL_MS = PRESENCE_HEARTBEAT_INTERVAL_MS * 2;

/**
 * Try to become the heartbeating tab. Returns true if this tab may ping now.
 * Deliberately optimistic: a lost race just means one extra heartbeat, and the
 * server throttles duplicate writes anyway.
 */
function acquireHeartbeatLease(tabId: string): boolean {
  try {
    const now = Date.now();
    const raw = window.localStorage.getItem(LEASE_KEY);
    if (raw) {
      const lease = JSON.parse(raw) as { tabId?: string; ts?: number };
      const fresh = typeof lease.ts === 'number' && now - lease.ts < LEASE_TTL_MS;
      if (fresh && lease.tabId !== tabId) return false;
    }
    window.localStorage.setItem(LEASE_KEY, JSON.stringify({ tabId, ts: now }));
    return true;
  } catch {
    // Private mode / storage disabled — fall back to always pinging.
    return true;
  }
}

function releaseHeartbeatLease(tabId: string) {
  try {
    const raw = window.localStorage.getItem(LEASE_KEY);
    if (!raw) return;
    const lease = JSON.parse(raw) as { tabId?: string };
    if (lease.tabId === tabId) window.localStorage.removeItem(LEASE_KEY);
  } catch {
    /* ignore */
  }
}

/* ─── shared presence store ─────────────────────────────────────────── */

type Listener = () => void;

class PresenceStore {
  private refCounts = new Map<string, number>();
  private values = new Map<string, PresenceState>();
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private burstTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;

  subscribe(userId: string, listener: Listener): () => void {
    this.listeners.add(listener);
    this.refCounts.set(userId, (this.refCounts.get(userId) || 0) + 1);

    // A newly-mounted card should not wait a full poll interval for its dot.
    // Coalesced, because a feed mounts dozens of cards in the same tick and we
    // want one request containing every id — not one request for the first id.
    this.scheduleRefresh();
    this.start();

    return () => {
      this.listeners.delete(listener);
      const next = (this.refCounts.get(userId) || 1) - 1;
      if (next <= 0) {
        this.refCounts.delete(userId);
        this.values.delete(userId);
      } else {
        this.refCounts.set(userId, next);
      }
      if (this.refCounts.size === 0) this.stop();
    };
  }

  get(userId: string): PresenceState | undefined {
    return this.values.get(userId);
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }

  private start() {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.refresh(); }, PRESENCE_POLL_INTERVAL_MS);
  }

  private stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.burstTimer) {
      clearTimeout(this.burstTimer);
      this.burstTimer = null;
    }
  }

  /** Collapse a burst of mounts into a single batched fetch. */
  private scheduleRefresh() {
    if (this.burstTimer) return;
    this.burstTimer = setTimeout(() => {
      this.burstTimer = null;
      void this.refresh();
    }, 50);
  }

  /**
   * Fetch every subscribed id in one request. A failed poll keeps the previous
   * values rather than blanking the UI — the server timestamp stays the source
   * of truth and the next poll will reconcile.
   */
  async refresh(): Promise<void> {
    if (this.inFlight) return;
    const ids = Array.from(this.refCounts.keys());
    if (ids.length === 0) return;

    this.inFlight = true;
    try {
      const response = await fetch(`/api/presence?ids=${encodeURIComponent(ids.join(','))}`, {
        cache: 'no-store',
      });
      if (!response.ok) return;
      const payload = await response.json() as {
        presence?: Record<string, PresenceState>;
      };
      if (!payload?.presence) return;

      for (const [id, state] of Object.entries(payload.presence)) {
        // Drop results for cards unmounted while the request was in flight.
        if (this.refCounts.has(id)) this.values.set(id, state);
      }
      this.emit();
    } catch {
      /* offline or aborted — keep last known values */
    } finally {
      this.inFlight = false;
    }
  }
}

const PresenceContext = createContext<PresenceStore | null>(null);

/* ─── heartbeat ─────────────────────────────────────────────────────── */

function useHeartbeat(enabled: boolean) {
  const tabIdRef = useRef<string>('');
  const lastInteractionRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppedRef = useRef(false);

  if (!tabIdRef.current && typeof window !== 'undefined') {
    tabIdRef.current = Math.random().toString(36).slice(2);
  }

  useEffect(() => {
    if (!enabled) return;
    stoppedRef.current = false;

    const markInteraction = () => { lastInteractionRef.current = Date.now(); };
    const interactionEvents: Array<keyof DocumentEventMap> = [
      'mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart',
    ];
    interactionEvents.forEach((event) =>
      document.addEventListener(event, markInteraction, { passive: true }),
    );

    const ping = () => {
      // Session gone (expired / logged out elsewhere) — stop until remount.
      if (stoppedRef.current) return;
      // Hidden tab is not presence.
      if (document.visibilityState !== 'visible') return;
      // Tab open but untouched for a long time is not presence either.
      if (Date.now() - lastInteractionRef.current > PRESENCE_IDLE_THRESHOLD_MS) return;
      // Another tab is already reporting for this user.
      if (!acquireHeartbeatLease(tabIdRef.current)) return;

      fetch('/api/presence/ping', { method: 'POST', keepalive: true })
        .then((response) => {
          if (response.status === 401) stoppedRef.current = true;
        })
        .catch(() => {
          // Transient network failure — the next tick retries. The UI is
          // untouched; the server timestamp simply ages until we reconnect.
        });
    };

    ping();
    timerRef.current = setInterval(ping, PRESENCE_HEARTBEAT_INTERVAL_MS);

    // Coming back to the tab should refresh presence immediately rather than
    // waiting out the interval.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markInteraction();
        ping();
      } else {
        releaseHeartbeatLease(tabIdRef.current);
      }
    };
    const onFocus = () => { markInteraction(); ping(); };
    const onPageHide = () => releaseHeartbeatLease(tabIdRef.current);

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      interactionEvents.forEach((event) =>
        document.removeEventListener(event, markInteraction),
      );
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', onPageHide);
      releaseHeartbeatLease(tabIdRef.current);
    };
  }, [enabled]);
}

/* ─── provider ──────────────────────────────────────────────────────── */

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const store = useMemo(() => new PresenceStore(), []);

  useHeartbeat(Boolean(session?.user));

  return <PresenceContext.Provider value={store}>{children}</PresenceContext.Provider>;
}

/* ─── consumer hook ─────────────────────────────────────────────────── */

/**
 * Subscribe to one user's presence.
 *
 * Re-renders on each poll (~30 s), which also keeps relative "last seen"
 * labels fresh without any additional timer.
 */
export function useUserPresence(userId: string | null | undefined): PresenceState {
  const store = useContext(PresenceContext);
  const [, forceRender] = useState(0);

  const bump = useCallback(() => forceRender((n) => n + 1), []);

  useEffect(() => {
    if (!store || !userId) return;
    return store.subscribe(userId, bump);
  }, [store, userId, bump]);

  if (!store || !userId) return { lastSeenAt: null, online: false };
  return store.get(userId) ?? { lastSeenAt: null, online: false };
}
