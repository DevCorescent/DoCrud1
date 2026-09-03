/**
 * Turning an uploaded file into a storable company mark.
 *
 * ═══ THE BYTES DECIDE, NOT THE FILENAME ═══
 *
 * `validateCompanyLogoUpload` checks what the uploader CLAIMS (MIME type and
 * extension). Both are attacker-controlled strings. This module opens the file
 * and reads its magic bytes, and that answer wins: a `.png` whose contents are
 * an SVG is treated as an SVG and sanitised as one, and a file that is neither
 * is refused.
 */

import sharp from 'sharp';
import { sanitizeCompanyLogoSvg } from '@/lib/security/svg-sanitizer';
import { COMPANY_LOGO_MAX_BYTES } from '@/lib/company-logo-uploads';

export type LogoFormat = 'svg' | 'png' | 'jpg' | 'webp';

export interface PreparedLogo {
  ok: true;
  format: LogoFormat;
  /** What must be written to storage — for SVG this is the SANITISED text. */
  body: Buffer;
  contentType: string;
  width?: number;
  height?: number;
}
export interface RejectedLogo { ok: false; message: string }

/** Smallest mark worth storing; below this it is an icon fragment or corrupt. */
const MIN_DIMENSION = 8;
const MAX_DIMENSION = 4096;

/**
 * The real format, from the file's own leading bytes.
 *
 * Returns null when the content is not one of the formats we accept — which
 * covers a corrupt file, an unrelated binary, and a script renamed to .png.
 */
export function detectLogoFormat(buf: Buffer): LogoFormat | null {
  if (buf.length < 4) return null;
  /* PNG: \x89PNG */
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  /* JPEG: FFD8FF */
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  /* WEBP: RIFF....WEBP */
  if (buf.length >= 12
    && buf.toString('ascii', 0, 4) === 'RIFF'
    && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  /* SVG is text: look for an <svg element near the start, past any XML
     declaration, BOM or comment. */
  const head = buf.slice(0, 2048).toString('utf8');
  if (/<\s*svg[\s>]/i.test(head)) return 'svg';
  return null;
}

const CONTENT_TYPE: Record<LogoFormat, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * Validate the bytes and produce exactly what should be stored.
 *
 * Never throws: a corrupt file is a rejection with a message, not a 500.
 */
export async function prepareCompanyLogo(buf: Buffer): Promise<PreparedLogo | RejectedLogo> {
  if (!buf || buf.length === 0) return { ok: false, message: 'That file is empty.' };
  if (buf.length > COMPANY_LOGO_MAX_BYTES) {
    return { ok: false, message: `That file is larger than ${COMPANY_LOGO_MAX_BYTES / 1024} KB.` };
  }

  const format = detectLogoFormat(buf);
  if (!format) {
    return { ok: false, message: 'That file is not a readable SVG, PNG, JPG or WEBP image.' };
  }

  if (format === 'svg') {
    const result = sanitizeCompanyLogoSvg(buf.toString('utf8'));
    if (!result.ok || !result.svg) {
      return { ok: false, message: result.message ?? 'That SVG could not be used.' };
    }
    /* The SANITISED text is what gets stored. The uploaded bytes are dropped
       here and never reach storage. */
    return {
      ok: true, format: 'svg',
      body: Buffer.from(result.svg, 'utf8'),
      contentType: CONTENT_TYPE.svg,
    };
  }

  /* Raster: decoding it is the proof that it is a real image. A file with a
     valid PNG header and garbage after it fails here rather than being stored
     and rendering as a broken image on every page. */
  try {
    const meta = await sharp(buf).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) return { ok: false, message: 'That image could not be read.' };
    if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
      return { ok: false, message: `That image is only ${width}×${height}. Upload a larger logo.` };
    }
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      return { ok: false, message: `That image is ${width}×${height}, which is too large for a logo.` };
    }
    return { ok: true, format, body: buf, contentType: CONTENT_TYPE[format], width, height };
  } catch {
    return { ok: false, message: 'That image is corrupt or could not be decoded.' };
  }
}
