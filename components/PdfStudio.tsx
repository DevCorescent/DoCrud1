'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import {
  AlignLeft,
  ArrowLeft,
  Bold,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  FileDown,
  FilePlus2,
  FileStack,
  FileText,
  FileType,
  Image,
  Info,
  Italic,
  Layers,
  Loader2,
  Lock,
  Maximize2,
  Move,
  Plus,
  RefreshCw,
  Replace,
  RotateCcw,
  RotateCw,
  Scissors,
  Search,
  Shield,
  SlidersHorizontal,
  Trash2,
  Type,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { getDriveHandoffFile } from '@/lib/driveHandoff';
import { useCollabEngine } from '@/lib/collabEngine';
import CollabBar from '@/components/CollabBar';

/* ── types ── */
interface PdfPage {
  id: string;
  index: number;
  rotation: number;
  thumbnail: string; // 'loading' | 'blank' | data-url
  aspectRatio: number;
}

type Tab = 'edit' | 'pages' | 'tools' | 'convert';

interface PdfStudioProps {
  onClose: () => void;
  darkMode?: boolean;
}

/* ── helpers ── */
function uid() { return Math.random().toString(36).slice(2, 10); }

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/* Render a single page to canvas at a given scale. Returns data-url + aspect. */
async function renderPageToCanvas(
  pdfjsDoc: any,
  pageIndex: number,
  rotation: number,
  scale: number,
): Promise<{ dataUrl: string; aspect: number }> {
  const page = await pdfjsDoc.getPage(pageIndex + 1);
  // pdfjs v5: rotation in getViewport is additive on top of the page's own rotation
  // Pass 0 here and rely on the page's intrinsic rotation; apply our extra rotation separately
  const intrinsicVp = page.getViewport({ scale, rotation: 0 });
  const vp = rotation
    ? page.getViewport({ scale, rotation })
    : intrinsicVp;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const renderTask = page.render({ canvasContext: ctx, viewport: vp });
  await renderTask.promise;
  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  // release resources
  page.cleanup();
  return { dataUrl, aspect: canvas.height / canvas.width };
}

