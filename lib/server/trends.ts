/**
 * Community Trends — what the market is talking about right now.
 *
 * A trend is a short topic anyone signed in can add. Everyone else pushes it
 * up or down, and the running score is written to a DAILY CLOSE, so the board
 * reads like a market: today's score, today's move, and a line of history.
 *
 * WHY ITS OWN STORE AND NOT `upraised`: upraise is modelled around people, is
 * single-direction (positive only) and keeps no time series. Trends need both
 * directions and a history to draw. Bending the live upraise store — which the
 * People surface depends on — to carry a second, differently-shaped concept
 * would put that feature at risk for no gain.
 *
 * Real data only. A brand-new trend has one history point and a flat line; it
 * is never seeded with invented movement.
 */
import { randomUUID } from 'crypto';
import { readJsonFile, writeJsonFile, trendsPath } from '@/lib/server/storage';

export type TrendVoteDirection = 1 | -1;

/** One day's close — the score as it stood at the end of that day. */
export interface TrendPoint {
  /** YYYY-MM-DD, UTC. */
  date: string;
  score: number;
  up: number;
  down: number;
}

export interface Trend {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  up: number;
  down: number;
  /** Oldest → newest, one entry per day the trend moved. Capped at HISTORY_DAYS. */
  history: TrendPoint[];
  status: 'active' | 'hidden';
}

/** trendId → userId → the direction that user is currently holding. */
type VoteLedger = Record<string, Record<string, TrendVoteDirection>>;

interface TrendsData {
  trends: Trend[];
  votes: VoteLedger;
}

/** What a client is given: the stored trend plus the viewer's own position. */
export interface TrendView extends Omit<Trend, 'status'> {
  score: number;
  /** Score movement since the previous daily close. */
  change: number;
  /** Percentage movement since the previous close; null when there is no prior close. */
  changePercent: number | null;
  /** The viewer's current vote, or 0 when they have not voted. */
  myVote: TrendVoteDirection | 0;
  voterCount: number;
}

const HISTORY_DAYS = 60;
const MAX_TITLE = 80;
const MAX_DESCRIPTION = 240;
const MAX_CATEGORY = 32;
/** Abuse guard: how many trends one account may add in a rolling 24 hours. */
const MAX_TRENDS_PER_USER_PER_DAY = 5;

export const TREND_CATEGORIES = [
  'Technology', 'Careers', 'Business', 'Design', 'Finance',
  'Marketing', 'Education', 'Startups', 'Other',
] as const;

const EMPTY: TrendsData = { trends: [], votes: {} };

async function readData(): Promise<TrendsData> {
  const raw = await readJsonFile<Partial<TrendsData> | null>(trendsPath, null);
  return {
    trends: Array.isArray(raw?.trends) ? (raw!.trends as Trend[]) : [],
    votes: raw?.votes && typeof raw.votes === 'object' ? (raw.votes as VoteLedger) : {},
  };
}

async function writeData(data: TrendsData): Promise<void> {
  await writeJsonFile(trendsPath, data);
}

function utcDay(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
}

/**
 * Records the current totals against today's close, replacing today's point if
 * one already exists. History therefore holds at most one entry per day and
 * always ends at the live score.
 */
function stampClose(trend: Trend, now: Date): void {
  const date = utcDay(now);
  const point: TrendPoint = { date, score: trend.up - trend.down, up: trend.up, down: trend.down };
  const last = trend.history[trend.history.length - 1];
  if (last && last.date === date) trend.history[trend.history.length - 1] = point;
  else trend.history.push(point);
  if (trend.history.length > HISTORY_DAYS) trend.history = trend.history.slice(-HISTORY_DAYS);
}

function toView(trend: Trend, votes: VoteLedger, viewerId: string | null): TrendView {
  const score = trend.up - trend.down;
  /* The previous close is the second-to-last point, because the last one is
     today and already carries the live score. With only one point there is no
     prior close and the move is genuinely unknown — reported as zero, never
     as a made-up percentage. */
  const previous = trend.history.length >= 2 ? trend.history[trend.history.length - 2] : null;
  const change = previous ? score - previous.score : 0;
  const changePercent = previous && previous.score !== 0
    ? Math.round((change / Math.abs(previous.score)) * 100)
    : null;
  const ledger = votes[trend.id] ?? {};

  return {
    id: trend.id,
    slug: trend.slug,
    title: trend.title,
    category: trend.category,
    description: trend.description,
    createdByUserId: trend.createdByUserId,
    createdByName: trend.createdByName,
    createdAt: trend.createdAt,
    up: trend.up,
    down: trend.down,
    history: trend.history,
    score,
    change,
    changePercent,
    myVote: viewerId ? (ledger[viewerId] ?? 0) : 0,
    voterCount: Object.keys(ledger).length,
  };
}

