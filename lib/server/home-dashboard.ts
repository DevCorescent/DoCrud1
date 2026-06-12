import { getAuthSession } from '@/lib/server/auth';
import { getStoredUserByEmail } from '@/lib/server/users';
import { getEffectiveSaasPlanForUser, getRoadmapPromotionSnapshot, getUserUsageSummary } from '@/lib/server/saas';
import { getProfileData } from '@/lib/server/user-profiles';
import { getHistoryEntries } from '@/lib/server/history';
import { getFileTransfers } from '@/lib/server/file-transfers';
import { getVisibleVirtualIdCards } from '@/lib/server/virtual-ids';
import { getVisibleCertificates } from '@/lib/server/certificates';
import { buildBillingThreshold } from '@/lib/server/billing';
import { getDbPool } from '@/lib/server/database';
import { selectHistoryRowsForUser } from '@/lib/server/db/history-rows';
import { selectFileTransferRowsForUser } from '@/lib/server/db/file-transfers-rows';
import { ProfileOverview } from '@/types/document';

export interface HomeDashboardCard {
  id: string;
  label: string;
  value: string;
  tone: 'sky' | 'emerald' | 'violet' | 'amber';
}

export interface HomeDashboardRecentDocument {
  id: string;
  title: string;
  referenceNumber?: string;
  href: string;
  createdAt: string;
  openCount: number;
  downloadCount: number;
}

export interface HomeDashboardRecentTransfer {
  id: string;
  title: string;
  fileName: string;
  href: string;
  createdAt: string;
  openCount: number;
  downloadCount: number;
  visibility: 'public' | 'private';
}

export interface HomeDashboardNotification {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  tone: 'sky' | 'emerald' | 'violet' | 'amber';
}

export interface HomeDashboardSnapshot {
  overview: ProfileOverview;
  cards: HomeDashboardCard[];
  recentDocuments: HomeDashboardRecentDocument[];
  recentTransfers: HomeDashboardRecentTransfer[];
  notifications: HomeDashboardNotification[];
}

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

