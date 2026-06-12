import crypto from 'node:crypto';
import { getDbPool } from '@/lib/server/database';
import { getEmailOutbox } from '@/lib/server/email-outbox';
import { readJsonFile, templateMarketplaceIncomePath, templateMarketplaceWithdrawalsPath, writeJsonFile } from '@/lib/server/storage';
import type { TemplateMarketplaceIncomeRecord, TemplateMarketplaceWithdrawal, TemplateMarketplaceWithdrawalStatus, User } from '@/types/document';
import { sendTrackedMail } from '@/lib/server/mailer';

const WITHDRAW_MIN_PAISE = 1000 * 100;

function nowIso() {
  return new Date().toISOString();
}

function clampPaise(value: unknown) {
  const num = Math.round(Number(value || 0));
  return Number.isFinite(num) ? Math.max(0, Math.min(25_00_00_000, num)) : 0;
}

function normalizeStatus(input: unknown): TemplateMarketplaceWithdrawalStatus {
  const raw = String(input || '').trim();
  if (raw === 'approved' || raw === 'paid' || raw === 'rejected' || raw === 'cancelled') return raw;
  return 'requested';
}

export async function listTemplateWithdrawals(params: {
  sellerUserId: string;
  limit?: number;
}) {
  const limit = Math.min(300, Math.max(20, Math.round(params.limit ?? 120)));
  const pool = getDbPool();
  if (!pool) {
    const raw = await readJsonFile<TemplateMarketplaceWithdrawal[]>(templateMarketplaceWithdrawalsPath, []);
    return raw
      .filter((w) => w.sellerUserId === params.sellerUserId)
      .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
      .slice(0, limit);
  }

  const result = await pool.query(
    `
      SELECT
        id, seller_user_id, seller_email, currency, amount_in_paise, status,
        payout_method_label, payout_method_details,
        admin_note, transaction_ref,
        requested_at, reviewed_at, paid_at, updated_at
      FROM template_marketplace_withdrawals
      WHERE seller_user_id = $1
      ORDER BY requested_at DESC
      LIMIT $2
    `,
    [params.sellerUserId, limit],
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    sellerUserId: String(row.seller_user_id),
    sellerEmail: row.seller_email ? String(row.seller_email) : undefined,
    currency: 'INR' as const,
    amountInPaise: Number(row.amount_in_paise || 0),
    status: normalizeStatus(row.status),
    payoutMethod: {
      label: String(row.payout_method_label || 'Any'),
      details: String(row.payout_method_details || ''),
    },
    adminNote: row.admin_note ? String(row.admin_note) : undefined,
    transactionRef: row.transaction_ref ? String(row.transaction_ref) : undefined,
    requestedAt: new Date(row.requested_at).toISOString(),
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : undefined,
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : undefined,
    updatedAt: new Date(row.updated_at).toISOString(),
  })) as TemplateMarketplaceWithdrawal[];
}

export async function listAllTemplateWithdrawals(params: {
  status?: TemplateMarketplaceWithdrawalStatus | 'all';
  limit?: number;
}) {
  const limit = Math.min(800, Math.max(50, Math.round(params.limit ?? 300)));
  const status = params.status && params.status !== 'all' ? normalizeStatus(params.status) : null;
  const pool = getDbPool();
  if (!pool) {
    const raw = await readJsonFile<TemplateMarketplaceWithdrawal[]>(templateMarketplaceWithdrawalsPath, []);
    return raw
      .filter((w) => (status ? w.status === status : true))
      .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
      .slice(0, limit);
  }

  const result = await pool.query(
    `
      SELECT
        id, seller_user_id, seller_email, currency, amount_in_paise, status,
        payout_method_label, payout_method_details,
        admin_note, transaction_ref,
        requested_at, reviewed_at, paid_at, updated_at
      FROM template_marketplace_withdrawals
      WHERE ($1::text IS NULL OR status = $1)
      ORDER BY requested_at DESC
      LIMIT $2
    `,
    [status, limit],
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    sellerUserId: String(row.seller_user_id),
    sellerEmail: row.seller_email ? String(row.seller_email) : undefined,
    currency: 'INR' as const,
    amountInPaise: Number(row.amount_in_paise || 0),
    status: normalizeStatus(row.status),
    payoutMethod: {
      label: String(row.payout_method_label || 'Any'),
      details: String(row.payout_method_details || ''),
    },
    adminNote: row.admin_note ? String(row.admin_note) : undefined,
    transactionRef: row.transaction_ref ? String(row.transaction_ref) : undefined,
    requestedAt: new Date(row.requested_at).toISOString(),
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : undefined,
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : undefined,
    updatedAt: new Date(row.updated_at).toISOString(),
  })) as TemplateMarketplaceWithdrawal[];
}

