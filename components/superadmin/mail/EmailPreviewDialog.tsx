'use client';

/**
 * The one email preview.
 *
 * Compose, Drafts, Templates, Campaigns and System Emails all render this.
 * Each screen used to own its preview, and two of them substituted
 * `{{variables}}` in the browser with their own inline regex - a second and
 * third rendering path that the server never saw. What an admin approved and
 * what a recipient received were related only by good intentions.
 *
 * Everything shown here comes from POST /api/super-admin/mail/preview: the
 * sanitized body, the resolved subject, the plain-text alternative and the
 * variable report. This component computes nothing about the email itself.
 *
 * The body renders inside a SANDBOXED iframe rather than being injected into
 * the admin page. Two reasons, and the second matters more:
 *
 * 1. Email HTML carries its own layout and styling. Injected into the panel it
 *    inherits the panel's CSS and looks like nothing an inbox would show; in a
 *    frame it gets a real viewport, which is what makes a mobile preview a
 *    preview rather than a narrow div.
 * 2. `sandbox` with no `allow-scripts` means nothing in that markup can run,
 *    even if the sanitizer were one day wrong. The preview stops being a place
 *    where a bad paste could execute against an authenticated super-admin
 *    session.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { describeFetchError } from '@/lib/email/session-error';

export type PreviewSource = 'compose' | 'draft' | 'template' | 'campaign' | 'system';
export type PreviewMode = 'desktop' | 'mobile' | 'text';

interface VariableReport {
  supported: string[]; used: string[]; unsupported: string[]; missing: string[];
}

interface CampaignContext {
  title: string;
  recipientCount: number | null;
  audienceDescription: string | null;
  status: string;
}

interface PreviewPayload {
  subject: string;
  html: string;
  text: string;
  modified: boolean;
  variables: VariableReport;
  sampleData: Record<string, string>;
  usesSampleData: boolean;
  securitySensitive: boolean;
  contract: string;
  campaign: CampaignContext | null;
}

export interface EmailPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  source: PreviewSource;
  /** The system email type. Required when `source` is 'system'. */
  type?: string;
  /** CURRENT editor content - never a saved copy. */
  subject: string;
  html: string;
  preheader?: string;
  /** Adds audience size and the send warning to a campaign preview. */
  campaignId?: string;
  initialMode?: PreviewMode;
}

const BTN =
  'rounded-lg border border-zinc-700 px-3 py-1.5 text-[12px] font-medium text-zinc-200 transition '
  + 'hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 '
  + 'disabled:opacity-60';
const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500';
const CHIP = 'rounded-full px-2 py-0.5 text-[10px] font-medium';

const MODES: PreviewMode[] = ['desktop', 'mobile', 'text'];

/* Widths chosen to mean something: 640px is the width most email clients give
   a message on a desktop, 390px is a common phone viewport. */
const FRAME_WIDTH: Record<PreviewMode, number> = { desktop: 640, mobile: 390, text: 640 };

