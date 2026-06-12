'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowLeft, Copy, Download, Loader2, Mail, MessageCircle, QrCode, Share2, ShoppingCart, Star } from 'lucide-react';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { Button } from '@/components/ui/button';
import type { LandingSettings, DocumentField, DocumentTemplate } from '@/types/document';
import { renderDocumentTemplate } from '@/lib/template';
import { buildQrImageUrl } from '@/lib/url';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

type MarketplaceItem = {
  id: string;
  templateSnapshot: DocumentTemplate;
  sellerUserId: string;
  sellerName?: string;
  priceInPaise: number;
  currency: 'INR';
  tags: string[];
  coverImageDataUrl?: string;
  exampleData?: Record<string, string>;
  previewImageDataUrls?: string[];
  purchaseCount: number;
  updatedAt: string;
};

type Review = {
  id: string;
  buyerName?: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title?: string;
  body?: string;
  createdAt: string;
};

function formatInr(paise: number) {
  const value = Math.max(0, Number(paise || 0)) / 100;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

async function loadRazorpayScript() {
  if (typeof window === 'undefined') return false;
  if (window.Razorpay) return true;
  return await new Promise<boolean>((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function buildSampleData(fields: DocumentField[]) {
  const sample: Record<string, string> = {};
  for (const f of fields) {
    if (f.type === 'date') sample[f.name] = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date());
    else if (f.type === 'number') sample[f.name] = '1000';
    else if (f.type === 'email') sample[f.name] = 'recipient@company.com';
    else if (f.type === 'tel') sample[f.name] = '+91 98XXXXXX10';
    else if (f.type === 'url') sample[f.name] = 'https://docrud.app';
    else if (f.type === 'textarea') sample[f.name] = 'Replace this text with your content.';
    else if ((f.type === 'select' || f.type === 'radio') && f.options?.length) sample[f.name] = f.options[0]!;
    else if (f.type === 'checkbox') sample[f.name] = 'true';
    else sample[f.name] = f.placeholder || 'Value';
  }
  return sample;
}

export default function PublicTemplateMarketplaceItemPage(props: {
  settings: LandingSettings;
  softwareName: string;
  accentLabel: string;
  itemId: string;
}) {
  const { data: session, status } = useSession();
  const [item, setItem] = useState<MarketplaceItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [ratingSummary, setRatingSummary] = useState<{ average: number; count: number }>({ average: 0, count: 0 });
  const [reviewDraft, setReviewDraft] = useState({ rating: 5, title: '', body: '' });
  const [activePreviewPage, setActivePreviewPage] = useState(0);
  const previewStripRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const res = await fetch(`/api/template-marketplace/items/${encodeURIComponent(props.itemId)}`, { signal: controller.signal });
        const payload = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok) throw new Error(payload?.error || 'Template not found.');
        setItem(payload.item || null);
      } catch (err) {
        if (!active) return;
        setItem(null);
        setError(err instanceof Error ? err.message : 'Template not found.');
      } finally {
        if (!active) return;
        setLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [props.itemId]);

  useEffect(() => {
    if (!props.itemId) return;
    let active = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/template-marketplace/reviews?itemId=${encodeURIComponent(props.itemId)}`, { signal: controller.signal });
        const payload = await res.json().catch(() => null);
        if (!active || !payload) return;
        setReviews(Array.isArray(payload.reviews) ? payload.reviews : []);
        setRatingSummary(payload.rating && typeof payload.rating === 'object' ? payload.rating : { average: 0, count: 0 });
      } catch {
        if (!active) return;
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [props.itemId]);

  const marketplacePath = useMemo(() => (item ? `/template-marketplace/${encodeURIComponent(item.id)}` : ''), [item?.id]);
  const shareUrl = useMemo(() => {
    if (!marketplacePath) return '';
    if (typeof window === 'undefined') return marketplacePath;
    return `${window.location.origin}${marketplacePath}`;
  }, [marketplacePath]);
  const shareText = useMemo(() => {
    if (!item) return '';
    const priceLabel = item.priceInPaise > 0 ? formatInr(item.priceInPaise) : 'Free';
    const seller = item.sellerName ? ` · by ${item.sellerName}` : '';
    return `${item.templateSnapshot.name} · ${item.templateSnapshot.category} · ${priceLabel}${seller}\n${shareUrl}`;
  }, [item, shareUrl]);
  const shareQrUrl = useMemo(() => {
    if (!marketplacePath) return '';
    return buildQrImageUrl(marketplacePath, typeof window !== 'undefined' ? window.location.origin : undefined, 220);
  }, [marketplacePath]);

  const copyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareNote('Link copied.');
      window.setTimeout(() => setShareNote(''), 1800);
    } catch {
      setShareNote('Unable to copy link on this device.');
      window.setTimeout(() => setShareNote(''), 2200);
    }
  };

  const nativeShare = async () => {
    if (!shareUrl || !item) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: item.templateSnapshot.name, text: shareText, url: shareUrl });
        return;
      }
    } catch {
      // fallback
    }
    await copyShareLink();
  };

  const shareWhatsApp = () => {
    if (!shareUrl) return;
    const text = encodeURIComponent(shareText);
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const shareEmail = () => {
    if (!shareUrl || !item) return;
    const subject = encodeURIComponent(`Template: ${item.templateSnapshot.name}`);
    const body = encodeURIComponent(shareText);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const previewHtml = useMemo(() => {
    if (!item?.templateSnapshot) return '';
    const tpl = item.templateSnapshot;
    const sample = (item as any)?.exampleData && typeof (item as any).exampleData === 'object'
      ? { ...(item as any).exampleData }
      : buildSampleData(tpl.fields || []);
    (sample as any).title = tpl.name || 'Template';
    (sample as any).summary = tpl.description || '';
    return renderDocumentTemplate(tpl, sample, {
      generatedBy: 'docrud marketplace preview',
      renderMode: 'plain',
      watermarkLabel: 'EXAMPLE',
      ...((tpl.renderSettings?.pageSize ? {
        pageSize: tpl.renderSettings.pageSize === 'Custom' ? 'A4' : tpl.renderSettings.pageSize,
        pageWidthMm: tpl.renderSettings.pageSize === 'Custom' ? tpl.renderSettings.pageWidthMm : undefined,
        pageHeightMm: tpl.renderSettings.pageSize === 'Custom' ? tpl.renderSettings.pageHeightMm : undefined,
        pageMarginMm: tpl.renderSettings.pageMarginMm,
        pageNumbersEnabled: Boolean(tpl.renderSettings.pageNumbersEnabled),
        pageBackgroundCss: typeof tpl.renderSettings.pageBackgroundCss === 'string' ? tpl.renderSettings.pageBackgroundCss : undefined,
      } : {}) as any),
    });
  }, [item]);

  const pagePx = useMemo(() => {
    const settings = item?.templateSnapshot?.renderSettings;
    const pxPerMm = 96 / 25.4;
    const size = settings?.pageSize && settings.pageSize !== 'Custom' ? settings.pageSize : 'A4';
    const wMm = settings?.pageSize === 'Custom' && settings.pageWidthMm ? settings.pageWidthMm : (size === 'Letter' ? 215.9 : size === 'Legal' ? 215.9 : 210);
    const hMm = settings?.pageSize === 'Custom' && settings.pageHeightMm ? settings.pageHeightMm : (size === 'Letter' ? 279.4 : size === 'Legal' ? 355.6 : 297);
    return { w: Math.round(wMm * pxPerMm), h: Math.round(hMm * pxPerMm) };
  }, [item?.templateSnapshot?.renderSettings]);

  const previewHtmlFit = useMemo(() => {
    const html = String(previewHtml || '');
    if (!html) return '';
    const pxPerMm = 96 / 25.4;
    const settings = item?.templateSnapshot?.renderSettings;
    const marginMm = Number.isFinite(settings?.pageMarginMm as any) ? Number(settings?.pageMarginMm) : 16;
    const marginPx = Math.max(0, Math.round(marginMm * pxPerMm));
    const fitCss = `
      html, body { height: 100% !important; overflow: hidden !important; }
      *::-webkit-scrollbar { display: none !important; }
      .page { margin: 0 auto !important; }
      /* Stabilize physical units (mm) on mobile by forcing a px-based page box for preview. */
      .page { width: ${pagePx.w}px !important; min-height: ${pagePx.h}px !important; padding: ${marginPx}px !important; }
    `.trim();
    return html.includes('</head>')
      ? html.replace('</head>', `<style>${fitCss}</style></head>`)
      : html;
  }, [item?.templateSnapshot?.renderSettings, pagePx.h, pagePx.w, previewHtml]);

  const [previewScale, setPreviewScale] = useState(1);
  const previewShellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = previewShellRef.current;
    if (!el) return;
    const compute = () => {
      const width = Math.max(0, (el.clientWidth || 0) - 8);
      const height = Math.max(0, (el.clientHeight || 0) - 8);
      if (!width || !height) return;
      const scale = Math.max(
        0.18,
        Math.min(1, Math.min(width / Math.max(1, pagePx.w), height / Math.max(1, pagePx.h)) * 0.98)
      );
      setPreviewScale(scale);
    };
    compute();
    const obs = new ResizeObserver(() => compute());
    obs.observe(el);
    return () => obs.disconnect();
  }, [pagePx.h, pagePx.w]);

  const installFree = async () => {
    if (!item) return;
    if (status !== 'authenticated' || !session?.user?.id) {
      window.location.href = '/login';
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/template-marketplace/install-free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Unable to install template.');
      window.location.href = '/workspace?tab=generate';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to install template.');
    } finally {
      setBusy(false);
    }
  };

  const setMarketplaceStatus = async (statusValue: 'published' | 'archived') => {
    if (!item) return;
    if (status !== 'authenticated' || !session?.user?.id) {
      window.location.href = '/login';
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/template-marketplace/items/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusValue }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Unable to update status.');
      setItem(payload.item || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update status.');
    } finally {
      setBusy(false);
    }
  };

  const deleteItem = async () => {
    if (!item) return;
    if (status !== 'authenticated' || !session?.user?.id) {
      window.location.href = '/login';
      return;
    }
    const ok = window.confirm('Delete this template from the marketplace? This cannot be undone.');
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/template-marketplace/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Unable to delete template.');
      window.location.href = '/template-marketplace';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete template.');
    } finally {
      setBusy(false);
    }
  };

  const purchase = async () => {
    if (!item) return;
    if (status !== 'authenticated' || !session?.user?.id) {
      window.location.href = '/login';
      return;
    }
    setBusy(true);
    setError('');
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) throw new Error('Razorpay checkout is unavailable on this device.');

      const createRes = await fetch('/api/template-marketplace/purchase/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });
      const createPayload = await createRes.json().catch(() => null);
      if (!createRes.ok) throw new Error(createPayload?.error || 'Unable to start checkout.');

      const checkout = createPayload?.checkout as any;
      const purchaseId = String(createPayload?.purchase?.id || '');

      const instance = new window.Razorpay({
        key: checkout.keyId,
        amount: checkout.amountInPaise,
        currency: checkout.currency,
        name: checkout.name,
        description: checkout.description,
        order_id: checkout.orderId,
        prefill: checkout.prefill || {},
        notes: checkout.notes || {},
        theme: { color: '#2C5DA9' },
        handler: async (response: any) => {
          try {
            const verifyRes = await fetch('/api/template-marketplace/purchase/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                purchaseId,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verifyPayload = await verifyRes.json().catch(() => null);
            if (!verifyRes.ok) throw new Error(verifyPayload?.error || 'Payment verification failed.');
            window.location.href = '/workspace?tab=generate';
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Payment verification failed.');
          }
        },
      });
      instance.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to purchase template.');
    } finally {
      setBusy(false);
    }
  };

  const submitReview = async () => {
    if (!item) return;
    if (status !== 'authenticated' || !session?.user?.id) {
      window.location.href = '/login';
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/template-marketplace/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: item.id,
          rating: reviewDraft.rating,
          title: reviewDraft.title,
          body: reviewDraft.body,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Unable to save review.');
      // refresh
      const next = await fetch(`/api/template-marketplace/reviews?itemId=${encodeURIComponent(item.id)}`).then((r) => r.json()).catch(() => null);
      if (next) {
        setReviews(Array.isArray(next.reviews) ? next.reviews : []);
        setRatingSummary(next.rating && typeof next.rating === 'object' ? next.rating : { average: 0, count: 0 });
      }
      setReviewDraft({ rating: 5, title: '', body: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save review.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicSiteChrome softwareName={props.softwareName} accentLabel={props.accentLabel} settings={props.settings}>
      <section className="cloud-panel relative overflow-hidden rounded-[2rem] border border-white/60 p-5 shadow-[0_22px_60px_rgba(148,163,184,0.14)] sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(44,93,169,0.26),transparent_40%),radial-gradient(circle_at_86%_18%,rgba(232,84,69,0.20),transparent_45%),linear-gradient(135deg,rgba(255,255,255,0.92),rgba(236,244,255,0.84),rgba(255,255,255,0.80))]" />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/template-marketplace" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-950">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <div className="flex items-center gap-2">
              {shareNote ? (
                <span className="hidden sm:inline-flex rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700 backdrop-blur-xl">
                  {shareNote}
                </span>
              ) : null}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 text-sm font-semibold text-slate-700 backdrop-blur-xl transition hover:bg-white/85 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/70"
                    title="Share"
                    aria-label="Share template"
                  >
                    <Share2 className="h-4 w-4" />
                    Share
                    <span className="text-base leading-none">▾</span>
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={10}
                    collisionPadding={16}
                    className="navbar-glass z-[95] w-[min(calc(100vw-1.5rem),20rem)] rounded-[1.35rem] border-0 p-2 text-slate-950 shadow-[0_26px_64px_rgba(15,23,42,0.14)] backdrop-blur-2xl"
                  >
                    <div className="px-2 pb-2 pt-1">
                      <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500">Share</p>
                      {item ? (
                        <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-900">
                          {item.templateSnapshot.name}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <DropdownMenu.Item asChild>
                        <button
                          type="button"
                          onClick={() => void nativeShare()}
                          className="flex w-full items-center gap-2 rounded-[1rem] px-3 py-2.5 text-left text-sm font-semibold text-slate-900 outline-none transition hover:bg-white/70 focus:bg-white/70"
                        >
                          <Share2 className="h-4 w-4 text-slate-700" />
                          Share via device
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button
                          type="button"
                          onClick={() => void copyShareLink()}
                          className="flex w-full items-center gap-2 rounded-[1rem] px-3 py-2.5 text-left text-sm font-semibold text-slate-900 outline-none transition hover:bg-white/70 focus:bg-white/70"
                        >
                          <Copy className="h-4 w-4 text-slate-600" />
                          Copy link
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button
                          type="button"
                          onClick={shareWhatsApp}
                          className="flex w-full items-center gap-2 rounded-[1rem] px-3 py-2.5 text-left text-sm font-semibold text-slate-900 outline-none transition hover:bg-white/70 focus:bg-white/70"
                        >
                          <MessageCircle className="h-4 w-4 text-emerald-600" />
                          WhatsApp
                        </button>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <button
                          type="button"
                          onClick={shareEmail}
                          className="flex w-full items-center gap-2 rounded-[1rem] px-3 py-2.5 text-left text-sm font-semibold text-slate-900 outline-none transition hover:bg-white/70 focus:bg-white/70"
                        >
                          <Mail className="h-4 w-4 text-sky-600" />
                          Email
                        </button>
                      </DropdownMenu.Item>
                      {shareQrUrl ? (
                        <DropdownMenu.Item asChild>
                          <a
                            href={shareQrUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex w-full items-center gap-2 rounded-[1rem] px-3 py-2.5 text-left text-sm font-semibold text-slate-900 outline-none transition hover:bg-white/70 focus:bg-white/70"
                          >
                            <QrCode className="h-4 w-4 text-violet-600" />
                            QR code
                          </a>
                        </DropdownMenu.Item>
                      ) : null}
                    </div>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>

              <Link href="/workspace?tab=generate" className="text-sm font-semibold text-slate-700 hover:text-slate-950">
                Open workspace
              </Link>
            </div>
          </div>

          {loading ? (
            <div className="mt-6 rounded-[1.5rem] border border-white/70 bg-white/70 p-6 text-sm text-slate-600">
              Loading…
            </div>
          ) : !item ? (
            <div className="mt-6 rounded-[1.5rem] border border-rose-200 bg-rose-50/80 p-6 text-sm text-rose-800">
              {error || 'Template not found.'}
            </div>
          ) : (
            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
              <div className="min-w-0 overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/78 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
                <div className="flex items-center justify-between gap-3 border-b border-white/70 bg-white/70 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold tracking-[-0.02em] text-slate-950">{item.templateSnapshot.name}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {item.templateSnapshot.category} · by{' '}
                      <Link href={`/template-marketplace/seller/${encodeURIComponent(item.sellerUserId)}`} className="font-semibold text-slate-800 hover:text-slate-950">
                        {item.sellerName || 'Seller'}
                      </Link>
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-white/80 bg-white/70 px-3 py-1 text-[11px] font-semibold text-slate-700">
                    {item.priceInPaise > 0 ? formatInr(item.priceInPaise) : 'Free'}
                  </span>
                </div>
                <div className="bg-white">
                  {/* Mobile: remove inline preview. Use PDF preview download instead. */}
                  <div className="sm:hidden p-4">
                    <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4">
                      <p className="text-sm font-semibold text-slate-950">Preview</p>
                      <p className="mt-1 text-xs text-slate-600">Download a PDF preview with an EXAMPLE watermark.</p>
                      <a
                        href={`/api/template-marketplace/items/${encodeURIComponent(item.id)}/preview-pdf`}
                        className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-full bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-900"
                      >
                        Download PDF preview
                      </a>
                    </div>
                  </div>

                  {/* Desktop/tablet: keep preview on-screen. */}
                  <div className="hidden sm:block">
                    {Array.isArray(item.previewImageDataUrls) && item.previewImageDataUrls.length ? (
                      <div className="p-4">
                        <div
                          ref={previewStripRef}
                          className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                          onScroll={() => {
                            const el = previewStripRef.current;
                            if (!el) return;
                            const child = el.firstElementChild as HTMLElement | null;
                            const w = child?.getBoundingClientRect().width || 0;
                            if (!w) return;
                            const idx = Math.max(0, Math.round(el.scrollLeft / (w + 12)));
                            setActivePreviewPage(Math.min(idx, Math.max(0, item.previewImageDataUrls!.length - 1)));
                          }}
                        >
                          {item.previewImageDataUrls.slice(0, 10).map((src, idx) => (
                            <div key={`preview-${item.id}-${idx}`} className="w-full shrink-0 snap-center">
                              <div className="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white">
                                <div className="aspect-[210/297] w-full bg-white">
                                  <img src={src} alt={`Preview page ${idx + 1}`} className="h-full w-full object-contain" loading="lazy" />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {item.previewImageDataUrls.length > 1 ? (
                          <div className="mt-2 flex items-center justify-center gap-1.5">
                            {item.previewImageDataUrls.slice(0, 10).map((_, idx) => (
                              <span
                                key={`dot-${item.id}-${idx}`}
                                className={`h-1.5 w-1.5 rounded-full ${idx === activePreviewPage ? 'bg-slate-900' : 'bg-slate-300'}`}
                                aria-hidden="true"
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <iframe title="Template preview" className="h-[78vh] w-full" srcDoc={previewHtml} />
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[1.75rem] border border-white/70 bg-white/78 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
                  <p className="text-sm font-semibold text-slate-950">Install into your workspace</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {item.templateSnapshot.description || 'A marketplace template ready for fast reuse.'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.tags.slice(0, 8).map((tag) => (
                      <span key={`${item.id}-tag-${tag}`} className="rounded-full border border-white/80 bg-white/70 px-3 py-1 text-[11px] font-semibold text-slate-700">
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      className="h-10 rounded-full bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
                      onClick={() => (item.priceInPaise > 0 ? void purchase() : void installFree())}
                      disabled={busy}
                    >
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-2 h-4 w-4" />}
                      {item.priceInPaise > 0 ? 'Buy & Install' : 'Install free'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-full bg-white/70"
                      onClick={() => {
                        const blob = new Blob([previewHtml], { type: 'text/html' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${item.templateSnapshot.name || 'template'}.html`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download preview
                    </Button>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">{item.purchaseCount} installs</p>
                </div>

                {(session?.user?.id && (session.user.id === item.sellerUserId || session.user.role === 'admin')) ? (
                  <div className="rounded-[1.75rem] border border-white/70 bg-white/78 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
                    <p className="text-sm font-semibold text-slate-950">Manage listing</p>
                    <p className="mt-1 text-xs text-slate-600">Only visible to the template publisher.</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-full bg-white/70"
                        onClick={() => void setMarketplaceStatus('archived')}
                        disabled={busy}
                      >
                        Deactivate
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-full bg-white/70"
                        onClick={() => void setMarketplaceStatus('published')}
                        disabled={busy}
                      >
                        Activate
                      </Button>
                      <Button
                        type="button"
                        className="h-10 rounded-full bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700"
                        onClick={() => void deleteItem()}
                        disabled={busy || (item.purchaseCount || 0) > 0}
                        title={(item.purchaseCount || 0) > 0 ? 'Delete is disabled after installs. Use Deactivate.' : 'Delete listing'}
                      >
                        Delete
                      </Button>
                    </div>
                    {(item.purchaseCount || 0) > 0 ? (
                      <p className="mt-3 text-xs text-slate-600">Delete is disabled after installs. Deactivate hides it from marketplace.</p>
                    ) : null}
                  </div>
                ) : null}

                <div className="rounded-[1.75rem] border border-white/70 bg-white/78 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-950">Ratings</p>
                    <div className="flex items-center gap-1 text-sm font-semibold text-slate-800">
                      <Star className="h-4 w-4 text-amber-500" />
                      {ratingSummary.average || 0} <span className="text-xs text-slate-500">({ratingSummary.count})</span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2">
                    {reviews.slice(0, 4).map((r) => (
                      <div key={r.id} className="rounded-[1.25rem] border border-white/70 bg-white/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-950">{r.buyerName || 'Buyer'}</p>
                          <div className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                            <Star className="h-3.5 w-3.5 text-amber-500" />
                            {r.rating}
                          </div>
                        </div>
                        {r.title ? <p className="mt-2 text-sm font-semibold text-slate-900">{r.title}</p> : null}
                        {r.body ? <p className="mt-2 text-sm leading-6 text-slate-600">{r.body}</p> : null}
                      </div>
                    ))}
                    {!reviews.length ? (
                      <div className="rounded-[1.25rem] border border-dashed border-white/70 bg-white/60 p-4 text-sm text-slate-600">
                        No reviews yet.
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 rounded-[1.25rem] border border-white/70 bg-white/70 p-4">
                    <p className="text-sm font-semibold text-slate-950">Write a review</p>
                    <p className="mt-1 text-xs text-slate-600">Requires purchase/installation.</p>
                    <div className="mt-3 grid gap-2">
                      <select
                        value={reviewDraft.rating}
                        onChange={(e) => setReviewDraft((c) => ({ ...c, rating: Number(e.target.value || 5) }))}
                        className="h-10 w-full rounded-full border border-white/70 bg-white/70 px-4 text-sm font-semibold text-slate-900"
                      >
                        {[5, 4, 3, 2, 1].map((v) => (
                          <option key={`rate-${v}`} value={v}>{v} stars</option>
                        ))}
                      </select>
                      <input
                        value={reviewDraft.title}
                        onChange={(e) => setReviewDraft((c) => ({ ...c, title: e.target.value }))}
                        placeholder="Title (optional)"
                        className="h-10 w-full rounded-full border border-white/70 bg-white/70 px-4 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-500"
                      />
                      <textarea
                        value={reviewDraft.body}
                        onChange={(e) => setReviewDraft((c) => ({ ...c, body: e.target.value }))}
                        placeholder="Share what worked well"
                        className="min-h-[92px] w-full rounded-[1.1rem] border border-white/70 bg-white/70 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-500"
                      />
                      <Button type="button" className="h-10 rounded-full bg-slate-950 text-white hover:bg-slate-800" onClick={() => void submitReview()} disabled={busy}>
                        Submit review
                      </Button>
                    </div>
                  </div>
                </div>

                {error ? (
                  <div className="rounded-[1.25rem] border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-800">
                    {error}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </section>
    </PublicSiteChrome>
  );
}
