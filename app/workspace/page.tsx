'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import DocumentGenerator from '@/components/DocumentGenerator';

export default function WorkspacePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) router.push('/login');
    if (session?.user?.role === 'suspended') router.push('/login?status=suspended');
  }, [session, status, router]);

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!session) {
    return null;
  }

  if (session.user.role === 'suspended') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-950">Account suspended</p>
          <p className="mt-2 text-sm text-slate-600">This account is currently suspended or disabled. Please contact your super admin.</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen">
      <DocumentGenerator />
    </main>
  );
}
