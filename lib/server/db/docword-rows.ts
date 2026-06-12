import type { DocWordDocument } from '@/types/document';
import { getDbPool } from '@/lib/server/database';

function rowToDocument(row: { full_record: unknown }) {
  return row.full_record as DocWordDocument;
}

export async function selectAllDocWordRows(): Promise<DocWordDocument[]> {
  const pool = getDbPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT full_record FROM docword_documents ORDER BY updated_at DESC, id DESC`,
  );
  return result.rows.map(rowToDocument);
}

export async function selectDocWordRowById(id: string): Promise<DocWordDocument | null> {
  const pool = getDbPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT full_record FROM docword_documents WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ? rowToDocument(result.rows[0]) : null;
}

export async function selectDocWordRowByShareToken(token: string): Promise<DocWordDocument | null> {
  const pool = getDbPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT full_record FROM docword_documents WHERE share_token = $1 LIMIT 1`,
    [token],
  );
  return result.rows[0] ? rowToDocument(result.rows[0]) : null;
}

function docToParams(d: DocWordDocument) {
  return [
    d.id,
    d.ownerUserId || null,
    d.ownerEmail || null,
    d.guestId || null,
    d.title || 'Untitled document',
    d.emoji || null,
    d.folderName || null,
    d.templateId || null,
    d.documentTheme || null,
    d.shareToken || null,
    d.shareMode || 'private',
    Number(d.wordCount ?? 0),
    Number(d.readTimeMinutes ?? 0),
    Boolean(d.isFavorite),
    Boolean(d.requireSignature),
    Boolean(d.trackChangesEnabled),
    d.html || '',
    d.plainText || '',
    JSON.stringify(d),
    d.createdAt || null,
    d.updatedAt || null,
  ] as const;
}

const INSERT_SQL = `INSERT INTO docword_documents (
  id, owner_user_id, owner_email, guest_id, title, emoji, folder_name, template_id,
  document_theme, share_token, share_mode, word_count, read_time_minutes, is_favorite,
  require_signature, track_changes_enabled, html, plain_text, full_record,
  created_at, updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
  $19::jsonb, COALESCE($20::timestamptz, NOW()), COALESCE($21::timestamptz, NOW())
)`;

export async function upsertDocWordRow(d: DocWordDocument): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  await pool.query(
    `${INSERT_SQL}
    ON CONFLICT (id) DO UPDATE SET
      owner_user_id = EXCLUDED.owner_user_id,
      owner_email = EXCLUDED.owner_email,
      guest_id = EXCLUDED.guest_id,
      title = EXCLUDED.title,
      emoji = EXCLUDED.emoji,
      folder_name = EXCLUDED.folder_name,
      template_id = EXCLUDED.template_id,
      document_theme = EXCLUDED.document_theme,
      share_token = EXCLUDED.share_token,
      share_mode = EXCLUDED.share_mode,
      word_count = EXCLUDED.word_count,
      read_time_minutes = EXCLUDED.read_time_minutes,
      is_favorite = EXCLUDED.is_favorite,
      require_signature = EXCLUDED.require_signature,
      track_changes_enabled = EXCLUDED.track_changes_enabled,
      html = EXCLUDED.html,
      plain_text = EXCLUDED.plain_text,
      full_record = EXCLUDED.full_record,
      updated_at = COALESCE(EXCLUDED.updated_at, NOW())`,
    [...docToParams(d)],
  );
}

export async function deleteDocWordRow(id: string): Promise<boolean> {
  const pool = getDbPool();
  if (!pool) return false;
  const result = await pool.query(`DELETE FROM docword_documents WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function bulkReplaceDocWordRows(rows: DocWordDocument[]): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  const incomingIds = new Set(rows.map((r) => r.id));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ id: string }>('SELECT id FROM docword_documents');
    const toDelete = existing.rows.map((r) => r.id).filter((id) => !incomingIds.has(id));
    if (toDelete.length) {
      await client.query('DELETE FROM docword_documents WHERE id = ANY($1::text[])', [toDelete]);
    }
    if (rows.length > 0) {
      const ids: string[] = [], ownerUserIds: (string | null)[] = [], ownerEmails: (string | null)[] = [];
      const guestIds: (string | null)[] = [], titles: string[] = [], emojis: (string | null)[] = [];
      const folderNames: (string | null)[] = [], templateIds: (string | null)[] = [], docThemes: (string | null)[] = [];
      const shareTokens: (string | null)[] = [], shareModes: string[] = [];
      const wordCounts: number[] = [], readTimes: number[] = [];
      const isFavorites: boolean[] = [], requireSigs: boolean[] = [], trackChanges: boolean[] = [];
      const htmls: string[] = [], plainTexts: string[] = [], fullRecords: string[] = [];
      const createdAts: (string | null)[] = [], updatedAts: (string | null)[] = [];
      for (const d of rows) {
        const p = docToParams(d);
        ids.push(p[0]); ownerUserIds.push(p[1]); ownerEmails.push(p[2]); guestIds.push(p[3]);
        titles.push(p[4]); emojis.push(p[5]); folderNames.push(p[6]); templateIds.push(p[7]);
        docThemes.push(p[8]); shareTokens.push(p[9]); shareModes.push(p[10]);
        wordCounts.push(p[11]); readTimes.push(p[12]);
        isFavorites.push(p[13]); requireSigs.push(p[14]); trackChanges.push(p[15]);
        htmls.push(p[16]); plainTexts.push(p[17]); fullRecords.push(p[18]);
        createdAts.push(p[19]); updatedAts.push(p[20]);
      }
      await client.query(
        `INSERT INTO docword_documents (
          id, owner_user_id, owner_email, guest_id, title, emoji, folder_name, template_id,
          document_theme, share_token, share_mode, word_count, read_time_minutes, is_favorite,
          require_signature, track_changes_enabled, html, plain_text, full_record,
          created_at, updated_at
        )
        SELECT * FROM UNNEST(
          $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
          $8::text[], $9::text[], $10::text[], $11::text[], $12::int[], $13::int[],
          $14::bool[], $15::bool[], $16::bool[], $17::text[], $18::text[], $19::jsonb[],
          $20::timestamptz[], $21::timestamptz[]
        )
        ON CONFLICT (id) DO UPDATE SET
          owner_user_id = EXCLUDED.owner_user_id,
          owner_email = EXCLUDED.owner_email,
          guest_id = EXCLUDED.guest_id,
          title = EXCLUDED.title,
          emoji = EXCLUDED.emoji,
          folder_name = EXCLUDED.folder_name,
          template_id = EXCLUDED.template_id,
          document_theme = EXCLUDED.document_theme,
          share_token = EXCLUDED.share_token,
          share_mode = EXCLUDED.share_mode,
          word_count = EXCLUDED.word_count,
          read_time_minutes = EXCLUDED.read_time_minutes,
          is_favorite = EXCLUDED.is_favorite,
          require_signature = EXCLUDED.require_signature,
          track_changes_enabled = EXCLUDED.track_changes_enabled,
          html = EXCLUDED.html,
          plain_text = EXCLUDED.plain_text,
          full_record = EXCLUDED.full_record,
          updated_at = COALESCE(EXCLUDED.updated_at, NOW())`,
        [ids, ownerUserIds, ownerEmails, guestIds, titles, emojis, folderNames, templateIds,
          docThemes, shareTokens, shareModes, wordCounts, readTimes,
          isFavorites, requireSigs, trackChanges, htmls, plainTexts, fullRecords,
          createdAts, updatedAts],
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
