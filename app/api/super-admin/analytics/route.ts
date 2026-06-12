import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getWebTelemetryEvents } from '@/lib/server/telemetry';
import { getStoredUsers } from '@/lib/server/auth';
import { getHistoryEntries } from '@/lib/server/history';
import { getBillingTransactions } from '@/lib/server/billing';
import { getUserActivityEvents } from '@/lib/server/user-intelligence';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const days = Math.max(1, Math.min(90, parseInt(searchParams.get('days') || '30')));

  try {
    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const [telRaw, users, histRaw, billRaw, actRaw] = await Promise.all([
      getWebTelemetryEvents().catch(() => []),
      getStoredUsers(),
      getHistoryEntries().catch(() => []),
      getBillingTransactions().catch(() => []),
      getUserActivityEvents().catch(() => []),
    ]);
    type TelEntry = { type: string; createdAt?: string; path?: string; featureId?: string };
    type HistEntry = { createdAt?: string; templateName?: string; category?: string; templateId?: string };
    type BillEntry = { status: string; createdAt?: string; amountPaise?: number; planId?: string };
    type ActEntry = { createdAt?: string; eventType?: string };
    const telemetry = telRaw as TelEntry[];
    const history = histRaw as HistEntry[];
    const billing = billRaw as BillEntry[];
    const activity = actRaw as ActEntry[];

    const telInWindow = telemetry.filter((e) => e.createdAt && new Date(e.createdAt) >= since);
    const histInWindow = history.filter((h) => h.createdAt && new Date(h.createdAt) >= since);
    const billingInWindow = billing.filter((t) => t.createdAt && new Date(t.createdAt) >= since);
    const actInWindow = activity.filter((a) => a.createdAt && new Date(a.createdAt) >= since);

    // Page views by path
    const pathViews: Record<string, number> = {};
    telInWindow
      .filter((e: { type: string }) => e.type === 'page_view')
      .forEach((e: { path?: string }) => {
        const p = e.path || '/';
        pathViews[p] = (pathViews[p] || 0) + 1;
      });
    const topPages = Object.entries(pathViews)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([path, views]) => ({ path, views }));

    // Feature opens
    const featureOpens: Record<string, number> = {};
    telInWindow
      .filter((e) => e.type === 'feature_open')
      .forEach((e) => {
        const f = e.featureId || 'unknown';
        featureOpens[f] = (featureOpens[f] || 0) + 1;
      });
    const topFeatures = Object.entries(featureOpens)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([feature, count]) => ({ feature, count }));

    // Daily activity
    const dailyActivity: { date: string; pageViews: number; signups: number; logins: number; docs: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayTel = telInWindow.filter((e) => e.createdAt?.slice(0, 10) === dateStr);
      dailyActivity.push({
        date: dateStr,
        pageViews: dayTel.filter((e) => e.type === 'page_view').length,
        signups: dayTel.filter((e) => e.type === 'signup').length,
        logins: dayTel.filter((e) => e.type === 'login').length,
        docs: histInWindow.filter((h) => h.createdAt?.slice(0, 10) === dateStr).length,
      });
    }

    // Revenue by day
    const dailyRevenue: { date: string; amountPaise: number; transactions: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayBilling = billingInWindow.filter((t) => t.createdAt?.slice(0, 10) === dateStr && (t.status === 'paid' || t.status === 'success'));
      dailyRevenue.push({
        date: dateStr,
        amountPaise: dayBilling.reduce((s, t) => s + (t.amountPaise || 0), 0),
        transactions: dayBilling.length,
      });
    }

    // User activity events
    const activityTypes: Record<string, number> = {};
    actInWindow.forEach((a) => {
      const t = a.eventType || 'unknown';
      activityTypes[t] = (activityTypes[t] || 0) + 1;
    });

    // Signup cohort by role
    const newUsersInWindow = users.filter((u) => u.createdAt && new Date(u.createdAt) >= since);
    const signupsByRole: Record<string, number> = {};
    newUsersInWindow.forEach((u) => {
      signupsByRole[u.role] = (signupsByRole[u.role] || 0) + 1;
    });

    // Signup cohort by account type
    const signupsByAccountType: Record<string, number> = {};
    newUsersInWindow.forEach((u) => {
      const t = u.accountType || 'unknown';
      signupsByAccountType[t] = (signupsByAccountType[t] || 0) + 1;
    });

    // Document types distribution
    const docTypes: Record<string, number> = {};
    histInWindow.forEach((h) => {
      const t = h.templateName || h.category || 'Unknown';
      docTypes[t] = (docTypes[t] || 0) + 1;
    });
    const topDocTypes = Object.entries(docTypes)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([type, count]) => ({ type, count }));

    return NextResponse.json({
      period: { days, since: since.toISOString(), until: now.toISOString() },
      overview: {
        totalPageViews: telInWindow.filter((e) => e.type === 'page_view').length,
        totalSignups: telInWindow.filter((e) => e.type === 'signup').length,
        totalLogins: telInWindow.filter((e) => e.type === 'login').length,
        totalDocuments: histInWindow.length,
        totalRevenuePaise: billingInWindow.filter((t) => t.status === 'paid' || t.status === 'success').reduce((s, t) => s + (t.amountPaise || 0), 0),
        totalNewUsers: newUsersInWindow.length,
        totalActivityEvents: actInWindow.length,
      },
      topPages,
      topFeatures,
      topDocTypes,
      dailyActivity,
      dailyRevenue,
      activityTypes,
      signupsByRole,
      signupsByAccountType,
    });
  } catch (err) {
    console.error('[super-admin/analytics GET]', err);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}