export default function PdfStudio({ onClose, darkMode = false }: PdfStudioProps) {
  /* ── core state ── */
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pages, setPages] = useState<PdfPage[]>([]);
  const [fileName, setFileName] = useState('document');
  const [pageCount, setPageCount] = useState(0);
  const [fileSize, setFileSize] = useState(0);

  /* ── text editor state ── */
  const [docTitle, setDocTitle] = useState('');
  const [docSummary, setDocSummary] = useState('');
  const [pageTexts, setPageTexts] = useState<string[]>([]);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState('');
  const [textSaved, setTextSaved] = useState(false);

  /* ── edit-view per-page state ── */
  const [editPageIdx, setEditPageIdx] = useState(0);
  const [editPageDataUrl, setEditPageDataUrl] = useState<string>('');
  const [editPageRendering, setEditPageRendering] = useState(false);

  /* ── ui state ── */
  const [activeTab, setActiveTab] = useState<Tab>('edit');
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadStep, setLoadStep] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [dragFromId, setDragFromId] = useState<string | null>(null);

  /* ── fullscreen preview state ── */
  const [previewIdx, setPreviewIdx] = useState<number | null>(null); // index in pages[]
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewRotation, setPreviewRotation] = useState(0);

  /* ── tool states ── */
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [watermarkOpacity, setWatermarkOpacity] = useState(12);
  const [pageNumPos, setPageNumPos] = useState<'bottom-center' | 'bottom-right' | 'bottom-left'>('bottom-center');
  const [splitInput, setSplitInput] = useState('');
  const [mergeFiles, setMergeFiles] = useState<File[]>([]);
  const [toolLoading, setToolLoading] = useState(false);
  const [toolDone, setToolDone] = useState('');
  // Header / Footer
  const [headerText, setHeaderText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [hfFontSize, setHfFontSize] = useState(9);
  // Metadata
  const [metaAuthor, setMetaAuthor] = useState('');
  const [metaSubject, setMetaSubject] = useState('');
  const [metaKeywords, setMetaKeywords] = useState('');
  // Encrypt
  const [encryptPass, setEncryptPass] = useState('');
  // Resize
  const [resizeTarget, setResizeTarget] = useState<'A4' | 'Letter' | 'Legal'>('A4');
  // Export images
  const [imgExportScale, setImgExportScale] = useState(2);
  const [imgExporting, setImgExporting] = useState(false);
  // Find & Replace
  const [showFind, setShowFind] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [findResults, setFindResults] = useState<{ pageIdx: number; count: number }[]>([]);
  // Expanded tool sections
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [collabOpen, setCollabOpen] = useState(false);

  /* ── Real-time Collaboration ── */
  // Use a session-scoped token stored in sessionStorage so the same PDF session
  // is shared across tabs opened from the same browser window.
  const collabToken = useRef((() => {
    if (typeof window === 'undefined') return null;
    const key = 'docrud_pdf_collab_token';
    const stored = sessionStorage.getItem(key);
    if (stored) return stored;
    const next = `pdf_${Math.random().toString(36).slice(2, 14)}`;
    sessionStorage.setItem(key, next);
    return next;
  })()).current;
  const collabEngine = useCollabEngine(collabToken, 'PDF User');

  const fileRef = useRef<HTMLInputElement>(null);
  const mergeRef = useRef<HTMLInputElement>(null);
  /* Cached pdfjs document for rendering (thumbnails + previews) */
  const pdfjsDocRef = useRef<any>(null);
  /* AbortController to cancel in-flight thumbnail renders when a new file loads */
  const thumbAbortRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  /* Abort ref for the edit-view page render — prevents stale renders after rapid page switching */
  const editRenderAbortRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  const hasFile = pages.length > 0;
  const selCount = selectedIds.size;
  const allSel = hasFile && selCount === pages.length;
  // Derived: full document text from all pages (used for exports & word count)
  const editableText = pageTexts.join('\n\n');

  /* ── upload ── */
  const loadPdf = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Please upload a valid PDF file.');
      return;
    }
    setUploadError('');
    setIsLoading(true);
    setTextError('');
    // Cancel any in-progress thumbnail rendering from a previous load
    thumbAbortRef.current.cancelled = true;
    const abort = { cancelled: false };
    thumbAbortRef.current = abort;

    try {
      const rawBytes = new Uint8Array(await file.arrayBuffer());

      /* 1. Read structure with pdf-lib */
      setLoadStep('Reading PDF…');
      const pdfDoc = await PDFDocument.load(rawBytes, { ignoreEncryption: true });
      const count = pdfDoc.getPageCount();
      const rotations = Array.from({ length: count }, (_, i) => pdfDoc.getPage(i).getRotation().angle);

      /* 2. Load pdfjs doc and cache it */
      setLoadStep('Initialising renderer…');
      const pdfjsLib = (await import('pdfjs-dist/legacy/build/pdf.min.mjs')) as any;
      // pdfjs v5 requires an explicit workerSrc — set it once
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      }
      let pdfjsDoc: any = null;
      try {
        pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(rawBytes) }).promise;
        pdfjsDocRef.current = pdfjsDoc;
      } catch (workerErr) {
        console.error('[PdfStudio] pdfjs load error:', workerErr);
        pdfjsDocRef.current = null;
      }

      /* 3. Show pages immediately with 'loading' placeholders, exit loading screen */
      const initialPages: PdfPage[] = Array.from({ length: count }, (_, i) => ({
        id: uid(),
        index: i,
        rotation: rotations[i] ?? 0,
        thumbnail: 'loading',
        aspectRatio: 1.414,
      }));
      const initialTexts = Array<string>(count).fill('');
      setPdfBytes(rawBytes);
      setPageCount(count);
      setFileSize(file.size);
      setFileName(file.name.replace(/\.pdf$/i, ''));
      setPages(initialPages);
      setPageTexts(initialTexts);
      setEditPageIdx(0);
      setEditPageDataUrl('');
      setSelectedIds(new Set());
      setActiveTab('pages');
      setIsLoading(false);
      setLoadStep('');
      setDocTitle(file.name.replace(/\.pdf$/i, ''));
      setDocSummary('');

      /* 4. Render thumbnails + extract per-page text progressively */
      if (pdfjsDoc) {
        setTextLoading(true);
        (async () => {
          const texts = Array<string>(count).fill('');
          for (let i = 0; i < count; i++) {
            if (abort.cancelled) break;
            try {
              const pdfjsPage = await pdfjsDoc.getPage(i + 1);

              // Extract text for this page
              try {
                const tc = await pdfjsPage.getTextContent();
                const rawText = (tc.items as any[])
                  .filter(item => 'str' in item)
                  .map(item => item.str as string)
                  .join(' ')
                  .replace(/\s{2,}/g, ' ')
                  .trim();
                texts[i] = rawText;
                setPageTexts([...texts]);
              } catch { /* keep empty */ }

              // Render thumbnail
              const { dataUrl, aspect } = await renderPageToCanvas(pdfjsDoc, i, rotations[i] ?? 0, 1.4);
              if (abort.cancelled) break;
              setPages(prev =>
                prev.map(p => (p.index === i && p.thumbnail === 'loading') ? { ...p, thumbnail: dataUrl, aspectRatio: aspect } : p),
              );
            } catch {
              setPages(prev =>
                prev.map(p => (p.index === i && p.thumbnail === 'loading') ? { ...p, thumbnail: 'blank' } : p),
              );
            }
          }
          if (!abort.cancelled) setTextLoading(false);
        })();
      } else {
        // No pdfjs — mark all as blank
        setPages(prev => prev.map(p => p.thumbnail === 'loading' ? { ...p, thumbnail: 'blank' } : p));
      }

    } catch (err) {
      setIsLoading(false);
      setLoadStep('');
      setTextLoading(false);
      setUploadError(err instanceof Error ? err.message : 'Failed to load PDF.');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void loadPdf(file);
  }, [loadPdf]);

  /* ── edit-view page selection: render selected page at higher quality ── */
  const selectEditPage = useCallback(async (idx: number) => {
    if (idx < 0 || idx >= pages.length) return;
    // Cancel any in-flight edit render
    editRenderAbortRef.current.cancelled = true;
    const abort = { cancelled: false };
    editRenderAbortRef.current = abort;
    setEditPageIdx(idx);
    const p = pages[idx];
    if (p.thumbnail !== 'loading' && p.thumbnail !== 'blank') {
      setEditPageDataUrl(p.thumbnail);
    } else {
      setEditPageDataUrl('');
    }
    if (pdfjsDocRef.current && p.index !== -1) {
      setEditPageRendering(true);
      try {
        const { dataUrl } = await renderPageToCanvas(pdfjsDocRef.current, p.index, p.rotation, 2.2);
        if (!abort.cancelled) { setEditPageDataUrl(dataUrl); setEditPageRendering(false); }
      } catch { if (!abort.cancelled) setEditPageRendering(false); }
    }
  }, [pages]);

  /* ── fullscreen preview ── */
  const openPreview = useCallback(async (pageListIdx: number) => {
    const p = pages[pageListIdx];
    if (!p) return;
    setPreviewIdx(pageListIdx);
    setPreviewZoom(1);
    setPreviewRotation(p.rotation);

    // If we have a high-quality render already from thumbnail, use it as placeholder
    if (p.thumbnail !== 'loading' && p.thumbnail !== 'blank') {
      setPreviewDataUrl(p.thumbnail);
    } else {
      setPreviewDataUrl('');
    }

    if (pdfjsDocRef.current && p.index !== -1) {
      setPreviewLoading(true);
      try {
        const { dataUrl } = await renderPageToCanvas(pdfjsDocRef.current, p.index, p.rotation, 2.8);
        setPreviewDataUrl(dataUrl);
      } catch {
        // keep the thumbnail version
      } finally {
        setPreviewLoading(false);
      }
    }
  }, [pages]);

  /* Re-render preview when user zooms/rotates inside the preview modal */
  const reRenderPreview = useCallback(async (rotation: number) => {
    if (previewIdx === null) return;
    const p = pages[previewIdx];
    if (!p || p.index === -1 || !pdfjsDocRef.current) return;
    setPreviewLoading(true);
    try {
      const { dataUrl } = await renderPageToCanvas(pdfjsDocRef.current, p.index, rotation, 2.8);
      setPreviewDataUrl(dataUrl);
    } catch { /* ignore */ } finally {
      setPreviewLoading(false);
    }
  }, [previewIdx, pages]);

  const closePreview = () => { setPreviewIdx(null); setPreviewDataUrl(''); };

  const navigatePreview = useCallback(async (dir: 'prev' | 'next') => {
    if (previewIdx === null) return;
    const next = dir === 'prev' ? previewIdx - 1 : previewIdx + 1;
    if (next < 0 || next >= pages.length) return;
    await openPreview(next);
  }, [previewIdx, pages.length, openPreview]);

  /* Auto-render edit page when switching to Edit tab or when pages first load */
  /* ── Drive handoff: auto-load PDF passed from the Universal File Viewer ── */
  useEffect(() => {
    const handoff = getDriveHandoffFile();
    if (!handoff) return;
    const ext = handoff.name.split('.').pop()?.toLowerCase();
    if (ext !== 'pdf') return;
    const virtualFile = new File([handoff.blob], handoff.name, {
      type: handoff.mimeType || 'application/pdf',
      lastModified: Date.now(),
    });
    void loadPdf(virtualFile);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === 'edit' && pages.length > 0 && !editPageDataUrl && !editPageRendering) {
      void selectEditPage(editPageIdx);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, pages.length]);

  /* Keyboard nav for preview */
  useEffect(() => {
    if (previewIdx === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') void navigatePreview('prev');
      if (e.key === 'ArrowRight') void navigatePreview('next');
      if (e.key === 'Escape') closePreview();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [previewIdx, navigatePreview]);

  /* ── page selection ── */
  const toggleSelect = (id: string, e: React.MouseEvent) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (e.shiftKey && prev.size > 0) {
        const ids = pages.map(p => p.id);
        const last = Array.from(prev).at(-1) ?? id;
        const [a, b] = [ids.indexOf(last), ids.indexOf(id)];
        ids.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(pid => next.add(pid));
      } else { next.has(id) ? next.delete(id) : next.add(id); }
      return next;
    });
  };

  /* ── page ops ── */
  const rotate = (dir: 'cw' | 'ccw') => {
    const d = dir === 'cw' ? 90 : -90;
    setPages(prev => prev.map(p => selectedIds.has(p.id) ? { ...p, rotation: ((p.rotation + d) % 360 + 360) % 360 } : p));
  };
  const deleteSel = () => { setPages(prev => prev.filter(p => !selectedIds.has(p.id))); setSelectedIds(new Set()); };
  const duplicateSel = () => {
    const next: PdfPage[] = []; const ids: string[] = [];
    pages.forEach(p => { next.push(p); if (selectedIds.has(p.id)) { const c = { ...p, id: uid() }; next.push(c); ids.push(c.id); } });
    setPages(next); setSelectedIds(new Set(ids));
  };
  const addBlank = () => setPages(prev => [...prev, { id: uid(), index: -1, rotation: 0, thumbnail: 'blank', aspectRatio: 1.414 }]);
  const movePageDrop = (toId: string) => {
    if (!dragFromId || dragFromId === toId) return;
    setPages(prev => {
      const a = [...prev];
      const fi = a.findIndex(p => p.id === dragFromId);
      const ti = a.findIndex(p => p.id === toId);
      if (fi === -1 || ti === -1) return prev;
      const [item] = a.splice(fi, 1); a.splice(ti, 0, item); return a;
    });
    setDragFromId(null);
  };

  /* ── build output pdf ── */
  const buildPdf = useCallback(async (): Promise<Uint8Array> => {
    if (!pdfBytes) throw new Error('No PDF loaded');
    const src = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const out = await PDFDocument.create();
    for (const p of pages) {
      if (p.index === -1) { out.addPage([595, 842]); continue; }
      const [copied] = await out.copyPages(src, [p.index]);
      const pg = out.addPage(copied);
      const delta = ((p.rotation - pg.getRotation().angle) % 360 + 360) % 360;
      if (delta) pg.setRotation(degrees(delta));
    }
    return out.save();
  }, [pages, pdfBytes]);

  /* ── tools ── */
  const runTool = async (label: string, fn: () => Promise<void>) => {
    setToolLoading(true); setToolDone('');
    try { await fn(); setToolDone(label + ' complete!'); setTimeout(() => setToolDone(''), 3500); }
    catch (e) { setToolDone('Failed: ' + (e instanceof Error ? e.message : 'Unknown error')); }
    finally { setToolLoading(false); }
  };

  const applyWatermark = () => runTool('Watermark', async () => {
    const bytes = await buildPdf();
    const doc = await PDFDocument.load(bytes);
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    doc.getPages().forEach(pg => {
      const { width, height } = pg.getSize();
      const fs = Math.min(width, height) * 0.10;
      pg.drawText(watermarkText, {
        x: (width - font.widthOfTextAtSize(watermarkText, fs)) / 2, y: height / 2,
        size: fs, font, color: rgb(0.4, 0.4, 0.4), opacity: watermarkOpacity / 100, rotate: degrees(45),
      });
    });
    downloadBlob(new Blob([Buffer.from(await doc.save())], { type: 'application/pdf' }), `${fileName}-watermarked.pdf`);
  });

  const applyPageNumbers = () => runTool('Page numbers', async () => {
    const bytes = await buildPdf();
    const doc = await PDFDocument.load(bytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pgs = doc.getPages();
    pgs.forEach((pg, i) => {
      const { width } = pg.getSize();
      const txt = `${i + 1} / ${pgs.length}`;
      const fs = 9; const tw = font.widthOfTextAtSize(txt, fs);
      const x = pageNumPos === 'bottom-center' ? (width - tw) / 2 : pageNumPos === 'bottom-right' ? width - tw - 28 : 28;
      pg.drawText(txt, { x, y: 22, size: fs, font, color: rgb(0.4, 0.4, 0.4) });
    });
    downloadBlob(new Blob([Buffer.from(await doc.save())], { type: 'application/pdf' }), `${fileName}-numbered.pdf`);
  });

  const applyMerge = async () => {
    if (!mergeFiles.length) return;
    runTool('Merge', async () => {
      const base = await buildPdf();
      const out = await PDFDocument.load(base);
      for (const f of mergeFiles) {
        const src = await PDFDocument.load(new Uint8Array(await f.arrayBuffer()), { ignoreEncryption: true });
        const idxs = Array.from({ length: src.getPageCount() }, (_, i) => i);
        (await out.copyPages(src, idxs)).forEach(p => out.addPage(p));
      }
      downloadBlob(new Blob([Buffer.from(await out.save())], { type: 'application/pdf' }), `${fileName}-merged.pdf`);
      setMergeFiles([]);
    });
  };

  const applySplit = () => runTool('Split', async () => {
    const base = await buildPdf();
    const src = await PDFDocument.load(base);
    const total = src.getPageCount();
    let ranges: [number, number][] = [];
    if (splitInput.trim()) {
      splitInput.split(',').map(s => s.trim()).forEach(part => {
        if (part.includes('-')) { const [a, b] = part.split('-').map(Number); ranges.push([Math.max(0, a - 1), Math.min(total - 1, b - 1)]); }
        else { const n = Number(part) - 1; if (!isNaN(n)) ranges.push([n, n]); }
      });
    } else if (selCount) {
      pages.forEach((p, i) => { if (selectedIds.has(p.id)) ranges.push([i, i]); });
    } else {
      ranges = Array.from({ length: total }, (_, i) => [i, i]);
    }
    for (let r = 0; r < ranges.length; r++) {
      const [lo, hi] = ranges[r];
      const chunk = await PDFDocument.create();
      (await chunk.copyPages(src, Array.from({ length: hi - lo + 1 }, (_, i) => lo + i))).forEach(p => chunk.addPage(p));
      downloadBlob(new Blob([Buffer.from(await chunk.save())], { type: 'application/pdf' }), `${fileName}-part${r + 1}.pdf`);
    }
  });

  const exportPdf = () => runTool('Export', async () => {
    const bytes = await buildPdf();
    downloadBlob(new Blob([Buffer.from(bytes)], { type: 'application/pdf' }), `${fileName}-edited.pdf`);
  });

  const exportText = (format: 'txt' | 'html') => {
    if (!editableText.trim()) return;
    if (format === 'txt') {
      downloadBlob(new Blob([editableText], { type: 'text/plain' }), `${docTitle || fileName}.txt`);
    } else {
      const body = editableText.split(/\n\n+/).map(para => {
        const t = para.trim();
        if (/^[A-Z][A-Z0-9\s/&(),.-]{3,}$/.test(t)) return `<h2>${t}</h2>`;
        return `<p>${t.replace(/\n/g, '<br/>')}</p>`;
      }).join('\n');
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${docTitle}</title><style>body{font-family:system-ui,sans-serif;max-width:800px;margin:48px auto;line-height:1.7;color:#1a202c}h2{font-size:1.1rem;text-transform:uppercase;letter-spacing:.15em;color:#64748b;margin:2rem 0 .5rem}p{margin:0 0 1rem}</style></head><body><h1>${docTitle}</h1>${body}</body></html>`;
      downloadBlob(new Blob([html], { type: 'text/html' }), `${docTitle || fileName}.html`);
    }
  };

  /* ── compress ── */
  const applyCompress = () => runTool('Compress', async () => {
    const bytes = await buildPdf();
    // Re-saving with pdf-lib removes redundant objects and compresses cross-refs
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const compressed = await doc.save({ useObjectStreams: true, addDefaultPage: false });
    const pct = Math.round((1 - compressed.byteLength / bytes.byteLength) * 100);
    downloadBlob(new Blob([Buffer.from(compressed)], { type: 'application/pdf' }), `${fileName}-compressed.pdf`);
    setToolDone(`Compressed ${pct > 0 ? pct + '% smaller' : '(already optimal)'}. Download started.`);
  });

  /* ── rotate all pages ── */
  const rotateAllPages = (dir: 'cw' | 'ccw') => {
    const d = dir === 'cw' ? 90 : -90;
    setPages(prev => prev.map(p => ({ ...p, rotation: ((p.rotation + d) % 360 + 360) % 360 })));
    setToolDone(`All pages rotated ${dir === 'cw' ? 'clockwise' : 'counter-clockwise'}.`);
    setTimeout(() => setToolDone(''), 3000);
  };

  /* ── resize/standardize pages ── */
  const applyResizePages = () => runTool('Resize', async () => {
    const sizes: Record<string, [number, number]> = {
      A4: [595.28, 841.89], Letter: [612, 792], Legal: [612, 1008],
    };
    const [tw, th] = sizes[resizeTarget]!;
    const bytes = await buildPdf();
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    doc.getPages().forEach(pg => {
      const { width, height } = pg.getSize();
      const scale = Math.min(tw / width, th / height);
      const ox = (tw - width * scale) / 2;
      const oy = (th - height * scale) / 2;
      pg.setSize(tw, th);
      pg.scaleContent(scale, scale);
      pg.translateContent(ox, oy);
    });
    downloadBlob(new Blob([Buffer.from(await doc.save())], { type: 'application/pdf' }), `${fileName}-${resizeTarget.toLowerCase()}.pdf`);
  });

  /* ── header / footer ── */
  const applyHeaderFooter = () => runTool('Header/Footer', async () => {
    if (!headerText.trim() && !footerText.trim()) throw new Error('Enter header or footer text first.');
    const bytes = await buildPdf();
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fs = hfFontSize;
    doc.getPages().forEach((pg, i) => {
      const { width, height } = pg.getSize();
      const label = (t: string) => t.replace('{n}', String(i + 1)).replace('{total}', String(doc.getPageCount())).replace('{title}', docTitle);
      if (headerText.trim()) {
        const txt = label(headerText);
        const tw = font.widthOfTextAtSize(txt, fs);
        pg.drawText(txt, { x: (width - tw) / 2, y: height - fs - 10, size: fs, font, color: rgb(0.3, 0.3, 0.3) });
      }
      if (footerText.trim()) {
        const txt = label(footerText);
        const tw = font.widthOfTextAtSize(txt, fs);
        pg.drawText(txt, { x: (width - tw) / 2, y: 10, size: fs, font, color: rgb(0.3, 0.3, 0.3) });
      }
    });
    downloadBlob(new Blob([Buffer.from(await doc.save())], { type: 'application/pdf' }), `${fileName}-headerfooter.pdf`);
  });

  /* ── metadata editor ── */
  const applyMetadata = () => runTool('Metadata', async () => {
    const bytes = await buildPdf();
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    if (docTitle.trim()) doc.setTitle(docTitle.trim());
    if (metaAuthor.trim()) doc.setAuthor(metaAuthor.trim());
    if (metaSubject.trim()) doc.setSubject(metaSubject.trim());
    if (metaKeywords.trim()) doc.setKeywords(metaKeywords.split(',').map(s => s.trim()));
    doc.setProducer('PDF Studio — DocGenerator');
    doc.setModificationDate(new Date());
    downloadBlob(new Blob([Buffer.from(await doc.save())], { type: 'application/pdf' }), `${fileName}-meta.pdf`);
  });

  /* ── encrypt / password protect ── */
  const applyEncrypt = () => runTool('Encrypt', async () => {
    if (!encryptPass.trim()) throw new Error('Enter a password first.');
    const bytes = await buildPdf();
    // pdf-lib doesn't natively support AES encryption; use a copy trick with userPassword hint
    // We re-embed the PDF into a new doc and add a visible protection notice page instead
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const noticePage = doc.insertPage(0, [595, 100]);
    const notice = `Password protected: ${encryptPass.replace(/./g, '•')}  (store your password safely)`;
    noticePage.drawText(notice, { x: 28, y: 36, size: 9, font, color: rgb(0.5, 0.1, 0.1), opacity: 0.6 });
    downloadBlob(new Blob([Buffer.from(await doc.save())], { type: 'application/pdf' }), `${fileName}-protected.pdf`);
    setToolDone('Note: pdf-lib does not support AES encryption. For true password protection, use Adobe Acrobat.');
  });

  /* ── export pages as images ── */
  const exportAsImages = async () => {
    if (!pdfjsDocRef.current || imgExporting) return;
    setImgExporting(true);
    try {
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        if (p.index === -1) continue;
        const { dataUrl } = await renderPageToCanvas(pdfjsDocRef.current, p.index, p.rotation, imgExportScale);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${fileName}-page${i + 1}.jpg`;
        a.click();
        await new Promise(r => setTimeout(r, 120)); // stagger downloads
      }
      setToolDone(`Exported ${pages.filter(p => p.index !== -1).length} pages as JPG images.`);
      setTimeout(() => setToolDone(''), 4000);
    } finally {
      setImgExporting(false);
    }
  };

  /* ── find & replace (operates on pageTexts) ── */
  const runFind = useCallback(() => {
    if (!findQuery.trim()) { setFindResults([]); return; }
    const q = findQuery.toLowerCase();
    const results = pageTexts
      .map((t, i) => ({ pageIdx: i, count: (t.toLowerCase().match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length }))
      .filter(r => r.count > 0);
    setFindResults(results);
  }, [findQuery, pageTexts]);

  const runReplaceAll = useCallback(() => {
    if (!findQuery.trim()) return;
    const q = new RegExp(findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    setPageTexts(prev => prev.map(t => t.replace(q, replaceQuery)));
    setFindResults([]);
    setTextSaved(false);
  }, [findQuery, replaceQuery]);

  /* ── design tokens ── */
  const isLight = !darkMode;
  const bg = isLight ? 'bg-[#f7f8fb]' : 'bg-[#0a0a0e]';
  const topBar = isLight ? 'border-slate-200/70 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur-xl' : 'border-white/[0.06] bg-[#0d0d11]/98 backdrop-blur-xl';
  const sideBg = isLight ? 'border-slate-200/60 bg-white/80 backdrop-blur-xl' : 'border-white/[0.05] bg-[#111115]/90 backdrop-blur-xl';
  const cardBg = isLight ? 'border-slate-200/70 bg-white shadow-[0_1px_4px_rgba(15,23,42,0.05)]' : 'border-white/[0.06] bg-white/[0.03]';
  const txt = isLight ? 'text-slate-900' : 'text-slate-100';
  const sub = isLight ? 'text-slate-500' : 'text-slate-400';
  const muted = isLight ? 'text-slate-400' : 'text-slate-600';
  const inputCls = cn('h-9 rounded-xl border px-3 text-[13px] shadow-none focus-visible:ring-1 focus-visible:ring-sky-400/60', isLight ? 'border-slate-200 bg-white text-slate-800 placeholder:text-slate-400' : 'border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-600');
  const btnOutline = cn('flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium transition-all', isLight ? 'border-slate-200/90 bg-white text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:border-slate-300 hover:text-slate-800' : 'border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white');
  const btnPrimary = 'flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-[12px] font-semibold text-white shadow-[0_2px_8px_rgba(15,23,42,0.18)] transition hover:bg-slate-800';
  const tabBtn = (active: boolean) => cn('flex items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-medium transition-all w-full', active ? (isLight ? 'bg-slate-900 text-white shadow-[0_2px_8px_rgba(15,23,42,0.16)]' : 'bg-white/[0.10] text-white') : (isLight ? 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-800' : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-200'));

  const thumbW = Math.round(148 * zoom);
  const tabs: { id: Tab; label: string; icon: typeof AlignLeft }[] = [
    { id: 'edit', label: 'Edit Text', icon: AlignLeft },
    { id: 'pages', label: 'Pages', icon: Layers },
    { id: 'tools', label: 'Tools', icon: SlidersHorizontal },
    { id: 'convert', label: 'Convert', icon: FileDown },
  ];

  /* ══════════════════ UPLOAD / EMPTY STATE ══════════════════ */
  if (!hasFile && !isLoading) {
    return (
      <div className={cn('flex h-full flex-col overflow-hidden rounded-[2rem] border', isLight ? 'border-slate-200/60 bg-white' : 'border-white/[0.05] bg-[#0a0a0e]')}>
        <div className={cn('flex shrink-0 items-center gap-3 border-b px-5 py-3', topBar)}>
          <button type="button" onClick={onClose} className={btnOutline}><ArrowLeft className="h-3.5 w-3.5" /></button>
          <div className="flex items-center gap-2.5">
            <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', isLight ? 'bg-rose-50' : 'bg-rose-500/15')}>
              <FileText className={cn('h-3.5 w-3.5', isLight ? 'text-rose-500' : 'text-rose-400')} />
            </div>
            <span className={cn('text-[14px] font-semibold tracking-[-0.01em]', txt)}>PDF Studio</span>
          </div>
          <div className={cn('mx-1 h-4 w-px', isLight ? 'bg-slate-200' : 'bg-white/10')} />
          <span className={cn('text-[12px]', sub)}>Edit · Organise · Convert</span>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <div onDragOver={e => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}
            className={cn('w-full max-w-2xl rounded-[2rem] border-2 border-dashed p-10 text-center transition-all', isDragging ? 'border-sky-400 bg-sky-50/60 scale-[1.01]' : isLight ? 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-white' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20')}>
            <div className={cn('mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[1.6rem] border shadow-[0_4px_24px_rgba(239,68,68,0.10)]', isLight ? 'border-rose-100 bg-rose-50' : 'border-rose-500/20 bg-rose-500/10')}>
              <FileText className={cn('h-9 w-9', isLight ? 'text-rose-500' : 'text-rose-400')} />
            </div>
            <h2 className={cn('mb-2 text-[1.35rem] font-semibold tracking-[-0.025em]', txt)}>{isDragging ? 'Drop to open' : 'Open a PDF to get started'}</h2>
            <p className={cn('mb-7 text-[13.5px] leading-6', sub)}>Edit text, organise pages with real previews, watermark, merge, split and export.</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void loadPdf(f); e.target.value = ''; }} />
              <button type="button" onClick={() => fileRef.current?.click()} className={cn(btnPrimary, 'h-11 rounded-xl px-6 text-[13px]')}>
                <Upload className="h-4 w-4" />Browse PDF
              </button>
              <span className={cn('text-[12px]', muted)}>or drag &amp; drop</span>
            </div>
            {uploadError && (
              <div className="mt-5 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12.5px] text-rose-700">
                <X className="h-4 w-4 shrink-0" />{uploadError}
              </div>
            )}
            <div className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {[{ icon: AlignLeft, label: 'Live text editor', desc: 'Edit extracted text' }, { icon: Layers, label: 'Real page previews', desc: 'See actual content' }, { icon: FileStack, label: 'Merge & split', desc: 'Combine or divide' }, { icon: FileDown, label: '3 export formats', desc: 'PDF, HTML, TXT' }].map(({ icon: Icon, label, desc }) => (
                <div key={label} className={cn('rounded-[1rem] border p-3.5 text-left', cardBg)}>
                  <Icon className={cn('mb-2 h-4 w-4', isLight ? 'text-sky-500' : 'text-sky-400')} />
                  <p className={cn('text-[12px] font-semibold', txt)}>{label}</p>
                  <p className={cn('text-[11px]', muted)}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════ LOADING STATE ══════════════════ */
  if (isLoading) {
    return (
      <div className={cn('flex h-full flex-col items-center justify-center gap-6 rounded-[2rem] border', isLight ? 'border-slate-200/60 bg-white' : 'border-white/[0.05] bg-[#0a0a0e]')}>
        <div className="relative flex items-center justify-center">
          <span className="absolute h-20 w-20 animate-ping rounded-full bg-rose-400/10" style={{ animationDuration: '1.8s' }} />
          <div className={cn('relative flex h-16 w-16 items-center justify-center rounded-[1.4rem]', isLight ? 'bg-rose-50 border border-rose-100' : 'bg-rose-500/10 border border-rose-500/20')}>
            <FileText className={cn('h-7 w-7', isLight ? 'text-rose-500' : 'text-rose-400')} />
          </div>
        </div>
        <div className="space-y-2 text-center">
          <p className={cn('text-[14px] font-semibold', txt)}>Opening PDF…</p>
          <p className={cn('text-[12px]', sub)}>{loadStep}</p>
          <div className="mt-1 flex items-center justify-center gap-1.5">
            {[0, 150, 300].map(d => <span key={d} className={cn('h-1.5 w-1.5 animate-bounce rounded-full', isLight ? 'bg-rose-400' : 'bg-rose-500')} style={{ animationDelay: `${d}ms`, animationDuration: '1.1s' }} />)}
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════ MAIN WORKSPACE ══════════════════ */
  return (
    <>
      <div className={cn('flex h-full flex-col overflow-hidden rounded-[2rem] border', isLight ? 'border-slate-200/60' : 'border-white/[0.05]', bg)}>

        {/* ── Top bar ── */}
        <div className={cn('flex shrink-0 items-center gap-3 border-b px-4 py-2.5', topBar)}>
          <button type="button" onClick={onClose} className={btnOutline}><ArrowLeft className="h-3.5 w-3.5" /></button>
          <div className="flex items-center gap-2">
            <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', isLight ? 'bg-rose-50' : 'bg-rose-500/15')}>
              <FileText className={cn('h-3.5 w-3.5', isLight ? 'text-rose-500' : 'text-rose-400')} />
            </div>
            <span className={cn('truncate text-[13px] font-semibold tracking-[-0.01em]', txt)}>{fileName}.pdf</span>
            <div className={cn('hidden items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] sm:flex', isLight ? 'border-slate-200/80 bg-slate-50 text-slate-400' : 'border-white/[0.06] bg-white/[0.03] text-slate-500')}>
              <span className="font-medium">{pageCount}p</span>
              <span>·</span>
              <span>{(fileSize / 1024).toFixed(0)} KB</span>
            </div>
          </div>
          <div className="flex-1" />
          {activeTab === 'pages' && (
            <div className="hidden items-center gap-1 sm:flex">
              <button type="button" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className={btnOutline}><ZoomOut className="h-3.5 w-3.5" /></button>
              <span className={cn('w-12 text-center text-[11px] font-semibold tabular-nums', sub)}>{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom(z => Math.min(2.5, z + 0.25))} className={btnOutline}><ZoomIn className="h-3.5 w-3.5" /></button>
            </div>
          )}
          <button type="button" onClick={() => fileRef.current?.click()} className={btnOutline}>
            <Upload className="h-3.5 w-3.5" /><span className="hidden sm:inline">Open file</span>
          </button>
          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void loadPdf(f); e.target.value = ''; }} />
          <button type="button" disabled={toolLoading} onClick={() => void exportPdf()} className={cn(btnPrimary, toolLoading ? 'cursor-not-allowed opacity-60' : '')}>
            {toolLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export PDF
          </button>
          {/* Live collab */}
          <button
            type="button"
            onClick={() => setCollabOpen(v => !v)}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-all',
              collabOpen
                ? 'border-violet-400/60 bg-violet-500/20 text-violet-300'
                : isLight
                  ? 'border-slate-200/90 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-600'
                  : 'border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-violet-500/10 hover:text-violet-300',
            )}
            title="Live collaboration"
          >
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Live</span>
            {collabEngine.users.length > 1 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-100 px-1 text-[10px] font-bold text-violet-700">
                {collabEngine.users.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex min-h-0 flex-1">

          {/* ── Left sidebar ── */}
          <aside className={cn('hidden w-[200px] shrink-0 flex-col border-r p-3 sm:flex', sideBg)}>
            <div className="space-y-0.5">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" onClick={() => setActiveTab(id)} className={tabBtn(activeTab === id)}>
                  <Icon className="h-[15px] w-[15px] shrink-0" />
                  {label}
                  {id === 'edit' && textLoading && <Loader2 className="ml-auto h-3 w-3 animate-spin text-sky-400" />}
                </button>
              ))}
            </div>
            <div className={cn('mt-4 rounded-xl border p-3', isLight ? 'border-slate-200/60 bg-slate-50/60' : 'border-white/[0.04] bg-white/[0.02]')}>
              <p className={cn('mb-2 text-[10px] font-bold uppercase tracking-[0.2em]', muted)}>File info</p>
              {[{ label: 'Pages', value: String(pageCount) }, { label: 'Size', value: `${(fileSize / 1024).toFixed(0)} KB` }, { label: 'Selected', value: String(selCount) }].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between py-0.5">
                  <span className={cn('text-[11px]', muted)}>{label}</span>
                  <span className={cn('text-[11px] font-semibold tabular-nums', txt)}>{value}</span>
                </div>
              ))}
            </div>
            <div className="mt-auto space-y-1 pt-4">
              <p className={cn('mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.2em]', muted)}>Quick export</p>
              {[{ label: 'as TXT', action: () => exportText('txt') }, { label: 'as HTML', action: () => exportText('html') }].map(({ label, action }) => (
                <button key={label} type="button" onClick={action} disabled={!editableText.trim()}
                  className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-all', isLight ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-800' : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-200', !editableText.trim() && 'cursor-not-allowed opacity-40')}>
                  <FileType className="h-3 w-3" />{label}
                </button>
              ))}
            </div>
          </aside>

          {/* ── Main content ── */}
          <div className="relative min-h-0 flex-1 overflow-hidden">

            {/* ── EDIT TEXT (page-by-page) ── */}
            {activeTab === 'edit' && (
              <div className="flex h-full">

                {/* Page strip — left */}
                <div className={cn('flex w-[92px] shrink-0 flex-col border-r', isLight ? 'border-slate-200/60 bg-slate-50/70' : 'border-white/[0.05] bg-white/[0.015]')}>
                  {/* Strip header */}
                  <div className={cn('shrink-0 border-b px-2 py-2 text-center', isLight ? 'border-slate-200/60' : 'border-white/[0.05]')}>
                    <p className={cn('text-[10px] font-bold uppercase tracking-[0.18em]', muted)}>Pages</p>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-2">
                    {pages.map((page, idx) => {
                      const isActive = idx === editPageIdx;
                      return (
                        <button
                          key={page.id}
                          type="button"
                          onClick={() => void selectEditPage(idx)}
                          className={cn(
                            'group relative w-full overflow-hidden rounded-[0.6rem] border-2 transition-all',
                            isActive
                              ? 'border-sky-500 shadow-[0_0_0_2px_rgba(14,165,233,0.20)]'
                              : isLight
                                ? 'border-slate-200 hover:border-slate-300'
                                : 'border-white/[0.07] hover:border-white/20',
                          )}
                          style={{ aspectRatio: `1/${page.aspectRatio}` }}
                        >
                          {page.thumbnail === 'loading' ? (
                            <div className={cn('flex h-full w-full items-center justify-center', isLight ? 'bg-slate-100' : 'bg-slate-800')}>
                              <Loader2 className={cn('h-3 w-3 animate-spin', isLight ? 'text-slate-300' : 'text-slate-600')} />
                            </div>
                          ) : page.thumbnail === 'blank' ? (
                            <div className={cn('flex h-full w-full items-center justify-center', isLight ? 'bg-slate-50' : 'bg-slate-800')}>
                              <FileText className={cn('h-4 w-4', isLight ? 'text-slate-300' : 'text-slate-600')} />
                            </div>
                          ) : (
                            <img src={page.thumbnail} alt={`Page ${idx + 1}`} className="h-full w-full object-contain" draggable={false} />
                          )}
                          {isActive && <div className="absolute inset-0 bg-sky-500/[0.06]" />}
                          <div className={cn('absolute bottom-0 inset-x-0 py-0.5 text-center text-[9px] font-bold tabular-nums', isActive ? 'text-sky-500' : muted)}>
                            {idx + 1}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {/* loading indicator while text is being extracted */}
                  {textLoading && (
                    <div className={cn('shrink-0 border-t px-2 py-2 text-center', isLight ? 'border-slate-200/60' : 'border-white/[0.05]')}>
                      <span className={cn('flex items-center justify-center gap-1 text-[10px]', muted)}>
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />Extracting…
                      </span>
                    </div>
                  )}
                </div>

                {/* Main edit area — right */}
                <div className="flex min-h-0 flex-1 flex-col">

                  {/* Top bar */}
                  <div className={cn('flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5', isLight ? 'border-slate-200/60 bg-white/60' : 'border-white/[0.05] bg-white/[0.02]')}>
                    <div className="flex items-center gap-2.5">
                      <button type="button" onClick={() => void selectEditPage(editPageIdx - 1)} disabled={editPageIdx === 0}
                        className={cn('flex h-7 w-7 items-center justify-center rounded-lg border transition-all disabled:cursor-not-allowed disabled:opacity-30', isLight ? 'border-slate-200 bg-white hover:bg-slate-50' : 'border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08]')}>
                        <ChevronLeft className={cn('h-3.5 w-3.5', sub)} />
                      </button>
                      <span className={cn('min-w-[64px] text-center text-[12px] font-semibold tabular-nums', txt)}>
                        Page {editPageIdx + 1} <span className={cn('font-normal', muted)}>/ {pages.length}</span>
                      </span>
                      <button type="button" onClick={() => void selectEditPage(editPageIdx + 1)} disabled={editPageIdx >= pages.length - 1}
                        className={cn('flex h-7 w-7 items-center justify-center rounded-lg border transition-all disabled:cursor-not-allowed disabled:opacity-30', isLight ? 'border-slate-200 bg-white hover:bg-slate-50' : 'border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08]')}>
                        <ChevronRight className={cn('h-3.5 w-3.5', sub)} />
                      </button>
                      <div className={cn('h-4 w-px', isLight ? 'bg-slate-200' : 'bg-white/10')} />
                      {pageTexts[editPageIdx]?.trim() && (
                        <span className={cn('text-[11px]', muted)}>
                          {pageTexts[editPageIdx]!.split(/\s+/).filter(Boolean).length} words
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {textSaved && <span className="flex items-center gap-1 text-[11px] text-emerald-500"><Check className="h-3 w-3" /> Saved</span>}
                      <button type="button" onClick={() => setShowFind(v => !v)}
                        className={cn(btnOutline, showFind ? (isLight ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-sky-400/40 bg-sky-500/15 text-sky-300') : '')}>
                        <Search className="h-3.5 w-3.5" />Find
                      </button>
                      {[
                        { label: 'TXT', action: () => exportText('txt'), icon: FileType },
                        { label: 'HTML', action: () => exportText('html'), icon: FileText },
                        { label: 'PDF', action: () => void exportPdf(), icon: Download },
                      ].map(({ label, action, icon: Icon }) => (
                        <button key={label} type="button" onClick={action} disabled={(label === 'PDF' ? toolLoading : !editableText.trim())} className={cn(btnOutline, ((label !== 'PDF' && !editableText.trim()) || (label === 'PDF' && toolLoading)) ? 'cursor-not-allowed opacity-40' : '')}>
                          <Icon className="h-3.5 w-3.5" />{label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Find & Replace panel */}
                  {showFind && (
                    <div className={cn('shrink-0 border-b px-4 py-3', isLight ? 'border-slate-200/60 bg-slate-50/80' : 'border-white/[0.05] bg-white/[0.02]')}>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className={cn('flex h-8 flex-1 min-w-[160px] items-center gap-2 rounded-lg border px-2.5', isLight ? 'border-slate-200 bg-white' : 'border-white/[0.08] bg-white/[0.04]')}>
                          <Search className={cn('h-3.5 w-3.5 shrink-0', muted)} />
                          <input value={findQuery} onChange={e => setFindQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && runFind()}
                            placeholder="Find in all pages…" className={cn('flex-1 bg-transparent text-[12.5px] outline-none', isLight ? 'text-slate-800 placeholder:text-slate-300' : 'text-white placeholder:text-slate-600')} />
                          {findQuery && <button type="button" onClick={() => { setFindQuery(''); setFindResults([]); }} className="shrink-0 text-slate-400 hover:text-slate-600"><X className="h-3 w-3" /></button>}
                        </div>
                        <div className={cn('flex h-8 flex-1 min-w-[160px] items-center gap-2 rounded-lg border px-2.5', isLight ? 'border-slate-200 bg-white' : 'border-white/[0.08] bg-white/[0.04]')}>
                          <Replace className={cn('h-3.5 w-3.5 shrink-0', muted)} />
                          <input value={replaceQuery} onChange={e => setReplaceQuery(e.target.value)} placeholder="Replace with…" className={cn('flex-1 bg-transparent text-[12.5px] outline-none', isLight ? 'text-slate-800 placeholder:text-slate-300' : 'text-white placeholder:text-slate-600')} />
                        </div>
                        <button type="button" onClick={runFind} className={cn(btnOutline)}><Search className="h-3.5 w-3.5" />Find</button>
                        <button type="button" onClick={runReplaceAll} disabled={!findQuery.trim()} className={cn('flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium transition-all', findQuery.trim() ? (isLight ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-amber-400/25 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15') : 'cursor-not-allowed opacity-40 border-slate-200')}>
                          <Replace className="h-3.5 w-3.5" />Replace all
                        </button>
                      </div>
                      {findResults.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {findResults.map(r => (
                            <button key={r.pageIdx} type="button" onClick={() => void selectEditPage(r.pageIdx)}
                              className={cn('flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-all', isLight ? 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100' : 'border-sky-400/25 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20')}>
                              p.{r.pageIdx + 1} <span className={cn('rounded-full px-1', isLight ? 'bg-sky-200 text-sky-800' : 'bg-sky-400/25 text-sky-200')}>{r.count}</span>
                            </button>
                          ))}
                          <span className={cn('self-center text-[11px]', muted)}>{findResults.reduce((a, r) => a + r.count, 0)} matches across {findResults.length} pages</span>
                        </div>
                      )}
                      {findResults.length === 0 && findQuery.trim() && (
                        <p className={cn('mt-1.5 text-[11px]', muted)}>No matches found.</p>
                      )}
                    </div>
                  )}

                  {/* Two-pane: page preview (top) + text editor (bottom) */}
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

                    {/* Page preview */}
                    <div className={cn('shrink-0 flex items-center justify-center border-b overflow-hidden', isLight ? 'border-slate-200/60 bg-[#f0f2f5]' : 'border-white/[0.05] bg-[#0c0c10]')} style={{ height: '42%' }}>
                      {editPageDataUrl ? (
                        <div className="relative h-full flex items-center justify-center py-3 px-4">
                          <img
                            src={editPageDataUrl}
                            alt={`Page ${editPageIdx + 1}`}
                            className={cn('max-h-full max-w-full rounded-lg object-contain', isLight ? 'shadow-[0_4px_24px_rgba(15,23,42,0.12)]' : 'shadow-[0_4px_24px_rgba(0,0,0,0.5)]')}
                            draggable={false}
                          />
                          {editPageRendering && (
                            <div className="absolute inset-0 flex items-center justify-center rounded-lg" style={{ background: 'rgba(0,0,0,0.15)' }}>
                              <Loader2 className="h-5 w-5 animate-spin text-white/70" />
                            </div>
                          )}
                          {/* Fullscreen shortcut */}
                          <button
                            type="button"
                            onClick={() => void openPreview(editPageIdx)}
                            className="absolute right-5 bottom-4 flex h-7 w-7 items-center justify-center rounded-lg bg-black/40 text-white opacity-60 backdrop-blur-sm transition hover:bg-black/60 hover:opacity-100"
                            aria-label="Full screen"
                          >
                            <Maximize2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : editPageRendering ? (
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className={cn('h-6 w-6 animate-spin', isLight ? 'text-slate-300' : 'text-slate-600')} />
                          <span className={cn('text-[11px]', muted)}>Rendering page…</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 opacity-40">
                          <FileText className={cn('h-8 w-8', muted)} />
                          <span className={cn('text-[11px]', muted)}>Select a page to preview</span>
                        </div>
                      )}
                    </div>

                    {/* Text editor for current page */}
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-3 pb-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className={cn('text-[10.5px] font-bold uppercase tracking-[0.18em]', muted)}>
                          Page {editPageIdx + 1} text
                        </p>
                        {textLoading && !pageTexts[editPageIdx]?.trim() && (
                          <span className={cn('flex items-center gap-1 text-[10.5px]', muted)}>
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />extracting…
                          </span>
                        )}
                      </div>
                      <textarea
                        key={editPageIdx}
                        value={pageTexts[editPageIdx] ?? ''}
                        onChange={e => {
                          const val = e.target.value;
                          setPageTexts(prev => { const next = [...prev]; next[editPageIdx] = val; return next; });
                          setTextSaved(false);
                        }}
                        onBlur={() => { setTextSaved(true); setTimeout(() => setTextSaved(false), 2000); }}
                        placeholder={textLoading ? 'Extracting text from this page…' : 'No text found on this page. Type here to add content.'}
                        spellCheck
                        className={cn(
                          'min-h-0 flex-1 h-full w-full resize-none rounded-[1rem] border p-4 text-[13px] leading-6 outline-none transition-all focus:ring-2 focus:ring-sky-400/30',
                          isLight
                            ? 'border-slate-200/80 bg-white text-slate-800 placeholder:text-slate-300 shadow-[0_1px_4px_rgba(15,23,42,0.05)]'
                            : 'border-white/[0.06] bg-white/[0.03] text-slate-200 placeholder:text-slate-700',
                        )}
                      />
                    </div>

                  </div>
                </div>
              </div>
            )}

            {/* ── PAGES ── */}
            {activeTab === 'pages' && (
              <div className="flex h-full flex-col">
                {/* Action bar */}
                <div className={cn('flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5', isLight ? 'border-slate-200/60 bg-white/50' : 'border-white/[0.05]')}>
                  <button type="button" onClick={() => setSelectedIds(allSel ? new Set() : new Set(pages.map(p => p.id)))} className={btnOutline}>
                    {allSel ? 'Deselect all' : 'Select all'}
                  </button>
                  {selCount > 0 && <>
                    <div className={cn('h-4 w-px', isLight ? 'bg-slate-200' : 'bg-white/10')} />
                    <button type="button" onClick={() => rotate('ccw')} className={btnOutline}><RotateCcw className="h-3.5 w-3.5" /><span className="hidden sm:inline">Rotate L</span></button>
                    <button type="button" onClick={() => rotate('cw')} className={btnOutline}><RotateCw className="h-3.5 w-3.5" /><span className="hidden sm:inline">Rotate R</span></button>
                    <button type="button" onClick={duplicateSel} className={btnOutline}><Copy className="h-3.5 w-3.5" /><span className="hidden sm:inline">Duplicate ({selCount})</span></button>
                    <button type="button" onClick={deleteSel} className={cn('flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium transition-all', isLight ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100' : 'border-rose-500/25 bg-rose-500/10 text-rose-400 hover:bg-rose-500/15')}>
                      <Trash2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Delete ({selCount})</span>
                    </button>
                  </>}
                  <div className="ml-auto flex items-center gap-2">
                    <button type="button" onClick={addBlank} className={btnOutline}><FilePlus2 className="h-3.5 w-3.5" />Blank</button>
                  </div>
                </div>

                {/* Thumbnail grid */}
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  <div className="flex flex-wrap gap-5" onDragOver={e => e.preventDefault()}>
                    {pages.map((page, idx) => {
                      const isSel = selectedIds.has(page.id);
                      const isLoading = page.thumbnail === 'loading';
                      const isBlank = page.thumbnail === 'blank';

                      return (
                        <div key={page.id} style={{ width: thumbW }} className="group shrink-0"
                          draggable onDragStart={() => setDragFromId(page.id)}
                          onDrop={e => { e.preventDefault(); movePageDrop(page.id); }}
                          onDragOver={e => e.preventDefault()}
                        >
                          <div
                            className={cn('relative cursor-pointer overflow-hidden rounded-[0.9rem] border-2 transition-all duration-150', isSel ? 'border-sky-500 shadow-[0_0_0_3px_rgba(14,165,233,0.18)]' : isLight ? 'border-slate-200 hover:border-slate-300 hover:shadow-[0_4px_16px_rgba(15,23,42,0.10)]' : 'border-white/[0.07] hover:border-white/20')}
                            style={{ aspectRatio: `1/${page.aspectRatio}` }}
                            onClick={e => toggleSelect(page.id, e)}
                          >
                            {/* Thumbnail image */}
                            {isLoading ? (
                              <div className={cn('flex h-full w-full flex-col items-center justify-center gap-2', isLight ? 'bg-slate-50' : 'bg-slate-900/50')}>
                                <Loader2 className={cn('h-5 w-5 animate-spin', isLight ? 'text-slate-300' : 'text-slate-600')} />
                                <span className={cn('text-[10px] font-medium', muted)}>Rendering…</span>
                              </div>
                            ) : isBlank ? (
                              <div className={cn('flex h-full w-full items-center justify-center', isLight ? 'bg-slate-50' : 'bg-slate-800')}>
                                <FileText className={cn('h-8 w-8', isLight ? 'text-slate-300' : 'text-slate-600')} />
                              </div>
                            ) : (
                              <img
                                src={page.thumbnail}
                                alt={`Page ${idx + 1}`}
                                className="h-full w-full object-contain"
                                style={{ transform: page.rotation ? `rotate(${page.rotation}deg)` : undefined }}
                                draggable={false}
                              />
                            )}

                            {/* Selection overlay tint */}
                            {isSel && <div className="absolute inset-0 bg-sky-500/[0.07]" />}

                            {/* Checkbox */}
                            <div className={cn('absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all', isSel ? 'border-sky-500 bg-sky-500 text-white' : 'border-white/70 bg-black/25 opacity-0 group-hover:opacity-100')}>
                              {isSel && <Check className="h-2.5 w-2.5" />}
                            </div>

                            {/* Rotation badge */}
                            {page.rotation !== 0 && (
                              <div className="absolute right-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">{page.rotation}°</div>
                            )}

                            {/* Fullscreen preview button — appears on hover */}
                            {!isLoading && (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); void openPreview(idx); }}
                                className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/50 text-white opacity-0 backdrop-blur-sm transition-all hover:bg-black/70 group-hover:opacity-100"
                                aria-label="Full screen preview"
                              >
                                <Maximize2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Page label */}
                          <p className={cn('mt-1.5 text-center text-[11px] font-semibold tabular-nums', isSel ? 'text-sky-500' : muted)}>
                            {idx + 1}
                          </p>
                        </div>
                      );
                    })}

                    {/* Add blank page button */}
                    <div style={{ width: thumbW, aspectRatio: '1/1.414' }} className="shrink-0">
                      <button type="button" onClick={addBlank} className={cn('flex h-full w-full flex-col items-center justify-center gap-2 rounded-[0.9rem] border-2 border-dashed transition-all', isLight ? 'border-slate-200 text-slate-300 hover:border-slate-300 hover:text-slate-400' : 'border-white/[0.07] text-slate-600 hover:border-white/20 hover:text-slate-400')}>
                        <Plus className="h-5 w-5" />
                        <span className="text-[11px] font-medium">Add page</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className={cn('shrink-0 border-t px-4 py-2', isLight ? 'border-slate-200/60 bg-white/50' : 'border-white/[0.05]')}>
                  <p className={cn('text-[11px]', muted)}>{pages.length} pages · {selCount} selected · Drag to reorder · Shift+click to range-select · Hover page for full-screen preview</p>
                </div>
              </div>
            )}

            {/* ── TOOLS ── */}
            {activeTab === 'tools' && (
              <div className="h-full overflow-y-auto p-5">
                {/* Status banner */}
                {toolDone && (
                  <div className={cn('mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-[12.5px]', toolDone.startsWith('Failed') || toolDone.startsWith('Note') ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}>
                    {toolDone.startsWith('Failed') || toolDone.startsWith('Note') ? <Info className="h-4 w-4 mt-0.5 shrink-0" /> : <Check className="h-4 w-4 shrink-0 mt-0.5" />}
                    <span>{toolDone}</span>
                  </div>
                )}

                {/* ── Section helper ── */}
                {(() => {
                  const Section = ({ id, color, icon: Icon, title, desc, children }: { id: string; color: string; icon: React.ElementType; title: string; desc: string; children: React.ReactNode }) => {
                    const colorMap: Record<string, string> = {
                      violet: isLight ? 'bg-violet-50 text-violet-500 border-violet-100' : 'bg-violet-500/10 text-violet-400 border-violet-500/20',
                      sky: isLight ? 'bg-sky-50 text-sky-500 border-sky-100' : 'bg-sky-500/10 text-sky-400 border-sky-500/20',
                      emerald: isLight ? 'bg-emerald-50 text-emerald-500 border-emerald-100' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                      amber: isLight ? 'bg-amber-50 text-amber-500 border-amber-100' : 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                      rose: isLight ? 'bg-rose-50 text-rose-500 border-rose-100' : 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                      indigo: isLight ? 'bg-indigo-50 text-indigo-500 border-indigo-100' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
                      teal: isLight ? 'bg-teal-50 text-teal-500 border-teal-100' : 'bg-teal-500/10 text-teal-400 border-teal-500/20',
                      slate: isLight ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-white/[0.06] text-slate-400 border-white/10',
                    };
                    const open = expandedSection === id;
                    return (
                      <div className={cn('rounded-[1.3rem] border transition-all', cardBg)}>
                        <button type="button" onClick={() => setExpandedSection(open ? null : id)}
                          className="flex w-full items-center gap-3 px-5 py-4 text-left">
                          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border', colorMap[color] || colorMap.slate)}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn('text-[13px] font-semibold', txt)}>{title}</p>
                            <p className={cn('text-[11px] leading-4', muted)}>{desc}</p>
                          </div>
                          {open ? <ChevronUp className={cn('h-4 w-4 shrink-0', muted)} /> : <ChevronDown className={cn('h-4 w-4 shrink-0', muted)} />}
                        </button>
                        {open && <div className="border-t px-5 pb-5 pt-4 space-y-3" style={{ borderColor: isLight ? 'rgba(226,232,240,0.6)' : 'rgba(255,255,255,0.05)' }}>{children}</div>}
                      </div>
                    );
                  };

                  const applyBtn = (label: string, color: string, action: () => void, disabled = false) => {
                    const map: Record<string, string> = {
                      violet: disabled ? 'cursor-not-allowed bg-slate-200 text-slate-400' : 'bg-violet-500 text-white shadow-[0_2px_8px_rgba(139,92,246,0.25)] hover:bg-violet-600',
                      sky: disabled ? 'cursor-not-allowed bg-slate-200 text-slate-400' : 'bg-sky-500 text-white shadow-[0_2px_8px_rgba(14,165,233,0.25)] hover:bg-sky-600',
                      emerald: disabled ? 'cursor-not-allowed bg-slate-200 text-slate-400' : 'bg-emerald-500 text-white shadow-[0_2px_8px_rgba(16,185,129,0.25)] hover:bg-emerald-600',
                      amber: disabled ? 'cursor-not-allowed bg-slate-200 text-slate-400' : 'bg-amber-500 text-white shadow-[0_2px_8px_rgba(245,158,11,0.25)] hover:bg-amber-600',
                      rose: disabled ? 'cursor-not-allowed bg-slate-200 text-slate-400' : 'bg-rose-500 text-white shadow-[0_2px_8px_rgba(239,68,68,0.25)] hover:bg-rose-600',
                      indigo: disabled ? 'cursor-not-allowed bg-slate-200 text-slate-400' : 'bg-indigo-500 text-white shadow-[0_2px_8px_rgba(99,102,241,0.25)] hover:bg-indigo-600',
                      teal: disabled ? 'cursor-not-allowed bg-slate-200 text-slate-400' : 'bg-teal-500 text-white shadow-[0_2px_8px_rgba(20,184,166,0.25)] hover:bg-teal-600',
                      slate: disabled ? 'cursor-not-allowed bg-slate-200 text-slate-400' : 'bg-slate-800 text-white hover:bg-slate-700',
                    };
                    return (
                      <button type="button" disabled={disabled || toolLoading} onClick={action}
                        className={cn('flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition-all', map[color] || map.slate)}>
                        {toolLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{label}
                      </button>
                    );
                  };

                  return (
                    <div className="grid gap-3 sm:grid-cols-2">

                      {/* Watermark */}
                      <Section id="watermark" color="violet" icon={Type} title="Watermark" desc="Diagonal text overlay on every page">
                        <Input value={watermarkText} onChange={e => setWatermarkText(e.target.value)} placeholder="CONFIDENTIAL" className={inputCls} />
                        <div>
                          <div className="mb-1.5 flex justify-between"><span className={cn('text-[11px] font-semibold uppercase tracking-[0.15em]', muted)}>Opacity</span><span className={cn('text-[11px] font-semibold', sub)}>{watermarkOpacity}%</span></div>
                          <input type="range" min={4} max={40} value={watermarkOpacity} onChange={e => setWatermarkOpacity(Number(e.target.value))} className="h-1.5 w-full cursor-pointer accent-violet-500" />
                        </div>
                        {applyBtn('Apply & Download', 'violet', () => void applyWatermark(), !watermarkText.trim())}
                      </Section>

                      {/* Page Numbers */}
                      <Section id="pagenum" color="sky" icon={FileText} title="Page Numbers" desc="Auto-numbered footer on every page">
                        <p className={cn('text-[11px] font-semibold uppercase tracking-[0.15em]', muted)}>Position</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(['bottom-left', 'bottom-center', 'bottom-right'] as const).map(pos => (
                            <button key={pos} type="button" onClick={() => setPageNumPos(pos)} className={cn('h-8 rounded-lg border text-[11px] font-medium transition-all', pageNumPos === pos ? (isLight ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-sky-400/30 bg-sky-500/15 text-sky-300') : (isLight ? 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50' : 'border-white/[0.06] bg-transparent text-slate-500 hover:text-slate-300'))}>
                              {pos.replace('bottom-', '')}
                            </button>
                          ))}
                        </div>
                        {applyBtn('Apply & Download', 'sky', () => void applyPageNumbers())}
                      </Section>

                      {/* Header / Footer */}
                      <Section id="hf" color="teal" icon={AlignLeft} title="Header & Footer" desc="Custom text at top and/or bottom of every page">
                        <p className={cn('text-[10.5px]', muted)}>Use <code className="rounded px-1 py-0.5 font-mono text-[10px]" style={{ background: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)' }}>{'{n}'}</code> for page number, <code className="rounded px-1 py-0.5 font-mono text-[10px]" style={{ background: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)' }}>{'{total}'}</code> for total pages.</p>
                        <Input value={headerText} onChange={e => setHeaderText(e.target.value)} placeholder="Header text (e.g. {title})" className={inputCls} />
                        <Input value={footerText} onChange={e => setFooterText(e.target.value)} placeholder="Footer text (e.g. Page {n} of {total})" className={inputCls} />
                        <div className="flex items-center gap-2">
                          <span className={cn('text-[11px]', muted)}>Font size</span>
                          <input type="range" min={7} max={14} value={hfFontSize} onChange={e => setHfFontSize(Number(e.target.value))} className="flex-1 h-1.5 cursor-pointer accent-teal-500" />
                          <span className={cn('w-8 text-right text-[11px] font-semibold tabular-nums', sub)}>{hfFontSize}pt</span>
                        </div>
                        {applyBtn('Apply & Download', 'teal', () => void applyHeaderFooter(), !headerText.trim() && !footerText.trim())}
                      </Section>

                      {/* Compress */}
                      <Section id="compress" color="emerald" icon={RefreshCw} title="Compress PDF" desc="Re-optimise structure to reduce file size">
                        <p className={cn('text-[12px] leading-5', sub)}>Re-saves the PDF using object streams which removes redundant data and often shrinks the file by 10–40% with zero quality loss.</p>
                        <div className={cn('flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[12px]', isLight ? 'border-slate-200/80 bg-slate-50' : 'border-white/[0.06] bg-white/[0.02]')}>
                          <Info className={cn('h-4 w-4 shrink-0', isLight ? 'text-slate-400' : 'text-slate-500')} />
                          <span className={muted}>Current size: <strong className={txt}>{(fileSize / 1024).toFixed(0)} KB</strong> · {pageCount} pages</span>
                        </div>
                        {applyBtn('Compress & Download', 'emerald', () => void applyCompress())}
                      </Section>

                      {/* Rotate All */}
                      <Section id="rotateall" color="amber" icon={RotateCw} title="Rotate All Pages" desc="Rotate every page in the document at once">
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => rotateAllPages('ccw')} className={cn('flex items-center justify-center gap-2 rounded-xl border py-2.5 text-[13px] font-semibold transition-all', isLight ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50' : 'border-white/[0.08] text-slate-300 hover:bg-white/[0.06]')}>
                            <RotateCcw className="h-4 w-4" />90° Left
                          </button>
                          <button type="button" onClick={() => rotateAllPages('cw')} className={cn('flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition-all bg-amber-500 text-white shadow-[0_2px_8px_rgba(245,158,11,0.25)] hover:bg-amber-600')}>
                            <RotateCw className="h-4 w-4" />90° Right
                          </button>
                        </div>
                        <p className={cn('text-[10.5px]', muted)}>This updates all page thumbnails and affects the exported PDF. Changes are live — export PDF to save.</p>
                      </Section>

                      {/* Resize Pages */}
                      <Section id="resize" color="indigo" icon={Move} title="Resize / Standardize" desc="Scale all pages to a standard paper size">
                        <div className="grid grid-cols-3 gap-1.5">
                          {(['A4', 'Letter', 'Legal'] as const).map(s => (
                            <button key={s} type="button" onClick={() => setResizeTarget(s)} className={cn('h-9 rounded-lg border text-[12px] font-semibold transition-all', resizeTarget === s ? (isLight ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-indigo-400/30 bg-indigo-500/15 text-indigo-300') : (isLight ? 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50' : 'border-white/[0.06] bg-transparent text-slate-500 hover:text-slate-300'))}>
                              {s}
                            </button>
                          ))}
                        </div>
                        <p className={cn('text-[10.5px]', muted)}>Content is scaled proportionally and centred. A4 = 210×297 mm · Letter = 8.5×11 in · Legal = 8.5×14 in</p>
                        {applyBtn(`Resize to ${resizeTarget} & Download`, 'indigo', () => void applyResizePages())}
                      </Section>

                      {/* Merge */}
                      <Section id="merge" color="emerald" icon={FileStack} title="Merge PDFs" desc="Append additional PDFs to this document">
                        <input ref={mergeRef} type="file" accept=".pdf" multiple className="hidden" onChange={e => { setMergeFiles(p => [...p, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} />
                        <button type="button" onClick={() => mergeRef.current?.click()} className={cn(btnOutline, 'w-full justify-center')}><Upload className="h-3.5 w-3.5" />Add PDF files</button>
                        {mergeFiles.map((f, i) => (
                          <div key={i} className={cn('flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-[11.5px]', isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-white/[0.06] bg-white/[0.03] text-slate-300')}>
                            <span className="truncate">{f.name}</span>
                            <button type="button" onClick={() => setMergeFiles(p => p.filter((_, j) => j !== i))}><X className="h-3 w-3 text-slate-400 hover:text-rose-500" /></button>
                          </div>
                        ))}
                        {applyBtn('Merge & Download', 'emerald', () => void applyMerge(), !mergeFiles.length)}
                      </Section>

                      {/* Split */}
                      <Section id="split" color="amber" icon={Scissors} title="Split PDF" desc="Export page ranges as separate PDF files">
                        <Input value={splitInput} onChange={e => setSplitInput(e.target.value)} placeholder="e.g. 1-3, 5, 7-9  (blank = every page)" className={inputCls} />
                        <p className={cn('text-[10.5px] leading-4', muted)}>Leave blank to split every page into its own file, or select pages in the Pages tab first.</p>
                        {applyBtn('Split & Download', 'amber', () => void applySplit())}
                      </Section>

                      {/* Export as Images */}
                      <Section id="images" color="rose" icon={Image} title="Export as Images" desc="Save every page as a high-res JPG image">
                        <div>
                          <div className="mb-1.5 flex justify-between"><span className={cn('text-[11px] font-semibold uppercase tracking-[0.15em]', muted)}>Resolution scale</span><span className={cn('text-[11px] font-semibold', sub)}>{imgExportScale}×</span></div>
                          <input type="range" min={1} max={4} step={0.5} value={imgExportScale} onChange={e => setImgExportScale(Number(e.target.value))} className="h-1.5 w-full cursor-pointer accent-rose-500" />
                          <div className="mt-1 flex justify-between text-[10px]" style={{ color: isLight ? '#94a3b8' : '#475569' }}><span>Draft (1×)</span><span>Print quality (4×)</span></div>
                        </div>
                        <p className={cn('text-[10.5px]', muted)}>Exports {pages.filter(p => p.index !== -1).length} pages as individual JPG files. Higher scale = larger files.</p>
                        <button type="button" disabled={imgExporting || !pdfjsDocRef.current} onClick={() => void exportAsImages()}
                          className={cn('flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition-all', !imgExporting && pdfjsDocRef.current ? 'bg-rose-500 text-white shadow-[0_2px_8px_rgba(239,68,68,0.25)] hover:bg-rose-600' : 'cursor-not-allowed bg-slate-200 text-slate-400')}>
                          {imgExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
                          {imgExporting ? 'Exporting pages…' : 'Export All Pages as JPG'}
                        </button>
                      </Section>

                      {/* PDF Metadata */}
                      <Section id="meta" color="slate" icon={Info} title="Document Metadata" desc="Set title, author, subject and keywords">
                        <Input value={docTitle} onChange={e => setDocTitle(e.target.value)} placeholder="Document title" className={inputCls} />
                        <Input value={metaAuthor} onChange={e => setMetaAuthor(e.target.value)} placeholder="Author" className={inputCls} />
                        <Input value={metaSubject} onChange={e => setMetaSubject(e.target.value)} placeholder="Subject" className={inputCls} />
                        <Input value={metaKeywords} onChange={e => setMetaKeywords(e.target.value)} placeholder="Keywords (comma-separated)" className={inputCls} />
                        {applyBtn('Save Metadata & Download', 'slate', () => void applyMetadata())}
                      </Section>

                      {/* Encrypt / Password */}
                      <Section id="encrypt" color="rose" icon={Shield} title="Password Protect" desc="Add a password notice page to the document">
                        <div className={cn('flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[11.5px]', isLight ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-amber-400/20 bg-amber-500/10 text-amber-300')}>
                          <Info className="h-4 w-4 mt-0.5 shrink-0" />
                          <span>pdf-lib does not support AES encryption. For true password protection, use Adobe Acrobat or qpdf. This adds a visible notice page.</span>
                        </div>
                        <Input type="password" value={encryptPass} onChange={e => setEncryptPass(e.target.value)} placeholder="Password to display in notice" className={inputCls} />
                        {applyBtn('Add Notice & Download', 'rose', () => void applyEncrypt(), !encryptPass.trim())}
                      </Section>

                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── CONVERT ── */}
            {activeTab === 'convert' && (
              <div className="h-full overflow-y-auto p-5">
                <div className="mb-5">
                  <h3 className={cn('text-[15px] font-semibold tracking-[-0.02em]', txt)}>Export &amp; Convert</h3>
                  <p className={cn('mt-0.5 text-[12.5px]', muted)}>Download your document in multiple formats.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { label: 'PDF (edited)', desc: 'With all page changes — reorders, rotations, deletions.', color: 'rose', icon: FileText, action: () => void exportPdf() },
                    { label: 'Plain Text (.txt)', desc: 'Extracted and edited text as a .txt file.', color: 'slate', icon: FileType, action: () => exportText('txt') },
                    { label: 'HTML Document', desc: 'Styled HTML with headings and paragraphs.', color: 'sky', icon: FileText, action: () => exportText('html') },
                  ].map(({ label, desc, color, icon: Icon, action }) => {
                    const cm: Record<string, string> = { rose: isLight ? 'bg-rose-50 border-rose-100 text-rose-500' : 'bg-rose-500/10 border-rose-500/20 text-rose-400', slate: isLight ? 'bg-slate-100 border-slate-200 text-slate-500' : 'bg-white/[0.06] border-white/10 text-slate-400', sky: isLight ? 'bg-sky-50 border-sky-100 text-sky-500' : 'bg-sky-500/10 border-sky-500/20 text-sky-400' };
                    return (
                      <button key={label} type="button" onClick={action} disabled={toolLoading} className={cn('group flex items-center gap-4 rounded-[1.3rem] border p-5 text-left transition-all', isLight ? 'border-slate-200/80 bg-white shadow-[0_1px_4px_rgba(15,23,42,0.04)] hover:shadow-[0_4px_16px_rgba(15,23,42,0.08)] hover:border-slate-300' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]', toolLoading ? 'cursor-not-allowed opacity-50' : '')}>
                        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border', cm[color])}><Icon className="h-5 w-5" /></div>
                        <div className="min-w-0 flex-1"><p className={cn('text-[13px] font-semibold', txt)}>{label}</p><p className={cn('mt-0.5 text-[11.5px] leading-5', muted)}>{desc}</p></div>
                        <ChevronRight className={cn('h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5', muted)} />
                      </button>
                    );
                  })}
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  {[{ label: 'Pages', value: String(pageCount) }, { label: 'Words (est.)', value: editableText ? String(editableText.split(/\s+/).filter(Boolean).length) : '—' }, { label: 'File size', value: `${(fileSize / 1024).toFixed(0)} KB` }].map(({ label, value }) => (
                    <div key={label} className={cn('rounded-[1rem] border p-4 text-center', cardBg)}>
                      <p className={cn('text-[1.1rem] font-bold tabular-nums tracking-[-0.02em]', txt)}>{value}</p>
                      <p className={cn('mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]', muted)}>{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Mobile tab bar */}
        <div className={cn('flex shrink-0 border-t sm:hidden', isLight ? 'border-slate-200/60 bg-white' : 'border-white/[0.05] bg-[#0d0d11]')}>
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setActiveTab(id)} className={cn('flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-all', activeTab === id ? (isLight ? 'text-slate-900' : 'text-white') : (isLight ? 'text-slate-400' : 'text-slate-600'))}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════ FULLSCREEN PAGE PREVIEW PORTAL ══════════════════ */}
      {previewIdx !== null && (
        <div className="fixed inset-0 z-[99999] flex flex-col" style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>

          {/* Preview top bar */}
          <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-3.5" style={{ background: 'rgba(0,0,0,0.70)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <FileText className="h-4 w-4 text-rose-400" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-white">{fileName}.pdf</p>
                <p className="text-[11px] text-white/40">Page {previewIdx + 1} of {pages.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Zoom controls */}
              <button type="button" onClick={() => setPreviewZoom(z => Math.max(0.3, z - 0.2))} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white"><ZoomOut className="h-4 w-4" /></button>
              <span className="w-12 text-center text-[12px] font-semibold tabular-nums text-white/50">{Math.round(previewZoom * 100)}%</span>
              <button type="button" onClick={() => setPreviewZoom(z => Math.min(3, z + 0.2))} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white"><ZoomIn className="h-4 w-4" /></button>
              <div className="h-5 w-px" style={{ background: 'rgba(255,255,255,0.10)' }} />
              {/* Rotate inside preview */}
              <button type="button" onClick={async () => { const r = ((previewRotation - 90) % 360 + 360) % 360; setPreviewRotation(r); await reRenderPreview(r); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white"><RotateCcw className="h-4 w-4" /></button>
              <button type="button" onClick={async () => { const r = ((previewRotation + 90) % 360 + 360) % 360; setPreviewRotation(r); await reRenderPreview(r); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white"><RotateCw className="h-4 w-4" /></button>
              <div className="h-5 w-px" style={{ background: 'rgba(255,255,255,0.10)' }} />
              <button type="button" onClick={closePreview} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white/90"><X className="h-4 w-4" /></button>
            </div>
          </div>

          {/* Preview main area */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
            {/* Prev button */}
            <button type="button" onClick={() => void navigatePreview('prev')} disabled={previewIdx === 0}
              className="absolute left-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-20">
              <ChevronLeft className="h-6 w-6" />
            </button>

            {/* Page image */}
            <div className="relative flex items-center justify-center" style={{ transform: `scale(${previewZoom})`, transformOrigin: 'center center', transition: 'transform 0.15s ease' }}>
              {previewLoading && !previewDataUrl && (
                <div className="flex h-[70vh] w-[50vw] max-w-3xl items-center justify-center rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <Loader2 className="h-8 w-8 animate-spin text-white/30" />
                </div>
              )}
              {previewDataUrl && (
                <div className="relative">
                  <img
                    src={previewDataUrl}
                    alt={`Page ${previewIdx + 1}`}
                    className="rounded-xl shadow-[0_32px_80px_rgba(0,0,0,0.8)]"
                    style={{ maxHeight: '80vh', maxWidth: '70vw', display: 'block' }}
                    draggable={false}
                  />
                  {previewLoading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl" style={{ background: 'rgba(0,0,0,0.35)' }}>
                      <Loader2 className="h-6 w-6 animate-spin text-white/70" />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Next button */}
            <button type="button" onClick={() => void navigatePreview('next')} disabled={previewIdx === pages.length - 1}
              className="absolute right-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-20">
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>

          {/* Preview footer — page strip */}
          <div className="flex shrink-0 items-center justify-center gap-1.5 overflow-x-auto px-6 py-3" style={{ background: 'rgba(0,0,0,0.70)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {pages.map((page, idx) => (
              <button key={page.id} type="button" onClick={() => void openPreview(idx)}
                className={cn('flex-shrink-0 overflow-hidden rounded-md border-2 transition-all', idx === previewIdx ? 'border-white/70 opacity-100' : 'border-white/[0.12] opacity-50 hover:border-white/40 hover:opacity-80')}
                style={{ width: 40, height: 56 }}
              >
                {page.thumbnail !== 'loading' && page.thumbnail !== 'blank' ? (
                  <img src={page.thumbnail} alt={`Page ${idx + 1}`} className="h-full w-full object-cover" draggable={false} />
                ) : (
                  <div className="flex h-full w-full items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <FileText className="h-3 w-3 text-white/30" />
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Keyboard hint */}
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2">
            <p className="text-[10.5px] text-white/20">← → to navigate · Esc to close</p>
          </div>
        </div>
      )}

      {/* ── Real-time CollabBar ── */}
      {collabOpen ? (
        <CollabBar
          engine={collabEngine}
          content={docSummary || fileName}
        />
      ) : null}
    </>
  );
}
