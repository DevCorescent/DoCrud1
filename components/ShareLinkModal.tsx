'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check, Clock, Copy, Download, ExternalLink, FileText,
  Globe, KeyRound, Link2, Lock, Mail, MessageCircle,
  RefreshCw, Share2, Shield, ShieldCheck, X, Zap,
} from 'lucide-react';

export interface ShareHistoryEntry {
  id: string;
  templateName: string;
  uploadedPdfFileName?: string;
  documentSourceType?: 'generated' | 'uploaded_pdf';
  shareId?: string;
  shareUrl?: string;
  sharePassword?: string;
  shareAccessPolicy?: 'standard' | 'expiring' | 'one_time';
  shareExpiresAt?: string;
  maxAccessCount?: number;
  openCount?: number;
  recipientSignedAt?: string;
  generatedAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  currentEntry?: ShareHistoryEntry | null;
  history: ShareHistoryEntry[];
  shareAccessPolicy: 'standard' | 'expiring' | 'one_time';
  setShareAccessPolicy: (v: 'standard' | 'expiring' | 'one_time') => void;
  shareExpiryDays: string;
  setShareExpiryDays: (v: string) => void;
  maxAccessCount: string;
  setMaxAccessCount: (v: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onOpenLink: (entry: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onCopyLink: (entry: any) => Promise<void> | void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onEmail: (entry: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onWhatsApp: (entry: any) => void;
}

type Tab = 'share' | 'security' | 'track';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function isExpired(entry: ShareHistoryEntry): boolean {
  if (entry.shareAccessPolicy !== 'expiring' || !entry.shareExpiresAt) return false;
  return new Date(entry.shareExpiresAt).getTime() < Date.now();
}

export default function ShareLinkModal({
  open, onClose, currentEntry, history,
  shareAccessPolicy, setShareAccessPolicy,
  shareExpiryDays, setShareExpiryDays,
  maxAccessCount, setMaxAccessCount,
  onOpenLink, onCopyLink, onEmail, onWhatsApp,
}: Props) {
  const [tab, setTab] = useState<Tab>('share');
  const [copied, setCopied] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => { setIsMounted(true); }, []);
  useEffect(() => { if (open) setTab('share'); }, [open]);
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [open, onClose]);

  async function handleCopy(entry: ShareHistoryEntry) {
    await onCopyLink(entry);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!isMounted || !open) return null;

  const entry = currentEntry;
  const policyLabel: Record<string, string> = {
    standard: 'Standard',
    expiring: 'Expiring',
    one_time: 'One-time',
  };
  const policyIcon: Record<string, typeof Shield> = {
    standard: Globe,
    expiring: Clock,
    one_time: Lock,
  };
  const PolicyIcon = policyIcon[shareAccessPolicy] ?? Globe;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-[6px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative w-full sm:max-w-[520px] mx-auto rounded-t-[28px] sm:rounded-[28px] overflow-hidden"
        style={{
          background: '#0D0D0F',
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.90)',
          animation: 'share-modal-in 0.30s cubic-bezier(0.32,0.72,0,1) both',
        }}
      >
        <style>{`
          @keyframes share-modal-in {
            from { opacity: 0; transform: translateY(24px) scale(0.98); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-white/[0.06] ring-1 ring-white/[0.10]">
              <Share2 className="h-4 w-4 text-white/70" />
            </div>
            <div>
              <p className="text-[14px] font-bold text-white leading-tight">
                {entry?.uploadedPdfFileName || entry?.templateName || 'Secure Share'}
              </p>
              <p className="text-[11px] text-white/35 mt-0.5">
                {entry ? `Password: ${entry.sharePassword}` : 'No link generated yet'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/40 transition hover:bg-white/[0.10] hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-4 pb-0">
          {(['share', 'security', 'track'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`h-8 px-4 rounded-[10px] text-[12px] font-semibold transition capitalize ${
                tab === t
                  ? 'bg-white/[0.10] text-white border border-white/[0.12]'
                  : 'text-white/35 hover:text-white/65 hover:bg-white/[0.04]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="mt-4 h-px bg-white/[0.06] mx-5" />

        {/* Content */}
        <div className="px-5 py-4 max-h-[72vh] overflow-y-auto overscroll-contain">

          {/* ── Share tab ── */}
          {tab === 'share' && (
            <div className="space-y-4">
              {!entry ? (
                <div className="rounded-[18px] border border-dashed border-white/[0.10] p-8 text-center">
                  <Share2 className="h-8 w-8 text-white/15 mx-auto mb-3" />
                  <p className="text-[13px] text-white/30 font-medium">No link generated yet</p>
                  <p className="text-[11px] text-white/20 mt-1">Generate a preview first, then come back to share.</p>
                </div>
              ) : (
                <>
                  {/* Link card */}
                  <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30">Secure link</p>
                      <div className="flex items-center gap-1.5">
                        <PolicyIcon className="h-3 w-3 text-white/30" />
                        <span className="text-[10px] text-white/30">{policyLabel[entry.shareAccessPolicy || 'standard']}</span>
                        {isExpired(entry) && (
                          <span className="rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-400">Expired</span>
                        )}
                      </div>
                    </div>

                    {/* URL pill */}
                    <div className="flex items-center gap-2 rounded-[12px] border border-white/[0.07] bg-black/40 px-3 py-2.5 mb-3">
                      <Link2 className="h-3.5 w-3.5 shrink-0 text-white/25" />
                      <p className="flex-1 min-w-0 text-[11px] text-white/50 truncate font-mono">
                        {typeof window !== 'undefined'
                          ? `${window.location.origin}${entry.shareId ? `/documents/${entry.shareId}` : (entry.shareUrl || '')}`
                          : entry.shareId ? `/documents/${entry.shareId}` : entry.shareUrl || ''}
                      </p>
                    </div>

                    {/* Password */}
                    {entry.sharePassword && (
                      <div className="flex items-center gap-2 rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-3 py-2 mb-3">
                        <KeyRound className="h-3 w-3 shrink-0 text-amber-400/70" />
                        <p className="text-[11px] text-white/40">Password:</p>
                        <p className="text-[12px] font-bold text-amber-300/80 font-mono ml-1">{entry.sharePassword}</p>
                      </div>
                    )}

                    {/* Opens */}
                    {(entry.openCount ?? 0) > 0 && (
                      <p className="text-[10px] text-white/25 mb-3">
                        Opened {entry.openCount} time{entry.openCount !== 1 ? 's' : ''}
                      </p>
                    )}

                    {/* Action buttons */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopy(entry)}
                        className="flex h-9 items-center justify-center gap-2 rounded-[12px] border border-white/[0.10] bg-white/[0.06] text-[12px] font-semibold text-white/70 transition hover:bg-white/[0.12] hover:text-white"
                      >
                        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? 'Copied!' : 'Copy link'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenLink(entry)}
                        className="flex h-9 items-center justify-center gap-2 rounded-[12px] border border-white/[0.10] bg-white/[0.06] text-[12px] font-semibold text-white/70 transition hover:bg-white/[0.12] hover:text-white"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => onEmail(entry)}
                        className="flex h-9 items-center justify-center gap-2 rounded-[12px] border border-white/[0.10] bg-white/[0.06] text-[12px] font-semibold text-white/70 transition hover:bg-white/[0.12] hover:text-white"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Email
                      </button>
                      <button
                        type="button"
                        onClick={() => onWhatsApp(entry)}
                        className="flex h-9 items-center justify-center gap-2 rounded-[12px] border border-white/[0.10] bg-white/[0.06] text-[12px] font-semibold text-white/70 transition hover:bg-white/[0.12] hover:text-white"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        WhatsApp
                      </button>
                    </div>
                  </div>

                  {/* Status card */}
                  <div className="rounded-[18px] border border-white/[0.06] bg-white/[0.02] px-4 py-3 flex items-center gap-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${entry.recipientSignedAt ? 'bg-emerald-500/[0.12]' : 'bg-amber-500/[0.10]'}`}>
                      {entry.recipientSignedAt
                        ? <Check className="h-3.5 w-3.5 text-emerald-400" />
                        : <RefreshCw className="h-3.5 w-3.5 text-amber-400" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-white/70">
                        {entry.recipientSignedAt ? 'Signed' : 'Awaiting signature'}
                      </p>
                      <p className="text-[10px] text-white/25 mt-0.5">
                        {entry.recipientSignedAt
                          ? `Signed ${timeAgo(entry.recipientSignedAt)}`
                          : `Created ${timeAgo(entry.generatedAt)}`}
                      </p>
                    </div>
                    {entry.recipientSignedAt && entry.shareId && entry.sharePassword && (
                      <a
                        href={`/api/public/documents/${entry.shareId}/pdf?password=${encodeURIComponent(entry.sharePassword)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-8 items-center gap-1.5 rounded-[10px] border border-emerald-500/20 bg-emerald-500/[0.08] px-3 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/[0.14] transition"
                      >
                        <Download className="h-3 w-3" />
                        PDF
                      </a>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Security tab ── */}
          {tab === 'security' && (
            <div className="space-y-3">
              <p className="text-[11px] text-white/30 leading-relaxed">
                These settings apply when you create the next secure link. Changing them here takes effect on the next generation.
              </p>

              {/* Access policy */}
              <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30">Access policy</p>
                {(['standard', 'expiring', 'one_time'] as const).map((policy) => {
                  const icons = { standard: Globe, expiring: Clock, one_time: Lock };
                  const labels = { standard: 'Standard secure link', expiring: 'Expiring secure link', one_time: 'One-time secure link' };
                  const descs = {
                    standard: 'No expiry, unlimited opens.',
                    expiring: 'Link expires after a set number of days.',
                    one_time: 'Link becomes invalid after N opens.',
                  };
                  const Icon = icons[policy];
                  const active = shareAccessPolicy === policy;
                  return (
                    <button
                      key={policy}
                      type="button"
                      onClick={() => setShareAccessPolicy(policy)}
                      className={`w-full flex items-center gap-3 rounded-[14px] border px-4 py-3 text-left transition ${
                        active
                          ? 'border-white/[0.16] bg-white/[0.08]'
                          : 'border-white/[0.06] hover:border-white/[0.10] hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${active ? 'bg-white/[0.12]' : 'bg-white/[0.05]'}`}>
                        <Icon className={`h-3.5 w-3.5 ${active ? 'text-white/80' : 'text-white/35'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[12px] font-semibold ${active ? 'text-white/85' : 'text-white/45'}`}>{labels[policy]}</p>
                        <p className="text-[10.5px] text-white/25 mt-0.5">{descs[policy]}</p>
                      </div>
                      <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? 'border-white/60 bg-white/20' : 'border-white/20'}`}>
                        {active && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Conditional config */}
              {shareAccessPolicy === 'expiring' && (
                <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-4">
                  <label className="block text-[11px] font-semibold uppercase tracking-widest text-white/30 mb-3">Expires after (days)</label>
                  <input
                    type="number"
                    value={shareExpiryDays}
                    onChange={(e) => setShareExpiryDays(e.target.value)}
                    min="1"
                    max="365"
                    placeholder="7"
                    className="h-10 w-full rounded-[12px] border border-white/[0.10] bg-white/[0.05] px-3 text-[13px] text-white/80 placeholder-white/20 focus:outline-none focus:border-white/[0.20]"
                  />
                </div>
              )}

              {shareAccessPolicy === 'one_time' && (
                <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-4">
                  <label className="block text-[11px] font-semibold uppercase tracking-widest text-white/30 mb-3">Max opens allowed</label>
                  <input
                    type="number"
                    value={maxAccessCount}
                    onChange={(e) => setMaxAccessCount(e.target.value)}
                    min="1"
                    max="100"
                    placeholder="1"
                    className="h-10 w-full rounded-[12px] border border-white/[0.10] bg-white/[0.05] px-3 text-[13px] text-white/80 placeholder-white/20 focus:outline-none focus:border-white/[0.20]"
                  />
                </div>
              )}

              {/* Info */}
              <div className="flex items-start gap-2.5 rounded-[14px] border border-sky-500/[0.12] bg-sky-500/[0.05] px-3.5 py-3">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-sky-400/70 mt-0.5" />
                <p className="text-[11px] text-white/35 leading-relaxed">
                  All links are password-protected with a unique key and include a full access audit trail.
                </p>
              </div>
            </div>
          )}

          {/* ── Track tab ── */}
          {tab === 'track' && (
            <div className="space-y-3">
              {history.length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-white/[0.10] p-8 text-center">
                  <FileText className="h-8 w-8 text-white/15 mx-auto mb-3" />
                  <p className="text-[13px] text-white/30 font-medium">No links yet</p>
                  <p className="text-[11px] text-white/20 mt-1">Generate a document to create a secure share link.</p>
                </div>
              ) : (
                history.slice(0, 20).map((entry) => {
                  const expired = isExpired(entry);
                  const signed = Boolean(entry.recipientSignedAt);
                  return (
                    <div
                      key={entry.id}
                      className="rounded-[18px] border border-white/[0.06] bg-white/[0.02] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.06] mt-0.5">
                            <FileText className="h-3.5 w-3.5 text-white/35" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-semibold text-white/75 truncate">
                              {entry.uploadedPdfFileName || entry.templateName}
                            </p>
                            <p className="text-[10.5px] text-white/25 mt-0.5">
                              {timeAgo(entry.generatedAt)} · {entry.openCount ?? 0} open{(entry.openCount ?? 0) !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {expired ? (
                            <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[9.5px] font-bold text-rose-400">Expired</span>
                          ) : signed ? (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9.5px] font-bold text-emerald-400">Signed</span>
                          ) : (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9.5px] font-bold text-amber-400">Pending</span>
                          )}
                          <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold ${entry.documentSourceType === 'uploaded_pdf' ? 'bg-violet-500/15 text-violet-400' : 'bg-sky-500/15 text-sky-400'}`}>
                            {entry.documentSourceType === 'uploaded_pdf' ? 'PDF' : 'Doc'}
                          </span>
                        </div>
                      </div>

                      {/* Password + policy */}
                      {entry.sharePassword && (
                        <div className="mt-3 flex items-center gap-2">
                          <KeyRound className="h-3 w-3 shrink-0 text-white/20" />
                          <span className="text-[10.5px] text-white/30 font-mono">{entry.sharePassword}</span>
                          {entry.shareAccessPolicy && entry.shareAccessPolicy !== 'standard' && (
                            <span className="ml-1 text-[10px] text-white/20">· {policyLabel[entry.shareAccessPolicy]}</span>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void onCopyLink(entry)}
                          className="flex h-7 items-center gap-1 rounded-[9px] border border-white/[0.08] bg-white/[0.04] px-2.5 text-[11px] text-white/45 hover:text-white/80 hover:bg-white/[0.08] transition"
                        >
                          <Copy className="h-3 w-3" />
                          Copy
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenLink(entry)}
                          className="flex h-7 items-center gap-1 rounded-[9px] border border-white/[0.08] bg-white/[0.04] px-2.5 text-[11px] text-white/45 hover:text-white/80 hover:bg-white/[0.08] transition"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open
                        </button>
                        {signed && entry.shareId && entry.sharePassword && (
                          <a
                            href={`/api/public/documents/${entry.shareId}/pdf?password=${encodeURIComponent(entry.sharePassword)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex h-7 items-center gap-1 rounded-[9px] border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 text-[11px] text-emerald-400 hover:bg-emerald-500/[0.12] transition"
                          >
                            <Download className="h-3 w-3" />
                            Signed PDF
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.06] px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-white/20">
            <Zap className="h-3 w-3" />
            End-to-end encrypted · Audit tracked
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-[12px] font-semibold text-white/45 hover:bg-white/[0.09] hover:text-white/80 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
