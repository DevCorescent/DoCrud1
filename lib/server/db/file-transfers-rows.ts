import type { SecureFileTransfer } from '@/types/document';
import { getDbPool } from '@/lib/server/database';

function rowToEntry(row: { full_record: unknown }) {
  return row.full_record as SecureFileTransfer;
}

export async function selectAllFileTransferRows(): Promise<SecureFileTransfer[]> {
  const pool = getDbPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT full_record FROM file_transfers ORDER BY created_at DESC, id DESC`,
  );
  return result.rows.map(rowToEntry);
}

export async function selectFileTransferRowById(idOrShareId: string): Promise<SecureFileTransfer | null> {
  const pool = getDbPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT full_record FROM file_transfers WHERE id = $1 OR share_id = $1 LIMIT 1`,
    [idOrShareId],
  );
  return result.rows[0] ? rowToEntry(result.rows[0]) : null;
}

function entryToParams(t: SecureFileTransfer) {
  return [
    t.id,
    t.shareId || null,
    t.shareUrl || null,
    t.publicOpenUrl || null,
    t.title || null,
    t.fileName || null,
    t.mimeType || null,
    t.dataUrl || null,
    t.encryptedPayload || null,
    Boolean(t.encryptionEnabled),
    t.encryptionAlgorithm || null,
    t.sizeInBytes ?? null,
    t.notes || null,
    t.folderId || null,
    t.folderName || null,
    t.lockerId || null,
    t.lockerName || null,
    t.directoryVisibility || null,
    t.directoryCategory || null,
    JSON.stringify(t.directoryTags || []),
    t.authMode || null,
    t.accessPassword || null,
    t.fileAccessPassword || null,
    t.securePassword || null,
    t.parserPassword || null,
    t.recipientEmail || null,
    t.maxDownloads ?? null,
    t.expiresAt || null,
    t.uploadedBy || null,
    t.uploadedByUserId || null,
    t.organizationId || null,
    t.organizationName || null,
    t.thumbnailUrl || null,
    Number(t.openCount ?? 0),
    Number(t.downloadCount ?? 0),
    Number(t.viewCount ?? 0),
    t.lastOpenedAt || null,
    t.lastDownloadedAt || null,
    JSON.stringify(t.accessEvents || []),
    JSON.stringify(t.likedBy || []),
    Number(t.likesCount ?? 0),
    JSON.stringify(t.comments || []),
    Number(t.commentsCount ?? 0),
    Boolean(t.featured),
    t.featuredPlan || null,
    t.featuredAt || null,
    t.featuredUntil || null,
    t.featuredOrderId || null,
    t.revokedAt || null,
    JSON.stringify(t),
    t.createdAt || null,
    t.updatedAt || null,
  ] as const;
}

const INSERT_SQL = `INSERT INTO file_transfers (
  id, share_id, share_url, public_open_url, title, file_name, mime_type, data_url,
  encrypted_payload, encryption_enabled, encryption_algorithm, size_in_bytes, notes,
  folder_id, folder_name, locker_id, locker_name, directory_visibility, directory_category,
  directory_tags, auth_mode, access_password, file_access_password, secure_password,
  parser_password, recipient_email, max_downloads, expires_at, uploaded_by, uploaded_by_user_id,
  organization_id, organization_name, thumbnail_url, open_count, download_count, view_count,
  last_opened_at, last_downloaded_at, access_events, liked_by, likes_count, comments,
  comments_count, featured, featured_plan, featured_at, featured_until, featured_order_id,
  revoked_at, full_record, created_at, updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
  $20::jsonb, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36,
  $37, $38, $39::jsonb, $40::jsonb, $41, $42::jsonb, $43, $44, $45, $46, $47, $48, $49,
  $50::jsonb, COALESCE($51::timestamptz, NOW()), COALESCE($52::timestamptz, NOW())
)`;

