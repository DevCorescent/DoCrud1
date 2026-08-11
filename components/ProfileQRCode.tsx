'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { QrCode, X, Copy, Check, Download, Share2, Loader2, RotateCcw } from 'lucide-react';
import { getProfileUrl } from '@/lib/utils/profile-qr';

export interface ProfileQRCodeProps {
  userId: string;
  userName: string;
}

/** `Alex O'Brien!` -> `alex-o-brien` — safe for a Content-Disposition filename. */
function sanitizeFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'profile';
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Profile QR share dialog.
 *
 * The QR is fetched ONLY when the dialog opens — the closed button costs no
 * network request, so the profile's initial load is unchanged. The SVG is
 * fetched once as text and rendered through an object URL, which lets the same
 * blob serve both the preview and the download without a second request and
 * without injecting markup or base64-encoding anything.
 */
export default function ProfileQRCode({ userId, userName }: ProfileQRCodeProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>('idle');
  const [qrObjectUrl, setQrObjectUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Resolved on the client so the link carries the real origin in every
  // environment. Origin logic itself lives in lib/utils/profile-qr.ts.
  const [profileUrl, setProfileUrl] = useState('');
  useEffect(() => {
    setProfileUrl(getProfileUrl(userId, window.location.origin));
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, [userId]);

  const releaseObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  useEffect(() => releaseObjectUrl, [releaseObjectUrl]);

  const loadQr = useCallback(async () => {
    setState('loading');
    setNotice(null);
    try {
      const response = await fetch(`/api/public/profile/${encodeURIComponent(userId)}/qr?size=512`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const svg = await response.text();
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      releaseObjectUrl();
      blobRef.current = blob;
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setQrObjectUrl(url);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [userId, releaseObjectUrl]);

  const handleOpen = useCallback(() => {
    setOpen(true);
    // Lazy: the first request for this QR happens here, never on page load.
    if (state === 'idle' || state === 'error') void loadQr();
  }, [state, loadQr]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setNotice(null);
    setCopied(false);
    triggerRef.current?.focus();
  }, []);

  /* Escape to close + focus the dialog when it opens */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    closeRef.current?.focus();
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, handleClose]);

  const handleCopy = useCallback(async () => {
    if (!profileUrl) return;
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setNotice(null);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice('Unable to copy link.');
    }
  }, [profileUrl]);

  const handleDownload = useCallback(() => {
    if (!qrObjectUrl) return;
    try {
      const anchor = document.createElement('a');
      anchor.href = qrObjectUrl;
      anchor.download = `docrud-${sanitizeFileName(userName)}-profile-qr.svg`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setNotice(null);
    } catch {
      setNotice('Unable to download QR.');
    }
  }, [qrObjectUrl, userName]);

  const handleShare = useCallback(async () => {
    if (!profileUrl) return;
    try {
      await navigator.share({
        title: `${userName} | Docrud`,
        text: `View ${userName}'s Docrud profile`,
        url: profileUrl,
      });
      setNotice(null);
    } catch (error) {
      // The user dismissing the share sheet is not an error worth surfacing.
      if ((error as Error)?.name === 'AbortError') return;
      setNotice('Unable to share right now.');
    }
  }, [profileUrl, userName]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        aria-label="Share profile QR code"
        title="Share profile QR code"
        className="flex items-center gap-2 h-9 px-3 rounded-[12px] border border-white/[0.10] bg-white/[0.04] text-white/70 text-sm hover:bg-white/[0.08] hover:text-white/90 transition-colors active:scale-95"
      >
        <QrCode className="h-3.5 w-3.5" />
        <span className="hidden sm:inline text-xs">QR</span>
      </button>

      {/*
        Portaled to <body>: rendered inline, the dialog inherits an ancestor
        stacking context on the profile page, which let the fixed GlobalBottomNav
        (z-index 9995) paint over the action buttons on mobile. The same fix the
        existing QRShareDialog uses. `pb` clears the nav's 62px bar + 18px offset.
      */}
      {open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-end md:items-center justify-center pb-[92px] md:pb-0">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden="true"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-qr-title"
            className="relative z-10 w-full md:max-w-sm md:mx-4 bg-[#111113] border border-white/[0.08] rounded-t-[28px] md:rounded-[24px] flex flex-col max-h-[calc(92vh-62px)] md:max-h-[88vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07] shrink-0">
              <h2 id="profile-qr-title" className="font-semibold text-white">Share profile</h2>
              <button
                ref={closeRef}
                type="button"
                onClick={handleClose}
                aria-label="Close"
                className="h-8 w-8 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.10] transition-colors"
              >
                <X className="h-4 w-4 text-white/60" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto px-6 py-5 flex-1">
              {/* QR panel — always on white so the code scans regardless of theme */}
              <div className="mx-auto w-full max-w-[260px] aspect-square rounded-[20px] bg-white border border-white/[0.08] flex items-center justify-center overflow-hidden p-3">
                {state === 'loading' && (
                  <Loader2 className="h-6 w-6 animate-spin text-black/30" aria-label="Generating QR code" />
                )}
                {state === 'ready' && qrObjectUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={qrObjectUrl}
                    alt={`QR code for ${userName}'s Docrud profile`}
                    className="h-full w-full object-contain"
                  />
                )}
                {state === 'error' && (
                  <div className="px-4 text-center">
                    <p className="text-[13px] text-black/70">Unable to generate QR. Please try again.</p>
                    <button
                      type="button"
                      onClick={() => void loadQr()}
                      className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-[10px] border border-black/10 bg-black/[0.04] text-black/70 text-xs font-medium hover:bg-black/[0.08] transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Try again
                    </button>
                  </div>
                )}
              </div>

              {/* Profile URL */}
              <p className="mt-4 text-center text-[11.5px] text-white/40 break-all">{profileUrl}</p>

              {/* Actions */}
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="flex items-center justify-center gap-2 h-10 rounded-[12px] border border-white/[0.10] bg-white/[0.04] text-white/80 text-sm hover:bg-white/[0.08] transition-colors"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy Profile Link'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={state !== 'ready'}
                    className="flex-1 flex items-center justify-center gap-2 h-10 rounded-[12px] border border-white/[0.10] bg-white/[0.04] text-white/70 text-sm hover:bg-white/[0.08] hover:text-white/90 transition-colors disabled:opacity-40"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                  {canShare && (
                    <button
                      type="button"
                      onClick={() => void handleShare()}
                      className="flex-1 flex items-center justify-center gap-2 h-10 rounded-[12px] border border-white/[0.10] bg-white/[0.04] text-white/70 text-sm hover:bg-white/[0.08] hover:text-white/90 transition-colors"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      Share
                    </button>
                  )}
                </div>
              </div>

              {notice && (
                <p role="status" className="mt-3 text-center text-[12px] text-rose-400/90">{notice}</p>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
