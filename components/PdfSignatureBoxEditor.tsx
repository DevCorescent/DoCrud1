'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { RecipientSignatureBoxPlacement } from '@/types/document';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { renderPdfDataUrlToPngPages } from '@/lib/client/render-pdf-pages';

function decodeBase64PdfDataUrl(dataUrl: string) {
  const match = String(dataUrl || '').match(/^data:application\/pdf;base64,(.+)$/);
  if (!match) return null;
  const base64 = match[1] || '';
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeBox(box: RecipientSignatureBoxPlacement): RecipientSignatureBoxPlacement {
  const widthPct = clamp01(box.widthPct);
  const heightPct = clamp01(box.heightPct);
  const xPct = clamp01(box.xPct);
  const yPct = clamp01(box.yPct);

  return {
    ...box,
    page: Math.max(1, Math.floor(Number(box.page) || 1)),
    xPct: Math.min(xPct, 1 - widthPct),
    yPct: Math.min(yPct, 1 - heightPct),
    widthPct,
    heightPct,
    label: box.label?.slice(0, 64),
    pdfX: Number.isFinite((box as any).pdfX) ? (box as any).pdfX : undefined,
    pdfY: Number.isFinite((box as any).pdfY) ? (box as any).pdfY : undefined,
    pdfW: Number.isFinite((box as any).pdfW) ? (box as any).pdfW : undefined,
    pdfH: Number.isFinite((box as any).pdfH) ? (box as any).pdfH : undefined,
  };
}

function buildNextSignatureLabel(existing: RecipientSignatureBoxPlacement[]) {
  const used = new Set<number>();
  for (const box of existing || []) {
    const match = String(box.label || '').match(/signature\s+(\d+)/i);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > 0) used.add(n);
  }
  let candidate = 1;
  while (used.has(candidate)) candidate += 1;
  return `Signature ${candidate}`;
}

