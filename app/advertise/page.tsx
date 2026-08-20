'use client';

/**
 * Advertiser campaign manager.
 *
 * Create a campaign, pay for it with the existing Razorpay checkout, then wait
 * for Superadmin approval. Paying never publishes an ad by itself — the server
 * moves a verified payment to PENDING_APPROVAL and stops there.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Upload } from 'lucide-react';

type Ad = {
  id: string; title: string; subtitle?: string; imageUrl: string;
  ctaLabel?: string; ctaHref?: string;
  targetDomain?: string[]; targetProfession?: string[]; targetSkills?: string[]; targetLocation?: string[];
  durationDays: number; feeInPaise: number;
  paymentStatus: string; status: string; rejectionReason?: string;
  impressions: number; clicks: number; startAt?: string; endAt?: string;
};

const LABEL = 'block text-[11px] font-bold uppercase tracking-[0.14em] text-white/32 mb-2';
const FIELD = 'w-full rounded-[12px] border border-white/[0.08] bg-white/[0.04] text-white px-3.5 text-[13.5px] placeholder:text-white/20 focus:outline-none focus:border-white/25 transition-colors';
const INPUT = `${FIELD} h-11`;
const SECTION = 'rounded-[20px] border border-white/[0.07] bg-[#0d0d10] p-5';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', payment_pending: 'Payment pending', payment_success: 'Paid',
  pending_approval: 'Awaiting approval', active: 'Active', rejected: 'Rejected',
  expired: 'Expired', disabled: 'Disabled',
};

export default function AdvertisePage() {
  const router = useRouter();
  const [ads, setAds] = useState<Ad[] | null>(null);
  const [unauthorised, setUnauthorised] = useState(false);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaHref, setCtaHref] = useState('');
  const [domain, setDomain] = useState('');
  const [skills, setSkills] = useState('');
  const [location, setLocation] = useState('');
  const [durationDays, setDurationDays] = useState(7);
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/ads');
    if (res.status === 401) { setUnauthorised(true); setAds([]); return; }
    const d = await res.json().catch(() => ({ ads: [] }));
    setAds(Array.isArray(d.ads) ? d.ads : []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const upload = async (file: File) => {
    setUploading(true); setError(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/ads/upload', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.url) { setError(d.error || 'Upload failed.'); return; }
      setImageUrl(d.url);
    } finally { setUploading(false); }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setNotice(null);
    if (!title.trim()) { setError('Give the campaign a title.'); return; }
    if (!imageUrl) { setError('Upload a creative image.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/ads', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title, subtitle, ctaLabel, ctaHref, imageUrl, durationDays,
          targetDomain: domain.split(',').map(s => s.trim()).filter(Boolean),
          targetSkills: skills.split(',').map(s => s.trim()).filter(Boolean),
          targetLocation: location.split(',').map(s => s.trim()).filter(Boolean),
        }),
      });
      if (res.status === 401) { router.push('/login?next=/advertise'); return; }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || 'Could not create the campaign.'); return; }
      setTitle(''); setSubtitle(''); setCtaLabel(''); setCtaHref('');
      setDomain(''); setSkills(''); setLocation(''); setImageUrl('');
      setNotice('Campaign saved as a draft. Pay to submit it for approval.');
      await load();
    } finally { setSaving(false); }
  };

  /* Checkout: the server creates the order and computes the fee. The signature
     is verified server-side; a verified payment lands in "Awaiting approval". */
  const pay = async (ad: Ad) => {
    setError(null); setNotice(null); setPayingId(ad.id);
    try {
      const res = await fetch(`/api/ads/${ad.id}/checkout`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || 'Could not start payment.'); return; }

      if (!window.Razorpay) { setError('Payment library is unavailable. Please retry.'); return; }
      const rzp = new window.Razorpay({
        key: d.keyId, order_id: d.orderId, amount: d.amountInPaise, currency: d.currency || 'INR',
        name: 'Docrud', description: `Sponsored campaign — ${ad.title}`,
        handler: async (resp: Record<string, string>) => {
          const v = await fetch('/api/ads/verify', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ adId: ad.id, ...resp }),
          });
          const vd = await v.json().catch(() => ({}));
          if (!v.ok) setError(vd.error || 'Payment verification failed.');
          else setNotice('Payment verified. Your campaign is now awaiting Superadmin approval.');
          await load();
        },
      });
      rzp.open();
    } finally { setPayingId(null); }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-white">
      <script src="https://checkout.razorpay.com/v1/checkout.js" async />
      <header className="sticky top-0 z-30 border-b border-white/[0.06]"
        style={{ height: 56, background: 'rgba(10,10,12,0.96)', backdropFilter: 'blur(20px) saturate(180%)' }}>
        <div className="mx-auto flex h-full max-w-3xl items-center gap-3 px-4">
          <button type="button" onClick={() => router.back()} aria-label="Go back"
            className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-white/48 hover:text-white transition-all">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-[15px] font-bold tracking-[-0.01em]">Advertise on Docrud</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 pb-24 space-y-4">
        {unauthorised && (
          <div className={SECTION}>
            <p className="text-[13.5px] text-white/60">Sign in to create and manage advertising campaigns.</p>
            <Link href="/login?next=/advertise" className="mt-3 inline-flex h-10 items-center rounded-[13px] border border-white/[0.10] bg-white/[0.04] px-6 text-[13.5px] font-semibold text-white/60 hover:text-white/85">
              Sign in
            </Link>
          </div>
        )}

        {!unauthorised && (
          <form onSubmit={create} className="space-y-4">
            <div className={SECTION}>
              <label className={LABEL} htmlFor="a-title">Campaign title</label>
              <input id="a-title" value={title} onChange={e => setTitle(e.target.value)} className={INPUT} placeholder="Backend Developer Hiring" />

              <label className={`${LABEL} mt-5`} htmlFor="a-sub">Description</label>
              <textarea id="a-sub" value={subtitle} onChange={e => setSubtitle(e.target.value)} rows={3}
                className={`${FIELD} py-3 resize-y leading-relaxed`} placeholder="One or two lines shown under the title." />

              <label className={`${LABEL} mt-5`}>Creative</label>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-white/[0.10] bg-white/[0.05] px-4 text-[13px] font-semibold text-white/70 hover:bg-white/[0.09] disabled:opacity-50">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {imageUrl ? 'Replace image' : 'Upload image'}
                </button>
                {imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={imageUrl} alt="" className="h-11 w-20 rounded-[8px] object-cover" data-no-invert />
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
            </div>

            <div className={SECTION}>
              <label className={LABEL} htmlFor="a-cta">Call to action</label>
              <div className="grid grid-cols-2 gap-2">
                <input id="a-cta" value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} className={INPUT} placeholder="View" />
                <input value={ctaHref} onChange={e => setCtaHref(e.target.value)} className={INPUT} placeholder="https://…" />
              </div>

              <p className={`${LABEL} mt-5`}>Targeting (comma separated, leave blank for everyone)</p>
              <div className="space-y-2">
                <input value={domain} onChange={e => setDomain(e.target.value)} className={INPUT} placeholder="Domain — e.g. Software Development" />
                <input value={skills} onChange={e => setSkills(e.target.value)} className={INPUT} placeholder="Skills — e.g. React, Node.js" />
                <input value={location} onChange={e => setLocation(e.target.value)} className={INPUT} placeholder="Location — e.g. Bengaluru" />
              </div>

              <label className={`${LABEL} mt-5`} htmlFor="a-days">Duration (days)</label>
              <input id="a-days" type="number" min={1} max={90} value={durationDays}
                onChange={e => setDurationDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))} className={INPUT} />
              <p className="mt-1.5 text-[11.5px] text-white/30">
                Fee is calculated by the server when you pay — ₹200 per day.
              </p>
            </div>

            {error && <p role="alert" className="rounded-[12px] border border-rose-500/25 bg-rose-500/[0.08] px-4 py-3 text-[12.5px] font-semibold text-rose-200/90">{error}</p>}
            {notice && <p role="status" className="rounded-[12px] border border-emerald-500/25 bg-emerald-500/[0.08] px-4 py-3 text-[12.5px] font-semibold text-emerald-200/90">{notice}</p>}

            <button type="submit" disabled={saving}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-white/[0.14] bg-white/[0.08] text-[14.5px] font-bold text-white/90 transition-all hover:bg-white/[0.13] disabled:opacity-60">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save draft
            </button>
          </form>
        )}

        {ads && ads.length > 0 && (
          <div className={SECTION}>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/32">Your campaigns</p>
            <div className="space-y-2">
              {ads.map(ad => (
                <div key={ad.id} className="rounded-[12px] border border-white/[0.07] bg-white/[0.02] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-white/90">{ad.title}</p>
                      <p className="mt-0.5 text-[11.5px] text-white/40">
                        {STATUS_LABEL[ad.status] ?? ad.status} · {ad.durationDays} days · ₹{(ad.feeInPaise / 100).toLocaleString()}
                      </p>
                      {ad.rejectionReason && <p className="mt-1 text-[11.5px] text-rose-300/70">Rejected: {ad.rejectionReason}</p>}
                      {/* Advertisers see only their own campaign performance. */}
                      <p className="mt-1 text-[11px] text-white/28">
                        {ad.impressions.toLocaleString()} impressions · {ad.clicks.toLocaleString()} clicks
                        {ad.impressions > 0 ? ` · ${((ad.clicks / ad.impressions) * 100).toFixed(2)}% CTR` : ''}
                      </p>
                    </div>
                    {(ad.status === 'draft' || ad.status === 'payment_pending') && (
                      <button type="button" onClick={() => void pay(ad)} disabled={payingId === ad.id}
                        className="shrink-0 inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-white/[0.14] bg-white/[0.08] px-4 text-[12.5px] font-semibold text-white/85 hover:bg-white/[0.13] disabled:opacity-50">
                        {payingId === ad.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Pay
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
