'use client';

/**
 * Presence UI — the single place the green dot is allowed to come from.
 *
 * The dot is rendered only while the viewed user is genuinely online (a
 * heartbeat inside PRESENCE_ONLINE_THRESHOLD_MS). Otherwise the badge falls
 * back to a relative "Last seen …" label, and the dot-only variant renders
 * nothing at all.
 *
 * Presence values come from the shared store in PresenceProvider, so a list of
 * cards costs one batched request per poll rather than one request per card.
 */

import { describePresence } from '@/lib/presence';
import { useUserPresence } from '@/app/components/PresenceProvider';

export { useUserPresence };

/* ─── inline badge (beside name) ───────────────────────────────────── */

export function PresenceBadge({ userId }: { userId: string }) {
  const { lastSeenAt, online: authoritativeOnline } = useUserPresence(userId);
  const { online, label } = describePresence(lastSeenAt, Date.now(), authoritativeOnline);

  // Never seen — render nothing rather than inventing a status.
  if (!label) return null;

  return (
    <span className="inline-flex items-center gap-1.5 select-none">
      {online && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
      )}
      <span
        className={`text-[11.5px] font-medium leading-none ${
          online ? 'text-emerald-400' : 'text-white/35'
        }`}
      >
        {label}
      </span>
    </span>
  );
}

/* ─── compact dot-only (for avatars / list rows) ───────────────────── */

export function PresenceDot({
  userId,
  size = 'md',
  ringClass = 'ring-[#0D0D0F]',
}: {
  userId: string | null | undefined;
  size?: 'sm' | 'md';
  /** Ring colour so the dot reads correctly against its own surface. */
  ringClass?: string;
}) {
  const { lastSeenAt, online: authoritativeOnline } = useUserPresence(userId);
  const { online, label } = describePresence(lastSeenAt, Date.now(), authoritativeOnline);

  // Offline users get no dot — absence is the offline state.
  if (!online) return null;

  const dim = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2.5 w-2.5';
  const ring = size === 'sm' ? 'ring-1' : 'ring-[1.5px]';

  return (
    <span className={`relative flex shrink-0 ${dim}`} title={label ?? 'Online'}>
      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50 animate-ping" />
      <span className={`relative inline-flex rounded-full ${dim} bg-emerald-400 ${ring} ${ringClass}`} />
    </span>
  );
}
