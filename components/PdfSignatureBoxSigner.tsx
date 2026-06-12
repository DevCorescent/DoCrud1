'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { RecipientSignatureBoxPlacement } from '@/types/document';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import SignaturePad from '@/components/SignaturePad';
import { renderPdfDataUrlToPngPages } from '@/lib/client/render-pdf-pages';

type SignatureMap = Record<string, string>;

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
    required: box.required !== false,
    label: box.label?.slice(0, 64),
  };
}

export function PdfSignatureBoxSigner(props: {
  pdfDataUrl: string;
  boxes: RecipientSignatureBoxPlacement[];
  signatures: SignatureMap;
  onChange: (next: SignatureMap) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [renderedPages, setRenderedPages] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [previewScale] = useState(1.25);
  const [activeBoxId, setActiveBoxId] = useState('');
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [draftSignature, setDraftSignature] = useState('');
  const containerRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [pdfMeta, setPdfMeta] = useState<{ doc: any; viewports: Map<number, any> } | null>(null);

  const boxesByPage = useMemo(() => {
    const map = new Map<number, RecipientSignatureBoxPlacement[]>();
    (props.boxes || []).map(normalizeBox).forEach((box) => {
      map.set(box.page, [...(map.get(box.page) || []), box]);
    });
    return map;
  }, [props.boxes]);

  const activeBox = useMemo(() => {
    const all = (props.boxes || []).map(normalizeBox);
    return all.find((b) => b.id === activeBoxId) || null;
  }, [props.boxes, activeBoxId]);

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
        setRenderedPages([]);
        setPageCount(0);
        setLoadError(err instanceof Error ? err.message : 'Unable to render PDF preview.');
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

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        if (!props.pdfDataUrl?.startsWith('data:application/pdf;base64,')) {
          setPdfMeta(null);
          return;
        }
        const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.min.mjs')) as any;
        const match = String(props.pdfDataUrl).match(/^data:application\/pdf;base64,(.+)$/);
        if (!match) return;
        const binary = atob(match[1] || '');
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        const doc = await pdfjs.getDocument({ data: bytes, disableWorker: true }).promise;
        if (cancelled) return;
        setPdfMeta({ doc, viewports: new Map() });
      } catch {
        if (!cancelled) setPdfMeta(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [props.pdfDataUrl]);

  const requiredBoxIds = useMemo(() => (props.boxes || []).map(normalizeBox).filter((b) => b.required !== false).map((b) => b.id), [props.boxes]);
  const missingRequired = requiredBoxIds.filter((id) => !props.signatures[id]);

  const openSignerForBox = (boxId: string) => {
    setActiveBoxId(boxId);
    setDraftSignature(props.signatures[boxId] || '');
    setSignDialogOpen(true);
  };

  const saveSignatureForActive = () => {
    if (!activeBoxId) return;
    if (!draftSignature?.startsWith('data:image/')) return;
    props.onChange({ ...props.signatures, [activeBoxId]: draftSignature });
    setSignDialogOpen(false);
  };

  const clearSignatureForBox = (boxId: string) => {
    const next = { ...props.signatures };
    delete next[boxId];
    props.onChange(next);
  };

  const scrollToPage = (page: number) => {
    const el = containerRefs.current[page];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (isLoading) {
    return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">Rendering PDF…</div>;
  }

  if (loadError) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{loadError}</div>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        {renderedPages.map((src, index) => {
          const page = index + 1;
          const boxes = boxesByPage.get(page) || [];
          return (
            <div
              key={`pdfsig-signer-page-${page}`}
              ref={(node) => {
                containerRefs.current[page] = node;
              }}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Page {page}</p>
                <p className="text-[11px] text-slate-400">{boxes.length ? `${boxes.length} box(es)` : ''}</p>
              </div>
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`PDF page ${page}`} className="block h-auto w-full select-none" draggable={false} />
                <div className="absolute inset-0">
                  {boxes.map((box) => {
                    const signed = Boolean(props.signatures[box.id]);
                    const pdfX = Number((box as any).pdfX);
                    const pdfY = Number((box as any).pdfY);
                    const pdfW = Number((box as any).pdfW);
                    const pdfH = Number((box as any).pdfH);

                    const rectPct = (() => {
                      if (
                        pdfMeta?.doc
                        && Number.isFinite(pdfX) && Number.isFinite(pdfY) && Number.isFinite(pdfW) && Number.isFinite(pdfH)
                        && pdfW > 0 && pdfH > 0
                      ) {
                        const cached = pdfMeta.viewports.get(page);
                        const ensure = async () => {
                          if (pdfMeta.viewports.get(page)) return;
                          const pdfPage = await pdfMeta.doc.getPage(page);
                          const viewport = pdfPage.getViewport({ scale: 1 });
                          pdfMeta.viewports.set(page, viewport);
                          setPdfMeta({ doc: pdfMeta.doc, viewports: new Map(pdfMeta.viewports) });
                        };
                        if (!cached) void ensure();
                        const viewport = cached;
                        if (viewport) {
                          const [vx1, vy1] = viewport.convertToViewportPoint(pdfX, pdfY);
                          const [vx2, vy2] = viewport.convertToViewportPoint(pdfX + pdfW, pdfY + pdfH);
                          const left = Math.min(vx1, vx2) / viewport.width;
                          const top = Math.min(vy1, vy2) / viewport.height;
                          const width = Math.abs(vx2 - vx1) / viewport.width;
                          const height = Math.abs(vy2 - vy1) / viewport.height;
                          return { left, top, width, height };
                        }
                      }
                      return { left: box.xPct, top: box.yPct, width: box.widthPct, height: box.heightPct };
                    })();
                    const style: CSSProperties = {
                      position: 'absolute',
                      left: `${rectPct.left * 100}%`,
                      top: `${rectPct.top * 100}%`,
                      width: `${rectPct.width * 100}%`,
                      height: `${rectPct.height * 100}%`,
                      borderRadius: 12,
                      border: signed ? '2px solid rgba(15, 23, 42, 0.85)' : '2px solid rgba(2, 132, 199, 0.95)',
                      background: signed ? 'rgba(15, 23, 42, 0.06)' : 'rgba(2, 132, 199, 0.10)',
                      boxShadow: signed ? '0 18px 46px rgba(15, 23, 42, 0.10)' : '0 12px 32px rgba(2, 132, 199, 0.10)',
                      cursor: 'pointer',
                      overflow: 'hidden',
                    };
                    return (
                      <button
                        key={box.id}
                        type="button"
                        style={style}
                        className="group"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openSignerForBox(box.id);
                        }}
                        title={signed ? 'Edit signature' : 'Click to sign'}
                      >
                        {signed ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={props.signatures[box.id]} alt="Signature" className="absolute inset-0 h-full w-full object-contain p-2" />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-slate-700">
                            Click to sign
                          </span>
                        )}
                        <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-slate-800 shadow-sm">
                          {box.label || 'Signature'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Signature boxes</p>
        <p className="mt-1 text-xs text-slate-500">Click a box in the preview to sign. Required boxes must be signed before submit.</p>
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          Required remaining: <span className="font-semibold">{missingRequired.length}</span>
        </div>
        <div className="mt-4 space-y-3">
          {(props.boxes || []).map(normalizeBox).map((box, idx) => {
            const signed = Boolean(props.signatures[box.id]);
            return (
              <div key={box.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => {
                    scrollToPage(box.page);
                    openSignerForBox(box.id);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{box.label || `Signature ${idx + 1}`}</p>
                      <p className="text-[11px] text-slate-500">Page {box.page}{box.required !== false ? ' · Required' : ''}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${signed ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'}`}>
                      {signed ? 'SIGNED' : 'EMPTY'}
                    </span>
                  </div>
                </button>
                <div className="mt-2 flex justify-end gap-2">
                  {signed ? (
                    <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => clearSignatureForBox(box.id)}>
                      Clear
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" className="rounded-full" onClick={() => openSignerForBox(box.id)}>
                    {signed ? 'Edit' : 'Sign'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
        <DialogContent className="max-w-2xl rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold tracking-[-0.02em] text-slate-950">
              {activeBox?.label || 'Signature'}
            </DialogTitle>
          </DialogHeader>
          <SignaturePad value={draftSignature} onChange={setDraftSignature} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setSignDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="rounded-full bg-slate-950 text-white hover:bg-slate-800" onClick={saveSignatureForActive} disabled={!draftSignature?.startsWith('data:image/')}>
              Save signature
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
