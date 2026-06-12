import type { BillingTransaction } from '@/types/document';
import { getDbPool } from '@/lib/server/database';

function rowToTxn(row: { full_record: unknown }) {
  return row.full_record as BillingTransaction;
}

export async function selectAllBillingRows(): Promise<BillingTransaction[]> {
  const pool = getDbPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT full_record FROM billing_transactions ORDER BY created_at DESC, id DESC`,
  );
  return result.rows.map(rowToTxn);
}

export async function selectBillingRowById(id: string): Promise<BillingTransaction | null> {
  const pool = getDbPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT full_record FROM billing_transactions WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ? rowToTxn(result.rows[0]) : null;
}

export async function selectBillingRowByProviderOrderId(providerOrderId: string): Promise<BillingTransaction | null> {
  const pool = getDbPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT full_record FROM billing_transactions WHERE provider_order_id = $1 LIMIT 1`,
    [providerOrderId],
  );
  return result.rows[0] ? rowToTxn(result.rows[0]) : null;
}

export async function selectBillingRowsForUser(userId: string): Promise<BillingTransaction[]> {
  const pool = getDbPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT full_record FROM billing_transactions WHERE user_id = $1 ORDER BY created_at DESC, id DESC`,
    [userId],
  );
  return result.rows.map(rowToTxn);
}

function txnToParams(t: BillingTransaction) {
  return [
    t.id,
    t.userId || null,
    t.userEmail || null,
    t.userName || null,
    t.organizationId || null,
    t.organizationName || null,
    t.accountType || null,
    t.productType || null,
    t.productLabel || null,
    t.planId || null,
    t.planName || null,
    t.billingModel || null,
    t.quantity ?? null,
    t.unitAmountInPaise ?? null,
    Number(t.baseAmountInPaise ?? 0),
    Number(t.gstRate ?? 0),
    Number(t.gstAmountInPaise ?? 0),
    Number(t.totalAmountInPaise ?? 0),
    Number(t.amountInPaise ?? 0),
    t.discountAmountInPaise ?? null,
    t.couponCode || null,
    t.referralCode || null,
    t.gstin || null,
    t.currency || 'INR',
    t.status || 'created',
    t.provider || 'razorpay',
    t.providerOrderId || null,
    t.providerPaymentId || null,
    t.providerSignature || null,
    t.receipt || null,
    t.invoiceNumber || null,
    t.notes || null,
    t.customConfiguration ? JSON.stringify(t.customConfiguration) : null,
    t.couponRedeemedAt || null,
    t.referralBonusGrantedAt || null,
    t.paidAt || null,
    JSON.stringify(t),
    t.createdAt || null,
    t.updatedAt || null,
  ] as const;
}

const INSERT_SQL = `INSERT INTO billing_transactions (
  id, user_id, user_email, user_name, organization_id, organization_name, account_type,
  product_type, product_label, plan_id, plan_name, billing_model, quantity, unit_amount_in_paise,
  base_amount_in_paise, gst_rate, gst_amount_in_paise, total_amount_in_paise, amount_in_paise,
  discount_amount_in_paise, coupon_code, referral_code, gstin, currency, status, provider,
  provider_order_id, provider_payment_id, provider_signature, receipt, invoice_number, notes,
  custom_configuration, coupon_redeemed_at, referral_bonus_granted_at, paid_at, full_record,
  created_at, updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
  $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33::jsonb, $34, $35,
  $36, $37::jsonb, COALESCE($38::timestamptz, NOW()), COALESCE($39::timestamptz, NOW())
)`;

export async function upsertBillingRow(t: BillingTransaction): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  await pool.query(
    `${INSERT_SQL}
    ON CONFLICT (id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      user_email = EXCLUDED.user_email,
      user_name = EXCLUDED.user_name,
      organization_id = EXCLUDED.organization_id,
      organization_name = EXCLUDED.organization_name,
      account_type = EXCLUDED.account_type,
      product_type = EXCLUDED.product_type,
      product_label = EXCLUDED.product_label,
      plan_id = EXCLUDED.plan_id,
      plan_name = EXCLUDED.plan_name,
      billing_model = EXCLUDED.billing_model,
      quantity = EXCLUDED.quantity,
      unit_amount_in_paise = EXCLUDED.unit_amount_in_paise,
      base_amount_in_paise = EXCLUDED.base_amount_in_paise,
      gst_rate = EXCLUDED.gst_rate,
      gst_amount_in_paise = EXCLUDED.gst_amount_in_paise,
      total_amount_in_paise = EXCLUDED.total_amount_in_paise,
      amount_in_paise = EXCLUDED.amount_in_paise,
      discount_amount_in_paise = EXCLUDED.discount_amount_in_paise,
      coupon_code = EXCLUDED.coupon_code,
      referral_code = EXCLUDED.referral_code,
      gstin = EXCLUDED.gstin,
      currency = EXCLUDED.currency,
      status = EXCLUDED.status,
      provider = EXCLUDED.provider,
      provider_order_id = EXCLUDED.provider_order_id,
      provider_payment_id = EXCLUDED.provider_payment_id,
      provider_signature = EXCLUDED.provider_signature,
      receipt = EXCLUDED.receipt,
      invoice_number = EXCLUDED.invoice_number,
      notes = EXCLUDED.notes,
      custom_configuration = EXCLUDED.custom_configuration,
      coupon_redeemed_at = EXCLUDED.coupon_redeemed_at,
      referral_bonus_granted_at = EXCLUDED.referral_bonus_granted_at,
      paid_at = EXCLUDED.paid_at,
      full_record = EXCLUDED.full_record,
      updated_at = NOW()`,
    [...txnToParams(t)],
  );
}

export async function updateBillingRowByProviderOrderId(
  providerOrderId: string,
  patch: Partial<BillingTransaction>,
): Promise<BillingTransaction | null> {
  const existing = await selectBillingRowByProviderOrderId(providerOrderId);
  if (!existing) return null;
  const merged: BillingTransaction = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await upsertBillingRow(merged);
  return merged;
}

export async function deleteBillingRow(id: string): Promise<boolean> {
  const pool = getDbPool();
  if (!pool) return false;
  const result = await pool.query(`DELETE FROM billing_transactions WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function bulkReplaceBillingRows(rows: BillingTransaction[]): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM billing_transactions');
    if (rows.length > 0) {
      // Batch upsert all rows in a single round-trip using UNNEST.
      const cols = {
        ids: [] as string[], userIds: [] as (string | null)[], userEmails: [] as (string | null)[],
        userNames: [] as (string | null)[], orgIds: [] as (string | null)[], orgNames: [] as (string | null)[],
        acctTypes: [] as (string | null)[], prodTypes: [] as (string | null)[], prodLabels: [] as (string | null)[],
        planIds: [] as (string | null)[], planNames: [] as (string | null)[], billingModels: [] as (string | null)[],
        qtys: [] as (number | null)[], unitAmts: [] as (number | null)[],
        baseAmts: [] as number[], gstRates: [] as number[], gstAmts: [] as number[],
        totalAmts: [] as number[], amts: [] as number[], discounts: [] as (number | null)[],
        coupons: [] as (string | null)[], referrals: [] as (string | null)[], gstins: [] as (string | null)[],
        currencies: [] as string[], statuses: [] as string[], providers: [] as string[],
        orderIds: [] as (string | null)[], paymentIds: [] as (string | null)[], signatures: [] as (string | null)[],
        receipts: [] as (string | null)[], invoiceNums: [] as (string | null)[], notes: [] as (string | null)[],
        customConfigs: [] as (string | null)[], couponRedeemedAts: [] as (string | null)[],
        referralBonusAts: [] as (string | null)[], paidAts: [] as (string | null)[],
        fullRecords: [] as string[], createdAts: [] as (string | null)[], updatedAts: [] as (string | null)[],
      };
      for (const t of rows) {
        const p = txnToParams(t);
        cols.ids.push(p[0] as string); cols.userIds.push(p[1] as string | null); cols.userEmails.push(p[2] as string | null);
        cols.userNames.push(p[3] as string | null); cols.orgIds.push(p[4] as string | null); cols.orgNames.push(p[5] as string | null);
        cols.acctTypes.push(p[6] as string | null); cols.prodTypes.push(p[7] as string | null); cols.prodLabels.push(p[8] as string | null);
        cols.planIds.push(p[9] as string | null); cols.planNames.push(p[10] as string | null); cols.billingModels.push(p[11] as string | null);
        cols.qtys.push(p[12] as number | null); cols.unitAmts.push(p[13] as number | null);
        cols.baseAmts.push(p[14] as number); cols.gstRates.push(p[15] as number); cols.gstAmts.push(p[16] as number);
        cols.totalAmts.push(p[17] as number); cols.amts.push(p[18] as number); cols.discounts.push(p[19] as number | null);
        cols.coupons.push(p[20] as string | null); cols.referrals.push(p[21] as string | null); cols.gstins.push(p[22] as string | null);
        cols.currencies.push(p[23] as string); cols.statuses.push(p[24] as string); cols.providers.push(p[25] as string);
        cols.orderIds.push(p[26] as string | null); cols.paymentIds.push(p[27] as string | null); cols.signatures.push(p[28] as string | null);
        cols.receipts.push(p[29] as string | null); cols.invoiceNums.push(p[30] as string | null); cols.notes.push(p[31] as string | null);
        cols.customConfigs.push(p[32] as string | null); cols.couponRedeemedAts.push(p[33] as string | null);
        cols.referralBonusAts.push(p[34] as string | null); cols.paidAts.push(p[35] as string | null);
        cols.fullRecords.push(p[36] as string); cols.createdAts.push(p[37] as string | null); cols.updatedAts.push(p[38] as string | null);
      }
      await client.query(
        `INSERT INTO billing_transactions (
          id, user_id, user_email, user_name, organization_id, organization_name, account_type,
          product_type, product_label, plan_id, plan_name, billing_model, quantity, unit_amount_in_paise,
          base_amount_in_paise, gst_rate, gst_amount_in_paise, total_amount_in_paise, amount_in_paise,
          discount_amount_in_paise, coupon_code, referral_code, gstin, currency, status, provider,
          provider_order_id, provider_payment_id, provider_signature, receipt, invoice_number, notes,
          custom_configuration, coupon_redeemed_at, referral_bonus_granted_at, paid_at, full_record,
          created_at, updated_at
        )
        SELECT * FROM UNNEST(
          $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
          $8::text[], $9::text[], $10::text[], $11::text[], $12::text[], $13::int[], $14::int[],
          $15::int[], $16::numeric[], $17::int[], $18::int[], $19::int[],
          $20::int[], $21::text[], $22::text[], $23::text[], $24::text[], $25::text[], $26::text[],
          $27::text[], $28::text[], $29::text[], $30::text[], $31::text[], $32::text[],
          $33::jsonb[], $34::timestamptz[], $35::timestamptz[], $36::timestamptz[], $37::jsonb[],
          $38::timestamptz[], $39::timestamptz[]
        )`,
        [
          cols.ids, cols.userIds, cols.userEmails, cols.userNames, cols.orgIds, cols.orgNames, cols.acctTypes,
          cols.prodTypes, cols.prodLabels, cols.planIds, cols.planNames, cols.billingModels, cols.qtys, cols.unitAmts,
          cols.baseAmts, cols.gstRates, cols.gstAmts, cols.totalAmts, cols.amts,
          cols.discounts, cols.coupons, cols.referrals, cols.gstins, cols.currencies, cols.statuses, cols.providers,
          cols.orderIds, cols.paymentIds, cols.signatures, cols.receipts, cols.invoiceNums, cols.notes,
          cols.customConfigs, cols.couponRedeemedAts, cols.referralBonusAts, cols.paidAts, cols.fullRecords,
          cols.createdAts, cols.updatedAts,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
