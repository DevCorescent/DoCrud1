'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';

/* ─── constants ────────────────────────────────────────────────────── */
const ONLINE_THRESHOLD_MS  = 3 * 60 * 1000;   // active in last 3 min → "Available Now"
const RECENT_THRESHOLD_MS  = 15 * 60 * 1000;  // active in last 15 min → "Active recently"
const HEARTBEAT_INTERVAL   = 30_000;           // send presence ping every 30 s
const POLL_INTERVAL        = 30_000;           // refresh viewed profile's presence every 30 s

/* ─── shared time formatter ────────────────────────────────────────── */
export function formatLastActive(iso: string | null): {
  label: string;
  status: 'online' | 'recent' | 'away' | 'unknown';
} {
  if (!iso) return { label: 'Offline', status: 'unknown' };
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < ONLINE_THRESHOLD_MS)  return { label: 'Available Now',    status: 'online'  };
  if (diff < RECENT_THRESHOLD_MS)  return { label: 'Active recently',  status: 'recent'  };
  if (diff < 60 * 60 * 1000)       return { label: `Active ${Math.floor(diff / 60_000)}m ago`, status: 'away' };
  if (diff < 24 * 60 * 60 * 1000)  return { label: `Active ${Math.floor(diff / 3_600_000)}h ago`, status: 'away' };
  if (diff < 7 * 24 * 60 * 60 * 1000) return { label: `Active ${Math.floor(diff / 86_400_000)}d ago`, status: 'away' };
  return { label: 'Offline', status: 'unknown' };
}

/* ─── heartbeat hook — keeps the logged-in user's presence alive ─── */
export function usePresenceHeartbeat() {
  const { data: session } = useSession();
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!session?.user) return;

    const ping = () => {
      // Only ping when tab is visible
      if (document.visibilityState !== 'visible') return;
      fetch('/api/presence/ping', { method: 'POST' }).catch(() => {});
    };

    ping(); // immediate ping on mount / focus
    ref.current = setInterval(ping, HEARTBEAT_INTERVAL);

    const onVisible = () => { if (document.visibilityState === 'visible') ping(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (ref.current) clearInterval(ref.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session?.user]);
}

/* ─── hook to read another user's presence ─────────────────────────── */
export function useUserPresence(userId: string | null | undefined) {
  const [lastActiveAt, setLastActiveAt] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!userId) return;

    const fetch_ = () => {
      fetch(`/api/presence/${userId}`)
        .then(r => r.ok ? r.json() : null)
        .then((d: { lastActiveAt: string | null } | null) => {
          if (d?.lastActiveAt !== undefined) setLastActiveAt(d.lastActiveAt);
        })
        .catch(() => {});
    };

    fetch_();
    pollRef.current = setInterval(fetch_, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [userId]);

  return lastActiveAt;
}

/* ─── dot colours ───────────────────────────────────────────────────── */
const DOT: Record<string, string> = {
  online:  'bg-emerald-400',
  recent:  'bg-emerald-400/60',
  away:    'bg-white/20',
  unknown: 'bg-white/12',
};

const TEXT: Record<string, string> = {
  online:  'text-emerald-400',
  recent:  'text-white/45',
  away:    'text-white/30',
  unknown: 'text-white/22',
};

/* ─── inline badge (beside name) ───────────────────────────────────── */
export function PresenceBadge({ userId }: { userId: string }) {
  const lastActiveAt = useUserPresence(userId);
  const { label, status } = formatLastActive(lastActiveAt);

  return (
    <span className="inline-flex items-center gap-1.5 select-none">
      {/* animated pulse only when truly online */}
      <span className="relative flex h-2 w-2 shrink-0">
        {status === 'online' && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${DOT[status]}`} />
      </span>
      <span className={`text-[11.5px] font-medium leading-none ${TEXT[status]}`}>
        {label}
      </span>
    </span>
  );
}

/* ─── compact dot-only (for avatars / list rows) ───────────────────── */
export function PresenceDot({
  userId,
  size = 'md',
}: {
  userId: string;
  size?: 'sm' | 'md';
}) {
  const lastActiveAt = useUserPresence(userId);
  const { status } = formatLastActive(lastActiveAt);
  if (status === 'unknown') return null;

  const dim = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2.5 w-2.5';
  const ring = size === 'sm' ? 'ring-1' : 'ring-[1.5px]';

  return (
    <span className={`relative flex shrink-0 ${dim}`}>
      {status === 'online' && (
        <span className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50 animate-ping`} />
      )}
      <span className={`relative inline-flex rounded-full ${dim} ${DOT[status]} ${ring} ring-[#0D0D0F]`} />
    </span>
  );
}