export async function upsertFileTransferRow(t: SecureFileTransfer): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  await pool.query(
    `${INSERT_SQL}
    ON CONFLICT (id) DO UPDATE SET
      share_id = EXCLUDED.share_id,
      share_url = EXCLUDED.share_url,
      public_open_url = EXCLUDED.public_open_url,
      title = EXCLUDED.title,
      file_name = EXCLUDED.file_name,
      mime_type = EXCLUDED.mime_type,
      data_url = EXCLUDED.data_url,
      encrypted_payload = EXCLUDED.encrypted_payload,
      encryption_enabled = EXCLUDED.encryption_enabled,
      encryption_algorithm = EXCLUDED.encryption_algorithm,
      size_in_bytes = EXCLUDED.size_in_bytes,
      notes = EXCLUDED.notes,
      folder_id = EXCLUDED.folder_id,
      folder_name = EXCLUDED.folder_name,
      locker_id = EXCLUDED.locker_id,
      locker_name = EXCLUDED.locker_name,
      directory_visibility = EXCLUDED.directory_visibility,
      directory_category = EXCLUDED.directory_category,
      directory_tags = EXCLUDED.directory_tags,
      auth_mode = EXCLUDED.auth_mode,
      access_password = EXCLUDED.access_password,
      file_access_password = EXCLUDED.file_access_password,
      secure_password = EXCLUDED.secure_password,
      parser_password = EXCLUDED.parser_password,
      recipient_email = EXCLUDED.recipient_email,
      max_downloads = EXCLUDED.max_downloads,
      expires_at = EXCLUDED.expires_at,
      uploaded_by = EXCLUDED.uploaded_by,
      uploaded_by_user_id = EXCLUDED.uploaded_by_user_id,
      organization_id = EXCLUDED.organization_id,
      organization_name = EXCLUDED.organization_name,
      thumbnail_url = EXCLUDED.thumbnail_url,
      open_count = EXCLUDED.open_count,
      download_count = EXCLUDED.download_count,
      view_count = EXCLUDED.view_count,
      last_opened_at = EXCLUDED.last_opened_at,
      last_downloaded_at = EXCLUDED.last_downloaded_at,
      access_events = EXCLUDED.access_events,
      liked_by = EXCLUDED.liked_by,
      likes_count = EXCLUDED.likes_count,
      comments = EXCLUDED.comments,
      comments_count = EXCLUDED.comments_count,
      featured = EXCLUDED.featured,
      featured_plan = EXCLUDED.featured_plan,
      featured_at = EXCLUDED.featured_at,
      featured_until = EXCLUDED.featured_until,
      featured_order_id = EXCLUDED.featured_order_id,
      revoked_at = EXCLUDED.revoked_at,
      full_record = EXCLUDED.full_record,
      updated_at = NOW()`,
    [...entryToParams(t)],
  );
}

export async function deleteFileTransferRow(idOrShareId: string): Promise<boolean> {
  const pool = getDbPool();
  if (!pool) return false;
  const result = await pool.query(
    `DELETE FROM file_transfers WHERE id = $1 OR share_id = $1`,
    [idOrShareId],
  );
  return (result.rowCount ?? 0) > 0;
}

export interface FileTransferFilterOpts {
  role: string;
  email: string;
  orgId: string | null;
}

/** Returns file transfers visible to the given user — filtered at the DB level to avoid full-table scans. */
export async function selectFileTransferRowsForUser(opts: FileTransferFilterOpts): Promise<SecureFileTransfer[]> {
  const pool = getDbPool();
  if (!pool) return [];
  const { role, email, orgId } = opts;

  if (role === 'admin') {
    const result = await pool.query(
      `SELECT full_record FROM file_transfers ORDER BY created_at DESC, id DESC`,
    );
    return result.rows.map(rowToEntry);
  }

  if (role === 'client') {
    const lowerEmail = email.toLowerCase();
    const result = await pool.query(
      `SELECT full_record FROM file_transfers
       WHERE organization_id = $1 OR LOWER(uploaded_by) = $2
       ORDER BY created_at DESC, id DESC`,
      [orgId || '', lowerEmail],
    );
    return result.rows.map(rowToEntry);
  }

  const lowerEmail = email.toLowerCase();
  const result = await pool.query(
    `SELECT full_record FROM file_transfers
     WHERE LOWER(uploaded_by) = $1
     ORDER BY created_at DESC, id DESC`,
    [lowerEmail],
  );
  return result.rows.map(rowToEntry);
}

