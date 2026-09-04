import mammoth from 'mammoth';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { preserveDocumentStructure } from '@/lib/document-parser-analysis';

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

function getExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

function stripXmlTags(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function hasEnoughReadableText(value: string) {
  const normalized = preserveDocumentStructure(value);
  return normalized.length >= 24;
}

async function withTemporaryDirectory<T>(work: (dir: string) => Promise<T>) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docrud-parser-'));
  try {
    return await work(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function extractPdfTextWithPdftotext(buffer: Buffer) {
  return withTemporaryDirectory(async (dir) => {
    const pdfPath = path.join(dir, 'source.pdf');
    const textPath = path.join(dir, 'source.txt');
    await fs.writeFile(pdfPath, buffer);
    await execFileAsync('/opt/homebrew/bin/pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, textPath]);
    const text = await fs.readFile(textPath, 'utf8').catch(() => '');
    return preserveDocumentStructure(text);
  });
}

async function extractPdfTextWithOcr(buffer: Buffer) {
  return withTemporaryDirectory(async (dir) => {
    const pdfPath = path.join(dir, 'source.pdf');
    const imagePrefix = path.join(dir, 'page');
    await fs.writeFile(pdfPath, buffer);
    await execFileAsync('/opt/homebrew/bin/pdftoppm', ['-png', '-f', '1', '-l', '3', pdfPath, imagePrefix]);
    const files = (await fs.readdir(dir))
      .filter((file) => file.startsWith('page-') && file.endsWith('.png'))
      .sort()
      .map((file) => path.join(dir, file));
    if (files.length === 0) {
      return '';
    }
    const scriptPath = path.join(process.cwd(), 'scripts', 'ocr-images.swift');
    const { stdout } = await execFileAsync('/usr/bin/swift', [scriptPath, ...files], { maxBuffer: 8 * 1024 * 1024 });
    return preserveDocumentStructure(stdout || '');
  });
}

async function extractImageTextWithOcr(buffer: Buffer, extension: string) {
  return withTemporaryDirectory(async (dir) => {
    const imagePath = path.join(dir, `source.${extension || 'png'}`);
    const scriptPath = path.join(process.cwd(), 'scripts', 'ocr-images.swift');
    await fs.writeFile(imagePath, buffer);
    const { stdout } = await execFileAsync('/usr/bin/swift', [scriptPath, imagePath], { maxBuffer: 8 * 1024 * 1024 });
    return preserveDocumentStructure(stdout || '');
  });
}

function extractReadableTextFromBuffer(buffer: Buffer) {
  const text = buffer.toString('utf8');
  const printable = text.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
  const ratio = text.length ? printable.length / text.length : 0;
  const normalized = preserveDocumentStructure(printable);
  if (ratio > 0.72 && normalized.length >= 24) {
    return normalized;
  }
  return '';
}

async function extractZipEntryText(buffer: Buffer, patterns: RegExp[]) {
  const zip = await JSZip.loadAsync(buffer);
  const entryNames = Object.keys(zip.files).filter((name) => patterns.some((pattern) => pattern.test(name)));
  if (entryNames.length === 0) {
    return '';
  }

  const chunks = await Promise.all(
    entryNames.slice(0, 30).map(async (entryName) => {
      const entry = zip.files[entryName];
      if (!entry || entry.dir) {
        return '';
      }
      const raw = await entry.async('text');
      return stripXmlTags(raw);
    }),
  );

  return preserveDocumentStructure(chunks.filter(Boolean).join('\n\n'));
}

/**
 * Are the local command-line helpers usable at all?
 *
 * `pdftotext`, `pdftoppm` and `swift` are referenced by ABSOLUTE macOS paths
 * (/opt/homebrew, /usr/bin/swift). On a Linux serverless runtime they cannot
 * exist, so attempting them there spends a process spawn each to earn a
 * guaranteed ENOENT, and — worse — buries the ONE real failure (pdf-parse)
 * under three "failed" lines that look like the same class of problem. That is
 * how production came to report
 *
 *     [doc-parser] all PDF extraction methods failed — throwing
 *
 * when in truth only one method was ever available.
 */
const NATIVE_HELPERS_AVAILABLE = process.platform === 'darwin';

/** One structured line per stage. Never carries document text or PII. */
function stage(name: string, outcome: string, detail?: Record<string, unknown>) {
  const extra = detail
    ? ' ' + Object.entries(detail).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')
    : '';
  console.log(`[doc-parser] stage=${name} outcome=${outcome}${extra}`);
}

/**
 * An error, reduced to something safe to log.
 *
 * Name and a TRUNCATED message only. A parser can put fragments of the document
 * it choked on into its message, and this runs on résumés — so the message is
 * capped hard and newlines are flattened rather than passed through.
 */
function safeError(err: unknown): { name: string; message: string } {
  const e = err as Error;
  return {
    name: e?.name || 'Error',
    message: String(e?.message ?? '').replace(/\s+/g, ' ').slice(0, 200),
  };
}

export async function extractDocumentText(fileName: string, mimeType: string, buffer: Buffer) {
  const extension = getExtension(fileName);
  const normalizedMime = mimeType.toLowerCase();
  const readableTextFallback = extractReadableTextFromBuffer(buffer);
  const startedAt = Date.now();

  /* The NAME is not logged — a résumé filename is routinely "Firstname
     Lastname CV.pdf", which is exactly the PII this must not emit. Type and
     size are what a production diagnosis actually needs. */
  stage('start', 'begin', {
    mime: normalizedMime, ext: extension, bytes: buffer.length,
    platform: process.platform, nativeHelpers: NATIVE_HELPERS_AVAILABLE,
  });

  if (
    normalizedMime.startsWith('text/')
    || ['txt', 'md', 'html', 'htm', 'csv', 'json', 'xml', 'rtf'].includes(extension)
  ) {
    const text = preserveDocumentStructure(buffer.toString('utf8'));
    console.log(`[doc-parser] plain-text path → ${text.length} chars`);
    return text;
  }

  if (normalizedMime === 'application/pdf' || extension === 'pdf') {
    stage('pdf-parse', 'attempt');
    try {
      // pdf-parse v2 exports { PDFParse } as a class, not a default function
      const pdfParseModule = require('pdf-parse') as { PDFParse?: new (opts: { data: Uint8Array }) => { getText(): Promise<{ text: string }> }; default?: (buf: Buffer) => Promise<{ text: string }> };
      let text = '';
      if (typeof pdfParseModule.PDFParse === 'function') {
        // v2 API: class-based
        const parser = new pdfParseModule.PDFParse({ data: new Uint8Array(buffer) });
        const result = await parser.getText();
        text = preserveDocumentStructure(result.text || '');
      } else {
        // v1 API: callable function (default or module itself)
        const fn = (typeof pdfParseModule === 'function' ? pdfParseModule : pdfParseModule.default) as unknown as (buf: Buffer) => Promise<{ text: string }>;
        const parsed = await fn(buffer);
        text = preserveDocumentStructure(parsed.text || '');
      }
      if (text) {
        stage('pdf-parse', 'ok', { chars: text.length, ms: Date.now() - startedAt });
        return text;
      }
      /* Parsed cleanly, contained no text layer — a scanned/image-only PDF.
         A distinct outcome from a parser error, and the one OCR exists for. */
      stage('pdf-parse', 'empty-text-layer', { ms: Date.now() - startedAt });
    } catch (err) {
      /* THE line that matters in production. Everything below this point is
         macOS-only, so on a Linux runtime this error IS the whole story. */
      stage('pdf-parse', 'failed', { ...safeError(err), ms: Date.now() - startedAt });
    }

    if (NATIVE_HELPERS_AVAILABLE) {
      try {
        const text = await extractPdfTextWithPdftotext(buffer);
        if (hasEnoughReadableText(text)) {
          stage('pdftotext', 'ok', { chars: text.length, ms: Date.now() - startedAt });
          return text;
        }
        stage('pdftotext', 'insufficient-text', { chars: text.length });
      } catch (err) {
        stage('pdftotext', 'failed', safeError(err));
      }

      try {
        const text = await extractPdfTextWithOcr(buffer);
        if (hasEnoughReadableText(text)) {
          stage('ocr', 'ok', { chars: text.length, ms: Date.now() - startedAt });
          return text;
        }
        stage('ocr', 'insufficient-text', { chars: text.length });
      } catch (err) {
        stage('ocr', 'failed', safeError(err));
      }
    } else {
      /* Said once, plainly, so a production log never again implies that three
         extraction methods were tried when only one could run. */
      stage('native-helpers', 'unavailable-on-platform', { platform: process.platform });
    }

    if (readableTextFallback) {
      stage('raw-bytes', 'ok', { chars: readableTextFallback.length, ms: Date.now() - startedAt });
      return readableTextFallback;
    }

    stage('pdf', 'exhausted', {
      attempted: NATIVE_HELPERS_AVAILABLE ? 'pdf-parse,pdftotext,ocr,raw-bytes' : 'pdf-parse,raw-bytes',
      ms: Date.now() - startedAt,
    });
    throw new Error('This PDF could not be read clearly enough for analysis. Try a sharper PDF, or paste the resume text directly.');
  }

  if (
    normalizedMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || normalizedMime === 'application/vnd.ms-word.document.macroenabled.12'
    || extension === 'docx'
    || extension === 'docm'
  ) {
    console.log('[doc-parser] DOCX path — trying mammoth');
    try {
      const parsed = await mammoth.extractRawText({ buffer });
      const text = preserveDocumentStructure(parsed.value || '');
      if (text) {
        console.log(`[doc-parser] mammoth OK → ${text.length} chars`);
        return text;
      }
      console.warn('[doc-parser] mammoth returned empty text, trying ZIP/XML fallback');
    } catch (err) {
      console.error('[doc-parser] mammoth failed:', err instanceof Error ? err.message : err);
    }

    const zipText = await extractZipEntryText(buffer, [/^word\/.*\.xml$/i, /^docProps\/.*\.xml$/i]);
    if (zipText) {
      console.log(`[doc-parser] DOCX ZIP/XML fallback OK → ${zipText.length} chars`);
      return zipText;
    }
    console.error('[doc-parser] DOCX ZIP/XML fallback also returned empty');
  }

  if (
    normalizedMime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || normalizedMime === 'application/vnd.ms-excel'
    || extension === 'xlsx'
    || extension === 'xls'
  ) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetText = workbook.SheetNames.slice(0, 3)
      .map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        return XLSX.utils.sheet_to_csv(sheet);
      })
      .join('\n\n');
    const text = preserveDocumentStructure(sheetText);
    if (text) {
      console.log(`[doc-parser] XLSX OK → ${text.length} chars`);
      return text;
    }
  }

  if (
    normalizedMime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    || normalizedMime === 'application/vnd.oasis.opendocument.presentation'
    || extension === 'pptx'
    || extension === 'odp'
  ) {
    const zipText = await extractZipEntryText(buffer, [/^ppt\/slides\/.*\.xml$/i, /^content\.xml$/i]);
    if (zipText) {
      console.log(`[doc-parser] PPTX/ODP ZIP OK → ${zipText.length} chars`);
      return zipText;
    }
  }

  if (
    normalizedMime === 'application/vnd.oasis.opendocument.text'
    || normalizedMime === 'application/vnd.oasis.opendocument.spreadsheet'
    || extension === 'odt'
    || extension === 'ods'
  ) {
    const zipText = await extractZipEntryText(buffer, [/^content\.xml$/i]);
    if (zipText) {
      console.log(`[doc-parser] ODT/ODS ZIP OK → ${zipText.length} chars`);
      return zipText;
    }
  }

  if (
    normalizedMime.startsWith('image/')
    || ['png', 'jpg', 'jpeg', 'webp', 'heic', 'gif', 'bmp', 'tiff', 'tif'].includes(extension)
  ) {
    console.log('[doc-parser] image path — trying OCR');
    try {
      const text = await extractImageTextWithOcr(buffer, extension || 'png');
      if (hasEnoughReadableText(text)) {
        console.log(`[doc-parser] image OCR OK → ${text.length} chars`);
        return text;
      }
      console.warn('[doc-parser] image OCR returned too little text');
    } catch (err) {
      console.error('[doc-parser] image OCR failed (swift not available):', err instanceof Error ? err.message : err);
    }
    throw new Error('This image could not be read clearly enough for analysis. Upload a sharper image or paste the extracted text.');
  }

  if (readableTextFallback) {
    console.log(`[doc-parser] using generic raw-bytes fallback → ${readableTextFallback.length} chars`);
    return readableTextFallback;
  }

  console.error(`[doc-parser] no extraction method matched for ext="${extension}" mime="${normalizedMime}"`);
  throw new Error(`Unable to extract readable text from this ${extension ? extension.toUpperCase() : 'file'} upload. Try PDF, DOCX, XLSX, PPTX, ODT, CSV, JSON, HTML, markdown, or paste the document text directly.`);
}
