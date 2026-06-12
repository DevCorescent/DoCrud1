'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

import TemplateStudioStudio from '@/components/TemplateStudioStudio';

export default function TemplateStudioPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) router.push('/login');
  }, [router, session, status]);

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!session) return null;

  return (
    <main className="min-h-screen">
      <div className="h-screen w-screen bg-[#f6f7fb]">
        <TemplateStudioStudio onClose={() => router.push('/workspace')} />
      </div>
    </main>
  );
}
