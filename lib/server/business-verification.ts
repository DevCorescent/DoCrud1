import { getDbPool, ensureDatabaseSchema } from './database';
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

interface JsonStore { verifications: BusinessVerification[] }
const EMPTY_STORE: JsonStore = { verifications: [] };

/* ── JSON helpers ─────────────────────────────────────────────── */
async function readStore(): Promise<JsonStore> {
  return readJsonFile<JsonStore>(verifPath, EMPTY_STORE);
}

async function writeStore(store: JsonStore): Promise<void> {
  await writeJsonFile(verifPath, store);
}

/* ── Postgres row mapper ──────────────────────────────────────── */
function rowToVerif(r: Record<string, unknown>): BusinessVerification {
  return {
    id: r.id as string,
    businessPageId: r.business_page_id as string,
    ownerUserId: r.owner_user_id as string,
    status: r.status as VerificationStatus,
    legalName: r.legal_name as string,
    businessType: r.business_type as string,
    registrationNumber: r.registration_number as string,
    gstin: r.gstin as string | undefined,
    pan: r.pan as string,
    registeredAddress: r.registered_address as string,
    city: r.city as string,
    state: r.state as string,
    pincode: r.pincode as string,
    country: (r.country as string) || 'India',
    website: r.website as string | undefined,
    contactName: r.contact_name as string,
    contactEmail: r.contact_email as string,
    contactPhone: r.contact_phone as string,
    yearsInBusiness: r.years_in_business as string | undefined,
    employeeCount: r.employee_count as string | undefined,
    annualRevenue: r.annual_revenue as string | undefined,
    businessCategory: r.business_category as string | undefined,
    adminNotes: r.admin_notes as string | undefined,
    reviewedBy: r.reviewed_by as string | undefined,
    reviewedAt: r.reviewed_at ? String(r.reviewed_at) : undefined,
    submittedAt: String(r.submitted_at),
    updatedAt: String(r.updated_at),
    pageName: r.page_name as string | undefined,
  };
}

/* ── Public API ───────────────────────────────────────────────── */

export async function getVerificationForPage(pageId: string): Promise<BusinessVerification | null> {
  const pool = getDbPool();
  if (pool) {
    try {
      await ensureDatabaseSchema();
      const res = await pool.query(
        `SELECT * FROM business_verifications WHERE business_page_id = $1 ORDER BY submitted_at DESC LIMIT 1`,
        [pageId]
      );
      return res.rows.length ? rowToVerif(res.rows[0] as Record<string, unknown>) : null;
    } catch { /* fall through to JSON */ }
  }
  const store = await readStore();
  const matches = store.verifications
    .filter(v => v.businessPageId === pageId)
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  return matches[0] ?? null;
}

export async function getAllVerifications(status?: VerificationStatus): Promise<BusinessVerification[]> {
  const pool = getDbPool();
  if (pool) {
    try {
      await ensureDatabaseSchema();
      const q = status
        ? `SELECT bv.*, bp.name as page_name FROM business_verifications bv LEFT JOIN business_pages bp ON bp.id = bv.business_page_id WHERE bv.status = $1 ORDER BY bv.submitted_at DESC`
        : `SELECT bv.*, bp.name as page_name FROM business_verifications bv LEFT JOIN business_pages bp ON bp.id = bv.business_page_id ORDER BY bv.submitted_at DESC`;
      const res = await pool.query(q, status ? [status] : []);
      return res.rows.map(r => rowToVerif(r as Record<string, unknown>));
    } catch { /* fall through to JSON */ }
  }
  // JSON mode — enrich with page names from business-pages.json
  const store = await readStore();
  let list = store.verifications;
  if (status) list = list.filter(v => v.status === status);
  list = [...list].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  // Attach page names
  try {
    const bpPath = path.join(dataDir, 'business-pages.json');
    const bp = await readJsonFile<{ pages?: Array<{ id: string; name: string }> }>(bpPath, { pages: [] });
    const pageMap = new Map((bp.pages ?? []).map(p => [p.id, p.name]));
    list = list.map(v => ({ ...v, pageName: pageMap.get(v.businessPageId) ?? v.pageName }));
  } catch { /* non-critical */ }

  return list;
}

