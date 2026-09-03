'use client';

/**
 * Upload, replace or remove one company's mark. Super Admin only.
 *
 * ═══ CLICK, KEYBOARD, DROP ═══
 *
 * One hidden `<input type="file">` serves all three — which is also what makes
 * it work on a phone, where a tap opens the system picker and dropping does not
 * exist. The drop zone is a real `<button>`, so Enter and Space activate it and
 * it takes focus without any ARIA of its own.
 *
 * ═══ VALIDATION HAPPENS TWICE, ON PURPOSE ═══
 *
 * `validateCompanyLogoUpload` runs here so an obviously wrong file is refused
 * without a round trip. The server runs the SAME function and then reads the
 * file's magic bytes, which is the check that cannot be lied to. Nothing here
 * is a substitute for that.
 *
 * ═══ WHAT THE PREVIEW DOES NOT DO ═══
 *
 * An SVG is previewed through `<img src=blob:>`, never injected as markup —
 * `<img>` does not execute script even for an SVG, and there is no
 * dangerouslySetInnerHTML anywhere in this component. The uploaded SVG is not
 * trusted until the server has sanitised it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Trash2, UploadCloud } from 'lucide-react';
import {
  COMPANY_LOGO_ACCEPT, validateCompanyLogoUpload,
} from '@/lib/company-logo-uploads';
import { setCompanyLogoOverrides } from '@/lib/company-logos';
import CompanyLogo from './CompanyLogo';

type Phase = 'idle' | 'selected' | 'saving' | 'done' | 'error';

export interface CompanyLogoUploaderProps {
  companyId: string;
  companyName: string;
  /** The mark currently in use, whatever its source. */
  currentLogoUrl?: string;
  /** True when this company already has an UPLOADED mark, so it can be removed. */
  hasUpload: boolean;
  onChanged: () => void;
}

const KB = 1024;

