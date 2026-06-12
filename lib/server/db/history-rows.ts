import type { DocumentHistory } from '@/types/document';
import { getDbPool } from '@/lib/server/database';

function rowToEntry(row: { full_record: unknown }) {
  return row.full_record as DocumentHistory;
}

export async function selectAllHistoryRows(): Promise<DocumentHistory[]> {
  const pool = getDbPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT full_record FROM history_entries ORDER BY generated_at DESC, id DESC`,
  );
  return result.rows.map(rowToEntry);
}

export async function selectHistoryRowById(idOrShareId: string): Promise<DocumentHistory | null> {
  const pool = getDbPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT full_record FROM history_entries WHERE id = $1 OR share_id = $1 LIMIT 1`,
    [idOrShareId],
  );
  return result.rows[0] ? rowToEntry(result.rows[0]) : null;
}

function entryToParams(entry: DocumentHistory) {
  return [
    entry.id,
    entry.shareId || null,
    entry.referenceNumber || null,
    entry.templateId || null,
    entry.templateName || null,
    entry.category || null,
    entry.organizationId || null,
    entry.generatedBy || null,
    entry.generatedAt || null,
    entry.shareUrl || null,
    entry.sharePassword || null,
    entry.previewHtml || null,
    JSON.stringify(entry.data || {}),
    JSON.stringify(entry.editorState || {}),
    JSON.stringify(entry.collaborationComments || []),
    JSON.stringify(entry.accessEvents || []),
    JSON.stringify(entry.managedFiles || []),
    JSON.stringify(entry.versionSnapshots || []),
    JSON.stringify(entry.deliveryHistory || []),
    JSON.stringify(entry),
  ] as const;
}

export async function upsertHistoryRow(entry: DocumentHistory): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  await pool.query(
    `INSERT INTO history_entries (
      id, share_id, reference_number, template_id, template_name, category, organization_id,
      generated_by, generated_at, share_url, share_password, preview_html, document_data,
      editor_state, collaboration_comments, access_events, managed_files, version_snapshots,
      delivery_history, full_record, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()), $10, $11, $12,
      $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb,
      $19::jsonb, $20::jsonb, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      share_id = EXCLUDED.share_id,
      reference_number = EXCLUDED.reference_number,
      template_id = EXCLUDED.template_id,
      template_name = EXCLUDED.template_name,
      category = EXCLUDED.category,
      organization_id = EXCLUDED.organization_id,
      generated_by = EXCLUDED.generated_by,
      generated_at = EXCLUDED.generated_at,
      share_url = EXCLUDED.share_url,
      share_password = EXCLUDED.share_password,
      preview_html = EXCLUDED.preview_html,
      document_data = EXCLUDED.document_data,
      editor_state = EXCLUDED.editor_state,
      collaboration_comments = EXCLUDED.collaboration_comments,
      access_events = EXCLUDED.access_events,
      managed_files = EXCLUDED.managed_files,
      version_snapshots = EXCLUDED.version_snapshots,
      delivery_history = EXCLUDED.delivery_history,
      full_record = EXCLUDED.full_record,
      updated_at = NOW()`,
    [...entryToParams(entry)],
  );
}

