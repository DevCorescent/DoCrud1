import crypto from 'crypto';
import { getDbPool, getMongoDb } from '@/lib/server/database';

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

type UCDoc = {
  _id: string;
  balance: number;
  totalEarned: number;
  totalSpent: number;
  streak: { current: number; longest: number; lastPostDate: string | null; streakStartDate: string | null };
  milestones: string[];
  dailyEarnLog: Record<string, string[]>;
  verified: boolean;
};

type TxDoc = {
  _id: string;
  userId: string;
  type: 'earn' | 'spend';
  amount: number;
  reason: string;
  description: string;
  createdAt: string;
};

async function dbGetUserCredits(userId: string): Promise<UserCredits | null> {
  const db = await getMongoDb();
  if (!db) return null;

  const [uc, txDocs] = await Promise.all([
    db.collection<UCDoc>('user_credits').findOne({ _id: userId }),
    db.collection<TxDoc>('credit_transactions')
      .find({ userId }).sort({ createdAt: -1 }).limit(200).toArray(),
  ]);

  if (!uc) return null;
  return {
    balance: uc.balance ?? 0,
    totalEarned: uc.totalEarned ?? 0,
    totalSpent: uc.totalSpent ?? 0,
    streak: uc.streak ?? { current: 0, longest: 0, lastPostDate: null, streakStartDate: null },
    milestones: uc.milestones ?? [],
    dailyEarnLog: uc.dailyEarnLog ?? {},
    verified: uc.verified ?? false,
    transactions: txDocs.map((t) => ({
      id: t._id,
      type: t.type,
      amount: t.amount,
      reason: t.reason,
      description: t.description,
      createdAt: t.createdAt,
    })),
  };
}

async function dbEnsureUser(userId: string): Promise<UserCredits> {
  const db = (await getMongoDb())!;
  await db.collection<UCDoc>('user_credits').updateOne(
    { _id: userId },
    {
      $setOnInsert: {
        _id: userId, balance: 0, totalEarned: 0, totalSpent: 0,
        streak: { current: 0, longest: 0, lastPostDate: null, streakStartDate: null },
        milestones: [], dailyEarnLog: {}, verified: false,
      } as UCDoc,
    },
    { upsert: true },
  );
  return (await dbGetUserCredits(userId)) ?? defaultUserCredits();
}

export async function getUserCredits(userId: string): Promise<UserCredits> {
  if (!getDbPool()) return defaultUserCredits();
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
  if (!getDbPool()) return defaultUserCredits();

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

  const db = (await getMongoDb())!;
  await db.collection<UCDoc>('user_credits').updateOne(
    { _id: userId },
    { $inc: { balance: earnAmount, totalEarned: earnAmount }, $set: { dailyEarnLog: newLog, updatedAt: new Date().toISOString() } as any },
  );
  await db.collection<TxDoc>('credit_transactions').insertOne({
    _id: txId, userId, type: 'earn', amount: earnAmount, reason,
    description: description ?? reason, createdAt: new Date().toISOString(),
  });
  return (await dbGetUserCredits(userId)) ?? defaultUserCredits();
}

export async function spendCredits(userId: string, amount: number, reason: string): Promise<UserCredits> {
  if (!getDbPool()) return defaultUserCredits();

  const user = await getUserCredits(userId);
  if (user.balance < amount) throw new Error(`Insufficient credits. Balance: ${user.balance}, Required: ${amount}`);
  const txId = uuidv4();

  const db = (await getMongoDb())!;
  await db.collection<UCDoc>('user_credits').updateOne(
    { _id: userId },
    { $inc: { balance: -amount, totalSpent: amount }, $set: { updatedAt: new Date().toISOString() } as any },
  );
  await db.collection<TxDoc>('credit_transactions').insertOne({
    _id: txId, userId, type: 'spend', amount, reason, description: reason,
    createdAt: new Date().toISOString(),
  });
  return (await dbGetUserCredits(userId)) ?? defaultUserCredits();
}

export async function recordPost(userId: string): Promise<UserCredits> {
  if (!getDbPool()) return defaultUserCredits();

  const today = getToday();
  await dbEnsureUser(userId);

  const db = (await getMongoDb())!;
  const uc = await db.collection<UCDoc>('user_credits').findOne({ _id: userId });
  if (!uc) return defaultUserCredits();

  const lastPostDate = uc.streak?.lastPostDate ?? null;
  if (lastPostDate === today) return (await dbGetUserCredits(userId)) ?? defaultUserCredits();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const newCurrent = lastPostDate === yesterdayStr ? (uc.streak?.current ?? 0) + 1 : 1;
  const newLongest = Math.max(newCurrent, uc.streak?.longest ?? 0);
  const newStartDate = lastPostDate === yesterdayStr ? undefined : today;

  const streakUpdate: Record<string, unknown> = {
    'streak.current': newCurrent,
    'streak.longest': newLongest,
    'streak.lastPostDate': today,
    updatedAt: new Date().toISOString(),
  };
  if (newStartDate) streakUpdate['streak.streakStartDate'] = newStartDate;

  await db.collection<UCDoc>('user_credits').updateOne({ _id: userId }, { $set: streakUpdate as any });

  await earnCredits(userId, 'daily_post', 5, 'Daily post reward');

  const milestones = uc.milestones ?? [];
  if (newCurrent >= 30 && !milestones.includes('streak_30')) await _grantMilestone(userId, 'streak_30');
  else if (newCurrent >= 10 && !milestones.includes('streak_10')) await _grantMilestone(userId, 'streak_10');
  else if (newCurrent >= 7 && !milestones.includes('streak_7')) await _grantMilestone(userId, 'streak_7');

  return (await dbGetUserCredits(userId)) ?? defaultUserCredits();
}

async function _grantMilestone(userId: string, milestoneId: string): Promise<void> {
  const milestone = MILESTONES.find((m) => m.id === milestoneId);
  if (!milestone) return;
  if (!getDbPool()) return;

  const db = (await getMongoDb())!;
  const uc = await db.collection<UCDoc>('user_credits').findOne({ _id: userId });
  if (!uc) return;
  const milestones = uc.milestones ?? [];
  if (milestones.includes(milestoneId)) return;

  const newMilestones = [...milestones, milestoneId];
  const grantsVerified = 'grantsVerified' in milestone && milestone.grantsVerified;
  const setData: Record<string, unknown> = { milestones: newMilestones, updatedAt: new Date().toISOString() };
  if (grantsVerified) setData.verified = true;

  await db.collection<UCDoc>('user_credits').updateOne({ _id: userId }, { $set: setData as any });
  const txId = uuidv4();
  await db.collection<TxDoc>('credit_transactions').insertOne({
    _id: txId, userId, type: 'earn', amount: milestone.credits,
    reason: milestoneId, description: `Milestone: ${milestone.title}`,
    createdAt: new Date().toISOString(),
  });
  await db.collection<UCDoc>('user_credits').updateOne(
    { _id: userId },
    { $inc: { balance: milestone.credits, totalEarned: milestone.credits } },
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
