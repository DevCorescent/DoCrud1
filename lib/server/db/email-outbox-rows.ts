import type { OutboundEmailEvent } from '@/lib/server/email-outbox';
import { getDbPool } from '@/lib/server/database';

function rowToEvent(row: { full_record: unknown }) {
  return row.full_record as OutboundEmailEvent;
}

export async function selectEmailOutboxRows(limit = 200): Promise<OutboundEmailEvent[]> {
  const pool = getDbPool();
  if (!pool) return [];
  const safeLimit = Math.max(1, Math.min(500, limit));
  const result = await pool.query(
    `SELECT full_record FROM email_outbox ORDER BY created_at DESC, id DESC LIMIT $1`,
    [safeLimit],
  );
  return result.rows.map(rowToEvent);
}

export async function selectEmailOutboxRowById(id: string): Promise<OutboundEmailEvent | null> {
  const pool = getDbPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT full_record FROM email_outbox WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ? rowToEvent(result.rows[0]) : null;
}

function eventToParams(ev: OutboundEmailEvent) {
  const tracking = ev.tracking || { opens: 0, clicks: 0 };
  return [
    ev.id,
    ev.status || 'queued',
    ev.type || 'system',
    ev.to,
    JSON.stringify(ev.cc || []),
    JSON.stringify(ev.bcc || []),
    ev.subject || '',
    ev.messageId || null,
    ev.sentAt || null,
    ev.sentBy || null,
    ev.error || null,
    Number(tracking.opens || 0),
    Number(tracking.clicks || 0),
    tracking.lastOpenedAt || null,
    tracking.lastClickedAt || null,
    JSON.stringify(ev.metadata || {}),
    JSON.stringify(ev),
    ev.createdAt || null,
  ] as const;
}

const INSERT_SQL = `INSERT INTO email_outbox (
  id, status, type, recipient, cc, bcc, subject, message_id, sent_at, sent_by, error,
  opens, clicks, last_opened_at, last_clicked_at, metadata, full_record, created_at
) VALUES (
  $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15,
  $16::jsonb, $17::jsonb, COALESCE($18::timestamptz, NOW())
)`;

export async function upsertEmailOutboxRow(ev: OutboundEmailEvent): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  await pool.query(
    `${INSERT_SQL}
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      type = EXCLUDED.type,
      recipient = EXCLUDED.recipient,
      cc = EXCLUDED.cc,
      bcc = EXCLUDED.bcc,
      subject = EXCLUDED.subject,
      message_id = EXCLUDED.message_id,
      sent_at = EXCLUDED.sent_at,
      sent_by = EXCLUDED.sent_by,
      error = EXCLUDED.error,
      opens = EXCLUDED.opens,
      clicks = EXCLUDED.clicks,
      last_opened_at = EXCLUDED.last_opened_at,
      last_clicked_at = EXCLUDED.last_clicked_at,
      metadata = EXCLUDED.metadata,
      full_record = EXCLUDED.full_record`,
    [...eventToParams(ev)],
  );
}

export async function trimEmailOutboxRows(maxRows: number): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  await pool.query(
    `DELETE FROM email_outbox
     WHERE id IN (
       SELECT id FROM email_outbox
       ORDER BY created_at DESC, id DESC
       OFFSET $1
     )`,
    [Math.max(1, maxRows)],
  );
}

export async function bulkReplaceEmailOutboxRows(events: OutboundEmailEvent[]): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  const incomingIds = new Set(events.map((e) => e.id));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ id: string }>('SELECT id FROM email_outbox');
    const toDelete = existing.rows.map((r) => r.id).filter((id) => !incomingIds.has(id));
    if (toDelete.length) {
      await client.query('DELETE FROM email_outbox WHERE id = ANY($1::text[])', [toDelete]);
    }
    if (events.length > 0) {
      const ids: string[] = [], statuses: string[] = [], types: string[] = [], recipients: string[] = [];
      const ccs: string[] = [], bccs: string[] = [], subjects: string[] = [];
      const messageIds: (string | null)[] = [], sentAts: (string | null)[] = [], sentBys: (string | null)[] = [];
      const errors: (string | null)[] = [], opens: number[] = [], clicks: number[] = [];
      const lastOpenedAts: (string | null)[] = [], lastClickedAts: (string | null)[] = [];
      const metadatas: string[] = [], fullRecords: string[] = [], createdAts: (string | null)[] = [];
      for (const ev of events) {
        const p = eventToParams(ev);
        ids.push(p[0]); statuses.push(p[1]); types.push(p[2]); recipients.push(p[3]);
        ccs.push(p[4]); bccs.push(p[5]); subjects.push(p[6]); messageIds.push(p[7]);
        sentAts.push(p[8]); sentBys.push(p[9]); errors.push(p[10]);
        opens.push(p[11]); clicks.push(p[12]); lastOpenedAts.push(p[13]); lastClickedAts.push(p[14]);
        metadatas.push(p[15]); fullRecords.push(p[16]); createdAts.push(p[17]);
      }
      await client.query(
        `INSERT INTO email_outbox (
          id, status, type, recipient, cc, bcc, subject, message_id, sent_at, sent_by, error,
          opens, clicks, last_opened_at, last_clicked_at, metadata, full_record, created_at
        )
        SELECT * FROM UNNEST(
          $1::text[], $2::text[], $3::text[], $4::text[], $5::jsonb[], $6::jsonb[], $7::text[],
          $8::text[], $9::timestamptz[], $10::text[], $11::text[], $12::int[], $13::int[],
          $14::timestamptz[], $15::timestamptz[], $16::jsonb[], $17::jsonb[], $18::timestamptz[]
        )
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          type = EXCLUDED.type,
          recipient = EXCLUDED.recipient,
          cc = EXCLUDED.cc,
          bcc = EXCLUDED.bcc,
          subject = EXCLUDED.subject,
          message_id = EXCLUDED.message_id,
          sent_at = EXCLUDED.sent_at,
          sent_by = EXCLUDED.sent_by,
          error = EXCLUDED.error,
          opens = EXCLUDED.opens,
          clicks = EXCLUDED.clicks,
          last_opened_at = EXCLUDED.last_opened_at,
          last_clicked_at = EXCLUDED.last_clicked_at,
          metadata = EXCLUDED.metadata,
          full_record = EXCLUDED.full_record`,
        [ids, statuses, types, recipients, ccs, bccs, subjects, messageIds, sentAts, sentBys, errors,
          opens, clicks, lastOpenedAts, lastClickedAts, metadatas, fullRecords, createdAts],
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
