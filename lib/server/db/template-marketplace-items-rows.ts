import type { TemplateMarketplaceItem } from '@/types/document';
import { getDbPool } from '@/lib/server/database';

function rowToItem(row: { full_record: unknown }) {
  return row.full_record as TemplateMarketplaceItem;
}

export async function selectAllTemplateMarketplaceItemRows(): Promise<TemplateMarketplaceItem[]> {
  const pool = getDbPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT full_record FROM template_marketplace_items ORDER BY created_at DESC, id DESC`,
  );
  return result.rows.map(rowToItem);
}

export async function selectTemplateMarketplaceItemRowById(id: string): Promise<TemplateMarketplaceItem | null> {
  const pool = getDbPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT full_record FROM template_marketplace_items WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ? rowToItem(result.rows[0]) : null;
}

export async function selectTemplateMarketplaceItemRowsBySeller(sellerUserId: string): Promise<TemplateMarketplaceItem[]> {
  const pool = getDbPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT full_record FROM template_marketplace_items WHERE seller_user_id = $1
     ORDER BY created_at DESC, id DESC`,
    [sellerUserId],
  );
  return result.rows.map(rowToItem);
}

function itemToParams(it: TemplateMarketplaceItem) {
  return [
    it.id,
    JSON.stringify(it.templateSnapshot || {}),
    it.sellerUserId,
    it.sellerName || null,
    it.sellerEmail || null,
    Number(it.priceInPaise ?? 0),
    it.currency || 'INR',
    JSON.stringify(it.tags || []),
    it.status || 'pending',
    JSON.stringify(it.exampleData || {}),
    JSON.stringify(it.previewImageDataUrls || []),
    Number(it.previewRenderVersion ?? 0),
    Number(it.purchaseCount ?? 0),
    Number(it.openCount ?? 0),
    JSON.stringify(it),
    it.createdAt || null,
    it.updatedAt || null,
  ] as const;
}

const INSERT_SQL = `INSERT INTO template_marketplace_items (
  id, template_snapshot, seller_user_id, seller_name, seller_email, price_in_paise, currency,
  tags, status, example_data, preview_image_data_urls, preview_render_version, purchase_count,
  open_count, full_record, created_at, updated_at
) VALUES (
  $1, $2::jsonb, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11::jsonb, $12, $13, $14,
  $15::jsonb, COALESCE($16::timestamptz, NOW()), COALESCE($17::timestamptz, NOW())
)`;

export async function upsertTemplateMarketplaceItemRow(it: TemplateMarketplaceItem): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  await pool.query(
    `${INSERT_SQL}
    ON CONFLICT (id) DO UPDATE SET
      template_snapshot = EXCLUDED.template_snapshot,
      seller_user_id = EXCLUDED.seller_user_id,
      seller_name = EXCLUDED.seller_name,
      seller_email = EXCLUDED.seller_email,
      price_in_paise = EXCLUDED.price_in_paise,
      currency = EXCLUDED.currency,
      tags = EXCLUDED.tags,
      status = EXCLUDED.status,
      example_data = EXCLUDED.example_data,
      preview_image_data_urls = EXCLUDED.preview_image_data_urls,
      preview_render_version = EXCLUDED.preview_render_version,
      purchase_count = EXCLUDED.purchase_count,
      open_count = EXCLUDED.open_count,
      full_record = EXCLUDED.full_record,
      updated_at = NOW()`,
    [...itemToParams(it)],
  );
}

export async function deleteTemplateMarketplaceItemRow(id: string): Promise<boolean> {
  const pool = getDbPool();
  if (!pool) return false;
  const result = await pool.query(`DELETE FROM template_marketplace_items WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function incrementTemplateMarketplaceItemOpens(id: string): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  await pool.query(
    `UPDATE template_marketplace_items
     SET open_count = COALESCE(open_count, 0) + 1,
         full_record = jsonb_set(full_record, '{openCount}', to_jsonb(COALESCE(open_count, 0) + 1)),
         updated_at = NOW()
     WHERE id = $1`,
    [id],
  );
}

export async function bulkReplaceTemplateMarketplaceItemRows(rows: TemplateMarketplaceItem[]): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  const incomingIds = new Set(rows.map((r) => r.id));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ id: string }>(`SELECT id FROM template_marketplace_items`);
    const toDelete = existing.rows.map((r) => r.id).filter((id) => !incomingIds.has(id));
    if (toDelete.length) {
      await client.query(`DELETE FROM template_marketplace_items WHERE id = ANY($1::text[])`, [toDelete]);
    }
    if (rows.length > 0) {
      const ids: string[] = [], tplSnapshots: string[] = [], sellerUserIds: string[] = [];
      const sellerNames: (string | null)[] = [], sellerEmails: (string | null)[] = [];
      const prices: number[] = [], currencies: string[] = [], tags: string[] = [];
      const statuses: string[] = [], exampleDatas: string[] = [], previewUrls: string[] = [];
      const renderVersions: number[] = [], purchaseCounts: number[] = [], openCounts: number[] = [];
      const fullRecords: string[] = [], createdAts: (string | null)[] = [], updatedAts: (string | null)[] = [];
      for (const r of rows) {
        const p = itemToParams(r);
        ids.push(p[0]); tplSnapshots.push(p[1]); sellerUserIds.push(p[2]);
        sellerNames.push(p[3]); sellerEmails.push(p[4]); prices.push(p[5]); currencies.push(p[6]);
        tags.push(p[7]); statuses.push(p[8]); exampleDatas.push(p[9]); previewUrls.push(p[10]);
        renderVersions.push(p[11]); purchaseCounts.push(p[12]); openCounts.push(p[13]);
        fullRecords.push(p[14]); createdAts.push(p[15]); updatedAts.push(p[16]);
      }
      await client.query(
        `INSERT INTO template_marketplace_items (
          id, template_snapshot, seller_user_id, seller_name, seller_email, price_in_paise, currency,
          tags, status, example_data, preview_image_data_urls, preview_render_version, purchase_count,
          open_count, full_record, created_at, updated_at
        )
        SELECT * FROM UNNEST(
          $1::text[], $2::jsonb[], $3::text[], $4::text[], $5::text[], $6::int[], $7::text[],
          $8::jsonb[], $9::text[], $10::jsonb[], $11::jsonb[], $12::int[], $13::int[], $14::int[],
          $15::jsonb[], $16::timestamptz[], $17::timestamptz[]
        )
        ON CONFLICT (id) DO UPDATE SET
          template_snapshot = EXCLUDED.template_snapshot,
          seller_user_id = EXCLUDED.seller_user_id,
          seller_name = EXCLUDED.seller_name,
          seller_email = EXCLUDED.seller_email,
          price_in_paise = EXCLUDED.price_in_paise,
          currency = EXCLUDED.currency,
          tags = EXCLUDED.tags,
          status = EXCLUDED.status,
          example_data = EXCLUDED.example_data,
          preview_image_data_urls = EXCLUDED.preview_image_data_urls,
          preview_render_version = EXCLUDED.preview_render_version,
          purchase_count = EXCLUDED.purchase_count,
          open_count = EXCLUDED.open_count,
          full_record = EXCLUDED.full_record,
          updated_at = NOW()`,
        [ids, tplSnapshots, sellerUserIds, sellerNames, sellerEmails, prices, currencies,
          tags, statuses, exampleDatas, previewUrls, renderVersions, purchaseCounts, openCounts,
          fullRecords, createdAts, updatedAts],
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
