'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { RecipientSignatureBoxPlacement } from '@/types/document';
import { renderPdfDataUrlToPngPages } from '@/lib/client/render-pdf-pages';

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
  };
}

export function PdfSignatureBoxPreview(props: {
  pdfDataUrl: string;
  boxes: RecipientSignatureBoxPlacement[];
  scale?: number;
  maxPages?: number;
}) {
  const [pages, setPages] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const boxesByPage = useMemo(() => {
    const map = new Map<number, RecipientSignatureBoxPlacement[]>();
    (props.boxes || []).map(normalizeBox).forEach((box) => {
      map.set(box.page, [...(map.get(box.page) || []), box]);
    });
    return map;
  }, [props.boxes]);

  const [pdfMeta, setPdfMeta] = useState<{ doc: any; viewports: Map<number, any> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
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
      controller.abort();
    };
  }, [props.pdfDataUrl]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const run = async () => {
      if (!props.pdfDataUrl?.startsWith('data:application/pdf;base64,')) {
        setPages([]);
        setPageCount(0);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const payload = await renderPdfDataUrlToPngPages({
          pdfDataUrl: props.pdfDataUrl,
          maxPages: props.maxPages ?? 16,
          scale: props.scale ?? 1.2,
          signal: controller.signal,
        });
        if (cancelled) return;
        setPages(payload.pages || []);
        setPageCount(Number(payload.pageCount || payload.pages.length || 0));
      } catch (err) {
        if (cancelled) return;
        setPages([]);
        setPageCount(0);
        setError(err instanceof Error ? err.message : 'Unable to render PDF preview.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [props.pdfDataUrl, props.maxPages, props.scale]);

  if (loading) {
    return <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">Rendering preview…</div>;
  }

  if (error) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{error}</div>;
  }

  if (!pages.length) {
    return <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">Preview unavailable.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">PDF Preview</p>
        <p className="text-[11px] text-slate-400">Pages: {pageCount || pages.length} · Boxes: {props.boxes?.length || 0}</p>
      </div>
      <div className="space-y-4">
        {pages.map((src, idx) => {
          const page = idx + 1;
          const boxes = boxesByPage.get(page) || [];
          return (
            <div key={`pdfsig-preview-${page}`} className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[11px] font-semibold text-slate-600">Page {page}</p>
                <p className="text-[11px] text-slate-400">{boxes.length ? `${boxes.length} box(es)` : ''}</p>
              </div>
                <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`PDF page ${page}`} className="block h-auto w-full select-none" draggable={false} />
                  <div className="absolute inset-0 pointer-events-none">
                    {boxes.map((box) => {
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
                        borderRadius: 10,
                        border: '2px solid rgba(2, 132, 199, 0.95)',
                        background: 'rgba(2, 132, 199, 0.10)',
                      };
                    return (
                      <div key={box.id} style={style}>
                        <div className="absolute left-2 top-2 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-semibold text-slate-800 shadow-sm">
                          {box.label || 'Signature'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
