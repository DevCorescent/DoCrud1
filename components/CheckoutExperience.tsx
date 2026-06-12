'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, CreditCard, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { CustomPlanConfiguration, SaasPlan } from '@/types/document';

type CheckoutExperienceProps = {
  plan: SaasPlan;
  customConfiguration?: CustomPlanConfiguration | null;
  referralCode?: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

function formatCurrency(amountInPaise: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amountInPaise / 100);
}

export default function CheckoutExperience({ plan, customConfiguration, referralCode }: CheckoutExperienceProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'gateway' | 'fallback' | 'initial'>('initial');
  const [gstin, setGstin] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [availableCoupons, setAvailableCoupons] = useState<Array<{ id: string; code: string; percentOff: number }>>([]);

  const pricing = useMemo(() => {
    const base = customConfiguration?.estimatedMonthlySubtotalInPaise ?? plan.amountInPaise ?? 0;
    const effectiveCoupon = referralCode ? null : ((appliedCoupon || couponCode).trim().toUpperCase() || null);
    const coupon = effectiveCoupon ? availableCoupons.find((c) => c.code === effectiveCoupon) : null;
    const discount = referralCode
      ? Math.round(base * 0.5)
      : coupon
        ? Math.round(base * (coupon.percentOff / 100))
        : 0;
    const discountedBase = Math.max(0, base - discount);
    const gst = Math.round(discountedBase * 0.18);
    const total = discountedBase + gst;
    return { base, discount, gst, total };
  }, [customConfiguration?.estimatedMonthlySubtotalInPaise, plan.amountInPaise, referralCode, appliedCoupon, couponCode, availableCoupons]);

  useEffect(() => {
    if (!referralCode) return;
    setAppliedCoupon(null);
    setCouponCode('');
  }, [referralCode]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch('/api/billing/coupons/public?limit=6', { cache: 'no-store' });
        const payload = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok) return;
        setAvailableCoupons(Array.isArray(payload?.coupons) ? payload.coupons : []);
      } catch {
        // ignore
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const loadRazorpayScript = async () => {
    if (typeof window === 'undefined') {
      return false;
    }
    if (window.Razorpay) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const completeFallbackCheckout = async () => {
    const response = await fetch('/api/billing/mock-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: plan.id, customConfiguration }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || 'Unable to activate this plan.');
    }
    setMode('fallback');
    router.replace(payload?.redirectTo || `/welcome?plan=${encodeURIComponent(plan.id)}`);
    router.refresh();
  };

  const activateFreePlan = async () => {
    const response = await fetch('/api/billing/activate-free', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: plan.id, customConfiguration }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || 'Unable to activate this free plan.');
    }
    router.replace(payload?.redirectTo || `/welcome?plan=${encodeURIComponent(plan.id)}`);
    router.refresh();
  };

  const handleProceed = async () => {
    try {
      setBusy(true);
      setError('');
      if (plan.billingModel === 'free') {
        await activateFreePlan();
        return;
      }
      const response = await fetch('/api/billing/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id,
          customConfiguration,
          gstin: gstin.trim(),
          couponCode: referralCode ? '' : ((appliedCoupon || couponCode).trim()),
          referralCode: referralCode ? referralCode.trim() : '',
        }),
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.order?.id && payload?.keyId) {
        const loaded = await loadRazorpayScript();
        if (loaded && window.Razorpay) {
          setMode('gateway');
          const instance = new window.Razorpay({
            key: payload.keyId,
            amount: payload.pricing?.totalAmountInPaise,
            currency: 'INR',
            name: 'docrud',
            description: `Checkout for ${plan.name}`,
            order_id: payload.order.id,
            handler: async (gatewayPayload: Record<string, string>) => {
              try {
                const verifyResponse = await fetch('/api/billing/verify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(gatewayPayload),
                });
                const verifyPayload = await verifyResponse.json().catch(() => null);
                if (!verifyResponse.ok) {
                  throw new Error(verifyPayload?.error || 'Payment verification failed.');
                }
                router.replace(`/welcome?plan=${encodeURIComponent(plan.id)}`);
                router.refresh();
              } catch (verificationError) {
                setBusy(false);
                setError(verificationError instanceof Error ? verificationError.message : 'Payment verification failed.');
              }
            },
            modal: {
              ondismiss: () => {
                setBusy(false);
              },
            },
            prefill: {
              name: payload.customer?.name || '',
              email: payload.customer?.email || '',
            },
            notes: {
              planId: plan.id,
              planName: plan.name,
            },
            theme: {
              color: '#0f172a',
            },
          });
          instance.on('payment.failed', (...args: unknown[]) => {
            const event = args[0] as { error?: { description?: string; reason?: string; source?: string } } | undefined;
            setBusy(false);
            setError(
              event?.error?.description
              || event?.error?.reason
              || 'Payment could not be completed. Please retry.',
            );
          });
          instance.open();
          return;
        }
        throw new Error('Razorpay checkout script could not be loaded on this device.');
      }
      if (payload?.fallbackAvailable) {
        await completeFallbackCheckout();
        return;
      }
      throw new Error(payload?.error || 'Unable to create checkout for this plan.');
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to complete checkout.');
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-8 px-2 py-10 sm:px-6 lg:px-12">
      <section className="grid gap-8 md:grid-cols-2 xl:grid-cols-[1.1fr_0.9fr]">
        {/* Plan Details & Transparency */}
        <Card className="rounded-3xl border-white/80 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-2xl w-full">
          <CardContent className="space-y-8 p-6 sm:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
              <CreditCard className="h-3.5 w-3.5 text-slate-900" />
              Checkout
            </div>
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-slate-950">{plan.billingModel === 'free' ? `Start ${plan.name}` : `Activate ${plan.name}`}</h1>
              <p className="mt-3 text-base leading-7 text-slate-600">
                {plan.billingModel === 'free'
                  ? 'Review your 30-day workspace trial and activate it instantly. Non-AI features open immediately, and a few AI tries are included to help habit form before upgrade.'
                  : 'Review your workspace plan and billing details before activation. Payment is processed securely via Razorpay, and the monthly subscription activates immediately after successful verification.'}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Plan</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{plan.name}</p>
                <p className="mt-2 text-base leading-6 text-slate-600">{plan.description}</p>
                <p className="mt-2 text-xs text-slate-500">Billing: <span className="font-semibold capitalize text-slate-700">{plan.billingModel === 'subscription' ? 'Recurring subscription' : plan.billingModel === 'payg' ? 'Pay as you go' : plan.billingModel}</span></p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-6 flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Usage</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{customConfiguration?.maxDocumentGenerations || plan.maxDocumentGenerations} documents</p>
                <p className="mt-2 text-base leading-6 text-slate-600">{plan.overagePriceLabel || 'No overage note configured for this plan.'}</p>
                {plan.includedFeatures && plan.includedFeatures.length > 0 && (
                  <ul className="mt-2 ml-2 list-disc text-xs text-slate-500">
                    {Array.from(new Set([...(plan.includedFeatures || []), ...(customConfiguration?.featureKeys || [])])).slice(0, 8).map((f: string) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-950">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 flex-none" />
                  <p>
                    Secure payment via Razorpay. Billing history, GST, invoices, and entitlements are recorded as soon as the purchase is completed.
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sm leading-6 text-sky-950">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" />
                  <p>Upgrade once and keep your docrud workspace running without interruptions across documents, file flows, and AI surfaces.</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-5 text-xs text-slate-600">
              <div className="mb-1 font-semibold text-slate-700">Transparency & Support</div>
              <ul className="list-disc ml-4 space-y-1">
                <li>Full refund available within 7 days if not satisfied (see <a href='/refund-and-cancellation-policy' className='underline'>policy</a>).</li>
                <li>Invoices and GST details are emailed after purchase.</li>
                <li>Cancel or change your plan anytime from your account dashboard.</li>
                <li>Need help? <a href='/support' className='underline'>Contact support</a> for any billing or plan questions.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Order Summary */}
        <Card className="rounded-3xl border-slate-900 bg-slate-950 text-white shadow-[0_24px_80px_rgba(15,23,42,0.16)] w-full">
          <CardContent className="space-y-8 p-6 sm:p-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">Order summary</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight">Transparent billing breakdown</h2>
            </div>

            <div className="space-y-3 rounded-2xl bg-white/10 p-5">
              <div className="flex items-center justify-between gap-4 text-base text-slate-200">
                <span>Base plan price</span>
                <span className="font-semibold text-white">{formatCurrency(pricing.base)}</span>
              </div>
              {pricing.discount ? (
                <div className="flex items-center justify-between gap-4 text-base text-slate-200">
                  <span>Discount</span>
                  <span className="font-semibold text-white">- {formatCurrency(pricing.discount)}</span>
                </div>
              ) : null}
              {customConfiguration ? (
                <div className="flex items-center justify-between gap-4 text-base text-slate-200">
                  <span>Custom scope</span>
                  <span className="font-semibold text-white">
                    {customConfiguration.featureKeys.length} features · {(customConfiguration.maxInternalUsers || plan.maxInternalUsers || 0)} users
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-4 text-base text-slate-200">
                <span>GST 18%</span>
                <span className="font-semibold text-white">{formatCurrency(pricing.gst)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-3">
                <span className="text-lg font-semibold text-white">Payable total</span>
                <span className="text-3xl font-bold text-white">{formatCurrency(pricing.total)}</span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">Business GST</p>
                <input
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value)}
                  placeholder="GSTIN (optional)"
                  className="mt-3 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-slate-400 outline-none focus:border-white/20"
                />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">Coupon code</p>
                {referralCode ? (
                  <div className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">
                    Referral applied · 50% OFF
                  </div>
                ) : (
                  <>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {availableCoupons.map((coupon) => (
                        <button
                          key={coupon.id}
                          type="button"
                          onClick={() => {
                            setAppliedCoupon(coupon.code);
                            setCouponCode(coupon.code);
                          }}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            (appliedCoupon || couponCode).trim().toUpperCase() === coupon.code
                              ? 'border-white bg-white text-slate-950'
                              : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                          }`}
                        >
                          {coupon.code} · {coupon.percentOff}% OFF
                        </button>
                      ))}
                    </div>
                    <input
                      value={couponCode}
                      onChange={(e) => {
                        setCouponCode(e.target.value);
                        setAppliedCoupon(null);
                      }}
                      placeholder="Enter coupon code"
                      className="mt-3 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-slate-400 outline-none focus:border-white/20"
                    />
                  </>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {[
                plan.billingModel === 'free' ? 'Free workspace activates instantly.' : 'Plan activates immediately after payment.',
                plan.billingModel === 'free' ? 'Trial limits, non-AI features, and free AI tries are applied to your account.' : 'GST, invoice, and billing records are created for your account.',
                'You are taken to a welcome screen and then into your workspace.',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 text-base text-slate-200">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-300" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            {error ? (
              <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-base text-rose-100">
                {error}
              </div>
            ) : null}

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs leading-6 text-slate-300">
              {mode === 'fallback'
                ? 'Mock checkout was used because explicit development fallback is enabled in this environment.'
                : plan.billingModel === 'free'
                  ? 'No payment is needed for this activation. Your selected docrud Workspace Trial will be provisioned immediately.'
                  : 'Secure Razorpay checkout is required for this purchase. If checkout fails, the message shown here comes directly from order creation or payment verification.'}
            </div>

            <Button
              type="button"
              onClick={() => void handleProceed()}
              disabled={busy}
              className="h-14 w-full rounded-xl bg-white text-slate-950 hover:bg-slate-100 text-lg font-bold"
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Preparing checkout...
                </>
              ) : (
                <>
                  {plan.billingModel === 'free' ? 'Activate Trial Workspace' : 'Proceed to Payment'}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
