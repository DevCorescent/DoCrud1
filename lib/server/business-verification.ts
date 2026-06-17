import { getDbPool, getMongoDb } from './database';
import { readJsonFile, writeJsonFile } from './storage';
import { nanoid } from 'nanoid';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
const verifPath = path.join(dataDir, 'business-verifications.json');

export type VerificationStatus = 'pending' | 'approved' | 'rejected';

export interface BusinessVerification {
  id: string;
  businessPageId: string;
  ownerUserId: string;
  status: VerificationStatus;
  legalName: string;
  businessType: string;
  registrationNumber: string;
  gstin?: string;
  pan: string;
  registeredAddress: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  website?: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  yearsInBusiness?: string;
  employeeCount?: string;
  annualRevenue?: string;
  businessCategory?: string;
  adminNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  submittedAt: string;
  updatedAt: string;
  pageName?: string;
}

type VerifDoc = BusinessVerification & { _id: string };

function strip({ _id: _u, ...rest }: VerifDoc): BusinessVerification { return rest; }

interface JsonStore { verifications: BusinessVerification[] }
const EMPTY_STORE: JsonStore = { verifications: [] };

/* ── JSON helpers ─────────────────────────────────────────────── */
async function readStore(): Promise<JsonStore> {
  return readJsonFile<JsonStore>(verifPath, EMPTY_STORE);
}
async function writeStore(store: JsonStore): Promise<void> {
  await writeJsonFile(verifPath, store);
}

/* ── Public API ───────────────────────────────────────────────── */

export async function getVerificationForPage(pageId: string): Promise<BusinessVerification | null> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection<VerifDoc>('business_verifications')
        .findOne({ businessPageId: pageId }, { sort: { submittedAt: -1 } });
      return doc ? strip(doc) : null;
    }
  }
  const store = await readStore();
  const matches = store.verifications
    .filter((v) => v.businessPageId === pageId)
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  return matches[0] ?? null;
}

export async function getAllVerifications(status?: VerificationStatus): Promise<BusinessVerification[]> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const filter = status ? { status } : {};
      const docs = await db.collection<VerifDoc>('business_verifications')
        .find(filter).sort({ submittedAt: -1 }).toArray();
      const verifs = docs.map(strip);

      // Enrich with page names from business_pages collection
      const pageIds = Array.from(new Set(verifs.map((v) => v.businessPageId)));
      if (pageIds.length > 0) {
        const pages = await db.collection<{ _id: string; name?: string }>('business_pages')
          .find({ _id: { $in: pageIds } as any }).toArray();
        const pageMap = Object.fromEntries(pages.map((p) => [p._id, p.name]));
        return verifs.map((v) => ({ ...v, pageName: pageMap[v.businessPageId] ?? v.pageName }));
      }
      return verifs;
    }
  }
  const store = await readStore();
  let list = store.verifications;
  if (status) list = list.filter((v) => v.status === status);
  list = [...list].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  try {
    const bpPath = path.join(dataDir, 'business-pages.json');
    const bp = await readJsonFile<{ pages?: Array<{ id: string; name: string }> }>(bpPath, { pages: [] });
    const pageMap = new Map((bp.pages ?? []).map((p) => [p.id, p.name]));
    list = list.map((v) => ({ ...v, pageName: pageMap.get(v.businessPageId) ?? v.pageName }));
  } catch { /* non-critical */ }

  return list;
}

export type SubmitVerifData = Omit<BusinessVerification, 'id' | 'status' | 'adminNotes' | 'reviewedBy' | 'reviewedAt' | 'submittedAt' | 'updatedAt' | 'pageName'>;

export async function submitVerification(data: SubmitVerifData): Promise<BusinessVerification> {
  const id = nanoid();
  const now = new Date().toISOString();
  const verif: BusinessVerification = {
    ...data,
    id,
    status: 'pending',
    adminNotes: undefined,
    reviewedBy: undefined,
    reviewedAt: undefined,
    submittedAt: now,
    updatedAt: now,
  };

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      await db.collection<VerifDoc>('business_verifications').insertOne({ ...verif, _id: id });
      return verif;
    }
  }
  const store = await readStore();
  store.verifications.push(verif);
  await writeStore(store);
  return verif;
}

export async function reviewVerification(
  id: string,
  status: 'approved' | 'rejected',
  adminNotes: string,
  reviewedBy: string,
): Promise<BusinessVerification | null> {
  const now = new Date().toISOString();

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      await db.collection('business_verifications').updateOne(
        { _id: id as any },
        { $set: { status, adminNotes, reviewedBy, reviewedAt: now, updatedAt: now } },
      );
      const doc = await db.collection<VerifDoc>('business_verifications').findOne({ _id: id as any });
      if (!doc) return null;
      const verif = strip(doc);
      if (status === 'approved') {
        await db.collection('business_pages').updateOne(
          { _id: verif.businessPageId as any },
          { $set: { verified: true } },
        ).catch(() => {});
      }
      return verif;
    }
  }
  const store = await readStore();
  const idx = store.verifications.findIndex((v) => v.id === id);
  if (idx === -1) return null;
  store.verifications[idx] = {
    ...store.verifications[idx],
    status, adminNotes, reviewedBy,
    reviewedAt: now, updatedAt: now,
  };
  if (status === 'approved') {
    await updateBusinessPageVerified(store.verifications[idx].businessPageId, true);
  }
  await writeStore(store);
  return store.verifications[idx];
}

async function updateBusinessPageVerified(pageId: string, verified: boolean) {
  try {
    const bpPath = path.join(dataDir, 'business-pages.json');
    const bp = await readJsonFile<{ pages?: Array<Record<string, unknown>> }>(bpPath, { pages: [] });
    const pages = bp.pages ?? [];
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx !== -1) {
      pages[idx] = { ...pages[idx], verified };
      await writeJsonFile(bpPath, bp);
    }
  } catch { /* non-critical */ }
}
