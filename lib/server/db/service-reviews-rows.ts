import type { ServiceReview } from '@/lib/server/services';
import { getDbPool } from '@/lib/server/database';

function rowToReview(row: { full_record: unknown }) {
  return row.full_record as ServiceReview;
}

export async function selectAllServiceReviewRows(): Promise<ServiceReview[]> {
  const pool = getDbPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT full_record FROM service_reviews ORDER BY created_at DESC, id DESC`,
  );
  return result.rows.map(rowToReview);
}

export async function selectServiceReviewsForService(serviceId: string): Promise<ServiceReview[]> {
  const pool = getDbPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT full_record FROM service_reviews WHERE service_id = $1 ORDER BY created_at DESC, id DESC`,
    [serviceId],
  );
  return result.rows.map(rowToReview);
}

export async function existsServiceReviewForBooking(bookingId: string): Promise<boolean> {
  const pool = getDbPool();
  if (!pool) return false;
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM service_reviews WHERE booking_id = $1) AS exists`,
    [bookingId],
  );
  return Boolean(result.rows[0]?.exists);
}

function reviewToParams(r: ServiceReview) {
  return [
    r.id,
    r.serviceId,
    r.serviceUserId,
    r.bookingId,
    r.reviewerId,
    r.reviewerName,
    r.reviewerAvatar || null,
    Number(r.rating || 0),
    r.headline,
    r.body,
    r.testimonial || null,
    JSON.stringify(r),
    r.createdAt || null,
    r.updatedAt || null,
  ] as const;
}

const INSERT_SQL = `INSERT INTO service_reviews (
  id, service_id, service_user_id, booking_id, reviewer_id, reviewer_name, reviewer_avatar,
  rating, headline, body, testimonial, full_record, created_at, updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb,
  COALESCE($13::timestamptz, NOW()), COALESCE($14::timestamptz, NOW())
)`;

export async function upsertServiceReviewRow(r: ServiceReview): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  await pool.query(
    `${INSERT_SQL}
    ON CONFLICT (id) DO UPDATE SET
      service_id = EXCLUDED.service_id,
      service_user_id = EXCLUDED.service_user_id,
      booking_id = EXCLUDED.booking_id,
      reviewer_id = EXCLUDED.reviewer_id,
      reviewer_name = EXCLUDED.reviewer_name,
      reviewer_avatar = EXCLUDED.reviewer_avatar,
      rating = EXCLUDED.rating,
      headline = EXCLUDED.headline,
      body = EXCLUDED.body,
      testimonial = EXCLUDED.testimonial,
      full_record = EXCLUDED.full_record,
      updated_at = NOW()`,
    [...reviewToParams(r)],
  );
}

export async function selectServiceReviewAggregateForService(
  serviceId: string,
): Promise<{ count: number; average: number }> {
  const pool = getDbPool();
  if (!pool) return { count: 0, average: 0 };
  const result = await pool.query<{ count: string; avg_rating: string | null }>(
    `SELECT COUNT(*)::text AS count, AVG(rating)::text AS avg_rating
     FROM service_reviews WHERE service_id = $1`,
    [serviceId],
  );
  const row = result.rows[0];
  const count = row ? Number(row.count) : 0;
  const average = row?.avg_rating ? Number(row.avg_rating) : 0;
  return { count, average: Math.round(average * 10) / 10 };
}

export async function bulkReplaceServiceReviewRows(rows: ServiceReview[]): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  const incomingIds = new Set(rows.map((r) => r.id));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ id: string }>('SELECT id FROM service_reviews');
    const toDelete = existing.rows.map((r) => r.id).filter((id) => !incomingIds.has(id));
    if (toDelete.length) {
      await client.query('DELETE FROM service_reviews WHERE id = ANY($1::text[])', [toDelete]);
    }
    if (rows.length > 0) {
      const ids: string[] = [], svcIds: string[] = [], svcUserIds: string[] = [];
      const bookingIds: string[] = [], reviewerIds: string[] = [], reviewerNames: string[] = [];
      const reviewerAvatars: (string | null)[] = [], ratings: number[] = [];
      const headlines: string[] = [], bodies: string[] = [], testimonials: (string | null)[] = [];
      const fullRecords: string[] = [], createdAts: (string | null)[] = [], updatedAts: (string | null)[] = [];
      for (const r of rows) {
        const p = reviewToParams(r);
        ids.push(p[0]); svcIds.push(p[1]); svcUserIds.push(p[2]); bookingIds.push(p[3]);
        reviewerIds.push(p[4]); reviewerNames.push(p[5]); reviewerAvatars.push(p[6]);
        ratings.push(p[7]); headlines.push(p[8]); bodies.push(p[9]); testimonials.push(p[10]);
        fullRecords.push(p[11]); createdAts.push(p[12]); updatedAts.push(p[13]);
      }
      await client.query(
        `INSERT INTO service_reviews (
          id, service_id, service_user_id, booking_id, reviewer_id, reviewer_name, reviewer_avatar,
          rating, headline, body, testimonial, full_record, created_at, updated_at
        )
        SELECT * FROM UNNEST(
          $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
          $8::int[], $9::text[], $10::text[], $11::text[], $12::jsonb[],
          $13::timestamptz[], $14::timestamptz[]
        )
        ON CONFLICT (id) DO UPDATE SET
          service_id = EXCLUDED.service_id,
          service_user_id = EXCLUDED.service_user_id,
          booking_id = EXCLUDED.booking_id,
          reviewer_id = EXCLUDED.reviewer_id,
          reviewer_name = EXCLUDED.reviewer_name,
          reviewer_avatar = EXCLUDED.reviewer_avatar,
          rating = EXCLUDED.rating,
          headline = EXCLUDED.headline,
          body = EXCLUDED.body,
          testimonial = EXCLUDED.testimonial,
          full_record = EXCLUDED.full_record,
          updated_at = NOW()`,
        [ids, svcIds, svcUserIds, bookingIds, reviewerIds, reviewerNames, reviewerAvatars,
          ratings, headlines, bodies, testimonials, fullRecords, createdAts, updatedAts],
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
