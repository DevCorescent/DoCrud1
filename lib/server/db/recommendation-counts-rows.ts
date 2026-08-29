/**
 * Durable per-viewer recommendation counts.
 *
 * These are the two headline numbers on the homepage ("N new matches",
 * "N new people"). Recomputing them means running the full personalised
 * ranking, which is ~47 s on a cold job cache — far too slow to sit in front of
 * a server render. So the last computed value is remembered here, and the
 * homepage renders it immediately while a background refresh corrects it.
 *
 * ONE DOCUMENT PER VIEWER, `_id` = the user id. That matters: a shared
 * document read-modify-written by every request would let concurrent viewers
 * clobber each other's entries. A per-user upsert is atomic and cannot.
 *
 * PRIVACY: a row is only ever read for the session user whose id it is keyed
 * by. It holds two integers and a timestamp — no profile data, nothing about
 * which jobs or people matched.
 *
 * Returns null whenever Mongo is unconfigured or the read fails, so the caller
 * falls back to fetching from the browser exactly as before.
 */
import { getMongoDb } from '@/lib/server/database';

const COL = 'recommendation_counts';

export interface ViewerCountRow {
  jobs: number | null;
  people: number | null;
  /** When each was last computed, so a caller can judge staleness. */
  jobsAt: string | null;
  peopleAt: string | null;
}

export async function readViewerCountRow(userId: string): Promise<ViewerCountRow | null> {
  if (!userId) return null;
  const db = await getMongoDb();
  if (!db) return null;
  try {
    const doc = await db.collection(COL).findOne(
      { _id: userId as never },
      { projection: { _id: 0, jobs: 1, people: 1, jobsAt: 1, peopleAt: 1 } },
    ) as Record<string, unknown> | null;
    if (!doc) return null;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const str = (v: unknown) => (typeof v === 'string' ? v : null);
    return {
      jobs: num(doc.jobs), people: num(doc.people),
      jobsAt: str(doc.jobsAt), peopleAt: str(doc.peopleAt),
    };
  } catch {
    return null;
  }
}

/** Records one freshly computed count. Best effort: never fails the caller. */
export async function writeViewerCountRow(
  userId: string,
  kind: 'jobs' | 'people',
  total: number,
): Promise<void> {
  if (!userId || !Number.isFinite(total)) return;
  const db = await getMongoDb();
  if (!db) return;
  try {
    await db.collection(COL).updateOne(
      { _id: userId as never },
      { $set: { [kind]: Math.max(0, Math.round(total)), [`${kind}At`]: new Date().toISOString() } },
      { upsert: true },
    );
  } catch { /* a count that cannot be remembered is simply recomputed later */ }
}
