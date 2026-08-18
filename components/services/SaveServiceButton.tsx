'use client';

/**
 * §26 Save Service — the save/unsave control used on cards and detail views.
 *
 * Self-contained: give it a serviceId and it owns its own state, including the
 * initial "is this already saved?" read. Optimistic on click, and it rolls the
 * icon back if the server refuses.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';

export interface SaveServiceButtonProps {
  serviceId: string;
  /** `icon` for dense card corners, `full` for a labelled button. */
  variant?: 'icon' | 'full';
  /** Skips the per-button GET when the host already knows the state. */
  initialSaved?: boolean;
  className?: string;
  onChange?: (saved: boolean) => void;
}

export default function SaveServiceButton({
  serviceId,
  variant = 'full',
  initialSaved,
  className = '',
  onChange,
}: SaveServiceButtonProps) {
  const { status } = useSession();
  const router = useRouter();
  const [saved, setSaved] = useState(Boolean(initialSaved));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialSaved !== undefined || status !== 'authenticated') return;
    let cancelled = false;
    fetch(`/api/services/saves?serviceId=${encodeURIComponent(serviceId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { saved?: boolean } | null) => { if (!cancelled && d) setSaved(Boolean(d.saved)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [serviceId, initialSaved, status]);

  const toggle = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;

    /* Unauthenticated users go to sign-in rather than having the save kept
       locally and silently lost. */
    if (status !== 'authenticated') {
      router.push('/login');
      return;
    }

    const next = !saved;
    setSaved(next);            // optimistic
    setBusy(true);
    setError('');
    try {
      const res = next
        ? await fetch('/api/services/saves', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ serviceId }),
        })
        : await fetch(`/api/services/saves?serviceId=${encodeURIComponent(serviceId)}`, { method: 'DELETE' });

      if (!res.ok) {
        const d = await res.json().catch(() => null) as { error?: string } | null;
        setSaved(!next);       // roll back
        setError(d?.error || 'Could not update your saved services.');
        return;
      }
      onChange?.(next);
    } catch {
      setSaved(!next);
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  }, [busy, saved, serviceId, status, router, onChange]);

  const label = saved ? 'Saved' : 'Save';
  const Icon = busy ? Loader2 : saved ? BookmarkCheck : Bookmark;

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={saved}
        aria-label={saved ? 'Remove from saved services' : 'Save this service'}
        title={error || label}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all ${
          saved
            ? 'border-violet-500/40 bg-violet-500/15 text-violet-300'
            : 'border-white/[0.10] bg-white/[0.06] text-white/45 hover:text-white/80'
        } ${className}`}
      >
        <Icon className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      title={error || undefined}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-[11px] font-semibold transition-all ${
        saved
          ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
          : 'border-white/[0.10] bg-white/[0.05] text-white/55 hover:bg-white/[0.08] hover:text-white'
      } ${className}`}
    >
      <Icon className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`} />
      {label}
    </button>
  );
}