export function PdfSignatureBoxEditor(props: {
  pdfDataUrl: string;
  value: RecipientSignatureBoxPlacement[];
  onChange: (next: RecipientSignatureBoxPlacement[]) => void;
  signerKeys?: string[];
  signerDirectory?: Record<string, { signerEmail?: string; signerName?: string }>;
  onUpdateSignerDirectory?: (signerKey: string, patch: { signerEmail?: string; signerName?: string }) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadErrorDetail, setLoadErrorDetail] = useState('');
  const [renderedPages, setRenderedPages] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [previewScale, setPreviewScale] = useState(1.35);
  const pdfDocRef = useRef<any>(null);
  const pdfDocUrlRef = useRef<string>('');
  const viewportRef = useRef<Map<number, any>>(new Map());
  const containerRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [activeBoxId, setActiveBoxId] = useState<string>('');
  const draftRef = useRef<{
    page: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    rect: DOMRect;
  } | null>(null);
  const [, forceDraftRender] = useState(0);

  const ensurePdfDoc = async () => {
    if (pdfDocRef.current && pdfDocUrlRef.current === props.pdfDataUrl) return pdfDocRef.current;
    const bytes = decodeBase64PdfDataUrl(props.pdfDataUrl);
    if (!bytes?.length) throw new Error('Invalid PDF data URL.');
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.min.mjs')) as any;
    const doc = await pdfjs.getDocument({ data: bytes, disableWorker: true }).promise;
    pdfDocRef.current = doc;
    pdfDocUrlRef.current = props.pdfDataUrl;
    viewportRef.current = new Map();
    return doc;
  };

  const ensureViewport = async (pageNumber: number) => {
    const cached = viewportRef.current.get(pageNumber);
    if (cached) return cached;
    const doc = await ensurePdfDoc();
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    viewportRef.current.set(pageNumber, { page, viewport });
    return { page, viewport };
  };

  const boxesByPage = useMemo(() => {
    const map = new Map<number, RecipientSignatureBoxPlacement[]>();
    (props.value || []).forEach((box) => {
      const page = Math.max(1, Math.floor(Number(box.page) || 1));
      map.set(page, [...(map.get(page) || []), box]);
    });
    return map;
  }, [props.value]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const run = async () => {
      if (!props.pdfDataUrl?.startsWith('data:application/pdf;base64,')) {
        setRenderedPages([]);
        setPageCount(0);
        return;
      }

      try {
        setIsLoading(true);
        setLoadError('');
        setLoadErrorDetail('');
        const payload = await renderPdfDataUrlToPngPages({
          pdfDataUrl: props.pdfDataUrl,
          maxPages: 24,
          scale: previewScale,
          signal: controller.signal,
        });
        if (cancelled) return;
        setRenderedPages(payload.pages || []);
        setPageCount(Number(payload.pageCount || payload.pages.length || 0));
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Unable to render PDF pages';
        const detail = err instanceof Error ? (err.stack || '') : '';
        if (!controller.signal.aborted) {
          setLoadError(message);
          setLoadErrorDetail(detail);
          // Helpful for debugging in dev without needing server logs.
          // eslint-disable-next-line no-console
          console.error('PdfSignatureBoxEditor render error:', err);
        }
        setRenderedPages([]);
        setPageCount(0);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [props.pdfDataUrl, previewScale]);

  const updateBoxes = (updater: (prev: RecipientSignatureBoxPlacement[]) => RecipientSignatureBoxPlacement[]) => {
    const next = updater(props.value || []).map(normalizeBox);
    props.onChange(next);
  };

  const beginDraft = (page: number, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const startX = event.clientX - rect.left;
    const startY = event.clientY - rect.top;
    draftRef.current = { page, startX, startY, currentX: startX, currentY: startY, rect };
    forceDraftRender((v) => v + 1);
    target.setPointerCapture(event.pointerId);
  };

  const moveDraft = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draftRef.current) return;
    const rect = draftRef.current.rect;
    draftRef.current.currentX = event.clientX - rect.left;
    draftRef.current.currentY = event.clientY - rect.top;
    forceDraftRender((v) => v + 1);
  };

  const endDraft = (event: ReactPointerEvent<HTMLDivElement>) => {
    const draft = draftRef.current;
    draftRef.current = null;
    forceDraftRender((v) => v + 1);
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!draft) return;

    const rect = draft.rect;
    const left = Math.min(draft.startX, draft.currentX);
    const top = Math.min(draft.startY, draft.currentY);
    const width = Math.abs(draft.currentX - draft.startX);
    const height = Math.abs(draft.currentY - draft.startY);
    const isClick = width < 8 && height < 8;

    const resolveNextSignerKey = () => {
      const existing = new Set<string>();
      (props.value || []).forEach((b: any) => existing.add(String(b?.signerKey || '').trim()));
      (props.signerKeys || []).forEach((k) => existing.add(String(k || '').trim()));
      Object.keys(props.signerDirectory || {}).forEach((k) => existing.add(String(k || '').trim()));

      const base = (props.signerKeys?.[0] || 'recipient').trim() || 'recipient';
      // Default behavior for multi-signer: give each new box its own signer slot (signer-1, signer-2, ...).
      // Sender can later re-assign multiple boxes to the same signer if needed.
      if (base === 'recipient') {
        let n = 1;
        while (existing.has(`signer-${n}`)) n += 1;
        return `signer-${n}`;
      }

      // Otherwise fall back to the first known signer key.
      return base;
    };

    const resolvedSignerKey = resolveNextSignerKey();
    props.onUpdateSignerDirectory?.(resolvedSignerKey, { signerName: `Signer ${String(resolvedSignerKey).replace(/^signer-/, '')}` });
    const nextLabel = buildNextSignatureLabel(props.value || []);
    const nextBase: RecipientSignatureBoxPlacement = normalizeBox(isClick
      ? {
          id: `sigbox_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          page: draft.page,
          // Default box size; centered around click position.
          widthPct: 0.28,
          heightPct: 0.12,
          xPct: (draft.startX / rect.width) - 0.28 / 2,
          yPct: (draft.startY / rect.height) - 0.12 / 2,
          label: nextLabel,
          signerKey: resolvedSignerKey,
          required: true,
        }
      : {
          id: `sigbox_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          page: draft.page,
          xPct: left / rect.width,
          yPct: top / rect.height,
          widthPct: width / rect.width,
          heightPct: height / rect.height,
          label: nextLabel,
          signerKey: resolvedSignerKey,
          required: true,
        });

    const maybeAttachPdfCoords = async () => {
      try {
        const { page, viewport } = await ensureViewport(nextBase.page);
        const vx1 = nextBase.xPct * viewport.width;
        const vy1 = nextBase.yPct * viewport.height;
        const vx2 = (nextBase.xPct + nextBase.widthPct) * viewport.width;
        const vy2 = (nextBase.yPct + nextBase.heightPct) * viewport.height;

        const rect = typeof viewport.convertToPdfRectangle === 'function'
          ? viewport.convertToPdfRectangle([vx1, vy1, vx2, vy2])
          : (() => {
              const [pdfX1, pdfY1] = viewport.convertToPdfPoint(vx1, vy1);
              const [pdfX2, pdfY2] = viewport.convertToPdfPoint(vx2, vy2);
              return [pdfX1, pdfY1, pdfX2, pdfY2];
            })();

        const minX = Math.min(rect[0], rect[2]);
        const minY = Math.min(rect[1], rect[3]);
        const maxX = Math.max(rect[0], rect[2]);
        const maxY = Math.max(rect[1], rect[3]);
        const next: RecipientSignatureBoxPlacement = normalizeBox({
          ...nextBase,
          pdfX: minX,
          pdfY: minY,
          pdfW: Math.max(0, maxX - minX),
          pdfH: Math.max(0, maxY - minY),
        } as any);
        setActiveBoxId(next.id);
        updateBoxes((prev) => [...prev, next]);
      } catch {
        // Fallback to pct-based placement if pdfjs can't compute coords.
        setActiveBoxId(nextBase.id);
        updateBoxes((prev) => [...prev, nextBase]);
      }
    };

    // Ignore accidental tiny drags that are not intentional clicks.
    if (!isClick && (nextBase.widthPct < 0.01 || nextBase.heightPct < 0.01)) return;

    void maybeAttachPdfCoords();
  };

  const draftOverlay = (() => {
    const draft = draftRef.current;
    if (!draft) return null;
    const rect = draft.rect;
    const left = Math.min(draft.startX, draft.currentX);
    const top = Math.min(draft.startY, draft.currentY);
    const width = Math.abs(draft.currentX - draft.startX);
    const height = Math.abs(draft.currentY - draft.startY);
    const style: CSSProperties = {
      position: 'absolute',
      left,
      top,
      width,
      height,
      borderRadius: 12,
      border: '2px dashed rgba(14, 165, 233, 0.9)',
      background: 'rgba(14, 165, 233, 0.10)',
      pointerEvents: 'none',
    };
    return { page: draft.page, style };
  })();

  const scrollToPage = (page: number) => {
    const el = containerRefs.current[page];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Signature boxes</p>
          <p className="mt-1 text-xs text-slate-500">
            Drag on any page to place a signature box. Each box can be assigned to a different signer (multi-signer) or the same signer.
          </p>
          {pageCount ? (
            <p className="mt-1 text-[11px] text-slate-400">PDF pages: {pageCount} · Preview rendered: {renderedPages.length} · Zoom: {Math.round(previewScale * 100)}%</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 shadow-sm">
            Zoom
            <input
              type="range"
              min={0.85}
              max={2.1}
              step={0.05}
              value={previewScale}
              onChange={(e) => setPreviewScale(Number(e.target.value))}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => {
              setActiveBoxId('');
              props.onChange([]);
            }}
            disabled={!props.value?.length}
          >
            Clear
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          Rendering PDF preview…
        </div>
      ) : loadError ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
          {loadError}
          {process.env.NODE_ENV !== 'production' && loadErrorDetail ? (
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-rose-200 bg-white/60 p-3 text-[11px] text-rose-800">
              {loadErrorDetail}
            </pre>
          ) : null}
        </div>
      ) : !renderedPages.length ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          Upload a PDF to place signature boxes.
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-4">
            {renderedPages.map((src, index) => {
              const page = index + 1;
              const boxes = boxesByPage.get(page) || [];
              return (
                <div
                  key={`pdfsig-page-${page}`}
                  ref={(node) => {
                    containerRefs.current[page] = node;
                  }}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Page {page}</p>
                    <p className="text-[11px] text-slate-400">{boxes.length ? `${boxes.length} box(es)` : 'No boxes yet'}</p>
                  </div>
                  <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`PDF page ${page}`} className="block h-auto w-full select-none" draggable={false} />
                    {/* Interaction layer matches the rendered page exactly (no border math). */}
                    <div
                      className="absolute inset-0 cursor-crosshair"
                      onPointerDown={(event) => beginDraft(page, event)}
                      onPointerMove={moveDraft}
                      onPointerUp={endDraft}
                    >
                      {boxes.map((box) => {
                        const style: CSSProperties = {
                          position: 'absolute',
                          left: `${box.xPct * 100}%`,
                          top: `${box.yPct * 100}%`,
                          width: `${box.widthPct * 100}%`,
                          height: `${box.heightPct * 100}%`,
                          borderRadius: 12,
                          border: box.id === activeBoxId ? '2px solid rgba(15, 23, 42, 0.92)' : '2px solid rgba(2, 132, 199, 0.92)',
                          background: box.id === activeBoxId ? 'rgba(15, 23, 42, 0.08)' : 'rgba(2, 132, 199, 0.10)',
                          boxShadow: box.id === activeBoxId ? '0 18px 46px rgba(2, 132, 199, 0.20)' : '0 12px 32px rgba(2, 132, 199, 0.10)',
                          cursor: 'pointer',
                        };
                        return (
                          <button
                            type="button"
                            key={box.id}
                            className="group"
                            style={style}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setActiveBoxId(box.id);
                            }}
                            title={box.label || 'Signature box'}
                          >
                            <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-slate-800 shadow-sm">
                              {box.label || 'Signature'}
                            </span>
                          </button>
                        );
                      })}
                      {draftOverlay && draftOverlay.page === page ? <div style={draftOverlay.style} /> : null}
                      <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-semibold text-slate-600 shadow-sm">
                        Click to add a box · Drag to resize
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Boxes</p>
            <p className="mt-1 text-xs text-slate-500">Rename, jump, or remove boxes.</p>

            {!props.value?.length ? (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                No boxes yet. Drag on a page to add one.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {props.value.map((box, idx) => {
                  const isActive = box.id === activeBoxId;
                  return (
                    <div key={box.id} className={`rounded-2xl border p-3 ${isActive ? 'border-slate-900/20 bg-slate-50' : 'border-slate-200 bg-white'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          className="text-left"
                          onClick={() => {
                            setActiveBoxId(box.id);
                            scrollToPage(box.page);
                          }}
                        >
                          <p className="text-sm font-semibold text-slate-900">Page {box.page}</p>
                          <p className="text-[11px] text-slate-500 break-words">
                            Box {idx + 1}{box.signerKey ? ` • Signer: ${box.signerKey}` : ''}{box.required === false ? ' • Optional' : ''}
                          </p>
                        </button>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-full"
                            onClick={() => {
                              setActiveBoxId((prev) => (prev === box.id ? '' : prev));
                              updateBoxes((prev) => prev.filter((item) => item.id !== box.id));
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Label</label>
                        <Input
                          className="mt-1"
                          value={box.label || ''}
                          onChange={(event) => {
                            const label = event.target.value;
                            updateBoxes((prev) => prev.map((item) => (item.id === box.id ? { ...item, label } : item)));
                          }}
                          placeholder="Signature"
                        />
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Assigned signer</label>
                          <select
                            className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
                            value={box.signerKey || (props.signerKeys?.[0] || 'recipient')}
                            onChange={(event) => {
                              const signerKey = event.target.value;
                              updateBoxes((prev) => prev.map((item) => (item.id === box.id ? { ...item, signerKey } : item)));
                            }}
                          >
                            {(props.signerKeys?.length ? props.signerKeys : ['recipient']).map((key) => (
                              <option key={key} value={key}>{key}</option>
                            ))}
                          </select>
                          {props.onUpdateSignerDirectory ? (
                            <div className="mt-2">
                              <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Signer email</label>
                              <Input
                                className="mt-1"
                                value={String(props.signerDirectory?.[String(box.signerKey || (props.signerKeys?.[0] || 'recipient'))]?.signerEmail || '')}
                                onChange={(event) => {
                                  const signerKey = String(box.signerKey || (props.signerKeys?.[0] || 'recipient'));
                                  props.onUpdateSignerDirectory?.(signerKey, { signerEmail: event.target.value });
                                }}
                                placeholder="name@company.com"
                              />
                            </div>
                          ) : null}
                        </div>
                        <div className="flex items-end">
                          <label className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900">
                            Required
                            <input
                              type="checkbox"
                              checked={box.required !== false}
                              onChange={(event) => {
                                const required = event.target.checked;
                                updateBoxes((prev) => prev.map((item) => (item.id === box.id ? { ...item, required } : item)));
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
