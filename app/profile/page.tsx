'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export const dynamic = 'force-dynamic';

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'loading') return;

    if (status === 'unauthenticated') {
      router.replace('/login?next=/profile');
      return;
    }

    const sessionId = typeof session?.user?.id === 'string' ? session.user.id.trim() : '';
    if (sessionId) {
      router.replace(`/u/${sessionId}`);
      return;
    }

    // Session authenticated but id missing (common with Google OAuth) — resolve via API
    let cancelled = false;
    fetch('/api/me', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Could not resolve profile');
        return r.json() as Promise<{ id?: string }>;
      })
      .then((d) => {
        if (cancelled) return;
        if (d?.id?.trim()) router.replace(`/u/${d.id.trim()}`);
        else router.replace('/login?next=/profile');
      })
      .catch(() => {
        if (!cancelled) setError('Unable to load your profile. Please sign in again.');
      });

    return () => { cancelled = true; };
  }, [status, session, router]);

  return (
    <div className="min-h-screen bg-[#0D0D0F] flex flex-col items-center justify-center gap-4 px-6">
      {error ? (
        <>
          <p className="text-sm text-white/60 text-center max-w-sm">{error}</p>
          <a href="/login?next=/profile" className="text-sm font-semibold text-amber-400 hover:text-amber-300">
            Go to sign in →
          </a>
        </>
      ) : (
        <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
      )}
    </div>
  );
}
