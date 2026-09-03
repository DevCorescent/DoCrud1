/**
 * Super Admin company-logo uploads — the rules both sides share.
 *
 * Deliberately outside lib/server, like lib/ats-upload-limits.ts: the admin
 * file input needs the accept list and the ceiling, and the route needs the
 * identical rule. One definition, so the browser can never accept something
 * the server refuses.
 *
 * ═══ WHERE AN UPLOADED LOGO SITS IN THE ORDER ═══
 *
 * It is the HIGHEST authority. A human looked at the company and chose the
 * mark, which beats every automatic answer:
 *
 *   0. this upload            ← authoritative, never auto-overwritten
 *   1. the verified registry  (lib/company-logos.ts)
 *   2. a logo the source gave
 *   3. an operator-configured website
 *   4. initials
 *
 * Nothing in the automatic pipeline may write over one of these. The resolver
 * checks this store first and returns immediately.
 */

/** Formats a company mark may be uploaded in. */
export const COMPANY_LOGO_TYPES: Record<string, string> = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
};

export const COMPANY_LOGO_EXTENSIONS = ['svg', 'png', 'jpg', 'jpeg', 'webp'];

/**
 * 512 KB. Larger than R2_MAX_IMAGE_BYTES (200 KB) because that ceiling applies
 * to raster images AFTER compression, which `uploadToR2` performs; an SVG is
 * text and is stored uncompressed. A brand mark far above this is the wrong
 * asset — a hero image or a screenshot, not a logo.
 */
export const COMPANY_LOGO_MAX_BYTES = 512 * 1024;

export const COMPANY_LOGO_ACCEPT = [
  ...Object.keys(COMPANY_LOGO_TYPES),
  ...COMPANY_LOGO_EXTENSIONS.map((e) => `.${e}`),
].join(',');

export type LogoUploadRejection =
  | { code: 'NO_FILE'; message: string }
  | { code: 'MULTIPLE_FILES'; message: string }
  | { code: 'EMPTY_FILE'; message: string }
  | { code: 'FILE_TOO_LARGE'; message: string }
  | { code: 'UNSUPPORTED_FORMAT'; message: string };

export function logoExtensionOf(fileName: string): string {
  const parts = String(fileName ?? '').trim().toLowerCase().split('.');
  return parts.length > 1 ? (parts.pop() ?? '') : '';
}

/**
 * Validate before any bytes move.
 *
 * BOTH signals must agree that the file could be an image, and neither is
 * trusted alone: browsers send `application/octet-stream` for an .svg often
 * enough that MIME-only would refuse valid marks, and an extension is just a
 * string the uploader chose. The server additionally checks the actual bytes —
 * see `detectLogoFormat` — which is the check that cannot be lied to.
 */
export function validateCompanyLogoUpload(
  file: { name: string; size: number; type: string } | null,
  count = 1,
): LogoUploadRejection | null {
  if (count > 1) {
    return { code: 'MULTIPLE_FILES', message: 'Drop one logo file, not several.' };
  }
  if (!file) return { code: 'NO_FILE', message: 'Choose a logo file to upload.' };
  if (file.size === 0) return { code: 'EMPTY_FILE', message: 'That file is empty.' };
  if (file.size > COMPANY_LOGO_MAX_BYTES) {
    return {
      code: 'FILE_TOO_LARGE',
      message: `That file is larger than ${COMPANY_LOGO_MAX_BYTES / 1024} KB. Upload a smaller logo.`,
    };
  }
  const byMime = Boolean(COMPANY_LOGO_TYPES[file.type?.toLowerCase() ?? '']);
  const byExtension = COMPANY_LOGO_EXTENSIONS.includes(logoExtensionOf(file.name));
  if (!byMime && !byExtension) {
    return { code: 'UNSUPPORTED_FORMAT', message: 'Upload an SVG, PNG, JPG or WEBP logo.' };
  }
  return null;
}

/** What is stored about one company's uploaded mark. */
export interface CompanyLogoOverride {
  /** `logoKey(name)` — the identity every other surface groups on. */
  id: string;
  /** The display name as it was at upload time. Never used for matching. */
  name: string;
  /** The public URL to render. */
  url: string;
  format: string;
  /** The storage object, so a replacement can delete exactly the old one. */
  storagePath: string;
  updatedAt: string;
  /** The super-admin email. Identity comes from the session, never the body. */
  updatedBy: string;
}

export type CompanyLogoOverrides = Record<string, CompanyLogoOverride>;

/**
 * A company-scoped, deterministic object key.
 *
 * The uploader's filename NEVER appears here: it is attacker-controlled text
 * and would be a path-traversal vector. `id` is already `[a-z0-9]` only (see
 * logoKey), and the extension comes from the format WE detected, not from the
 * name. The revision makes each replacement a distinct object, which is what
 * lets a CDN cache logos forever and still show a new one immediately.
 */
export function companyLogoStoragePath(id: string, format: string, revision: number): string {
  const safeId = String(id ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 64);
  const safeFormat = COMPANY_LOGO_EXTENSIONS.includes(format) ? format : 'png';
  if (!safeId) throw new Error('A company id is required to store a logo.');
  return `company-logos/${safeId}/logo-${revision}.${safeFormat}`;
}