export type SubmitVerifData = Omit<BusinessVerification, 'id' | 'status' | 'adminNotes' | 'reviewedBy' | 'reviewedAt' | 'submittedAt' | 'updatedAt' | 'pageName'>;

export async function submitVerification(data: SubmitVerifData): Promise<BusinessVerification> {
  const id = nanoid();
  const now = new Date().toISOString();
  const pool = getDbPool();
  if (pool) {
    try {
      await ensureDatabaseSchema();
      const res = await pool.query(
        `INSERT INTO business_verifications
          (id, business_page_id, owner_user_id, legal_name, business_type, registration_number, gstin, pan,
           registered_address, city, state, pincode, country, website, contact_name, contact_email, contact_phone,
           years_in_business, employee_count, annual_revenue, business_category)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         RETURNING *`,
        [id, data.businessPageId, data.ownerUserId, data.legalName, data.businessType,
         data.registrationNumber, data.gstin || null, data.pan, data.registeredAddress,
         data.city, data.state, data.pincode, data.country, data.website || null,
         data.contactName, data.contactEmail, data.contactPhone,
         data.yearsInBusiness || null, data.employeeCount || null,
         data.annualRevenue || null, data.businessCategory || null]
      );
      if (res.rows.length) return rowToVerif(res.rows[0] as Record<string, unknown>);
    } catch { /* fall through to JSON */ }
  }
  // JSON fallback — persist to file
  const v: BusinessVerification = {
    id, status: 'pending',
    adminNotes: undefined, reviewedBy: undefined, reviewedAt: undefined,
    submittedAt: now, updatedAt: now,
    ...data,
  };
  const store = await readStore();
  store.verifications.push(v);
  await writeStore(store);
  return v;
}

export async function reviewVerification(
  id: string,
  status: 'approved' | 'rejected',
  adminNotes: string,
  reviewedBy: string,
): Promise<BusinessVerification | null> {
  const now = new Date().toISOString();
  const pool = getDbPool();
  if (pool) {
    try {
      await ensureDatabaseSchema();
      const res = await pool.query(
        `UPDATE business_verifications SET status=$1, admin_notes=$2, reviewed_by=$3, reviewed_at=$4, updated_at=$4 WHERE id=$5 RETURNING *`,
        [status, adminNotes, reviewedBy, now, id]
      );
      if (res.rows.length) {
        const v = rowToVerif(res.rows[0] as Record<string, unknown>);
        if (status === 'approved') {
          await pool.query(`UPDATE business_pages SET verified=TRUE WHERE id=$1`, [v.businessPageId]).catch(() => {});
        }
        return v;
      }
    } catch { /* fall through to JSON */ }
  }
  // JSON fallback — persist to file
  const store = await readStore();
  const idx = store.verifications.findIndex(v => v.id === id);
  if (idx === -1) return null;
  store.verifications[idx] = {
    ...store.verifications[idx],
    status, adminNotes, reviewedBy,
    reviewedAt: now, updatedAt: now,
  };
  // If approved, also update business-pages.json
  if (status === 'approved') {
    const { businessPageId } = store.verifications[idx];
    await updateBusinessPageVerified(businessPageId, true);
  }
  await writeStore(store);
  return store.verifications[idx];
}

/** Update verified flag in business-pages.json when no Postgres */
async function updateBusinessPageVerified(pageId: string, verified: boolean) {
  try {
    const bpPath = path.join(dataDir, 'business-pages.json');
    const bp = await readJsonFile<{ pages?: Array<Record<string, unknown>> }>(bpPath, { pages: [] });
    const pages = bp.pages ?? [];
    const idx = pages.findIndex(p => p.id === pageId);
    if (idx !== -1) {
      pages[idx] = { ...pages[idx], verified };
      await writeJsonFile(bpPath, bp);
    }
  } catch { /* non-critical */ }
}
