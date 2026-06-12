import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { readJsonFile, writeJsonFile, dataDir } from '@/lib/server/storage';
import { getAuthSession } from '@/lib/server/auth';
import { appendFileTransfer, getFileTransfers } from '@/lib/server/file-transfers';

export const dynamic = 'force-dynamic';

const sharesPath = path.join(dataDir, 'drive-shares.json');

interface DriveShareRecord {
  token: string;
  itemId: string;
  itemName: string;
  kind: 'file' | 'folder';
  fileKind?: string;
  permission: string;
  ownerUserId: string;
  ownerName: string;
  password?: string;
  expiresAt?: number;
  createdAt: number;
  revoked: boolean;
  addedBy: string[];
  accessCount: number;
  dataUrl?: string;
  mimeType?: string;
  sizeInBytes?: number;
  sourceTransferId?: string;
}

async function readShares(): Promise<DriveShareRecord[]> {
  return readJsonFile<DriveShareRecord[]>(sharesPath, []);
}
async function writeShares(s: DriveShareRecord[]) {
  await writeJsonFile(sharesPath, s);
}

/* GET /api/drive/share/[token] — preview metadata (no auth needed) */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const shares = await readShares();
  const rec    = shares.find(s => s.token === token);

  if (!rec)                                        return NextResponse.json({ error: 'not_found' },  { status: 404 });
  if (rec.revoked)                                 return NextResponse.json({ error: 'revoked' },    { status: 410 });
  if (rec.expiresAt && Date.now() > rec.expiresAt) return NextResponse.json({ error: 'expired' },   { status: 410 });

  rec.accessCount += 1;
  await writeShares(shares);

  const { dataUrl: _d, password: _p, ...safe } = rec;
  return NextResponse.json({ share: { ...safe, hasPassword: !!rec.password } });
}

/* POST /api/drive/share/[token] — add shared file to caller's drive */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const session = await getAuthSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await params;
  const body      = await req.json() as { password?: string };

  const shares = await readShares();
  const rec    = shares.find(s => s.token === token);

  if (!rec)                                        return NextResponse.json({ error: 'not_found' },  { status: 404 });
  if (rec.revoked)                                 return NextResponse.json({ error: 'revoked' },    { status: 410 });
  if (rec.expiresAt && Date.now() > rec.expiresAt) return NextResponse.json({ error: 'expired' },   { status: 410 });
  if (rec.password && body.password !== rec.password)
                                                   return NextResponse.json({ error: 'wrong_password' }, { status: 403 });

  const uid = session.user.id ?? session.user.email ?? 'unknown';
  if (!rec.addedBy.includes(uid)) { rec.addedBy.push(uid); await writeShares(shares); }

  /* Resolve actual file data */
  let dataUrl  = rec.dataUrl   ?? '';
  let mime     = rec.mimeType  ?? 'application/octet-stream';
  let sizeB    = rec.sizeInBytes ?? 0;

  if (dataUrl.length < 10 && rec.sourceTransferId) {
    const transfers = await getFileTransfers();
    const src = transfers.find(t => t.id === rec.sourceTransferId || t.shareId === rec.sourceTransferId);
    if (src) { dataUrl = src.dataUrl; mime = src.mimeType; sizeB = src.sizeInBytes ?? 0; }
  }

  /* If no data, return a stub reference */
  if (dataUrl.length < 10) {
    return NextResponse.json({
      ok: true, stub: true,
      token, itemName: rec.itemName, kind: rec.kind, permission: rec.permission,
      message: 'Reference added — original file data unavailable',
    });
  }

  /* Create a real file-transfer in recipient's drive */
  const transfer = await appendFileTransfer({
    fileName:         rec.itemName,
    mimeType:         mime,
    dataUrl,
    sizeInBytes:      sizeB,
    authMode:         'public',
    uploadedBy:       session.user.email ?? uid,
    uploadedByName:   session.user.name  ?? undefined,
    uploadedByUserId: uid,
    title:            rec.itemName,
    notes:            `Received via QR from ${rec.ownerName}`,
  });

  return NextResponse.json({
    ok: true, transferId: transfer.id,
    token, itemName: rec.itemName, kind: rec.kind, permission: rec.permission,
    shareUrl: `${process.env.NEXTAUTH_URL ?? ''}/share/${token}`,
  });
}
