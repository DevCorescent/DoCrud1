'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export const dynamic = 'force-dynamic';

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login?next=/profile');
      return;
    }
    if (status === 'authenticated') {
      const userId = (session?.user as any)?.id;
      if (userId) {
        router.replace(`/u/${userId}`);
      }
    }
  }, [status, session, router]);

  return (
    <div className="min-h-screen bg-[#0D0D0F] flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
    </div>
  );
}
