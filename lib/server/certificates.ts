import { getStoredUsers } from '@/lib/server/auth';
import { certificatesPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import { buildQrImageUrl } from '@/lib/url';
import type { CertificateAnalyticsEvent, CertificateRecord, User } from '@/types/document';

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56) || `certificate-${Date.now().toString(36)}`;
}

function buildQrUrl(path: string) {
  return buildQrImageUrl(path);
}

function computeAnalytics(events: CertificateAnalyticsEvent[]) {
  const uniqueVisitors = new Set(events.map((event) => event.visitorKey).filter(Boolean)).size;
  const opens = events.filter((event) => event.type === 'open');
  const downloads = events.filter((event) => event.type === 'download');
  const verifies = events.filter((event) => event.type === 'verify');

  return {
    openCount: opens.length,
    downloadCount: downloads.length,
    verifyCount: verifies.length,
    uniqueVisitors,
    lastOpenedAt: opens[0]?.createdAt,
    lastDownloadedAt: downloads[0]?.createdAt,
    lastVerifiedAt: verifies[0]?.createdAt,
  };
}

function normalizeCertificate(entry: Partial<CertificateRecord>): CertificateRecord {
  const slug = entry.slug || slugify(`${entry.certificateTitle || entry.name || 'certificate'}-${entry.recipientName || ''}`);
  const events: CertificateAnalyticsEvent[] = Array.isArray(entry.events)
    ? entry.events
        .map<CertificateAnalyticsEvent>((event) => ({
          id: event.id || createId('cert-event'),
          type: event.type === 'download' || event.type === 'verify' ? event.type : 'open',
          createdAt: event.createdAt || new Date().toISOString(),
          source: event.source,
          visitorKey: event.visitorKey,
          userAgent: event.userAgent,
        }))
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    : [];

  return {
    id: entry.id || createId('cert'),
    ownerUserId: String(entry.ownerUserId || ''),
    ownerEmail: String(entry.ownerEmail || '').toLowerCase(),
    ownerName: String(entry.ownerName || 'docrud user'),
    organizationId: entry.organizationId ? String(entry.organizationId) : undefined,
    organizationName: entry.organizationName ? String(entry.organizationName) : undefined,
    name: String(entry.name || 'Certificate record'),
    recipientName: String(entry.recipientName || 'Recipient'),
    recipientEmail: entry.recipientEmail ? String(entry.recipientEmail).toLowerCase() : undefined,
    credentialId: String(entry.credentialId || `DOC-${Date.now().toString().slice(-8)}`),
    issueDate: String(entry.issueDate || new Date().toISOString().slice(0, 10)),
    expiryDate: entry.expiryDate ? String(entry.expiryDate) : undefined,
    certificateTitle: String(entry.certificateTitle || 'Certificate of Achievement'),
    subtitle: entry.subtitle ? String(entry.subtitle) : undefined,
    description: entry.description ? String(entry.description) : undefined,
    issuerName: String(entry.issuerName || entry.organizationName || entry.ownerName || 'docrud'),
    signatoryName: entry.signatoryName ? String(entry.signatoryName) : undefined,
    signatoryRole: entry.signatoryRole ? String(entry.signatoryRole) : undefined,
    logoUrl: entry.logoUrl ? String(entry.logoUrl) : Array.isArray(entry.logoUrls) ? String(entry.logoUrls[0] || '') || undefined : undefined,
    logoUrls: Array.isArray(entry.logoUrls)
      ? entry.logoUrls.map((item) => String(item).trim()).filter(Boolean)
      : entry.logoUrl
        ? [String(entry.logoUrl)]
        : [],
    signatureUrl: entry.signatureUrl
      ? String(entry.signatureUrl)
      : Array.isArray(entry.signatureImageUrls)
        ? String(entry.signatureImageUrls[0] || '') || undefined
        : undefined,
    signatureImageUrls: Array.isArray(entry.signatureImageUrls)
      ? entry.signatureImageUrls.map((item) => String(item).trim()).filter(Boolean)
      : entry.signatureUrl
        ? [String(entry.signatureUrl)]
        : [],
    signatureDrawnDataUrl: entry.signatureDrawnDataUrl ? String(entry.signatureDrawnDataUrl) : undefined,
    backgroundImageUrl: entry.backgroundImageUrl ? String(entry.backgroundImageUrl) : undefined,
    accentColor: entry.accentColor ? String(entry.accentColor) : '#f97316',
    textColor: entry.textColor ? String(entry.textColor) : '#111827',
    layout: entry.layout === 'modern' || entry.layout === 'spotlight' ? entry.layout : 'classic',
    includeDocrudWatermark: entry.includeDocrudWatermark !== false,
    status: entry.status === 'published' ? 'published' : 'draft',
    slug,
    qrUrl: buildQrUrl(`/certificate/${slug}`),
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || new Date().toISOString(),
    analytics: computeAnalytics(events),
    events,
  };
}

async function saveCertificates(records: CertificateRecord[]) {
  await writeJsonFile(certificatesPath, records);
}

export async function getCertificates() {
  const records = await readJsonFile<CertificateRecord[]>(certificatesPath, []);
  const normalized = records.map(normalizeCertificate);
  if (JSON.stringify(records) !== JSON.stringify(normalized)) {
    await saveCertificates(normalized);
  }
  return normalized;
}