export default function EmailPreviewDialog(props: EmailPreviewDialogProps) {
  const { open, onClose, source, type, subject, html, preheader, campaignId } = props;

  const [mode, setMode] = useState<PreviewMode>(props.initialMode ?? 'desktop');
  const [data, setData] = useState<PreviewPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const closeRef = useRef<HTMLButtonElement | null>(null);

  /* Fetched from the CURRENT props every time the dialog opens, so unsaved
     edits are what gets previewed. Nothing is cached between openings - a
     stale preview is worse than a slow one. */
  const load = useCallback(async () => {
    setLoading(true); setError(''); setData(null);
    try {
      const r = await fetch('/api/super-admin/mail/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, type, subject, html, preheader, campaignId }),
      });
      const payload = await r.json().catch(() => null);
      if (!r.ok) { setError(describeFetchError(r.status, payload?.error, 'Unable to build the preview.')); return; }
      setData(payload as PreviewPayload);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [source, type, subject, html, preheader, campaignId]);

  useEffect(() => {
    if (!open) return;
    setMode(props.initialMode ?? 'desktop');
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, load]);

  /* Escape closes, and focus lands on the dialog rather than staying behind it. */
  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const v = data?.variables;
  const blocked = (v?.unsupported.length ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/75 p-3 sm:p-4"
      onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Email preview"
        className="my-auto w-full max-w-3xl space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-3 sm:p-4"
        onClick={(e) => e.stopPropagation()}>

        {/* Header: mode switch and close */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex rounded-lg border border-zinc-800 p-0.5" role="group" aria-label="Preview mode">
            {MODES.map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
                className={`rounded-md px-2.5 py-1 text-[11px] capitalize transition ${
                  mode === m ? 'bg-amber-500 font-semibold text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800'}`}>
                {m === 'text' ? 'Plain text' : m}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void load()} disabled={loading} className={BTN}>
              {loading ? 'Building…' : 'Refresh'}
            </button>
            <button type="button" ref={closeRef} onClick={onClose} className={BTN}>Close</button>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
            {error}
          </p>
        )}
        {loading && !data && (
          <p aria-live="polite" className="text-[12px] text-zinc-500">Rendering on the server…</p>
        )}

        {data && (
          <>
            {/* Subject, resolved - section 4 */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <p className={LABEL}>Subject</p>
              <p className="mt-1 break-words text-[13px] font-semibold text-zinc-100">
                {data.subject || '(no subject)'}
              </p>
              {data.usesSampleData && (
                <p className="mt-1.5 text-[11px] text-amber-300">
                  Preview uses sample data. Real sends resolve these values per recipient.
                </p>
              )}
              {data.securitySensitive && (
                <p className="mt-1 text-[11px] font-semibold text-amber-200">
                  This is not a real OTP or token — nothing here generates a working credential.
                </p>
              )}
            </div>

            {/* Campaign context - section 12 */}
            {data.campaign && (
              <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className={LABEL}>Campaign</p>
                <p className="text-[12px] text-zinc-200">{data.campaign.title}</p>
                <p className="text-[12px] text-zinc-400">
                  Audience: {data.campaign.audienceDescription || 'Not described'}
                </p>
                <p className="text-[12px] text-zinc-400">
                  {data.campaign.recipientCount === null
                    ? 'Recipient count is resolved on the server at send time.'
                    /* Resolved server-side. The browser never supplies this. */
                    : `${data.campaign.recipientCount.toLocaleString()} recipient(s), resolved on the server.`}
                </p>
                <p className="text-[12px] font-semibold text-amber-200">
                  Sending cannot be undone. There is no recall once the provider accepts a message.
                </p>
              </div>
            )}

            {/* Variables - section 5 */}
            {v && (v.used.length > 0 || v.supported.length > 0) && (
              <div className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <p className={LABEL}>Variables · {data.contract}</p>
                <div className="flex flex-wrap gap-1">
                  {v.supported.map((name) => (
                    <span key={name}
                      className={`${CHIP} ${v.used.includes(name)
                        ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-800 text-zinc-400'}`}>
                      {`{{${name}}}`}
                    </span>
                  ))}
                </div>
                {v.unsupported.length > 0 && (
                  <p role="alert" className="text-[11px] text-rose-300">
                    Not supported by this email: {v.unsupported.map((n) => `{{${n}}}`).join(', ')}.
                    Remove them — publishing and test sending are blocked until you do.
                  </p>
                )}
                {v.missing.length > 0 && (
                  <p className="text-[11px] text-amber-300">
                    No value supplied for {v.missing.map((n) => `{{${n}}}`).join(', ')}.
                  </p>
                )}
              </div>
            )}

            {data.modified && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                The server removed or rewrote part of this HTML while sanitizing. What you see below
                is what would actually be sent.
              </p>
            )}

            {/* The message */}
            <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2">
              {mode === 'text' ? (
                <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words p-2 text-[12px] leading-relaxed text-zinc-300">
                  {data.text || '(empty)'}
                </pre>
              ) : (
                <iframe
                  title={`${mode} email preview`}
                  /* No allow-scripts: nothing in the message can execute. */
                  sandbox=""
                  srcDoc={`<!doctype html><html><head><meta charset="utf-8">`
                    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
                    + `<style>html,body{margin:0;padding:0;background:#fff;}</style></head>`
                    + `<body>${data.html}</body></html>`}
                  style={{ width: FRAME_WIDTH[mode], maxWidth: '100%' }}
                  className="mx-auto block h-[55vh] rounded border-0 bg-white"
                />
              )}
            </div>

            <p className="text-[11px] leading-relaxed text-zinc-500">
              Rendered by the server through the same pipeline that sends the email: sanitize,
              validate variables, resolve, then generate plain text.
              {blocked && ' Unsupported variables must be removed before this can be sent.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
