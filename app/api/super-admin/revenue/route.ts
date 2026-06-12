import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getBillingTransactions } from '@/lib/server/billing';
import { getStoredUsers } from '@/lib/server/auth';
import { getSaasPlans } from '@/lib/server/saas';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [rawBilling, users, plans] = await Promise.all([
      getBillingTransactions(),
      getStoredUsers(),
      getSaasPlans(),
    ]);

    type Tx = {
      id?: string; userId?: string; userEmail?: string; userName?: string; organizationName?: string;
      planId?: string; planName?: string; amountInPaise?: number; baseAmountInPaise?: number;
      gstAmountInPaise?: number; status: string; createdAt?: string; paidAt?: string;
      productType?: string; productLabel?: string; billingModel?: string; couponCode?: string;
      provider?: string; providerPaymentId?: string; accountType?: string;
    };
    const billing = rawBilling as Tx[];

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const day30Ago = new Date(now.getTime() - 30 * 86400000);
    const day7Ago = new Date(now.getTime() - 7 * 86400000);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const paid = billing.filter((t) => t.status === 'paid' || t.status === 'success');
    const failed = billing.filter((t) => t.status === 'failed');

    // Core revenue metrics
    const totalRevenuePaise = paid.reduce((s, t) => s + (t.amountInPaise || 0), 0);
    const totalGstPaise = paid.reduce((s, t) => s + (t.gstAmountInPaise || 0), 0);
    const netRevenuePaise = totalRevenuePaise - totalGstPaise;

    const thisMonthPaid = paid.filter((t) => t.createdAt && new Date(t.createdAt) >= startOfMonth);
    const prevMonthPaid = paid.filter((t) => t.createdAt && new Date(t.createdAt) >= prevMonthStart && new Date(t.createdAt) <= prevMonthEnd);
    const thisMonthRevenue = thisMonthPaid.reduce((s, t) => s + (t.amountInPaise || 0), 0);
    const prevMonthRevenue = prevMonthPaid.reduce((s, t) => s + (t.amountInPaise || 0), 0);
    const yearRevenue = paid.filter((t) => t.createdAt && new Date(t.createdAt) >= startOfYear).reduce((s, t) => s + (t.amountInPaise || 0), 0);
    const last30Revenue = paid.filter((t) => t.createdAt && new Date(t.createdAt) >= day30Ago).reduce((s, t) => s + (t.amountInPaise || 0), 0);
    const last7Revenue = paid.filter((t) => t.createdAt && new Date(t.createdAt) >= day7Ago).reduce((s, t) => s + (t.amountInPaise || 0), 0);

    // MRR calculation from active subscriptions
    const planPriceMap: Record<string, number> = {};
    plans.forEach((p) => { planPriceMap[p.id] = p.amountInPaise || 0; });
    const activeSubUsers = users.filter((u) => u.subscription?.status === 'active' && u.subscription?.planId);
    const mrrPaise = activeSubUsers.reduce((s, u) => {
      const planPrice = planPriceMap[u.subscription!.planId] || 0;
      return s + planPrice;
    }, 0);
    const arrPaise = mrrPaise * 12;

    // Payment metrics
    const totalTransactions = billing.length;
    const successRate = totalTransactions > 0 ? Math.round((paid.length / totalTransactions) * 100) : 0;
    const avgTransactionPaise = paid.length > 0 ? Math.round(totalRevenuePaise / paid.length) : 0;

    // Revenue by plan
    const planRevenue: Record<string, { revenue: number; transactions: number; name: string }> = {};
    paid.forEach((t) => {
      const key = t.planId || t.productType || 'other';
      if (!planRevenue[key]) planRevenue[key] = { revenue: 0, transactions: 0, name: t.planName || t.productLabel || key };
      planRevenue[key].revenue += t.amountInPaise || 0;
      planRevenue[key].transactions++;
    });

    // Revenue by product type
    const productRevenue: Record<string, number> = {};
    paid.forEach((t) => {
      const key = t.productType || 'subscription';
      productRevenue[key] = (productRevenue[key] || 0) + (t.amountInPaise || 0);
    });

    // Top paying users
    const userRevenue: Record<string, { email: string; name: string; revenue: number; transactions: number }> = {};
    paid.forEach((t) => {
      if (!t.userId) return;
      if (!userRevenue[t.userId]) userRevenue[t.userId] = { email: t.userEmail || '', name: t.userName || '', revenue: 0, transactions: 0 };
      userRevenue[t.userId].revenue += t.amountInPaise || 0;
      userRevenue[t.userId].transactions++;
    });
    const topPayingUsers = Object.entries(userRevenue)
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .slice(0, 15)
      .map(([userId, data]) => ({ userId, ...data }));

    // Daily revenue for last 90 days
    const dailyRevenue: { date: string; paise: number; gst: number; transactions: number; failed: number }[] = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayPaid = paid.filter((t) => t.createdAt?.slice(0, 10) === dateStr);
      const dayFailed = failed.filter((t) => t.createdAt?.slice(0, 10) === dateStr);
      dailyRevenue.push({
        date: dateStr,
        paise: dayPaid.reduce((s, t) => s + (t.amountInPaise || 0), 0),
        gst: dayPaid.reduce((s, t) => s + (t.gstAmountInPaise || 0), 0),
        transactions: dayPaid.length,
        failed: dayFailed.length,
      });
    }

    // Monthly revenue last 12 months
    const monthlyRevenue: { month: string; paise: number; transactions: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = d.toISOString().slice(0, 7);
      const monthPaid = paid.filter((t) => t.createdAt?.slice(0, 7) === monthStr);
      monthlyRevenue.push({ month: monthStr, paise: monthPaid.reduce((s, t) => s + (t.amountInPaise || 0), 0), transactions: monthPaid.length });
    }

    // Coupon usage
    const couponUsage: Record<string, number> = {};
    paid.filter((t) => t.couponCode).forEach((t) => { couponUsage[t.couponCode!] = (couponUsage[t.couponCode!] || 0) + 1; });

    // Recent transactions
    const recentTransactions = [...paid]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 30)
      .map((t) => ({
        id: t.id, userEmail: t.userEmail, userName: t.userName, organizationName: t.organizationName,
        planId: t.planId, planName: t.planName, productType: t.productType, productLabel: t.productLabel,
        amountInPaise: t.amountInPaise, gstAmountInPaise: t.gstAmountInPaise, status: t.status,
        provider: t.provider, providerPaymentId: t.providerPaymentId, createdAt: t.createdAt, paidAt: t.paidAt,
        couponCode: t.couponCode,
      }));

    // Failed transactions recently
    const recentFailed = [...failed]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 10)
      .map((t) => ({ id: t.id, userEmail: t.userEmail, planId: t.planId, amountInPaise: t.amountInPaise, createdAt: t.createdAt }));

    const monthGrowth = prevMonthRevenue > 0 ? Math.round(((thisMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100) : null;

    return NextResponse.json({
      summary: {
        totalRevenuePaise, netRevenuePaise, totalGstPaise,
        thisMonthRevenue, prevMonthRevenue, monthGrowth,
        yearRevenue, last30Revenue, last7Revenue,
        mrrPaise, arrPaise,
        totalTransactions, successRate, avgTransactionPaise,
        totalPaid: paid.length, totalFailed: failed.length,
        activeSubscriptions: activeSubUsers.length,
      },
      planRevenue: Object.entries(planRevenue).map(([id, d]) => ({ id, ...d })).sort((a, b) => b.revenue - a.revenue),
      productRevenue: Object.entries(productRevenue).map(([product, paise]) => ({ product, paise })).sort((a, b) => b.paise - a.paise),
      topPayingUsers,
      dailyRevenue,
      monthlyRevenue,
      couponUsage: Object.entries(couponUsage).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
      recentTransactions,
      recentFailed,
    });
  } catch (err) {
    console.error('[super-admin/revenue GET]', err);
    return NextResponse.json({ error: 'Failed to load revenue data' }, { status: 500 });
  }
}
