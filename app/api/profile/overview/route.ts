import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getEffectiveSaasPlanForUser, getRoadmapPromotionSnapshot, getUserUsageSummary } from '@/lib/server/saas';
import { getHistoryEntries } from '@/lib/server/history';
import { getFileTransfers } from '@/lib/server/file-transfers';
import { getStoredUserByEmail } from '@/lib/server/users';
import { getDbPool } from '@/lib/server/database';
import { selectHistoryRowsForUser } from '@/lib/server/db/history-rows';
import { selectFileTransferRowsForUser } from '@/lib/server/db/file-transfers-rows';
import { getVisibleVirtualIdCards } from '@/lib/server/virtual-ids';
import { getVisibleCertificates } from '@/lib/server/certificates';
import { ProfileOverview } from '@/types/document';
import { buildBillingThreshold } from '@/lib/server/billing';

export const dynamic = 'force-dynamic';

function formatExhaustion(daysUntilExhausted: number | null) {
  if (daysUntilExhausted === null) {
    return {
      projectedExhaustionLabel: 'No usage forecast yet',
      projectedExhaustionDate: undefined,
    };
  }

  if (!Number.isFinite(daysUntilExhausted)) {
    return {
      projectedExhaustionLabel: 'Resources look stable at current pace',
      projectedExhaustionDate: undefined,
    };
  }

  const target = new Date(Date.now() + daysUntilExhausted * 24 * 60 * 60 * 1000);
  return {
    projectedExhaustionLabel: `Approx. ${Math.max(1, Math.round(daysUntilExhausted))} day${Math.round(daysUntilExhausted) === 1 ? '' : 's'} left at current pace`,
    projectedExhaustionDate: target.toISOString(),
  };
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = session.user.email || '';
    const userRole = session.user.role;
    const isDbMode = Boolean(getDbPool());
    const [storedUser, visibleHistory, visibleTransfers] = await Promise.all([
      getStoredUserByEmail(userEmail),
      isDbMode
        ? selectHistoryRowsForUser({ role: userRole, email: userEmail, orgId: session.user.id })
        : getHistoryEntries().then((history) => userRole === 'admin'
            ? history
            : userRole === 'employee'
              ? history.filter((e) => e.employeeEmail?.toLowerCase() === userEmail.toLowerCase())
              : userRole === 'client'
                ? history.filter((e) => e.organizationId === session.user.id || e.clientEmail?.toLowerCase() === userEmail.toLowerCase())
                : history.filter((e) => e.generatedBy === userEmail)),
      isDbMode
        ? selectFileTransferRowsForUser({ role: userRole, email: userEmail, orgId: session.user.id })
        : getFileTransfers().then((transfers) => userRole === 'admin'
            ? transfers
            : userRole === 'client'
              ? transfers.filter((e) => e.organizationId === session.user.id || e.uploadedBy.toLowerCase() === userEmail.toLowerCase())
              : transfers.filter((e) => e.uploadedBy.toLowerCase() === userEmail.toLowerCase())),
    ]);
    const plan = storedUser ? await getEffectiveSaasPlanForUser(storedUser) : null;
    const usageSummary = storedUser ? await getUserUsageSummary(storedUser, visibleHistory) : null;
    const [virtualIds, certificates] = storedUser ? await Promise.all([
      getVisibleVirtualIdCards(storedUser),
      getVisibleCertificates(storedUser),
    ]) : [[], []];

    const lastThirtyDays = new Date();
    lastThirtyDays.setDate(lastThirtyDays.getDate() - 30);
    const monthlyDocuments = visibleHistory.filter((entry) => new Date(entry.generatedAt) >= lastThirtyDays).length;
    const averageDocumentsPerDay = monthlyDocuments / 30;
    const averageDocumentsPerWeek = averageDocumentsPerDay * 7;
    const remainingGenerations = usageSummary?.usage.remainingGenerations ?? 0;
    const daysUntilExhausted = averageDocumentsPerDay > 0 && remainingGenerations > 0
      ? remainingGenerations / averageDocumentsPerDay
      : averageDocumentsPerDay === 0
        ? Number.POSITIVE_INFINITY
        : null;
    const projection = formatExhaustion(daysUntilExhausted);
    const threshold = buildBillingThreshold(usageSummary?.usage.thresholdPercentUsed ?? 0, remainingGenerations);

    const limitations = [
      plan?.maxDocumentGenerations ? `${plan.maxDocumentGenerations} document generations in current billing cycle` : undefined,
      plan?.overagePriceLabel || undefined,
      typeof plan?.maxInternalUsers === 'number' ? `${plan.maxInternalUsers} internal users included` : undefined,
      typeof plan?.maxMailboxThreads === 'number'
        ? (plan.maxMailboxThreads > 0 ? `${plan.maxMailboxThreads} internal mailbox threads per cycle` : 'Internal mailbox is not included on current plan')
        : undefined,
      typeof plan?.maxTalentConnectsPerCycle === 'number' && plan.maxTalentConnectsPerCycle > 0
        ? `Talent Directory connects: ${Math.max(plan.maxTalentConnectsPerCycle - Math.max(storedUser?.subscription?.talentConnectsUsed || 0, 0), 0)} of ${plan.maxTalentConnectsPerCycle} remaining this cycle`
        : 'Talent Directory connects not included on current plan',
      typeof plan?.maxGigProposalsPerCycle === 'number' && plan.maxGigProposalsPerCycle > 0
        ? `Gigs proposals: ${Math.max(plan.maxGigProposalsPerCycle - Math.max(storedUser?.subscription?.gigProposalsUsed || 0, 0), 0)} of ${plan.maxGigProposalsPerCycle} remaining this cycle`
        : 'Gigs proposals not included on current plan',
      plan?.includedFeatures?.includes('doxpert') ? 'DoXpert AI included' : 'DoXpert AI not included on current plan',
      storedUser?.subscription
        ? `AI access: ${Math.max((storedUser.subscription.aiTrialLimit || 0) - (storedUser.subscription.aiTrialUsed || 0), 0)} free tries left, ${Math.max(storedUser.subscription.remainingAiCredits || 0, 0)} paid credits available`
        : undefined,
    ].filter(Boolean) as string[];

    const overview: ProfileOverview = {
      name: session.user.name || 'docrud user',
      email: session.user.email || '',
      role: session.user.role,
      organizationName: session.user.organizationName || undefined,
      subscription: {
        planId: storedUser?.subscription?.planId,
        planName: storedUser?.subscription?.planName || (session.user.role === 'admin' ? 'Super Admin Access' : 'docrud Workspace Trial'),
        status: storedUser?.subscription?.status || (session.user.role === 'admin' ? 'active' : 'trial'),
        billingModel: plan?.billingModel,
        priceLabel: plan?.priceLabel,
        maxDocumentGenerations: plan?.maxDocumentGenerations,
        remainingGenerations,
        totalGeneratedDocuments: usageSummary?.usage.totalGeneratedDocuments ?? visibleHistory.length,
        remainingAiTrialRuns: usageSummary?.usage.remainingAiTrialRuns ?? 0,
        monthlyAiCredits: storedUser?.subscription?.monthlyAiCredits || 0,
        remainingAiCredits: usageSummary?.usage.remainingAiCredits ?? 0,
        overagePriceLabel: plan?.overagePriceLabel,
        currentPeriodStart: storedUser?.subscription?.currentPeriodStart || storedUser?.subscription?.startedAt,
        currentPeriodEnd: storedUser?.subscription?.currentPeriodEnd || storedUser?.subscription?.renewalDate,
        lastPaymentAt: storedUser?.subscription?.lastPaymentAt,
        roadmapPromotion: getRoadmapPromotionSnapshot(storedUser?.subscription),
      },
      limitations,
      threshold: {
        state: threshold.state,
        percentUsed: usageSummary?.usage.thresholdPercentUsed ?? 0,
        recommendation: threshold.recommendation,
      },
      usage: {
        totalDocuments: visibleHistory.length,
        documentsThisMonth: monthlyDocuments,
        averageDocumentsPerWeek: Number(averageDocumentsPerWeek.toFixed(1)),
        averageDocumentsPerDay: Number(averageDocumentsPerDay.toFixed(2)),
        remainingGenerations,
        projectedExhaustionLabel: projection.projectedExhaustionLabel,
        projectedExhaustionDate: projection.projectedExhaustionDate,
        activeFileTransfers: visibleTransfers.filter((entry) => !entry.revokedAt).length,
        totalFileTransfers: visibleTransfers.length,
        fileTransferDownloads: visibleTransfers.reduce((sum, entry) => sum + (entry.downloadCount || 0), 0),
        totalVirtualIds: virtualIds.length,
        totalVirtualIdScans: virtualIds.reduce((sum, entry) => sum + entry.analytics.scanCount, 0),
        totalCertificates: certificates.length,
        totalCertificateDownloads: certificates.reduce((sum, entry) => sum + entry.analytics.downloadCount, 0),
      },
    };

    return NextResponse.json(overview);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load profile overview' }, { status: 500 });
  }
}
