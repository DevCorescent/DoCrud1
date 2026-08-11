import { NextRequest, NextResponse } from 'next/server';
import qrcode from 'qrcode-generator';
import { getDbPool } from '@/lib/server/database';
import { selectUserIdExists } from '@/lib/server/db/users-rows';
import { getStoredUserById } from '@/lib/server/users';
import { getProfileUrl, isValidProfileId } from '@/lib/utils/profile-qr';

/**
 * GET /api/public/profile/{userId}/qr
 *
 * Renders the QR for `{origin}/u/{userId}` as SVG.
 *
 * Nothing is persisted: the QR is a pure function of the profile URL, so it is
 * generated on demand and cached at the edge rather than stored in MongoDB.
 * SVG keeps the payload small (~4 KB measured) and stays sharp at any render
 * size, unlike a fixed-resolution PNG.
 *
 * Cost is one indexed `_id` existence check, projected to the key alone.
 */
export const dynamic = 'force-dynamic';

/** Bounds for ?size= (SVG scales freely; this only sets the viewport hint). */
const DEFAULT_SIZE = 320;
const MIN_SIZE = 64;
const MAX_SIZE = 1024;

/** Error correction M — ~15% recovery, the usual balance for a scannable link. */
const ERROR_CORRECTION = 'M' as const;

function clampSize(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return DEFAULT_SIZE;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, parsed));
}

/** Quiet zone in modules — 4 is the QR spec minimum for reliable scanning. */
const QUIET_ZONE = 4;

/**
 * Render the module matrix as ONE `<path>`.
 *
 * The library's built-in createSvgTag() emits a separate `<rect>` per dark
 * module, which measured 14,979 bytes for a profile URL. Merging every module
 * into a single path definition brings that to 4,115 bytes (3.6x smaller),
 * which matters because this is a public, cached, frequently embedded asset.
 *
 * Horizontal runs are coalesced, so a row of N adjacent dark modules costs one
 * subpath instead of N.
 */
function renderQrSvg(qr: ReturnType<typeof qrcode>, size: number): string {
  const count = qr.getModuleCount();
  const dimension = count + QUIET_ZONE * 2;
  const parts: string[] = [];

  for (let row = 0; row < count; row += 1) {
    let col = 0;
    while (col < count) {
      if (!qr.isDark(row, col)) {
        col += 1;
        continue;
      }
      let run = 1;
      while (col + run < count && qr.isDark(row, col + run)) run += 1;
      parts.push(`M${col + QUIET_ZONE} ${row + QUIET_ZONE}h${run}v1h-${run}z`);
      col += run;
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" `
    + `viewBox="0 0 ${dimension} ${dimension}" shape-rendering="crispEdges" role="img" `
    + `aria-label="Profile QR code">`
    + `<rect width="${dimension}" height="${dimension}" fill="#ffffff"/>`
    + `<path fill="#000000" d="${parts.join('')}"/>`
    + `</svg>`
  );
}

/** Existence only — never reads the user document, never lists users. */
async function profileExists(userId: string): Promise<boolean> {
  if (getDbPool()) {
    const exists = await selectUserIdExists(userId);
    if (exists !== null) return exists;
  }
  // No database configured (JSON storage mode) — fall back to the shared lookup.
  return Boolean(await getStoredUserById(userId));
}

export async function GET(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const { userId } = params;

    if (!isValidProfileId(userId)) {
      return NextResponse.json({ error: 'Invalid user id.' }, { status: 400 });
    }

    if (!(await profileExists(userId))) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    // In a deployed environment the canonical origin wins; locally this is the
    // dev server's own origin, so a localhost URL can never end up in a
    // production QR code.
    const target = getProfileUrl(userId, request.nextUrl.origin);

    const size = clampSize(request.nextUrl.searchParams.get('size'));
    const qr = qrcode(0, ERROR_CORRECTION); // 0 = auto-select the smallest fitting version
    qr.addData(target);
    qr.make();

    const svg = renderQrSvg(qr, size);

    return new NextResponse(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        // Deterministic output for a given (userId, origin, size) — cache hard.
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[public/profile/qr] GET error', error);
    return NextResponse.json({ error: 'Failed to generate QR code.' }, { status: 500 });
  }
}
