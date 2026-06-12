/**
 * Feed moderation — reports, suspension, removal for all published items.
 *
 * Published items are SecureFileTransfer records with
 * directoryVisibility='public' and authMode='public'.
 *
 * Moderation state lives directly on the transfer record:
 *   moderationStatus: 'active' | 'suspended' | 'removed' | 'under_review'
 *   moderationNote, moderationUpdatedAt, moderationUpdatedBy
 *   reports: [{id, reason, detail, reporterUserId, reporterEmail, createdAt, status}]
 */

import { getFileTransfers, updateFileTransfer } from '@/lib/server/file-transfers';
import { getStoredUsers } from '@/lib/server/auth';
import { sendTrackedMail } from '@/lib/server/mailer';
import type { SecureFileTransfer } from '@/types/document';

export type ModerationAction = 'suspend' | 'remove' | 'restore' | 'under_review' | 'dismiss_reports';

function nowIso() { return new Date().toISOString(); }
function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

// ── Read helpers ───────────────────────────────────────────────────────

export async function getAllPublishedItems(): Promise<SecureFileTransfer[]> {
  const transfers = await getFileTransfers();
  return transfers.filter(
    (t) => t.directoryVisibility === 'public' && t.authMode === 'public',
  ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getPublishedItemById(id: string): Promise<SecureFileTransfer | null> {
  const all = await getFileTransfers();
  return all.find((t) => t.id === id || t.shareId === id) ?? null;
}

// ── Report a published item ────────────────────────────────────────────

export async function reportPublishedItem(input: {
  itemId: string;
  reporterUserId?: string;
  reporterEmail?: string;
  reason: string;
  detail?: string;
}): Promise<SecureFileTransfer> {
  const item = await getPublishedItemById(input.itemId);
  if (!item) throw new Error('Published item not found.');
  if (item.moderationStatus === 'removed') throw new Error('Item has been removed.');

  const report = {
    id: `rpt_${uid()}`,
    reporterUserId: input.reporterUserId,
    reporterEmail: input.reporterEmail,
    reason: String(input.reason).trim().slice(0, 200),
    detail: input.detail ? String(input.detail).trim().slice(0, 500) : undefined,
    createdAt: nowIso(),
    status: 'pending' as const,
  };

  const updated = await updateFileTransfer(item.id, (t) => ({
    reports: [...(t.reports || []), report],
    // Auto-escalate to under_review if this is the 3rd+ report
    moderationStatus: (t.moderationStatus === 'active' || !t.moderationStatus)
      && ((t.reports?.length ?? 0) + 1) >= 3
      ? 'under_review' as const
      : t.moderationStatus,
  }));

  if (!updated) throw new Error('Failed to save report.');
  return updated;
}

// ── Moderate a published item ─────────────────────────────────────────

export async function moderatePublishedItem(input: {
  itemId: string;
  action: ModerationAction;
  note?: string;
  actorEmail?: string;
  origin: string;         // for email links
}): Promise<SecureFileTransfer> {
  const item = await getPublishedItemById(input.itemId);
  if (!item) throw new Error('Published item not found.');

  const now = nowIso();
  let newStatus: SecureFileTransfer['moderationStatus'];
  let markReportsReviewed = false;

  switch (input.action) {
    case 'suspend':      newStatus = 'suspended';    break;
    case 'remove':       newStatus = 'removed';      break;
    case 'restore':      newStatus = 'active';       break;
    case 'under_review': newStatus = 'under_review'; break;
    case 'dismiss_reports':
      newStatus = item.moderationStatus === 'under_review' ? 'active' : item.moderationStatus;
      markReportsReviewed = true;
      break;
  }

  const updated = await updateFileTransfer(item.id, (t) => ({
    moderationStatus: newStatus,
    moderationNote: input.note ?? t.moderationNote,
    moderationUpdatedAt: now,
    moderationUpdatedBy: input.actorEmail ?? 'admin',
    reports: markReportsReviewed
      ? (t.reports ?? []).map((r) => ({ ...r, status: 'reviewed' as const }))
      : (t.reports ?? []).map((r) =>
          r.status === 'pending' && (input.action === 'suspend' || input.action === 'remove')
            ? { ...r, status: 'reviewed' as const }
            : r
        ),
  }));

  if (!updated) throw new Error('Failed to apply moderation action.');

  // ── Email the publisher ──────────────────────────────────────────────
  if (input.action === 'suspend' || input.action === 'remove' || input.action === 'restore') {
    await sendModerationEmail({ item: updated, action: input.action, note: input.note, origin: input.origin });
  }

  return updated;
}

// ── Email helper ───────────────────────────────────────────────────────

async function sendModerationEmail(input: {
  item: SecureFileTransfer;
  action: 'suspend' | 'remove' | 'restore';
  note?: string;
  origin: string;
}) {
  const publisherEmail = input.item.uploadedBy;
  if (!publisherEmail || !publisherEmail.includes('@')) return;

  const publisherName = input.item.uploadedByName || publisherEmail.split('@')[0];
  const title = input.item.title || input.item.fileName;
  const itemUrl = `${input.origin}/published/${input.item.shareId || input.item.id}`;

  let subject: string;
  let bodyHtml: string;
  let preheader: string;

  if (input.action === 'suspend') {
    subject = `Your published item has been suspended — "${title}"`;
    preheader = 'Action required: your content has been temporarily suspended.';
    bodyHtml = `
      <p style="font-size:15px;color:#0f172a;margin:0 0 16px">Hi ${escHtml(publisherName)},</p>
      <p style="font-size:14px;color:#334155;margin:0 0 16px">
        Your published item <strong>"${escHtml(title)}"</strong> has been
        <strong style="color:#dc2626;">temporarily suspended</strong> by our moderation team.
      </p>
      ${input.note ? `<div style="background:#fef2f2;border-left:3px solid #dc2626;padding:12px 16px;margin:0 0 16px;border-radius:4px;font-size:13px;color:#7f1d1d;">${escHtml(input.note)}</div>` : ''}
      <p style="font-size:14px;color:#334155;margin:0 0 16px">
        While suspended, your item is not visible to other users. If you believe this is a mistake,
        please contact our support team.
      </p>
      <a href="${itemUrl}" style="display:inline-block;background:#1e293b;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">View Item</a>
    `;
  } else if (input.action === 'remove') {
    subject = `Your published item has been removed — "${title}"`;
    preheader = 'Your content has been permanently removed from the platform.';
    bodyHtml = `
      <p style="font-size:15px;color:#0f172a;margin:0 0 16px">Hi ${escHtml(publisherName)},</p>
      <p style="font-size:14px;color:#334155;margin:0 0 16px">
        Your published item <strong>"${escHtml(title)}"</strong> has been
        <strong style="color:#dc2626;">permanently removed</strong> from the platform by our moderation team.
      </p>
      ${input.note ? `<div style="background:#fef2f2;border-left:3px solid #dc2626;padding:12px 16px;margin:0 0 16px;border-radius:4px;font-size:13px;color:#7f1d1d;">${escHtml(input.note)}</div>` : ''}
      <p style="font-size:14px;color:#334155;margin:0 0 16px">
        If you believe this decision was made in error, please contact our support team with details.
      </p>
    `;
  } else {
    subject = `Your published item has been reinstated — "${title}"`;
    preheader = 'Good news — your content is live again.';
    bodyHtml = `
      <p style="font-size:15px;color:#0f172a;margin:0 0 16px">Hi ${escHtml(publisherName)},</p>
      <p style="font-size:14px;color:#334155;margin:0 0 16px">
        Your published item <strong>"${escHtml(title)}"</strong> has been
        <strong style="color:#16a34a;">reinstated</strong> and is now visible to all users again.
      </p>
      ${input.note ? `<div style="background:#f0fdf4;border-left:3px solid #16a34a;padding:12px 16px;margin:0 0 16px;border-radius:4px;font-size:13px;color:#14532d;">${escHtml(input.note)}</div>` : ''}
      <a href="${itemUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">View Item</a>
    `;
  }

  try {
    await sendTrackedMail({
      policyKey: 'feed_moderation',
      typeLabel: 'feed_moderation',
      to: publisherEmail,
      subject,
      preheader,
      text: subject,
      html: bodyHtml,
      sentBy: 'moderation-system',
      origin: input.origin,
    });
  } catch {
    // non-fatal — moderation already applied
  }
}

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Stats helper for super admin ──────────────────────────────────────

export async function getFeedModerationStats() {
  const items = await getAllPublishedItems();
  const total        = items.length;
  const active       = items.filter((i) => !i.moderationStatus || i.moderationStatus === 'active').length;
  const suspended    = items.filter((i) => i.moderationStatus === 'suspended').length;
  const removed      = items.filter((i) => i.moderationStatus === 'removed').length;
  const underReview  = items.filter((i) => i.moderationStatus === 'under_review').length;
  const withReports  = items.filter((i) => (i.reports?.length ?? 0) > 0).length;
  const pendingReports = items.reduce((s, i) => s + (i.reports?.filter((r) => r.status === 'pending').length ?? 0), 0);

  const byCategory: Record<string, number> = {};
  items.forEach((i) => {
    const cat = i.directoryCategory?.toLowerCase() || 'other';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  });

  // Resolve publisher names from user store
  const users = await getStoredUsers();
  const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));

  const enriched = items.map((item) => {
    const publisherUser = userByEmail.get((item.uploadedBy || '').toLowerCase());
    return {
      id: item.id,
      shareId: item.shareId,
      title: item.title || item.fileName,
      category: item.directoryCategory?.toLowerCase() || 'other',
      tags: item.directoryTags ?? [],
      publisherEmail: item.uploadedBy,
      publisherName: item.uploadedByName || item.uploadedBy?.split('@')[0],
      publisherUserId: item.uploadedByUserId || publisherUser?.id,
      moderationStatus: item.moderationStatus || 'active',
      moderationNote: item.moderationNote,
      moderationUpdatedAt: item.moderationUpdatedAt,
      moderationUpdatedBy: item.moderationUpdatedBy,
      reportCount: item.reports?.length ?? 0,
      pendingReportCount: item.reports?.filter((r) => r.status === 'pending').length ?? 0,
      reports: (item.reports ?? []).slice(0, 50),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      likesCount: item.likesCount ?? 0,
      trendCount: item.trendCount ?? 0,
      commentsCount: item.commentsCount ?? 0,
      viewCount: item.viewCount ?? 0,
      openCount: item.openCount ?? 0,
      featured: item.featured ?? false,
    };
  });

  return {
    generatedAt: nowIso(),
    stats: { total, active, suspended, removed, underReview, withReports, pendingReports, byCategory },
    items: enriched,
  };
}
