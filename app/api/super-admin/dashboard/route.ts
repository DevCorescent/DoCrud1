import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getStoredUsers } from '@/lib/server/auth';
import { getHistoryEntries } from '@/lib/server/history';
import { getBillingTransactions } from '@/lib/server/billing';
import { getWebTelemetryEvents } from '@/lib/server/telemetry';
import { getUserActivityEvents } from '@/lib/server/user-intelligence';
import { getAllPublishedItems } from '@/lib/server/feed-moderation';
import { getAllProfiles } from '@/lib/server/user-profiles';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function subDays(d: Date, n: number) { return new Date(d.getTime() - n * 86_400_000); }

// Helper: count active unique user IDs in a time window
function countActiveUnique(
  telRaw: Array<{ userId?: string; createdAt?: string }>,
  actRaw: Array<{ userId: string; createdAt: string }>,
  users: Array<{ id: string; lastLogin?: string }>,
  since: Date
) {
  const set = new Set<string>();
  telRaw.filter((e) => e.userId && e.createdAt && new Date(e.createdAt) >= since).forEach((e) => set.add(e.userId!));
  actRaw.filter((e) => e.userId && e.createdAt && new Date(e.createdAt) >= since).forEach((e) => set.add(e.userId));
  users.filter((u) => u.lastLogin && new Date(u.lastLogin) >= since).forEach((u) => set.add(u.id));
  return set.size;
}

// Helper: paise amount from billing transaction
function txPaise(t: { amountInPaise?: number; amountPaise?: number }) {
  return t.amountInPaise || t.amountPaise || 0;
}

