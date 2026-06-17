'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error]', error);
  }, [error]);

  return (
    <html>
      <body style={{ margin: 0, background: '#0A0A0C' }}>
        <div style={{
          display: 'flex', minHeight: '100vh', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: '#fff', padding: '24px', fontFamily: 'system-ui, sans-serif',
        }}>
          <div style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
            <div style={{
              margin: '0 auto 20px', width: 56, height: 56, borderRadius: 16,
              border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>Something went wrong</h2>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
              An unexpected error occurred. Try again or go home.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                onClick={reset}
                style={{
                  height: 36, borderRadius: 12, border: '1px solid rgba(255,255,255,0.10)',
                  background: 'rgba(255,255,255,0.05)', padding: '0 16px',
                  fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.70)', cursor: 'pointer',
                }}
              >
                Try again
              </button>
              <a
                href="/"
                style={{
                  height: 36, borderRadius: 12, background: '#fff', padding: '0 16px',
                  fontSize: 13, fontWeight: 600, color: '#09090c', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', textDecoration: 'none',
                }}
              >
                Go home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