export async function getSellerWithdrawalSummary(sellerUserId: string) {
  const income = await readJsonFile<TemplateMarketplaceIncomeRecord[]>(templateMarketplaceIncomePath, []);
  const earnedNet = income
    .filter((r) => r.sellerUserId === sellerUserId)
    .filter((r) => r.status !== 'void')
    .reduce((sum, r) => sum + (r.sellerNetAmountInPaise || 0), 0);

  const withdrawals = await listTemplateWithdrawals({ sellerUserId, limit: 600 });
  const paid = withdrawals.filter((w) => w.status === 'paid').reduce((s, w) => s + w.amountInPaise, 0);
  const reserved = withdrawals
    .filter((w) => w.status === 'requested' || w.status === 'approved')
    .reduce((s, w) => s + w.amountInPaise, 0);
  const available = Math.max(earnedNet - paid - reserved, 0);

  return {
    earnedNetInPaise: earnedNet,
    paidOutInPaise: paid,
    reservedInPaise: reserved,
    availableToWithdrawInPaise: available,
    minimumWithdrawInPaise: WITHDRAW_MIN_PAISE,
  };
}

export async function createTemplateWithdrawalRequest(params: {
  actor: User;
  amountInPaise: number;
  payoutMethodLabel: string;
  payoutMethodDetails: string;
}) {
  const amountInPaise = clampPaise(params.amountInPaise);
  if (amountInPaise < WITHDRAW_MIN_PAISE) {
    throw new Error('Minimum withdrawal is ₹1000.');
  }
  const summary = await getSellerWithdrawalSummary(params.actor.id);
  if (amountInPaise > summary.availableToWithdrawInPaise) {
    throw new Error('Withdrawal amount exceeds available balance.');
  }

  const label = String(params.payoutMethodLabel || '').trim().slice(0, 40) || 'Any';
  const details = String(params.payoutMethodDetails || '').trim().slice(0, 1200);
  if (!details) {
    throw new Error('Payment method details are required.');
  }

  const now = nowIso();
  const record: TemplateMarketplaceWithdrawal = {
    id: crypto.randomUUID(),
    sellerUserId: params.actor.id,
    sellerEmail: params.actor.email || undefined,
    currency: 'INR',
    amountInPaise,
    status: 'requested',
    payoutMethod: { label, details },
    requestedAt: now,
    updatedAt: now,
  };

  const pool = getDbPool();
  if (!pool) {
    const raw = await readJsonFile<TemplateMarketplaceWithdrawal[]>(templateMarketplaceWithdrawalsPath, []);
    await writeJsonFile(templateMarketplaceWithdrawalsPath, [record, ...raw].slice(0, 30_000));
  } else {
    await pool.query(
      `
        INSERT INTO template_marketplace_withdrawals (
          id, seller_user_id, seller_email, currency, amount_in_paise, status,
          payout_method_label, payout_method_details,
          requested_at, updated_at
        ) VALUES ($1,$2,$3,'INR',$4,'requested',$5,$6,NOW(),NOW())
      `,
      [record.id, record.sellerUserId, record.sellerEmail || null, record.amountInPaise, record.payoutMethod.label, record.payoutMethod.details],
    );
  }

  return record;
}