export async function GET(req: NextRequest) {
  const fail = await guard(req);
  if (fail) return fail;

  try {
    const now = new Date();
    const nowMs = now.getTime();

    // Time boundaries
    const d1   = new Date(nowMs - 1  * 86_400_000); // 24h ago
    const d7   = new Date(nowMs - 7  * 86_400_000);
    const d14  = new Date(nowMs - 14 * 86_400_000);
    const d30  = new Date(nowMs - 30 * 86_400_000);
    const d60  = new Date(nowMs - 60 * 86_400_000);

    const [users, historyRaw, billingRaw, telemetryRaw, activityRaw, publishedRaw, allProfiles] = await Promise.all([
      getStoredUsers(),
      getHistoryEntries().catch(() => []),
      getBillingTransactions().catch(() => []),
      getWebTelemetryEvents().catch(() => []),
      getUserActivityEvents().catch(() => []),
      getAllPublishedItems().catch(() => []),
      getAllProfiles().catch(() => ({} as Record<string, unknown>)),
    ]);

    // ── USER METRICS ──────────────────────────────────────────────────

    const totalUsers    = users.length;
    const activeUsers   = users.filter((u) => u.isActive && !((u.safety?.suspendedUntil && new Date(u.safety.suspendedUntil) > now))).length;
    const suspendedUsers= users.filter((u) => u.safety?.suspendedUntil && new Date(u.safety.suspendedUntil) > now).length;
    const disabledUsers = users.filter((u) => !u.isActive).length;
    const businessAccounts = users.filter((u) => u.accountType === 'business').length;
    const individualAccounts = users.filter((u) => u.accountType === 'individual').length;

    const newUsers30d = users.filter((u) => u.createdAt && new Date(u.createdAt) >= d30).length;
    const newUsers7d  = users.filter((u) => u.createdAt && new Date(u.createdAt) >= d7).length;
    const newUsers1d  = users.filter((u) => u.createdAt && new Date(u.createdAt) >= d1).length;
    const newUsers14d = users.filter((u) => u.createdAt && new Date(u.createdAt) >= d14).length;

    // Growth rates
    const newUsersPrev30d = users.filter((u) => u.createdAt && new Date(u.createdAt) >= d60 && new Date(u.createdAt) < d30).length;
    const userGrowthMoM = newUsersPrev30d > 0 ? Math.round(((newUsers30d - newUsersPrev30d) / newUsersPrev30d) * 100) : null;
    const newUsersPrev7d = users.filter((u) => u.createdAt && new Date(u.createdAt) >= d14 && new Date(u.createdAt) < d7).length;
    const userGrowthWoW = newUsersPrev7d > 0 ? Math.round(((newUsers7d - newUsersPrev7d) / newUsersPrev7d) * 100) : null;

    // DAU/WAU/MAU from telemetry unique user IDs (login events used as proxy)
    const tel = telemetryRaw as Array<{ type: string; userId?: string; sessionId?: string; createdAt?: string; ip?: string; path?: string; featureId?: string; userAgent?: string }>;
    const act = activityRaw as Array<{ userId: string; createdAt: string; eventType: string; tabId?: string; featureId?: string }>;

    // DAU / WAU / MAU
    const DAU = countActiveUnique(tel, act, users, d1);
    const WAU = countActiveUnique(tel, act, users, d7);
    const MAU = countActiveUnique(tel, act, users, d30);
    const stickinessRatio = MAU > 0 ? Math.round((DAU / MAU) * 100) : 0; // DAU/MAU %

    // Paying users
    const bill = billingRaw as Array<{ status: string; amountInPaise?: number; amountPaise?: number; createdAt?: string; planId?: string; planName?: string; id?: string; userEmail?: string; userId?: string; paidAt?: string; updatedAt?: string }>;
    const paid = bill.filter((t) => t.status === 'paid');
    const payingUserIds = new Set(paid.map((t) => t.userId).filter(Boolean) as string[]);
    const payingUsers = payingUserIds.size;

    // Subscription breakdown from users
    const subPlanDist: Record<string, number> = {};
    const subStatusDist: Record<string, number> = {};
    const roleDist: Record<string, number> = {};
    users.forEach((u) => {
      const planId = u.subscription?.planId || 'none';
      subPlanDist[planId] = (subPlanDist[planId] || 0) + 1;
      const st = u.subscription?.status || 'none';
      subStatusDist[st] = (subStatusDist[st] || 0) + 1;
      roleDist[u.role] = (roleDist[u.role] || 0) + 1;
    });

    // Conversion rate (free → paid users ÷ total users)
    const paidSubscribers = users.filter((u) => u.subscription?.status === 'active' || u.subscription?.status === 'trial').length;
    const conversionRate = totalUsers > 0 ? ((paidSubscribers / totalUsers) * 100).toFixed(1) : '0.0';

    // Churn: users with no activity in last 30d but had activity in 31-60d window
    const active30dSet = new Set<string>();
    tel.filter((e) => e.userId && e.createdAt && new Date(e.createdAt) >= d30).forEach((e) => active30dSet.add(e.userId!));
    users.filter((u) => u.lastLogin && new Date(u.lastLogin) >= d30).forEach((u) => active30dSet.add(u.id));
    const activePrev30d = new Set<string>();
    tel.filter((e) => e.userId && e.createdAt && new Date(e.createdAt) >= d60 && new Date(e.createdAt) < d30).forEach((e) => activePrev30d.add(e.userId!));
    users.filter((u) => u.lastLogin && new Date(u.lastLogin) >= d60 && new Date(u.lastLogin) < d30).forEach((u) => activePrev30d.add(u.id));
    let churned = 0;
    activePrev30d.forEach((id) => { if (!active30dSet.has(id)) churned++; });
    const churnRate = activePrev30d.size > 0 ? ((churned / activePrev30d.size) * 100).toFixed(1) : '0.0';
    const retentionRate = (100 - parseFloat(churnRate)).toFixed(1);

    // Day-1 retention: new users from 2 days ago who were active yesterday
    const newUsersD2 = users.filter((u) => u.createdAt && isoDate(new Date(u.createdAt)) === isoDate(subDays(now, 2)));
    const newUsersDayOneRetained = newUsersD2.filter((u) => {
      const uidSet = new Set<string>();
      tel.filter((e) => e.userId && e.createdAt && isoDate(new Date(e.createdAt)) === isoDate(subDays(now, 1))).forEach((e) => uidSet.add(e.userId!));
      return uidSet.has(u.id);
    }).length;
    const day1Retention = newUsersD2.length > 0 ? Math.round((newUsersDayOneRetained / newUsersD2.length) * 100) : null;

    // Daily signups last 30 days
    const dailySignups: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = subDays(now, i);
      const dateStr = isoDate(d);
      dailySignups.push({ date: dateStr, count: users.filter((u) => u.createdAt && u.createdAt.slice(0, 10) === dateStr).length });
    }

    // Daily active users last 30 days
    const dailyActiveUsers: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = subDays(now, i);
      const dateStr = isoDate(d);
      const activeSet = new Set<string>();
      tel.filter((e) => e.userId && e.createdAt && e.createdAt.slice(0, 10) === dateStr).forEach((e) => activeSet.add(e.userId!));
      users.filter((u) => u.lastLogin && u.lastLogin.slice(0, 10) === dateStr).forEach((u) => activeSet.add(u.id));
      dailyActiveUsers.push({ date: dateStr, count: activeSet.size });
    }

    // Recent signups
    const recentSignups = [...users]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 10)
      .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, accountType: u.accountType, organizationName: u.organizationName, planId: u.subscription?.planId, planStatus: u.subscription?.status, createdAt: u.createdAt }));

    // ── DOCUMENT METRICS ─────────────────────────────────────────────

    const history = historyRaw as Array<{ createdAt?: string; generatedAt?: string; templateId?: string; templateName?: string; generatedBy?: string; category?: string; emailSent?: boolean; signatureId?: string }>;
    const totalDocs = history.length;
    const docs30d = history.filter((h) => { const d = h.createdAt || h.generatedAt || ''; return d && new Date(d) >= d30; }).length;
    const docs7d  = history.filter((h) => { const d = h.createdAt || h.generatedAt || ''; return d && new Date(d) >= d7; }).length;
    const docs1d  = history.filter((h) => { const d = h.createdAt || h.generatedAt || ''; return d && new Date(d) >= d1; }).length;
    const signedDocs = history.filter((h) => Boolean(h.signatureId)).length;
    const emailedDocs= history.filter((h) => Boolean(h.emailSent)).length;
    const docsByCategory: Record<string, number> = {};
    history.forEach((h) => {
      const cat = h.category || h.templateName?.split(' ')[0] || 'Other';
      docsByCategory[cat] = (docsByCategory[cat] || 0) + 1;
    });

    // Top 5 templates
    const tplMap: Record<string, number> = {};
    history.forEach((h) => { if (h.templateName) tplMap[h.templateName] = (tplMap[h.templateName] || 0) + 1; });
    const topTemplates = Object.entries(tplMap).sort(([, a], [, b]) => b - a).slice(0, 8).map(([name, count]) => ({ name, count }));

    // Daily docs last 30 days
    const dailyDocs: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = subDays(now, i);
      const dateStr = isoDate(d);
      dailyDocs.push({ date: dateStr, count: history.filter((h) => { const s = h.createdAt || h.generatedAt || ''; return s && s.slice(0, 10) === dateStr; }).length });
    }

    // ── REVENUE / FINANCIAL METRICS ─────────────────────────────────

    const totalRevenue = paid.reduce((s, t) => s + txPaise(t), 0);
    const rev30d = paid.filter((t) => { const d = t.paidAt || t.updatedAt || t.createdAt || ''; return d && new Date(d) >= d30; }).reduce((s, t) => s + txPaise(t), 0);
    const rev7d  = paid.filter((t) => { const d = t.paidAt || t.updatedAt || t.createdAt || ''; return d && new Date(d) >= d7; }).reduce((s, t) => s + txPaise(t), 0);
    const revPrev30d = paid.filter((t) => { const d = t.paidAt || t.updatedAt || t.createdAt || ''; return d && new Date(d) >= d60 && new Date(d) < d30; }).reduce((s, t) => s + txPaise(t), 0);
    const revGrowthMoM = revPrev30d > 0 ? Math.round(((rev30d - revPrev30d) / revPrev30d) * 100) : null;

    // MRR = last 30d revenue (proxy — not true subscription MRR without billing model data)
    const MRR = rev30d;
    const ARR = MRR * 12;
    const ARPU = totalUsers > 0 ? Math.round(totalRevenue / totalUsers) : 0;                 // paise
    const ARPPU = payingUsers > 0 ? Math.round(totalRevenue / payingUsers) : 0;              // paise
    // Simple LTV estimate: ARPPU × (1 / churn_rate) — capped at 24 months
    const churnRateNum = parseFloat(churnRate) / 100;
    const LTV = churnRateNum > 0 && ARPPU > 0 ? Math.min(Math.round(ARPPU / churnRateNum), ARPPU * 2400) : 0;
    const paybackPeriod = ARPU > 0 && MRR > 0 ? null : null; // placeholder — needs CAC data

    // Revenue by plan
    const revByPlan: Record<string, number> = {};
    paid.forEach((t) => {
      const plan = t.planId || t.planName || 'unknown';
      revByPlan[plan] = (revByPlan[plan] || 0) + txPaise(t);
    });

    // Failed payment count
    const failedTx = bill.filter((t) => t.status === 'failed').length;
    const totalAttempted = bill.length;
    const paymentSuccessRate = totalAttempted > 0 ? Math.round((paid.length / totalAttempted) * 100) : 100;

    // Daily revenue last 30 days
    const dailyRevenue: { date: string; paise: number; transactions: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = subDays(now, i);
      const dateStr = isoDate(d);
      const dayTx = paid.filter((t) => { const s = t.paidAt || t.updatedAt || t.createdAt || ''; return s && s.slice(0, 10) === dateStr; });
      dailyRevenue.push({ date: dateStr, paise: dayTx.reduce((s, t) => s + txPaise(t), 0), transactions: dayTx.length });
    }

    // Monthly revenue last 12 months
    const monthlyRevenue: { month: string; paise: number; transactions: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthTx = paid.filter((t) => { const s = t.paidAt || t.updatedAt || t.createdAt || ''; return s && s.slice(0, 7) === monthStr; });
      monthlyRevenue.push({ month: monthStr, paise: monthTx.reduce((s, t) => s + txPaise(t), 0), transactions: monthTx.length });
    }

    // Recent billing
    const recentBilling = [...paid]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 10)
      .map((t) => ({ id: t.id, userEmail: t.userEmail, planId: t.planId, planName: t.planName, amountPaise: txPaise(t), status: t.status, createdAt: t.createdAt }));

    // ── DOCRUD INFINITY METRICS ──────────────────────────────────────────
    type ProfileEntry = { docrudInfinity?: boolean; docrudInfinityGrantedFree?: boolean; docrudInfinityPurchasedAt?: string };
    const profileList = Object.values(allProfiles) as ProfileEntry[];
    const infinityUsers    = profileList.filter((p) => p?.docrudInfinity === true);
    const infinityTotal    = infinityUsers.length;
    const infinityFree     = infinityUsers.filter((p) => p?.docrudInfinityGrantedFree === true).length;
    const infinityPaid     = infinityTotal - infinityFree;
    const infinityNew7d    = infinityUsers.filter((p) => p?.docrudInfinityPurchasedAt && new Date(p.docrudInfinityPurchasedAt as string) >= d7).length;
    const infinityNew30d   = infinityUsers.filter((p) => p?.docrudInfinityPurchasedAt && new Date(p.docrudInfinityPurchasedAt as string) >= d30).length;
    const infinityRevenue  = paid.filter((t) => (t as { productType?: string }).productType === 'docrud_infinity').reduce((s, t) => s + txPaise(t), 0);
    const infinityRev30d   = paid.filter((t) => {
      const isInfinity = (t as { productType?: string }).productType === 'docrud_infinity';
      const d = t.paidAt || t.updatedAt || t.createdAt || '';
      return isInfinity && d && new Date(d) >= d30;
    }).reduce((s, t) => s + txPaise(t), 0);
    const infinityConvRate = users.length > 0 ? ((infinityTotal / users.length) * 100).toFixed(1) : '0.0';

    // ── TELEMETRY / ENGAGEMENT ────────────────────────────────────────────────

    const pageViews7d  = tel.filter((e) => e.type === 'page_view' && e.createdAt && new Date(e.createdAt) >= d7).length;
    const pageViews30d = tel.filter((e) => e.type === 'page_view' && e.createdAt && new Date(e.createdAt) >= d30).length;
    const signups7d    = tel.filter((e) => e.type === 'signup'    && e.createdAt && new Date(e.createdAt) >= d7).length;
    const logins7d     = tel.filter((e) => e.type === 'login'     && e.createdAt && new Date(e.createdAt) >= d7).length;
    const logins30d    = tel.filter((e) => e.type === 'login'     && e.createdAt && new Date(e.createdAt) >= d30).length;
    const featureOpens7d = tel.filter((e) => e.type === 'feature_open' && e.createdAt && new Date(e.createdAt) >= d7).length;

    // Sessions: unique sessionIds in 7d/30d
    const sessions7d  = new Set(tel.filter((e) => e.sessionId && e.createdAt && new Date(e.createdAt) >= d7).map((e) => e.sessionId)).size;
    const sessions30d = new Set(tel.filter((e) => e.sessionId && e.createdAt && new Date(e.createdAt) >= d30).map((e) => e.sessionId)).size;

    // Sessions per user
    const sessionsPerUser7d = WAU > 0 ? (sessions7d / WAU).toFixed(1) : '0.0';

    // Top features (7d)
    const featMap: Record<string, number> = {};
    tel.filter((e) => e.type === 'feature_open' && e.createdAt && new Date(e.createdAt) >= d7).forEach((e) => {
      if (e.featureId) featMap[e.featureId] = (featMap[e.featureId] || 0) + 1;
    });
    // also from activity events
    act.filter((e) => e.featureId && e.createdAt && new Date(e.createdAt) >= d7).forEach((e) => {
      if (e.featureId) featMap[e.featureId] = (featMap[e.featureId] || 0) + 1;
    });
    const topFeatures = Object.entries(featMap).sort(([, a], [, b]) => b - a).slice(0, 8).map(([feature, count]) => ({ feature, count }));

    // Device breakdown from UA
    const deviceMap: Record<string, number> = {};
    tel.filter((e) => e.createdAt && new Date(e.createdAt) >= d30).forEach((e) => {
      const ua = (e as any).userAgent || '';
      const d = /mobile|android|iphone/i.test(ua) ? 'mobile' : /tablet|ipad/i.test(ua) ? 'tablet' : 'desktop';
      deviceMap[d] = (deviceMap[d] || 0) + 1;
    });

    // Daily page views + sessions last 30 days
    const dailyEngagement: { date: string; pageViews: number; sessions: number; logins: number; signups: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = subDays(now, i);
      const dateStr = isoDate(d);
      const dayTel = tel.filter((e) => e.createdAt && e.createdAt.slice(0, 10) === dateStr);
      dailyEngagement.push({
        date: dateStr,
        pageViews: dayTel.filter((e) => e.type === 'page_view').length,
        sessions: new Set(dayTel.filter((e) => e.sessionId).map((e) => e.sessionId)).size,
        logins: dayTel.filter((e) => e.type === 'login').length,
        signups: dayTel.filter((e) => e.type === 'signup').length,
      });
    }

    // ── PUBLISHED FEED METRICS ────────────────────────────────────────

    const published = publishedRaw;
    const totalPublished = published.length;
    const publishedActive   = published.filter((p) => !p.moderationStatus || p.moderationStatus === 'active').length;
    const publishedSuspended= published.filter((p) => p.moderationStatus === 'suspended').length;
    const publishedRemoved  = published.filter((p) => p.moderationStatus === 'removed').length;
    const publishedReview   = published.filter((p) => p.moderationStatus === 'under_review').length;
    const publishedWithReports = published.filter((p) => (p.reports?.length ?? 0) > 0).length;
    const published7d = published.filter((p) => new Date(p.createdAt) >= d7).length;
    const published30d= published.filter((p) => new Date(p.createdAt) >= d30).length;

    // By category
    const pubCatMap: Record<string, number> = {};
    published.forEach((p) => {
      const cat = p.directoryCategory?.toLowerCase() || 'other';
      pubCatMap[cat] = (pubCatMap[cat] || 0) + 1;
    });

    // Total engagement across all published items
    const totalPubLikes    = published.reduce((s, p) => s + (p.likesCount ?? 0), 0);
    const totalPubComments = published.reduce((s, p) => s + (p.commentsCount ?? 0), 0);
    const totalPubViews    = published.reduce((s, p) => s + (p.viewCount ?? p.openCount ?? 0), 0);
    const avgEngagementPerPost = totalPublished > 0 ? Math.round((totalPubLikes + totalPubComments) / totalPublished) : 0;

    // Publishing velocity (daily) last 30 days
    const dailyPublished: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = subDays(now, i);
      const dateStr = isoDate(d);
      dailyPublished.push({ date: dateStr, count: published.filter((p) => p.createdAt && p.createdAt.slice(0, 10) === dateStr).length });
    }

    // Top publishers
    const pubMap: Record<string, { name: string; count: number; likes: number }> = {};
    published.forEach((p) => {
      const key = p.uploadedBy || 'unknown';
      if (!pubMap[key]) pubMap[key] = { name: p.uploadedByName || key.split('@')[0], count: 0, likes: 0 };
      pubMap[key].count++;
      pubMap[key].likes += p.likesCount ?? 0;
    });
    const topPublishers = Object.entries(pubMap).sort(([, a], [, b]) => b.count - a.count).slice(0, 8).map(([email, v]) => ({ email, name: v.name, count: v.count, likes: v.likes }));

    return NextResponse.json({
      generatedAt: now.toISOString(),

      // User metrics
      users: {
        total: totalUsers, active: activeUsers, suspended: suspendedUsers, disabled: disabledUsers,
        business: businessAccounts, individual: individualAccounts,
        newLast1Day: newUsers1d, newLast7Days: newUsers7d, newLast14Days: newUsers14d, newLast30Days: newUsers30d,
        growthMoM: userGrowthMoM, growthWoW: userGrowthWoW,
        paidSubscribers, payingUsers, conversionRate,
        DAU, WAU, MAU, stickinessRatio,
        churnRate, retentionRate, day1Retention,
        planDistribution: subPlanDist, subscriptionStatusDistribution: subStatusDist, roleDistribution: roleDist,
        recentSignups, dailySignups, dailyActiveUsers,
      },

      // Document metrics
      documents: {
        total: totalDocs, last30Days: docs30d, last7Days: docs7d, last1Day: docs1d,
        signed: signedDocs, emailed: emailedDocs,
        emailDeliveryRate: totalDocs > 0 ? Math.round((emailedDocs / totalDocs) * 100) : 0,
        topTemplates, byCategory: docsByCategory, daily: dailyDocs,
      },

      // Revenue metrics
      revenue: {
        totalPaise: totalRevenue,
        last30DaysPaise: rev30d, last7DaysPaise: rev7d,
        growthMoM: revGrowthMoM,
        MRR, ARR, ARPU, ARPPU, LTV,
        totalTransactions: paid.length, failedTransactions: failedTx,
        paymentSuccessRate, byPlan: revByPlan,
        daily: dailyRevenue, monthly: monthlyRevenue, recent: recentBilling,
      },

      // Engagement / telemetry
      engagement: {
        pageViews7d, pageViews30d, signups7d, logins7d, logins30d,
        sessions7d, sessions30d, featureOpens7d, sessionsPerUser7d,
        topFeatures, deviceBreakdown: deviceMap, daily: dailyEngagement,
      },

      // Published feed
      published: {
        total: totalPublished, active: publishedActive, suspended: publishedSuspended,
        removed: publishedRemoved, underReview: publishedReview,
        withReports: publishedWithReports,
        last7Days: published7d, last30Days: published30d,
        totalLikes: totalPubLikes, totalComments: totalPubComments,
        totalViews: totalPubViews, avgEngagementPerPost,
        byCategory: pubCatMap, dailyVelocity: dailyPublished, topPublishers,
      },

      // Docrud Infinity metrics
      infinity: {
        total: infinityTotal, paid: infinityPaid, free: infinityFree,
        newLast7Days: infinityNew7d, newLast30Days: infinityNew30d,
        conversionRate: infinityConvRate,
        revenueTotalPaise: infinityRevenue, revenueLast30DaysPaise: infinityRev30d,
      },

      // Legacy shape (backwards-compat for any other consumer)
      telemetry: { pageViewsLast7Days: pageViews7d, signupsLast7Days: signups7d, loginsLast7Days: logins7d },
    });

  } catch (err) {
    console.error('[super-admin/dashboard]', err);
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
