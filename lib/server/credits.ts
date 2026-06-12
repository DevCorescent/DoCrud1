import crypto from 'crypto';
import { getDbPool } from '@/lib/server/database';

function uuidv4(): string {
  return crypto.randomUUID();
}

export interface UserCredits {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  streak: {
    current: number;
    longest: number;
    lastPostDate: string | null;
    streakStartDate: string | null;
  };
  milestones: string[];
  verified: boolean;
  transactions: Array<{
    id: string;
    type: 'earn' | 'spend';
    amount: number;
    reason: string;
    description: string;
    createdAt: string;
  }>;
  dailyEarnLog: Record<string, string[]>;
}

export const MILESTONES = [
  { id: 'first_step', title: 'First Step', desc: 'Create your account', icon: '🚀', credits: 5, condition: 'signup' },
  { id: 'profile_complete', title: 'Identity Established', desc: 'Complete your profile to 100%', icon: '✦', credits: 20, condition: 'profile_complete' },
  { id: 'first_publish', title: 'First Publish', desc: 'Publish your first piece of content', icon: '📄', credits: 10, condition: 'first_publish' },
  { id: 'streak_7', title: 'Week Warrior', desc: 'Post 7 days in a row', icon: '🔥', credits: 30, condition: 'streak_7' },
  { id: 'streak_10', title: 'Verified Creator', desc: 'Post 10 days in a row', icon: '✓', credits: 75, condition: 'streak_10', grantsVerified: true },
  { id: 'streak_30', title: 'Legendary', desc: 'Post 30 days in a row', icon: '👑', credits: 200, condition: 'streak_30' },
  { id: 'followers_10', title: 'Rising Star', desc: 'Earn 10 followers', icon: '⭐', credits: 15, condition: 'followers_10' },
  { id: 'followers_100', title: 'Influencer', desc: 'Earn 100 followers', icon: '💫', credits: 50, condition: 'followers_100' },
  { id: 'publish_10', title: 'Content Creator', desc: 'Publish 10 pieces of content', icon: '🎨', credits: 40, condition: 'publish_10' },
] as const;

const CREDIT_RULES: Record<string, { amount: number; dailyMax?: number }> = {
  daily_post: { amount: 5, dailyMax: 1 },
  profile_view: { amount: 0.5, dailyMax: 5 },
  received_follow: { amount: 3 },
  post_comment: { amount: 1, dailyMax: 10 },
  post_like: { amount: 1, dailyMax: 20 },
  profile_complete: { amount: 20 },
  first_gig: { amount: 10 },
  streak_7: { amount: 30 },
  streak_10: { amount: 75 },
  streak_30: { amount: 200 },
};

const ONE_TIME_REASONS = new Set(['profile_complete', 'first_gig', 'streak_7', 'streak_10', 'streak_30']);

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultUserCredits(): UserCredits {
  return {
    balance: 0, totalEarned: 0, totalSpent: 0,
    streak: { current: 0, longest: 0, lastPostDate: null, streakStartDate: null },
    milestones: [], verified: false, transactions: [], dailyEarnLog: {},
  };
}