export async function deleteHistoryRow(id: string): Promise<boolean> {
  const pool = getDbPool();
  if (!pool) return false;
  const result = await pool.query(`DELETE FROM history_entries WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export interface HistoryFilterOpts {
  role: string;
  email: string;
  orgId: string | null;
}

/** Returns history entries visible to the given user — filtered at the DB level to avoid full-table scans. */
export async function selectHistoryRowsForUser(opts: HistoryFilterOpts): Promise<DocumentHistory[]> {
  const pool = getDbPool();
  if (!pool) return [];
  const { role, email, orgId } = opts;

  if (role === 'admin') {
    const result = await pool.query(
      `SELECT full_record FROM history_entries ORDER BY generated_at DESC, id DESC`,
    );
    return result.rows.map(rowToEntry);
  }

  if (role === 'employee') {
    const lowerEmail = email.toLowerCase();
    const result = await pool.query(
      `SELECT full_record FROM history_entries
       WHERE generated_by = $1 OR LOWER(full_record->>'employeeEmail') = $1
       ORDER BY generated_at DESC, id DESC`,
      [lowerEmail],
    );
    return result.rows.map(rowToEntry);
  }

  if (role === 'client') {
    const lowerEmail = email.toLowerCase();
    const result = await pool.query(
      `SELECT full_record FROM history_entries
       WHERE organization_id = $1
          OR LOWER(generated_by) = $2
          OR LOWER(full_record->>'clientEmail') = $2
       ORDER BY generated_at DESC, id DESC`,
      [orgId || '', lowerEmail],
    );
    return result.rows.map(rowToEntry);
  }

  const result = await pool.query(
    `SELECT full_record FROM history_entries
     WHERE generated_by = $1
     ORDER BY generated_at DESC, id DESC`,
    [email],
  );
  return result.rows.map(rowToEntry);
}

/** Diff-based reconcile — upserts all incoming rows and deletes removed ones. Uses UNNEST batch for a single DB round trip. */
export async function reconcileHistoryRows(entries: DocumentHistory[]): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  const incomingIds = new Set(entries.map((e) => e.id));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ id: string }>('SELECT id FROM history_entries');
    const toDelete = existing.rows.map((r) => r.id).filter((id) => !incomingIds.has(id));
    if (toDelete.length) {
      await client.query('DELETE FROM history_entries WHERE id = ANY($1::text[])', [toDelete]);
    }
    if (entries.length > 0) {
      const ids: string[] = [], shareIds: (string | null)[] = [], refNums: (string | null)[] = [];
      const tplIds: (string | null)[] = [], tplNames: (string | null)[] = [], cats: (string | null)[] = [];
      const orgIds: (string | null)[] = [], genBys: (string | null)[] = [], genAts: (string | null)[] = [];
      const shareUrls: (string | null)[] = [], sharePwds: (string | null)[] = [], prevHtmls: (string | null)[] = [];
      const docDatas: string[] = [], editorStates: string[] = [], collabComments: string[] = [];
      const accessEvents: string[] = [], managedFiles: string[] = [], versionSnaps: string[] = [];
      const deliveryHistories: string[] = [], fullRecords: string[] = [];
      for (const e of entries) {
        const p = entryToParams(e);
        ids.push(p[0]); shareIds.push(p[1]); refNums.push(p[2]); tplIds.push(p[3]);
        tplNames.push(p[4]); cats.push(p[5]); orgIds.push(p[6]); genBys.push(p[7]);
        genAts.push(p[8]); shareUrls.push(p[9]); sharePwds.push(p[10]); prevHtmls.push(p[11]);
        docDatas.push(p[12]); editorStates.push(p[13]); collabComments.push(p[14]);
        accessEvents.push(p[15]); managedFiles.push(p[16]); versionSnaps.push(p[17]);
        deliveryHistories.push(p[18]); fullRecords.push(p[19]);
      }
      await client.query(
        `INSERT INTO history_entries (
          id, share_id, reference_number, template_id, template_name, category, organization_id,
          generated_by, generated_at, share_url, share_password, preview_html, document_data,
          editor_state, collaboration_comments, access_events, managed_files, version_snapshots,
          delivery_history, full_record, updated_at
        )
        SELECT * FROM UNNEST(
          $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
          $8::text[], $9::timestamptz[], $10::text[], $11::text[], $12::text[],
          $13::jsonb[], $14::jsonb[], $15::jsonb[], $16::jsonb[], $17::jsonb[], $18::jsonb[],
          $19::jsonb[], $20::jsonb[]
        ), NOW()
        ON CONFLICT (id) DO UPDATE SET
          share_id = EXCLUDED.share_id,
          reference_number = EXCLUDED.reference_number,
          template_id = EXCLUDED.template_id,
          template_name = EXCLUDED.template_name,
          category = EXCLUDED.category,
          organization_id = EXCLUDED.organization_id,
          generated_by = EXCLUDED.generated_by,
          generated_at = EXCLUDED.generated_at,
          share_url = EXCLUDED.share_url,
          share_password = EXCLUDED.share_password,
          preview_html = EXCLUDED.preview_html,
          document_data = EXCLUDED.document_data,
          editor_state = EXCLUDED.editor_state,
          collaboration_comments = EXCLUDED.collaboration_comments,
          access_events = EXCLUDED.access_events,
          managed_files = EXCLUDED.managed_files,
          version_snapshots = EXCLUDED.version_snapshots,
          delivery_history = EXCLUDED.delivery_history,
          full_record = EXCLUDED.full_record,
          updated_at = NOW()`,
        [ids, shareIds, refNums, tplIds, tplNames, cats, orgIds, genBys, genAts,
          shareUrls, sharePwds, prevHtmls, docDatas, editorStates, collabComments,
          accessEvents, managedFiles, versionSnaps, deliveryHistories, fullRecords],
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

/** Kept for backward compatibility. Prefer reconcileHistoryRows for new code. */
export async function bulkReplaceHistoryRows(entries: DocumentHistory[]): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM history_entries');
    if (entries.length > 0) {
      const ids: string[] = [], shareIds: (string | null)[] = [], refNums: (string | null)[] = [];
      const tplIds: (string | null)[] = [], tplNames: (string | null)[] = [], cats: (string | null)[] = [];
      const orgIds: (string | null)[] = [], genBys: (string | null)[] = [], genAts: (string | null)[] = [];
      const shareUrls: (string | null)[] = [], sharePwds: (string | null)[] = [], prevHtmls: (string | null)[] = [];
      const docDatas: string[] = [], editorStates: string[] = [], collabComments: string[] = [];
      const accessEvents: string[] = [], managedFiles: string[] = [], versionSnaps: string[] = [];
      const deliveryHistories: string[] = [], fullRecords: string[] = [];
      for (const e of entries) {
        const p = entryToParams(e);
        ids.push(p[0]); shareIds.push(p[1]); refNums.push(p[2]); tplIds.push(p[3]);
        tplNames.push(p[4]); cats.push(p[5]); orgIds.push(p[6]); genBys.push(p[7]);
        genAts.push(p[8]); shareUrls.push(p[9]); sharePwds.push(p[10]); prevHtmls.push(p[11]);
        docDatas.push(p[12]); editorStates.push(p[13]); collabComments.push(p[14]);
        accessEvents.push(p[15]); managedFiles.push(p[16]); versionSnaps.push(p[17]);
        deliveryHistories.push(p[18]); fullRecords.push(p[19]);
      }
      await client.query(
        `INSERT INTO history_entries (
          id, share_id, reference_number, template_id, template_name, category, organization_id,
          generated_by, generated_at, share_url, share_password, preview_html, document_data,
          editor_state, collaboration_comments, access_events, managed_files, version_snapshots,
          delivery_history, full_record, updated_at
        )
        SELECT * FROM UNNEST(
          $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
          $8::text[], $9::timestamptz[], $10::text[], $11::text[], $12::text[],
          $13::jsonb[], $14::jsonb[], $15::jsonb[], $16::jsonb[], $17::jsonb[], $18::jsonb[],
          $19::jsonb[], $20::jsonb[]
        ), NOW()`,
        [ids, shareIds, refNums, tplIds, tplNames, cats, orgIds, genBys, genAts,
          shareUrls, sharePwds, prevHtmls, docDatas, editorStates, collabComments,
          accessEvents, managedFiles, versionSnaps, deliveryHistories, fullRecords],
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