export default function CompanyLogoUploader({
  companyId, companyName, currentLogoUrl, hasUpload, onChanged,
}: CompanyLogoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  /* Revoked on change and on unmount — a blob URL held forever is a leak. */
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const take = useCallback((files: FileList | File[] | null) => {
    if (phase === 'saving') return;
    const list = Array.from(files ?? []);
    const rejection = validateCompanyLogoUpload(
      list[0] ? { name: list[0].name, size: list[0].size, type: list[0].type } : null,
      list.length || 1,
    );
    if (rejection) { setFile(null); setPhase('error'); setMessage(rejection.message); return; }
    setFile(list[0]);
    setPhase('selected');
    setMessage('');
  }, [phase]);

  const save = async () => {
    if (!file || phase === 'saving') return;
    setPhase('saving');
    setMessage('');
    try {
      const form = new FormData();
      form.append('companyId', companyId);
      form.append('logo', file);
      const res = await fetch('/api/super-admin/company-logo', { method: 'POST', body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        /* The server's own reason — unsafe SVG, corrupt image, storage down —
           shown as-is rather than replaced with something vaguer. */
        setPhase('error');
        setMessage(data?.error ?? 'That logo could not be saved.');
        return;
      }
      /* Live immediately on every surface in this tab, without a reload. */
      if (data?.logo?.url) setCompanyLogoOverrides({ [companyId]: data.logo.url });
      setFile(null);
      setPhase('done');
      setMessage('Logo saved.');
      onChanged();
    } catch {
      setPhase('error');
      setMessage('The upload failed. Check your connection and try again.');
    }
  };

  const remove = async () => {
    if (phase === 'saving') return;
    setPhase('saving');
    setMessage('');
    try {
      const res = await fetch('/api/super-admin/company-logo', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setPhase('error');
        setMessage(data?.error ?? 'That logo could not be removed.');
        return;
      }
      setPhase('done');
      setMessage('Logo removed — this company now uses its automatic mark.');
      onChanged();
    } catch {
      setPhase('error');
      setMessage('The removal failed. Please try again.');
    }
  };

  const drop = {
    onDragEnter: (e: React.DragEvent) => { e.preventDefault(); depth.current += 1; setDragging(true); },
    /* Without this the browser navigates away to the dropped file. */
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      depth.current = 0; setDragging(false);
      take(e.dataTransfer?.files ?? null);
    },
  };

  const saving = phase === 'saving';

  return (
    <div className="mt-2 rounded-xl p-3"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="mb-2.5 flex items-center gap-2">
        <CompanyLogo name={companyName} logoUrl={currentLogoUrl} size={30} rounded={9} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-bold" style={{ color: 'rgba(255,255,255,0.86)' }}>
            {companyName}
          </p>
          <p className="text-[10.5px] font-semibold" style={{ color: 'rgba(255,255,255,0.34)' }}>
            {hasUpload ? 'Uploaded & verified' : 'Using automatic or fallback logo'}
          </p>
        </div>
        {hasUpload && (
          <button type="button" onClick={remove} disabled={saving}
            aria-label={`Remove uploaded logo for ${companyName}`}
            className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[10.5px] font-bold transition"
            style={{ color: 'rgba(248,113,113,0.9)', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.28)' }}>
            <Trash2 className="h-3 w-3" aria-hidden /> Remove
          </button>
        )}
      </div>

      <input ref={inputRef} type="file" accept={COMPANY_LOGO_ACCEPT} className="sr-only" tabIndex={-1}
        onChange={(e) => { const f = e.target.files; e.target.value = ''; take(f); }} />

      {/* A real button: focusable, Enter/Space activated, no ARIA needed. */}
      <button type="button" onClick={() => inputRef.current?.click()} disabled={saving} {...drop}
        className="flex w-full flex-col items-center justify-center gap-1 rounded-xl py-4 transition"
        style={{
          background: dragging ? 'rgba(167,139,250,0.10)' : 'rgba(255,255,255,0.02)',
          border: `1px dashed ${dragging ? 'rgba(167,139,250,0.55)' : 'rgba(255,255,255,0.14)'}`,
        }}>
        {saving
          ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'rgba(255,255,255,0.5)' }} aria-hidden />
          : <UploadCloud className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.5)' }} aria-hidden />}
        <span className="text-[11.5px] font-bold" style={{ color: 'rgba(255,255,255,0.66)' }}>
          {dragging ? 'Drop the logo' : hasUpload ? 'Replace logo' : 'Drag & drop, or browse'}
        </span>
        <span className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.30)' }}>
          SVG · PNG · JPG · WEBP · up to 512 KB
        </span>
      </button>

      {/* Preview through <img>, never injected markup — see the header note. */}
      {file && preview && (
        <div className="mt-2.5 flex items-center gap-2 rounded-lg p-2"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg"
            style={{ background: '#fff', border: '1px solid rgba(15,17,21,0.1)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" style={{ width: 26, height: 26, objectFit: 'contain' }} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-bold" style={{ color: 'rgba(255,255,255,0.82)' }}>{file.name}</p>
            <p className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.34)' }}>
              {file.type || 'unknown type'} · {Math.max(1, Math.round(file.size / KB))} KB
            </p>
          </div>
          <button type="button" onClick={() => { setFile(null); setPhase('idle'); setMessage(''); }}
            disabled={saving} className="text-[10.5px] font-bold"
            style={{ color: 'rgba(255,255,255,0.45)' }}>Cancel</button>
          <button type="button" onClick={save} disabled={saving}
            className="rounded-lg px-2.5 py-1 text-[10.5px] font-bold transition"
            style={{ background: 'rgba(167,139,250,0.16)', border: '1px solid rgba(167,139,250,0.34)', color: 'rgb(196,181,253)' }}>
            {saving ? 'Saving…' : 'Save logo'}
          </button>
        </div>
      )}

      {message && (
        <p className="mt-2 text-[10.5px] font-semibold" role="status" aria-live="polite"
          style={{ color: phase === 'error' ? 'rgba(248,113,113,0.92)' : 'rgba(134,239,172,0.85)' }}>
          {message}
        </p>
      )}
    </div>
  );
}
