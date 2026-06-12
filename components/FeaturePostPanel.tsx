'use client';

import { useState } from 'react';
import { Rocket, Zap, Crown, X, CheckCircle2, ExternalLink } from 'lucide-react';


const PLANS = [
  {
    key: 'spotlight' as const,
    name: 'Spotlight',
    days: 3,
    price: 199,
    priceLabel: '₹199',
    gstLabel: '+ 18% GST',
    totalLabel: '₹235',
    Icon: Zap,
    color: 'from-sky-500/20 to-blue-600/10',
    ring: 'ring-sky-500/30',
    badge: 'bg-sky-500/20 text-sky-300',
    perks: ['Pinned at top of feed for 3 days', 'Spotlight badge on your post', 'Priority visibility'],
  },
  {
    key: 'boost' as const,
    name: 'Boost',
    days: 7,
    price: 399,
    priceLabel: '₹399',
    gstLabel: '+ 18% GST',
    totalLabel: '₹471',
    Icon: Rocket,
    color: 'from-violet-500/20 to-purple-600/10',
    ring: 'ring-violet-500/30',
    badge: 'bg-violet-500/20 text-violet-300',
    perks: ['Featured for 7 days', 'Boost badge on your post', 'Email newsletter mention', 'Priority visibility'],
    popular: true,
  },
  {
    key: 'prime' as const,
    name: 'Prime',
    days: 30,
    price: 999,
    priceLabel: '₹999',
    gstLabel: '+ 18% GST',
    totalLabel: '₹1,179',
    Icon: Crown,
    color: 'from-amber-500/20 to-orange-600/10',
    ring: 'ring-amber-500/30',
    badge: 'bg-amber-500/20 text-amber-300',
    perks: ['30-day prime placement', 'Crown badge on your post', 'Newsletter & social promotion', 'Analytics insights', 'Priority support'],
  },
] as const;

interface Props {
  postId: string;
  postTitle: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function FeaturePostPanel({ postId, postTitle, onClose, onSuccess }: Props) {
  const [selected, setSelected] = useState<'spotlight' | 'boost' | 'prime'>('boost');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const loadRazorpay = (): Promise<boolean> =>
    new Promise((resolve) => {
      if (window.Razorpay) { resolve(true); return; }
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });

  const handlePay = async () => {
    setLoading(true);
    setError('');
    try {
      const loaded = await loadRazorpay();
      if (!loaded || !window.Razorpay) throw new Error('Payment gateway failed to load. Check your internet connection.');

      const res = await fetch('/api/feature-post/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, plan: selected }),
      });
      const data = await res.json() as { orderId?: string; amount?: number; currency?: string; keyId?: string; planLabel?: string; error?: string };
      if (!res.ok || !data.orderId) throw new Error(data.error || 'Failed to create order.');

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay!({
          key: data.keyId,
          amount: data.amount,
          currency: data.currency || 'INR',
          name: 'Docrud',
          description: `Feature: ${data.planLabel}`,
          order_id: data.orderId,
          prefill: {},
          theme: { color: '#7C3AED' },
          handler: async (response: unknown) => {
            const r = response as { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
            try {
              const vRes = await fetch('/api/feature-post/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...r, postId, plan: selected }),
              });
              const vData = await vRes.json() as { success?: boolean; error?: string };
              if (!vRes.ok || !vData.success) throw new Error(vData.error || 'Verification failed.');
              resolve();
            } catch (e) { reject(e); }
          },
        });
        rzp.on('payment.failed', (resp: unknown) => {
          const r = resp as { error?: { description?: string } };
          reject(new Error(r?.error?.description || 'Payment failed.'));
        });
        rzp.open();
      });

      setDone(true);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
        <div className="w-full max-w-sm rounded-[24px] border border-white/[0.09] bg-[#0D0D0F] p-8 text-center shadow-[0_32px_80px_rgba(0,0,0,0.8)]" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-center mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            </div>
          </div>
          <h3 className="text-lg font-bold text-white mb-1">Post Featured!</h3>
          <p className="text-[13px] text-white/40 mb-1">Your post is now featured on the feed.</p>
          <p className="text-[11px] text-white/25 mb-6">Invoice sent to your registered email.</p>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-[13px] bg-white py-2.5 text-[13px] font-bold text-[#0D0D0F] transition hover:bg-white/90"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#0D0D0F] shadow-[0_40px_100px_rgba(0,0,0,0.9)]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-5">
          <div>
            <h2 className="text-base font-bold text-white">Feature this post</h2>
            <p className="mt-0.5 text-[11.5px] text-white/35 truncate max-w-[320px]">{postTitle}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-white/40 transition hover:bg-white/[0.12] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-5">
          {PLANS.map((plan) => {
            const active = selected === plan.key;
            return (
              <button
                key={plan.key}
                type="button"
                onClick={() => setSelected(plan.key)}
                className={[
                  'relative flex flex-col rounded-[20px] border p-4 text-left transition-all duration-200',
                  active
                    ? `bg-gradient-to-br ${plan.color} border-white/[0.15] ring-1 ${plan.ring} scale-[1.02]`
                    : 'border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06]',
                ].join(' ')}
              >
                {'popular' in plan && plan.popular && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-violet-500 px-3 py-0.5 text-[10px] font-bold text-white shadow">Most Popular</span>
                )}
                <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-2xl ${plan.badge}`}>
                  <plan.Icon className="h-4.5 w-4.5" />
                </div>
                <p className="text-[13px] font-bold text-white">{plan.name}</p>
                <p className="text-[11px] text-white/35 mb-3">{plan.days} days</p>
                <p className="text-xl font-black text-white">{plan.priceLabel}</p>
                <p className="text-[10px] text-white/25 mb-3">{plan.gstLabel} = {plan.totalLabel}</p>
                <ul className="space-y-1.5">
                  {plan.perks.map((perk) => (
                    <li key={perk} className="flex items-start gap-1.5 text-[10.5px] text-white/45">
                      <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-white/30" />
                      {perk}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        {error && (
          <div className="mx-5 mb-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.07] px-4 py-2.5 text-[12px] text-rose-400">{error}</div>
        )}
        <div className="flex items-center gap-3 border-t border-white/[0.07] px-5 py-4">
          <button
            type="button"
            onClick={handlePay}
            disabled={loading}
            className="flex-1 rounded-[13px] bg-white py-2.5 text-[13px] font-bold text-[#0D0D0F] transition hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing…' : `Pay ${PLANS.find((p) => p.key === selected)?.totalLabel} & Feature`}
          </button>
          <a
            href="/api/billing/overview"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-[13px] border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[12px] text-white/40 transition hover:text-white/70"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Billing
          </a>
        </div>
        <p className="px-5 pb-4 text-[10px] text-white/20">Secured by Razorpay. GST invoice sent to your registered email. No refunds after featuring begins.</p>
      </div>
    </div>
  );
}
