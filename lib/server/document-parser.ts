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

export async function extractDocumentText(fileName: string, mimeType: string, buffer: Buffer) {
  const extension = getExtension(fileName);
  const normalizedMime = mimeType.toLowerCase();
  const readableTextFallback = extractReadableTextFromBuffer(buffer);

  console.log(`[doc-parser] start file="${fileName}" mime="${normalizedMime}" ext="${extension}" size=${buffer.length}B`);

  if (
    normalizedMime.startsWith('text/')
    || ['txt', 'md', 'html', 'htm', 'csv', 'json', 'xml', 'rtf'].includes(extension)
  ) {
    const text = preserveDocumentStructure(buffer.toString('utf8'));
    console.log(`[doc-parser] plain-text path → ${text.length} chars`);
    return text;
  }

  if (normalizedMime === 'application/pdf' || extension === 'pdf') {
    console.log('[doc-parser] PDF path — trying pdf-parse');
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
        console.log(`[doc-parser] pdf-parse OK → ${text.length} chars`);
        return text;
      }
      console.warn('[doc-parser] pdf-parse returned empty text');
    } catch (err) {
      console.error('[doc-parser] pdf-parse failed:', err instanceof Error ? err.message : err);
    }

    console.log('[doc-parser] trying pdftotext binary');
    try {
      const text = await extractPdfTextWithPdftotext(buffer);
      if (hasEnoughReadableText(text)) {
        console.log(`[doc-parser] pdftotext OK → ${text.length} chars`);
        return text;
      }
      console.warn(`[doc-parser] pdftotext returned too little text: ${text.length} chars`);
    } catch (err) {
      console.error('[doc-parser] pdftotext failed (binary may not be installed on this server):', err instanceof Error ? err.message : err);
    }

    console.log('[doc-parser] trying OCR (Swift/pdftoppm) fallback');
    try {
      const text = await extractPdfTextWithOcr(buffer);
      if (hasEnoughReadableText(text)) {
        console.log(`[doc-parser] OCR OK → ${text.length} chars`);
        return text;
      }
      console.warn(`[doc-parser] OCR returned too little text: ${text.length} chars`);
    } catch (err) {
      console.error('[doc-parser] OCR failed (pdftoppm/swift not available on this server):', err instanceof Error ? err.message : err);
    }

    if (readableTextFallback) {
      console.log(`[doc-parser] using raw-bytes UTF-8 fallback → ${readableTextFallback.length} chars`);
      return readableTextFallback;
    }

    console.error('[doc-parser] all PDF extraction methods failed — throwing');
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
