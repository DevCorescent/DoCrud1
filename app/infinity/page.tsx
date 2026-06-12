'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import './infinity.css';

const FEATURES = [
  {
    icon: <svg className="inf-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
    label: 'Business Pages',
    desc: 'Build a full company profile with products, jobs & events.',
  },
  {
    icon: <svg className="inf-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
    label: 'Unlimited Services',
    desc: 'No cap on services — free users are limited to 2.',
  },
  {
    icon: <svg className="inf-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>,
    label: 'Direct Messaging',
    desc: 'Chat with any professional or client on the platform.',
  },
  {
    icon: <svg className="inf-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>,
    label: 'Public Face Badge',
    desc: 'Apply for verified creator status across the platform.',
  },
  {
    icon: <svg className="inf-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>,
    label: 'E-Sign Documents',
    desc: 'Send contracts for OTP-verified signature & audit trails.',
  },
  {
    icon: <svg className="inf-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>,
    label: '5 GB Drive Storage',
    desc: 'Free cloud storage for files, documents and media.',
  },
];

function InfinityPageInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams?.get('returnTo') || '/';

  const [period, setPeriod] = useState<'monthly' | 'annual'>('annual');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    if (document.querySelector('script[src*="razorpay"]')) { setSdkReady(true); return; }
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => setSdkReady(true);
    document.body.appendChild(s);
  }, []);

  const monthly = 299;
  const annual  = 2499;
  const saving  = Math.round(100 - (annual / (monthly * 12)) * 100);

  async function handleCheckout() {
    if (status !== 'authenticated') { router.push('/login?returnTo=/infinity'); return; }
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/billing/infinity', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create order.');
      const RZP = (window as unknown as { Razorpay: new (o: Record<string, unknown>) => { open(): void } }).Razorpay;
      const rzp = new RZP({
        key: data.keyId, order_id: data.order.id, amount: data.order.amount, currency: 'INR',
        name: 'Docrud', description: `Docrud Infinity · ${period === 'annual' ? 'Annual' : 'Monthly'}`,
        prefill: { name: data.customer?.name || '', email: data.customer?.email || '' },
        theme: { color: '#4f46e5' },
        handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const vr = await fetch('/api/billing/infinity', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature }),
          });
          const vd = await vr.json();
          if (!vr.ok) { setError(vd.error || 'Verification failed.'); setLoading(false); return; }
          setSuccess(true); setLoading(false);
          setTimeout(() => router.push(returnTo), 2000);
        },
        modal: { ondismiss: () => setLoading(false) },
      });
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setLoading(false);
    }
  }

  if (success) return (
    <div className="inf-success">
      <div className="inf-success-orb">
        <span className="inf-success-sym">∞</span>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div className="inf-eyebrow-sm" style={{ marginBottom: 8 }}>Welcome to</div>
        <h2 className="inf-success-title">Docrud Infinity</h2>
        <p className="inf-success-sub">All premium features are now active.</p>
      </div>
      <div className="inf-spinner-row">
        <div className="inf-spinner" />
        <span className="inf-spinner-label">Redirecting…</span>
      </div>
    </div>
  );

  return (
    <div className="inf-root">
      {/* Ambient */}
      <div className="inf-ambient">
        <div className="inf-blob1" />
        <div className="inf-blob2" />
        <div className="inf-blob3" />
        <div className="inf-noise" />
      </div>

      {/* Nav */}
      <nav className="inf-nav">
        <Link href={returnTo} className="inf-nav-back">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
          </svg>
          Back
        </Link>
        <div className="inf-nav-brand">
          <span className="inf-brand-name">docrud</span>
          <div className="inf-brand-divider" />
          <span className="inf-brand-tag">Infinity ∞</span>
        </div>
        <div className="inf-nav-spacer" />
      </nav>

      {/* Body */}
      <div className="inf-body">

        {/* LEFT */}
        <div className="inf-left">
          <div className="inf-eyebrow">
            <div className="inf-eyebrow-dot" />
            <span className="inf-eyebrow-text">Docrud Infinity</span>
          </div>

          <h1 className="inf-headline">
            <span className="inf-headline-plain">One plan. </span>
            <span className="inf-shimmer">Every unlock.</span>
          </h1>

          <p className="inf-sub">
            Remove every limitation. Business pages, messaging, e-sign,<br className="inf-br-desktop" /> public face &amp; 5&nbsp;GB storage — active from day one.
          </p>

          {/* Period toggle */}
          <div className="inf-toggle-wrap">
            {(['monthly', 'annual'] as const).map(p => (
              <button key={p} className={`inf-toggle-btn ${period === p ? 'active' : 'inactive'}`} onClick={() => setPeriod(p)}>
                {p === 'monthly' ? 'Monthly' : 'Annual'}
                {p === 'annual' && <span className="inf-save-badge">Save {saving}%</span>}
              </button>
            ))}
          </div>

          {/* Feature grid */}
          <div className="inf-feat-grid">
            {FEATURES.map(({ icon, label, desc }, i) => (
              <div key={label} className="inf-feat-card" style={{ animationDelay: `${0.05 + i * 0.06}s` }}>
                <div className="inf-feat-icon-wrap">{icon}</div>
                <p className="inf-feat-label">{label}</p>
                <p className="inf-feat-desc">{desc}</p>
              </div>
            ))}
          </div>

          {/* Trust strip */}
          <div className="inf-trust">
            {[
              { num: '10,000+', label: 'Members' },
              { num: '₹0',      label: 'Hidden fees' },
              { num: 'Instant', label: 'Feature access' },
              { num: 'GST',     label: 'Invoice included' },
            ].map(({ num, label }) => (
              <div key={label} className="inf-trust-item">
                <span className="inf-trust-num">{num}</span>
                <span className="inf-trust-label">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — checkout card */}
        <div className="inf-right">
          <div className="inf-card-outer">
            <div className="inf-card-inner">
              <div className="inf-card-glow" />
              <div className="inf-card-shimmer-line" />
              <div className="inf-card-body">

                <div className="inf-plan-row">
                  <div>
                    <div className="inf-plan-tag">one plan · all access</div>
                    <h2 className="inf-plan-name">Infinity <span>∞</span></h2>
                  </div>
                  <div className="inf-float-badge">∞</div>
                </div>

                <div className="inf-price-block">
                  <div className="inf-price-row">
                    <span className="inf-price-amount">
                      ₹{period === 'annual' ? annual.toLocaleString('en-IN') : monthly}
                    </span>
                    <span className="inf-price-period">/{period === 'annual' ? 'year' : 'month'}</span>
                  </div>
                  {period === 'annual' && (
                    <div className="inf-price-note">₹{Math.round(annual / 12)}/mo effective · {saving}% off monthly</div>
                  )}
                  <div className="inf-price-gst">+18% GST applicable</div>
                </div>

                <div className="inf-checklist">
                  {FEATURES.map(({ label }) => (
                    <div key={label} className="inf-check-row">
                      <div className="inf-check-dot">
                        <svg fill="none" viewBox="0 0 24 24" stroke="#a5b4fc" strokeWidth={3.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                        </svg>
                      </div>
                      <span className="inf-check-label">{label}</span>
                    </div>
                  ))}
                </div>

                {error && <div className="inf-error">{error}</div>}

                <button className="inf-cta" onClick={handleCheckout} disabled={loading || !sdkReady}>
                  {loading ? (
                    <><div className="inf-spinner" />Processing…</>
                  ) : (
                    <><span style={{ fontSize: 15, letterSpacing: '-0.03em' }}>∞</span> Upgrade to Infinity</>
                  )}
                </button>

                <div className="inf-trust-line">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                  </svg>
                  Secured by Razorpay · Cancel anytime
                </div>

              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function InfinityPage() {
  return (
    <Suspense fallback={<div style={{ height: '100svh', background: '#0D0D0F' }} />}>
      <InfinityPageInner />
    </Suspense>
  );
}
