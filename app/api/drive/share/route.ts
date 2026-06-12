import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { readJsonFile, writeJsonFile, dataDir } from '@/lib/server/storage';
import { getAuthSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

const sharesPath = path.join(dataDir, 'drive-shares.json');

export interface DriveShareRecord {
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

async function writeShares(shares: DriveShareRecord[]): Promise<void> {
  await writeJsonFile(sharesPath, shares);
}

/* POST /api/drive/share — create / upsert a share */
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as Partial<DriveShareRecord>;
  if (!body.token || !body.itemName || !body.kind) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const shares = await readShares();
  if (shares.some(s => s.token === body.token)) {
    return NextResponse.json({ ok: true, token: body.token });
  }

  const record: DriveShareRecord = {
    token:            body.token,
    itemId:           body.itemId ?? '',
    itemName:         body.itemName,
    kind:             body.kind,
    fileKind:         body.fileKind,
    permission:       body.permission ?? 'read',
    ownerUserId:      session.user.id ?? session.user.email ?? 'unknown',
    ownerName:        session.user.name ?? session.user.email ?? 'User',
    password:         body.password,
    expiresAt:        body.expiresAt,
    createdAt:        Date.now(),
    revoked:          false,
    addedBy:          [],
    accessCount:      0,
    dataUrl:          body.dataUrl,
    mimeType:         body.mimeType,
    sizeInBytes:      body.sizeInBytes,
    sourceTransferId: body.sourceTransferId,
  };

  shares.unshift(record);
  await writeShares(shares);
  return NextResponse.json({ ok: true, token: record.token });
}

/* GET /api/drive/share — list caller's own shares */
export async function GET() {
  const session = await getAuthSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const uid    = session.user.id ?? session.user.email ?? '';
  const shares = await readShares();
  const mine   = shares.filter(s => s.ownerUserId === uid && !s.revoked).map(
    ({ dataUrl: _d, password: _p, ...s }) => s,
  );
  return NextResponse.json({ shares: mine });
}