export async function updateTemplateWithdrawalByAdmin(params: {
  id: string;
  actorEmail: string;
  action: 'approve' | 'reject' | 'mark_paid';
  adminNote?: string;
  transactionRef?: string;
  origin: string;
}) {
  const id = String(params.id || '').trim();
  if (!id) throw new Error('Withdrawal id is required.');

  const pool = getDbPool();
  const now = nowIso();

  const loadOne = async () => {
    if (!pool) {
      const raw = await readJsonFile<TemplateMarketplaceWithdrawal[]>(templateMarketplaceWithdrawalsPath, []);
      return raw.find((w) => w.id === id) || null;
    }
    const result = await pool.query(
      `SELECT id, seller_user_id, seller_email, currency, amount_in_paise, status, payout_method_label, payout_method_details, admin_note, transaction_ref, requested_at, reviewed_at, paid_at, updated_at
       FROM template_marketplace_withdrawals WHERE id = $1 LIMIT 1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: String(row.id),
      sellerUserId: String(row.seller_user_id),
      sellerEmail: row.seller_email ? String(row.seller_email) : undefined,
      currency: 'INR' as const,
      amountInPaise: Number(row.amount_in_paise || 0),
      status: normalizeStatus(row.status),
      payoutMethod: { label: String(row.payout_method_label || 'Any'), details: String(row.payout_method_details || '') },
      adminNote: row.admin_note ? String(row.admin_note) : undefined,
      transactionRef: row.transaction_ref ? String(row.transaction_ref) : undefined,
      requestedAt: new Date(row.requested_at).toISOString(),
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : undefined,
      paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : undefined,
      updatedAt: new Date(row.updated_at).toISOString(),
    } as TemplateMarketplaceWithdrawal;
  };

  const current = await loadOne();
  if (!current) throw new Error('Withdrawal request not found.');

  const adminNote = params.adminNote ? String(params.adminNote).trim().slice(0, 800) : undefined;
  const transactionRef = params.transactionRef ? String(params.transactionRef).trim().slice(0, 120) : undefined;

  const nextStatus: TemplateMarketplaceWithdrawalStatus = params.action === 'approve'
    ? 'approved'
    : params.action === 'reject'
      ? 'rejected'
      : 'paid';

  if (params.action === 'mark_paid' && !transactionRef) {
    throw new Error('Transaction reference is required to mark as paid.');
  }

  const reviewedAt = params.action === 'approve' || params.action === 'reject' ? now : current.reviewedAt || now;
  const paidAt = params.action === 'mark_paid' ? now : current.paidAt;

  if (!pool) {
    const raw = await readJsonFile<TemplateMarketplaceWithdrawal[]>(templateMarketplaceWithdrawalsPath, []);
    const next = raw.map((w) => {
      if (w.id !== id) return w;
      return {
        ...w,
        status: nextStatus,
        adminNote: adminNote ?? w.adminNote,
        transactionRef: transactionRef ?? w.transactionRef,
        reviewedAt: reviewedAt,
        paidAt,
        updatedAt: now,
      };
    });
    await writeJsonFile(templateMarketplaceWithdrawalsPath, next.slice(0, 30_000));
  } else {
    await pool.query(
      `
        UPDATE template_marketplace_withdrawals
        SET
          status = $2,
          admin_note = COALESCE($3, admin_note),
          transaction_ref = COALESCE($4, transaction_ref),
          reviewed_at = COALESCE($5, reviewed_at),
          paid_at = $6,
          updated_at = NOW()
        WHERE id = $1
      `,
      [id, nextStatus, adminNote || null, transactionRef || null, reviewedAt ? new Date(reviewedAt) : null, paidAt ? new Date(paidAt) : null],
    );
  }

  // Notify seller on completion (paid).
  if (params.action === 'mark_paid' && current.sellerEmail) {
    const outbox = await getEmailOutbox(300);
    const reminderKey = `tpl-withdrawal-paid:${id}`;
    const alreadySent = outbox.some((ev) => ev.metadata?.reminderKey === reminderKey && (ev.status === 'sent' || ev.status === 'queued'));
    if (!alreadySent) {
      await sendTrackedMail({
        policyKey: 'billing_reminders',
        typeLabel: 'system',
        to: current.sellerEmail,
        subject: 'Template withdrawal paid',
        preheader: 'Your withdrawal has been paid.',
        text: `Your template withdrawal request has been paid.\n\nAmount: ₹${(current.amountInPaise / 100).toFixed(0)}\nReference: ${transactionRef}\n\nOpen dashboard: ${params.origin.replace(/\/$/, '')}/workspace?tab=template-publisher`,
        html: `
          <div style="border:1px solid #e2e8f0;border-radius:22px;padding:18px;background:#fff;">
            <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;font-weight:900;color:rgba(15,23,42,.55);">Template payout</div>
            <div style="margin-top:10px;font-size:18px;font-weight:900;color:#0f172a;">Withdrawal paid</div>
            <div style="margin-top:8px;font-size:14px;color:rgba(15,23,42,.72);">₹${(current.amountInPaise / 100).toFixed(0)} has been processed.</div>
            <div style="margin-top:14px;padding:14px;border-radius:18px;border:1px solid #e2e8f0;background:#f8fafc;">
              <div style="font-size:12px;font-weight:900;color:rgba(15,23,42,.6);">Transaction reference</div>
              <div style="margin-top:6px;font-size:16px;font-weight:900;color:#0f172a;">${transactionRef}</div>
            </div>
            <div style="margin-top:14px;">
              <a href="${params.origin.replace(/\/$/, '')}/workspace?tab=template-publisher" style="display:inline-block;padding:12px 16px;border-radius:14px;border:1px solid #0f172a;background:#0f172a;color:#fff;font-weight:800;text-decoration:none;font-size:14px;">Open withdrawals</a>
            </div>
          </div>
        `,
        sentBy: params.actorEmail || 'admin',
        origin: params.origin,
        metadata: { reminderKey, withdrawalId: id, event: 'template_withdrawal_paid' },
      });
    }
  }

  return { ok: true };
}