function formatCompactCount(value: number | undefined) {
  const safeValue = Number(value || 0);
  if (safeValue >= 1000000) return `${(safeValue / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (safeValue >= 1000) return `${(safeValue / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(safeValue);
}

export async function getHomeDashboardSnapshot(): Promise<HomeDashboardSnapshot | null> {
  const session = await getAuthSession();
  if (!session?.user?.email) {
    return null;
  }

  // In DB mode, fetch only the calling user's visible data — avoids full-table scans for non-admin roles
  const isDbMode = Boolean(getDbPool());
  const userRole = session.user.role;
  const userEmail = session.user.email || '';

  const [storedUser, history, transfers] = await Promise.all([
    getStoredUserByEmail(userEmail),
    isDbMode && userRole !== 'admin'
      ? selectHistoryRowsForUser({ role: userRole, email: userEmail, orgId: session.user.id })
      : getHistoryEntries(),
    isDbMode && userRole !== 'admin'
      ? selectFileTransferRowsForUser({ role: userRole, email: userEmail, orgId: session.user.id })
      : getFileTransfers(),
  ]);

  const plan = storedUser ? await getEffectiveSaasPlanForUser(storedUser) : null;
  const usageSummary = storedUser ? await getUserUsageSummary(storedUser, history) : null;
  const [userProfile, virtualIds, certificates] = storedUser ? await Promise.all([
    getProfileData(storedUser.id),
    getVisibleVirtualIdCards(storedUser),
    getVisibleCertificates(storedUser),
  ]) : [null, [], []];

  // When using DB-filtered queries for non-admin roles, `history`/`transfers` are already scoped
  const visibleHistory = isDbMode && userRole !== 'admin'
    ? history
    : userRole === 'admin'
      ? history
      : userRole === 'employee'
        ? history.filter((entry) => entry.employeeEmail?.toLowerCase() === userEmail.toLowerCase())
        : userRole === 'client'
          ? history.filter((entry) => entry.organizationId === session.user.id || entry.clientEmail?.toLowerCase() === userEmail.toLowerCase())
          : history.filter((entry) => entry.generatedBy === userEmail);

  const visibleTransfers = isDbMode && userRole !== 'admin'
    ? transfers
    : userRole === 'admin'
      ? transfers
      : userRole === 'client'
        ? transfers.filter((entry) => entry.organizationId === session.user.id || entry.uploadedBy.toLowerCase() === userEmail.toLowerCase())
        : transfers.filter((entry) => entry.uploadedBy.toLowerCase() === userEmail.toLowerCase());

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
      overagePriceLabel: plan?.overagePriceLabel,
      currentPeriodStart: storedUser?.subscription?.currentPeriodStart || storedUser?.subscription?.startedAt,
      currentPeriodEnd: storedUser?.subscription?.currentPeriodEnd || storedUser?.subscription?.renewalDate,
      lastPaymentAt: storedUser?.subscription?.lastPaymentAt,
      roadmapPromotion: getRoadmapPromotionSnapshot(storedUser?.subscription),
    },
    docrudGo: userProfile?.docrudGo ?? false,
    avatarUrl: userProfile?.avatarUrl ?? null,
    limitations: [],
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

  const recentDocuments = [...visibleHistory]
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())
    .slice(0, 4)
    .map((entry) => ({
      id: entry.id,
      title: entry.editorState?.title || entry.templateName || 'Untitled document',
      referenceNumber: entry.referenceNumber,
      href: entry.shareUrl || `/documents/${entry.shareId}`,
      createdAt: entry.generatedAt,
      openCount: entry.openCount || 0,
      downloadCount: entry.downloadCount || 0,
    }));

  const recentTransfers: HomeDashboardRecentTransfer[] = [...visibleTransfers]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 4)
    .map((entry): HomeDashboardRecentTransfer => ({
      id: entry.id,
      title: entry.title || entry.fileName,
      fileName: entry.fileName,
      href: entry.shareUrl || `/transfer/${entry.shareId}`,
      createdAt: entry.createdAt,
      openCount: entry.openCount || 0,
      downloadCount: entry.downloadCount || 0,
      visibility: entry.directoryVisibility === 'public' ? 'public' : 'private',
    }));

  const transferNotifications = visibleTransfers.flatMap((entry) =>
    (entry.accessEvents || []).slice(0, 3).map((event) => ({
      id: event.id,
      title:
        event.eventType === 'download'
          ? `${entry.fileName} downloaded`
          : event.eventType === 'open'
            ? `${entry.fileName} opened`
            : `${entry.fileName} activity`,
      detail: `${event.actorName || event.actorEmail || 'A recipient'} interacted with your transfer.`,
      createdAt: event.createdAt,
      tone: event.eventType === 'download' ? ('emerald' as const) : ('sky' as const),
    })),
  );

  const documentNotifications = visibleHistory.flatMap((entry) =>
    (entry.accessEvents || []).slice(0, 2).map((event) => ({
      id: event.id,
      title:
        event.eventType === 'sign'
          ? `${entry.templateName} signed`
          : event.eventType === 'download'
            ? `${entry.templateName} downloaded`
            : `${entry.templateName} viewed`,
      detail: `${event.actorName || 'Someone'} accessed ${entry.referenceNumber || entry.templateName}.`,
      createdAt: event.createdAt,
      tone: event.eventType === 'sign' ? ('violet' as const) : ('sky' as const),
    })),
  );

  const systemNotifications: HomeDashboardNotification[] = [
    {
      id: 'plan-usage',
      title: `${overview.threshold.percentUsed}% of plan capacity used`,
      detail: overview.threshold.recommendation,
      createdAt: new Date().toISOString(),
      tone:
        overview.threshold.state === 'limit_reached' || overview.threshold.state === 'critical'
          ? 'amber'
          : 'sky',
    },
    {
      id: 'transfer-summary',
      title: `${formatCompactCount(overview.usage.activeFileTransfers)} active file shares`,
      detail: `${formatCompactCount(overview.usage.fileTransferDownloads)} total downloads across your recent transfers.`,
      createdAt: new Date().toISOString(),
      tone: 'emerald',
    },
    {
      id: 'identity-summary',
      title: `${formatCompactCount(overview.usage.totalVirtualIds)} virtual IDs and ${formatCompactCount(overview.usage.totalCertificates)} certificates`,
      detail: `${formatCompactCount(overview.usage.totalVirtualIdScans)} scans and ${formatCompactCount(overview.usage.totalCertificateDownloads)} certificate downloads tracked.`,
      createdAt: new Date().toISOString(),
      tone: 'violet',
    },
  ];

  const notifications = [...transferNotifications, ...documentNotifications, ...systemNotifications]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  const cards: HomeDashboardCard[] = [
    { id: 'documents', label: 'Documents', value: formatCompactCount(overview.usage.totalDocuments), tone: 'sky' },
    { id: 'shared', label: 'File shares', value: formatCompactCount(overview.usage.totalFileTransfers), tone: 'emerald' },
    { id: 'downloads', label: 'Downloads', value: formatCompactCount(overview.usage.fileTransferDownloads), tone: 'amber' },
    { id: 'ids', label: 'ID scans', value: formatCompactCount(overview.usage.totalVirtualIdScans), tone: 'violet' },
  ];

  return {
    overview,
    cards,
    recentDocuments,
    recentTransfers,
    notifications,
  };
}
