'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0C] text-white p-6">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
          <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Something went wrong</h2>
          <p className="mt-1.5 text-[13px] text-white/40">An unexpected error occurred. Try again or go home.</p>
        </div>
        <div className="flex gap-2 justify-center">
          <button
            onClick={reset}
            className="h-9 rounded-xl border border-white/[0.10] bg-white/[0.05] px-4 text-[13px] font-medium text-white/70 transition hover:bg-white/[0.10] hover:text-white"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-xl bg-white px-4 text-[13px] font-semibold text-[#09090c] transition hover:bg-white/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