export async function getVisibleCertificates(actor: User) {
  const records = await getCertificates();
  if (actor.role === 'admin') {
    return records;
  }
  if (actor.role === 'client' || actor.role === 'member') {
    return records.filter((record) => record.ownerUserId === actor.id || (actor.organizationId && record.organizationId === actor.organizationId) || record.organizationId === actor.id);
  }
  return records.filter((record) => record.ownerUserId === actor.id);
}

export async function createCertificate(actor: User, input: Partial<CertificateRecord>) {
  const records = await getCertificates();
  const slugBase = slugify(`${input.certificateTitle || input.name || 'certificate'}-${input.recipientName || 'recipient'}`);
  let slug = slugBase;
  let attempt = 1;
  while (records.some((entry) => entry.slug === slug)) {
    slug = `${slugBase}-${attempt += 1}`;
  }

  const now = new Date().toISOString();
  const created = normalizeCertificate({
    ...input,
    id: createId('cert'),
    slug,
    ownerUserId: actor.id,
    ownerEmail: actor.email,
    ownerName: actor.name,
    organizationId: actor.role === 'client' ? actor.id : actor.organizationId,
    organizationName: actor.organizationName,
    createdAt: now,
    updatedAt: now,
    events: [],
  });
  await saveCertificates([created, ...records]);
  return created;
}

export async function updateCertificate(actor: User, certificateId: string, updates: Partial<CertificateRecord>) {
  const records = await getCertificates();
  const current = records.find((record) => record.id === certificateId);
  if (!current) {
    throw new Error('Certificate not found.');
  }
  const allowed = actor.role === 'admin' || current.ownerUserId === actor.id || (actor.organizationId && current.organizationId === actor.organizationId);
  if (!allowed) {
    throw new Error('You cannot update this certificate.');
  }
  const nextRecords = records.map((record) => {
    if (record.id !== certificateId) return record;
    return normalizeCertificate({
      ...record,
      ...updates,
      id: record.id,
      slug: record.slug,
      ownerUserId: record.ownerUserId,
      ownerEmail: record.ownerEmail,
      ownerName: record.ownerName,
      organizationId: record.organizationId,
      organizationName: record.organizationName,
      events: record.events,
      updatedAt: new Date().toISOString(),
    });
  });
  await saveCertificates(nextRecords);
  return nextRecords.find((record) => record.id === certificateId) || null;
}

export async function deleteCertificate(actor: User, certificateId: string) {
  const records = await getCertificates();
  const current = records.find((record) => record.id === certificateId);
  if (!current) {
    throw new Error('Certificate not found.');
  }
  const allowed = actor.role === 'admin' || current.ownerUserId === actor.id || (actor.organizationId && current.organizationId === actor.organizationId);
  if (!allowed) {
    throw new Error('You cannot delete this certificate.');
  }
  await saveCertificates(records.filter((record) => record.id !== certificateId));
}

export async function getPublicCertificate(slug: string) {
  const records = await getCertificates();
  return records.find((record) => record.slug === slug && record.status === 'published') || null;
}

export async function recordCertificateEvent(
  slug: string,
  event: Pick<CertificateAnalyticsEvent, 'type' | 'source' | 'visitorKey' | 'userAgent'>,
): Promise<CertificateRecord | null> {
  const records = await getCertificates();
  let updatedRecord: CertificateRecord | null = null;
  const nextRecords = records.map((record) => {
    if (record.slug !== slug) {
      return record;
    }
    const next = normalizeCertificate({
      ...record,
      events: [
        {
          id: createId('cert-event'),
          type: event.type,
          source: event.source,
          visitorKey: event.visitorKey,
          userAgent: event.userAgent,
          createdAt: new Date().toISOString(),
        },
        ...record.events,
      ],
      updatedAt: new Date().toISOString(),
    });
    updatedRecord = next;
    return next;
  });
  await saveCertificates(nextRecords);
  return updatedRecord;
}

export async function getCertificatesWorkspaceData(actor: User) {
  const records = await getVisibleCertificates(actor);
  const totals = records.reduce(
    (acc, record) => {
      acc.records += 1;
      acc.opens += record.analytics.openCount;
      acc.downloads += record.analytics.downloadCount;
      acc.verifies += record.analytics.verifyCount;
      return acc;
    },
    { records: 0, opens: 0, downloads: 0, verifies: 0 },
  );

  return {
    records,
    totals,
    suggestedCertificate: {
      name: 'New certificate issue',
      certificateTitle: 'Certificate of Completion',
      subtitle: 'Recognizing successful completion',
      issuerName: actor.organizationName || actor.name,
      signatoryName: actor.name,
      signatoryRole: actor.role === 'individual' ? 'Issuer' : 'Authorized Signatory',
      status: 'draft' as const,
      layout: 'modern' as const,
    },
  };
}

export async function getCertificateAdminStats() {
  const users = await getStoredUsers();
  const records = await getCertificates();
  return {
    totalCertificates: records.length,
    totalOpens: records.reduce((sum, record) => sum + record.analytics.openCount, 0),
    totalDownloads: records.reduce((sum, record) => sum + record.analytics.downloadCount, 0),
    totalVerifies: records.reduce((sum, record) => sum + record.analytics.verifyCount, 0),
    activeIssuers: new Set(records.map((record) => record.ownerUserId)).size,
    adoptionRate: users.length ? Math.round((new Set(records.map((record) => record.ownerUserId)).size / users.length) * 100) : 0,
  };
}