async function dbGetUserCredits(userId: string): Promise<UserCredits | null> {
  const pool = getDbPool();
  if (!pool) return null;

  const [ucRow, txRows] = await Promise.all([
    pool.query<Record<string, unknown>>(`SELECT * FROM user_credits WHERE user_id = $1`, [userId]),
    pool.query<Record<string, unknown>>(
      `SELECT id, type, amount, reason, description, created_at FROM credit_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [userId]
    ),
  ]);

  if (!ucRow.rows[0]) return null;
  const r = ucRow.rows[0];
  return {
    balance: parseFloat(r.balance as string),
    totalEarned: parseFloat(r.total_earned as string),
    totalSpent: parseFloat(r.total_spent as string),
    streak: {
      current: r.streak_current as number,
      longest: r.streak_longest as number,
      lastPostDate: (r.streak_last_post_date as string | null) ?? null,
      streakStartDate: (r.streak_start_date as string | null) ?? null,
    },
    milestones: (r.milestones as string[]) ?? [],
    dailyEarnLog: (r.daily_earn_log as Record<string, string[]>) ?? {},
    verified: r.verified as boolean,
    transactions: txRows.rows.map((t) => ({
      id: t.id as string,
      type: t.type as 'earn' | 'spend',
      amount: parseFloat(t.amount as string),
      reason: t.reason as string,
      description: t.description as string,
      createdAt: (t.created_at as Date).toISOString(),
    })),
  };
}

async function dbEnsureUser(userId: string): Promise<UserCredits> {
  const pool = getDbPool()!;
  await pool.query(
    `INSERT INTO user_credits (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
  return (await dbGetUserCredits(userId)) ?? defaultUserCredits();
}

export async function getUserCredits(userId: string): Promise<UserCredits> {
  const pool = getDbPool();
  if (!pool) return defaultUserCredits();
  const existing = await dbGetUserCredits(userId);
  if (existing) return existing;
  return dbEnsureUser(userId);
}

export async function earnCredits(
  userId: string,
  reason: string,
  amount?: number,
  description?: string,
): Promise<UserCredits> {
  const pool = getDbPool();
  if (!pool) return defaultUserCredits();

  const rule = CREDIT_RULES[reason];
  const today = getToday();
  const earnAmount = amount ?? rule?.amount ?? 1;
  const user = await getUserCredits(userId);

  if (ONE_TIME_REASONS.has(reason) && user.transactions.some((t) => t.type === 'earn' && t.reason === reason)) {
    return user;
  }
  if (rule?.dailyMax !== undefined) {
    const countToday = (user.dailyEarnLog[today] ?? []).filter((r) => r === reason).length;
    if (countToday >= rule.dailyMax) return user;
  }
  if (reason === 'profile_view') {
    const viewsToday = (user.dailyEarnLog[today] ?? []).filter((r) => r === reason).length;
    if (viewsToday >= 10) return user;
  }

  const txId = uuidv4();
  const newLog = { ...user.dailyEarnLog };
  if (!newLog[today]) newLog[today] = [];
  newLog[today] = [...newLog[today], reason];

  await pool.query(
    `UPDATE user_credits SET balance = balance + $1, total_earned = total_earned + $1, daily_earn_log = $2::jsonb, updated_at = NOW() WHERE user_id = $3`,
    [earnAmount, JSON.stringify(newLog), userId]
  );
  await pool.query(
    `INSERT INTO credit_transactions (id, user_id, type, amount, reason, description) VALUES ($1,$2,'earn',$3,$4,$5)`,
    [txId, userId, earnAmount, reason, description ?? reason]
  );
  return (await dbGetUserCredits(userId)) ?? defaultUserCredits();
}

export async function spendCredits(userId: string, amount: number, reason: string): Promise<UserCredits> {
  const pool = getDbPool();
  if (!pool) return defaultUserCredits();

  const user = await getUserCredits(userId);
  if (user.balance < amount) throw new Error(`Insufficient credits. Balance: ${user.balance}, Required: ${amount}`);
  const txId = uuidv4();
  await pool.query(
    `UPDATE user_credits SET balance = balance - $1, total_spent = total_spent + $1, updated_at = NOW() WHERE user_id = $2`,
    [amount, userId]
  );
  await pool.query(
    `INSERT INTO credit_transactions (id, user_id, type, amount, reason, description) VALUES ($1,$2,'spend',$3,$4,$4)`,
    [txId, userId, amount, reason]
  );
  return (await dbGetUserCredits(userId)) ?? defaultUserCredits();
}

export async function recordPost(userId: string): Promise<UserCredits> {
  const pool = getDbPool();
  if (!pool) return defaultUserCredits();

  const today = getToday();
  await dbEnsureUser(userId);
  const ucRow = await pool.query<Record<string, unknown>>(
    `SELECT streak_current, streak_longest, streak_last_post_date, milestones FROM user_credits WHERE user_id = $1`,
    [userId]
  );
  const r = ucRow.rows[0];
  const lastPostDate = r.streak_last_post_date as string | null;

  if (lastPostDate === today) return (await dbGetUserCredits(userId)) ?? defaultUserCredits();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const newCurrent = lastPostDate === yesterdayStr ? (r.streak_current as number) + 1 : 1;
  const newLongest = Math.max(newCurrent, r.streak_longest as number);
  const newStartDate = lastPostDate === yesterdayStr ? undefined : today;

  await pool.query(
    `UPDATE user_credits SET streak_current=$1, streak_longest=$2, streak_last_post_date=$3${newStartDate ? ', streak_start_date=$5' : ''}, updated_at=NOW() WHERE user_id=$4`,
    newStartDate ? [newCurrent, newLongest, today, userId, newStartDate] : [newCurrent, newLongest, today, userId]
  );

  await earnCredits(userId, 'daily_post', 5, 'Daily post reward');

  const milestones = (r.milestones as string[]) ?? [];
  if (newCurrent >= 30 && !milestones.includes('streak_30')) await _grantMilestone(userId, 'streak_30');
  else if (newCurrent >= 10 && !milestones.includes('streak_10')) await _grantMilestone(userId, 'streak_10');
  else if (newCurrent >= 7 && !milestones.includes('streak_7')) await _grantMilestone(userId, 'streak_7');

  return (await dbGetUserCredits(userId)) ?? defaultUserCredits();
}

async function _grantMilestone(userId: string, milestoneId: string): Promise<void> {
  const milestone = MILESTONES.find((m) => m.id === milestoneId);
  if (!milestone) return;

  const pool = getDbPool();
  if (!pool) return;

  const ucRow = await pool.query<{ milestones: string[]; verified: boolean }>(
    `SELECT milestones, verified FROM user_credits WHERE user_id = $1`, [userId]
  );
  if (!ucRow.rows[0]) return;
  const milestones = ucRow.rows[0].milestones ?? [];
  if (milestones.includes(milestoneId)) return;

  const newMilestones = [...milestones, milestoneId];
  const grantsVerified = 'grantsVerified' in milestone && milestone.grantsVerified;
  await pool.query(
    `UPDATE user_credits SET milestones=$1::jsonb${grantsVerified ? ', verified=TRUE' : ''}, updated_at=NOW() WHERE user_id=$2`,
    [JSON.stringify(newMilestones), userId]
  );
  const txId = uuidv4();
  await pool.query(
    `INSERT INTO credit_transactions (id, user_id, type, amount, reason, description) VALUES ($1,$2,'earn',$3,$4,$5)`,
    [txId, userId, milestone.credits, milestoneId, `Milestone: ${milestone.title}`]
  );
  await pool.query(
    `UPDATE user_credits SET balance = balance + $1, total_earned = total_earned + $1, updated_at = NOW() WHERE user_id = $2`,
    [milestone.credits, userId]
  );
}

export async function checkAndGrantMilestones(
  userId: string,
  context: { followers?: number; publishCount?: number },
): Promise<UserCredits> {
  const user = await getUserCredits(userId);
  const { followers = 0, publishCount = 0 } = context;

  if (followers >= 10 && !user.milestones.includes('followers_10')) await _grantMilestone(userId, 'followers_10');
  if (followers >= 100 && !user.milestones.includes('followers_100')) await _grantMilestone(userId, 'followers_100');
  if (publishCount >= 1 && !user.milestones.includes('first_publish')) await _grantMilestone(userId, 'first_publish');
  if (publishCount >= 10 && !user.milestones.includes('publish_10')) await _grantMilestone(userId, 'publish_10');

  return getUserCredits(userId);
}
