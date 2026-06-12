'use client';

type PdfRenderResult = {
  pages: string[];
  pageCount: number;
  renderedPages: number;
};

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

async function loadPdfJs() {
  // Use the legacy build for maximum compatibility with bundlers and SSR environments.
  // Worker is provided via `?url` so Next treats it as a static asset (string URL).
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.min.mjs')) as any;
  const workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default as string;
  if (pdfjs?.GlobalWorkerOptions && typeof workerSrc === 'string') {
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  }
  return pdfjs;
}

export async function renderPdfDataUrlToPngPages(options: {
  pdfDataUrl: string;
  maxPages?: number;
  scale?: number;
  signal?: AbortSignal;
}): Promise<PdfRenderResult> {
  const bytes = decodeBase64PdfDataUrl(options.pdfDataUrl);
  if (!bytes?.length) {
    throw new Error('Invalid PDF data URL.');
  }

  const pdfjs = await loadPdfJs();
  const resolvedMaxPages = Math.max(1, Math.min(40, Number(options.maxPages ?? 24)));
  const resolvedScale = Math.max(0.6, Math.min(2.4, Number(options.scale ?? 1.5)));

  // Disable worker for maximum robustness in Next dev/prod environments.
  // This avoids worker-src / module-worker edge cases.
  const loadingTask = pdfjs.getDocument({ data: bytes, disableWorker: true });
  if (options.signal) {
    const onAbort = () => {
      try {
        loadingTask?.destroy?.();
      } catch {
        // ignore
      }
    };
    if (options.signal.aborted) onAbort();
    else options.signal.addEventListener('abort', onAbort, { once: true });
  }

  const doc = await loadingTask.promise;
  const total = Math.min(resolvedMaxPages, Number(doc.numPages || 1));
  const pages: string[] = [];

  for (let i = 1; i <= total; i += 1) {
    if (options.signal?.aborted) break;
    const pdfPage = await doc.getPage(i);
    const viewport = pdfPage.getViewport({ scale: resolvedScale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Unable to create canvas context for PDF preview.');
    await pdfPage.render({ canvasContext: ctx as any, viewport }).promise;
    pages.push(canvas.toDataURL('image/png'));
  }

  return {
    pages,
    pageCount: Number(doc.numPages || pages.length),
    renderedPages: pages.length,
  };
}

export async function renderPdfFileToPngPages(options: {
  file: File;
  maxPages?: number;
  scale?: number;
  signal?: AbortSignal;
}): Promise<PdfRenderResult> {
  const bytes = new Uint8Array(await options.file.arrayBuffer());
  if (!bytes.length) throw new Error('Empty PDF file.');

  const pdfjs = await loadPdfJs();
  const resolvedMaxPages = Math.max(1, Math.min(40, Number(options.maxPages ?? 24)));
  const resolvedScale = Math.max(0.6, Math.min(2.4, Number(options.scale ?? 1.5)));

  const loadingTask = pdfjs.getDocument({ data: bytes, disableWorker: true });
  if (options.signal) {
    const onAbort = () => {
      try {
        loadingTask?.destroy?.();
      } catch {
        // ignore
      }
    };
    if (options.signal.aborted) onAbort();
    else options.signal.addEventListener('abort', onAbort, { once: true });
  }

  const doc = await loadingTask.promise;
  const total = Math.min(resolvedMaxPages, Number(doc.numPages || 1));
  const pages: string[] = [];

  for (let i = 1; i <= total; i += 1) {
    if (options.signal?.aborted) break;
    const pdfPage = await doc.getPage(i);
    const viewport = pdfPage.getViewport({ scale: resolvedScale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Unable to create canvas context for PDF preview.');
    await pdfPage.render({ canvasContext: ctx as any, viewport }).promise;
    pages.push(canvas.toDataURL('image/png'));
  }

  return {
    pages,
    pageCount: Number(doc.numPages || pages.length),
    renderedPages: pages.length,
  };
}