/** Diff-based reconcile — upserts all incoming rows and deletes removed ones. Uses jsonb_array_elements for a single DB round trip. */
export async function reconcileFileTransferRows(rows: SecureFileTransfer[]): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  const incomingIds = new Set(rows.map((r) => r.id));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ id: string }>('SELECT id FROM file_transfers');
    const toDelete = existing.rows.map((r) => r.id).filter((id) => !incomingIds.has(id));
    if (toDelete.length) {
      await client.query('DELETE FROM file_transfers WHERE id = ANY($1::text[])', [toDelete]);
    }
    if (rows.length > 0) {
      await client.query(
        `INSERT INTO file_transfers (
          id, share_id, share_url, public_open_url, title, file_name, mime_type, data_url,
          encrypted_payload, encryption_enabled, encryption_algorithm, size_in_bytes, notes,
          folder_id, folder_name, locker_id, locker_name, directory_visibility, directory_category,
          directory_tags, auth_mode, access_password, file_access_password, secure_password,
          parser_password, recipient_email, max_downloads, expires_at, uploaded_by, uploaded_by_user_id,
          organization_id, organization_name, thumbnail_url, open_count, download_count, view_count,
          last_opened_at, last_downloaded_at, access_events, liked_by, likes_count, comments,
          comments_count, featured, featured_plan, featured_at, featured_until, featured_order_id,
          revoked_at, full_record, created_at, updated_at
        )
        SELECT
          (r->>'id')::text,
          (r->>'shareId')::text,
          (r->>'shareUrl')::text,
          (r->>'publicOpenUrl')::text,
          (r->>'title')::text,
          (r->>'fileName')::text,
          (r->>'mimeType')::text,
          (r->>'dataUrl')::text,
          (r->>'encryptedPayload')::text,
          COALESCE((r->>'encryptionEnabled')::boolean, false),
          (r->>'encryptionAlgorithm')::text,
          (r->>'sizeInBytes')::bigint,
          (r->>'notes')::text,
          (r->>'folderId')::text,
          (r->>'folderName')::text,
          (r->>'lockerId')::text,
          (r->>'lockerName')::text,
          (r->>'directoryVisibility')::text,
          (r->>'directoryCategory')::text,
          COALESCE(r->'directoryTags', '[]'::jsonb),
          (r->>'authMode')::text,
          (r->>'accessPassword')::text,
          (r->>'fileAccessPassword')::text,
          (r->>'securePassword')::text,
          (r->>'parserPassword')::text,
          (r->>'recipientEmail')::text,
          (r->>'maxDownloads')::int,
          (r->>'expiresAt')::text,
          (r->>'uploadedBy')::text,
          (r->>'uploadedByUserId')::text,
          (r->>'organizationId')::text,
          (r->>'organizationName')::text,
          (r->>'thumbnailUrl')::text,
          COALESCE((r->>'openCount')::int, 0),
          COALESCE((r->>'downloadCount')::int, 0),
          COALESCE((r->>'viewCount')::int, 0),
          (r->>'lastOpenedAt')::text,
          (r->>'lastDownloadedAt')::text,
          COALESCE(r->'accessEvents', '[]'::jsonb),
          COALESCE(r->'likedBy', '[]'::jsonb),
          COALESCE((r->>'likesCount')::int, 0),
          COALESCE(r->'comments', '[]'::jsonb),
          COALESCE((r->>'commentsCount')::int, 0),
          COALESCE((r->>'featured')::boolean, false),
          (r->>'featuredPlan')::text,
          (r->>'featuredAt')::text,
          (r->>'featuredUntil')::text,
          (r->>'featuredOrderId')::text,
          (r->>'revokedAt')::text,
          r,
          COALESCE((r->>'createdAt')::timestamptz, NOW()),
          COALESCE((r->>'updatedAt')::timestamptz, NOW())
        FROM jsonb_array_elements($1::jsonb) AS r
        ON CONFLICT (id) DO UPDATE SET
          share_id = EXCLUDED.share_id,
          share_url = EXCLUDED.share_url,
          public_open_url = EXCLUDED.public_open_url,
          title = EXCLUDED.title,
          file_name = EXCLUDED.file_name,
          mime_type = EXCLUDED.mime_type,
          data_url = EXCLUDED.data_url,
          encrypted_payload = EXCLUDED.encrypted_payload,
          encryption_enabled = EXCLUDED.encryption_enabled,
          encryption_algorithm = EXCLUDED.encryption_algorithm,
          size_in_bytes = EXCLUDED.size_in_bytes,
          notes = EXCLUDED.notes,
          folder_id = EXCLUDED.folder_id,
          folder_name = EXCLUDED.folder_name,
          locker_id = EXCLUDED.locker_id,
          locker_name = EXCLUDED.locker_name,
          directory_visibility = EXCLUDED.directory_visibility,
          directory_category = EXCLUDED.directory_category,
          directory_tags = EXCLUDED.directory_tags,
          auth_mode = EXCLUDED.auth_mode,
          access_password = EXCLUDED.access_password,
          file_access_password = EXCLUDED.file_access_password,
          secure_password = EXCLUDED.secure_password,
          parser_password = EXCLUDED.parser_password,
          recipient_email = EXCLUDED.recipient_email,
          max_downloads = EXCLUDED.max_downloads,
          expires_at = EXCLUDED.expires_at,
          uploaded_by = EXCLUDED.uploaded_by,
          uploaded_by_user_id = EXCLUDED.uploaded_by_user_id,
          organization_id = EXCLUDED.organization_id,
          organization_name = EXCLUDED.organization_name,
          thumbnail_url = EXCLUDED.thumbnail_url,
          open_count = EXCLUDED.open_count,
          download_count = EXCLUDED.download_count,
          view_count = EXCLUDED.view_count,
          last_opened_at = EXCLUDED.last_opened_at,
          last_downloaded_at = EXCLUDED.last_downloaded_at,
          access_events = EXCLUDED.access_events,
          liked_by = EXCLUDED.liked_by,
          likes_count = EXCLUDED.likes_count,
          comments = EXCLUDED.comments,
          comments_count = EXCLUDED.comments_count,
          featured = EXCLUDED.featured,
          featured_plan = EXCLUDED.featured_plan,
          featured_at = EXCLUDED.featured_at,
          featured_until = EXCLUDED.featured_until,
          featured_order_id = EXCLUDED.featured_order_id,
          revoked_at = EXCLUDED.revoked_at,
          full_record = EXCLUDED.full_record,
          updated_at = NOW()`,
        [JSON.stringify(rows)],
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

/** Targeted patch for folder rename — updates folder_name in DB without rewriting all rows. */
export async function patchFileTransfersByFolderId(folderId: string, patch: { folderName?: string | null; folderId?: string | null }): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [folderId];
  if ('folderName' in patch) {
    params.push(patch.folderName ?? null);
    sets.push(`folder_name = $${params.length}`);
    sets.push(`full_record = full_record || jsonb_build_object('folderName', $${params.length}::text)`);
  }
  if ('folderId' in patch) {
    params.push(patch.folderId ?? null);
    sets.push(`folder_id = $${params.length}`);
    sets.push(`full_record = full_record || jsonb_build_object('folderId', $${params.length}::text)`);
  }
  await pool.query(`UPDATE file_transfers SET ${sets.join(', ')} WHERE folder_id = $1`, params);
}

/** Targeted patch for locker password rotation — updates access_password without rewriting all rows. */
export async function patchFileTransfersByLockerId(lockerId: string, patch: { accessPassword?: string }): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  if (patch.accessPassword !== undefined) {
    await pool.query(
      `UPDATE file_transfers SET access_password = $1, full_record = full_record || jsonb_build_object('accessPassword', $1::text), updated_at = NOW() WHERE locker_id = $2`,
      [patch.accessPassword, lockerId],
    );
  }
}

/** Kept for backward compatibility with the storage-adapter write path. Prefer reconcileFileTransferRows for new code. */
export async function bulkReplaceFileTransferRows(rows: SecureFileTransfer[]): Promise<void> {
  return reconcileFileTransferRows(rows);
}
