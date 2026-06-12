'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const SuperAdminPanel = dynamic(() => import('@/components/SuperAdminPanel'), { ssr: false });

export default function SuperAdminPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');

  useEffect(() => {
    fetch('/api/super-admin/auth/check')
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) {
          setAuthenticated(true);
          setAdminEmail(d.email || '');
        } else {
          router.replace('/super-admin/auth');
        }
      })
      .catch(() => router.replace('/super-admin/auth'))
      .finally(() => setChecking(false));
  }, [router]);

  async function logout() {
    await fetch('/api/super-admin/auth/logout', { method: 'POST' });
    router.replace('/super-admin/auth');
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-6 h-6 rounded-full border-2 border-amber-500 border-t-transparent animate-spin mx-auto" />
          <p className="text-zinc-600 text-sm">Verifying session…</p>
        </div>
      </div>
    );
  }

  if (!authenticated) return null;

  return <SuperAdminPanel adminEmail={adminEmail} onLogout={logout} />;
}
