import crypto from 'node:crypto';
import { getStoredUsers, saveStoredUsers } from '@/lib/server/auth';
import { gigsSafetyReportsPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import type { User } from '@/types/document';

export type GigsSafetyReportStatus = 'pending' | 'approved' | 'rejected';

export type GigsSafetyReport = {
  id: string;
  gigId: string;
  gigSlug: string;
  reporterUserId: string;
  reporterEmail?: string;
  accusedUserId: string;
  accusedEmail?: string;
  reason: string;
  details?: string;
  evidence: Array<{ name: string; dataUrl: string }>;
  status: GigsSafetyReportStatus;
  adminNote?: string;
  createdAt: string;
  reviewedAt?: string;
  updatedAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

function clampEvidence(evidence: Array<{ name: string; dataUrl: string }>) {
  const cleaned = (Array.isArray(evidence) ? evidence : [])
    .map((item) => ({
      name: String(item?.name || '').trim().slice(0, 64) || 'proof',
      dataUrl: String(item?.dataUrl || '').trim(),
    }))
    .filter((item) => item.dataUrl.startsWith('data:') && item.dataUrl.length < 1_500_000);
  return cleaned.slice(0, 3);
}

export async function listGigsSafetyReports(limit = 400) {
  const raw = await readJsonFile<GigsSafetyReport[]>(gigsSafetyReportsPath, []);
  return raw
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, Math.max(1, Math.min(2000, Math.round(limit))));
}

export async function createGigsSafetyReport(params: {
  gigId: string;
  gigSlug: string;
  reporter: User;
  accusedUserId: string;
  reason: string;
  details?: string;
  evidence: Array<{ name: string; dataUrl: string }>;
}) {
  const reason = String(params.reason || '').trim();
  if (reason.length < 6) throw new Error('Reason is required.');

  const evidence = clampEvidence(params.evidence || []);
  if (evidence.length === 0) throw new Error('Add at least one proof (screenshot or file).');

  const users = await getStoredUsers();
  const accused = users.find((u) => u.id === params.accusedUserId) || null;
  if (!accused) throw new Error('User not found.');
  if (accused.id === params.reporter.id) throw new Error('You cannot report yourself.');

  const reports = await listGigsSafetyReports(5000);
  const now = nowIso();

  const report: GigsSafetyReport = {
    id: crypto.randomUUID(),
    gigId: String(params.gigId),
    gigSlug: String(params.gigSlug),
    reporterUserId: params.reporter.id,
    reporterEmail: params.reporter.email,
    accusedUserId: accused.id,
    accusedEmail: accused.email,
    reason: reason.slice(0, 120),
    details: params.details ? String(params.details).trim().slice(0, 2000) : undefined,
    evidence,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await writeJsonFile(gigsSafetyReportsPath, [report, ...reports].slice(0, 20_000));
  return report;
}

export async function approveGigsSafetyReport(params: {
  reportId: string;
  adminNote?: string;
}) {
  const reports = await listGigsSafetyReports(25_000);
  const idx = reports.findIndex((r) => r.id === params.reportId);
  if (idx === -1) throw new Error('Report not found.');
  const target = reports[idx];
  if (target.status !== 'pending') return target;

  const now = new Date();
  const nowIsoValue = now.toISOString();
  const suspendUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const users = await getStoredUsers();
  const nextUsers = users.map((u) => {
    if (u.id !== target.accusedUserId) return u;
    return {
      ...u,
      safety: {
        ...(u.safety || {}),
        scamWarning: true,
        scamWarningLabel: target.reason,
        scamReportId: target.id,
        scamEvidence: target.evidence,
        flaggedAt: nowIsoValue,
        suspendedUntil: suspendUntil,
      },
    };
  });
  await saveStoredUsers(nextUsers);

  const next = reports.map((r) => r.id === target.id
    ? {
        ...r,
        status: 'approved' as const,
        adminNote: params.adminNote ? String(params.adminNote).trim().slice(0, 800) : undefined,
        reviewedAt: nowIsoValue,
        updatedAt: nowIsoValue,
      }
    : r);
  await writeJsonFile(gigsSafetyReportsPath, next.slice(0, 20_000));
  return next.find((r) => r.id === target.id) || null;
}

export async function rejectGigsSafetyReport(params: { reportId: string; adminNote?: string }) {
  const reports = await listGigsSafetyReports(25_000);
  const idx = reports.findIndex((r) => r.id === params.reportId);
  if (idx === -1) throw new Error('Report not found.');
  const target = reports[idx];
  if (target.status !== 'pending') return target;

  const now = nowIso();
  const next = reports.map((r) => r.id === target.id
    ? {
        ...r,
        status: 'rejected' as const,
        adminNote: params.adminNote ? String(params.adminNote).trim().slice(0, 800) : undefined,
        reviewedAt: now,
        updatedAt: now,
      }
    : r);
  await writeJsonFile(gigsSafetyReportsPath, next.slice(0, 20_000));
  return next.find((r) => r.id === target.id) || null;
}