/* ─── reads ──────────────────────────────────────────────────────────────── */

export async function listTrends(viewerId: string | null): Promise<TrendView[]> {
  const data = await readData();
  return data.trends
    .filter((t) => t.status !== 'hidden')
    .map((t) => toView(t, data.votes, viewerId))
    // Highest score first; a tie breaks on today's movement, then on recency.
    .sort((a, b) =>
      b.score - a.score
      || b.change - a.change
      || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function getTrend(idOrSlug: string, viewerId: string | null): Promise<TrendView | null> {
  const data = await readData();
  const trend = data.trends.find((t) => t.id === idOrSlug || t.slug === idOrSlug);
  if (!trend || trend.status === 'hidden') return null;
  return toView(trend, data.votes, viewerId);
}

/* ─── writes ─────────────────────────────────────────────────────────────── */

export type CreateTrendResult =
  | { ok: true; trend: TrendView }
  | { ok: false; error: string; status: number };

export async function createTrend(input: {
  title: string;
  category?: string;
  description?: string;
  userId: string;
  userName: string;
}): Promise<CreateTrendResult> {
  const title = (input.title ?? '').trim().replace(/\s+/g, ' ');
  if (title.length < 3) return { ok: false, error: 'Give the trend a name of at least 3 characters.', status: 400 };
  if (title.length > MAX_TITLE) return { ok: false, error: `Keep the name under ${MAX_TITLE} characters.`, status: 400 };

  const category = (input.category ?? '').trim().slice(0, MAX_CATEGORY) || 'Other';
  const description = (input.description ?? '').trim().slice(0, MAX_DESCRIPTION);
  const slug = slugify(title);
  if (!slug) return { ok: false, error: 'That name cannot be used.', status: 400 };

  const data = await readData();

  if (data.trends.some((t) => t.slug === slug)) {
    return { ok: false, error: 'That trend already exists — vote on it instead.', status: 409 };
  }

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recent = data.trends.filter(
    (t) => t.createdByUserId === input.userId && Date.parse(t.createdAt) > dayAgo,
  ).length;
  if (recent >= MAX_TRENDS_PER_USER_PER_DAY) {
    return { ok: false, error: 'You have added the maximum number of trends for today.', status: 429 };
  }

  const now = new Date();
  const trend: Trend = {
    id: randomUUID(),
    slug,
    title,
    category,
    description,
    createdByUserId: input.userId,
    createdByName: input.userName || 'Someone',
    createdAt: now.toISOString(),
    /* The author's own belief in the trend is its first vote — an explicit
       up, recorded in the ledger like any other, not a free head start. */
    up: 1,
    down: 0,
    history: [],
    status: 'active',
  };
  stampClose(trend, now);

  data.trends.push(trend);
  data.votes[trend.id] = { [input.userId]: 1 };
  await writeData(data);

  return { ok: true, trend: toView(trend, data.votes, input.userId) };
}

export type VoteTrendResult =
  | { ok: true; trend: TrendView }
  | { ok: false; error: string; status: number };

/**
 * Casts, switches or withdraws a vote. Voting the same direction twice
 * withdraws it, so a member holds at most one position per trend and the
 * totals can never be inflated by repeat clicks.
 */
export async function voteTrend(
  trendId: string,
  userId: string,
  direction: TrendVoteDirection,
): Promise<VoteTrendResult> {
  const data = await readData();
  const trend = data.trends.find((t) => t.id === trendId || t.slug === trendId);
  if (!trend || trend.status === 'hidden') return { ok: false, error: 'Trend not found.', status: 404 };

  const ledger = data.votes[trend.id] ?? {};
  const held = ledger[userId] ?? 0;

  // Remove whatever they were holding before applying the new position.
  if (held === 1) trend.up = Math.max(0, trend.up - 1);
  if (held === -1) trend.down = Math.max(0, trend.down - 1);

  if (held === direction) {
    delete ledger[userId];
  } else {
    ledger[userId] = direction;
    if (direction === 1) trend.up += 1;
    else trend.down += 1;
  }

  data.votes[trend.id] = ledger;
  stampClose(trend, new Date());
  await writeData(data);

  return { ok: true, trend: toView(trend, data.votes, userId) };
}

/** Super Admin moderation — hides a trend without destroying its history. */
export async function setTrendStatus(trendId: string, status: Trend['status']): Promise<boolean> {
  const data = await readData();
  const trend = data.trends.find((t) => t.id === trendId);
  if (!trend) return false;
  trend.status = status;
  await writeData(data);
  return true;
}
