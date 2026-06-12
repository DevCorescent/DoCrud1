import { promises as fs } from 'fs';
import { getHistoryEntries } from '@/lib/server/history';
import { getStoredUsers, getStoredUserById, saveStoredUsers, upsertStoredUser, type StoredUser } from '@/lib/server/users';
import { CustomPlanConfiguration, SaasFeatureKey, SaasOverview, SaasPlan, SaasUsageSummary, User } from '@/types/document';
import { getAllBusinessSettings } from '@/lib/server/business';
import { getFileTransfers } from '@/lib/server/file-transfers';
import { getInternalMailThreads } from '@/lib/server/internal-mailbox';
import { getCertificateAdminStats } from '@/lib/server/certificates';
import { getVirtualIdAdminStats } from '@/lib/server/virtual-ids';
import { getBillingTransactions } from '@/lib/server/billing';
import {
  billingTransactionsPath,
  certificatesPath,
  fileTransfersPath,
  historyFilePath,
  internalMailboxPath,
  parserHistoryPath,
  usersPath,
  virtualIdsPath,
} from '@/lib/server/storage';
import { isDatabaseConfigured } from '@/lib/server/database';

import {
  roadmapPromotionCampaign,
  canQualifyForRoadmapPromotion,
  getRoadmapPromotionSnapshot,
  applyRoadmapPromotionToSubscription,
  isSubscriptionPeriodExpired,
  getSubscriptionCycleRemaining,
  defaultSaasPlans,
  saasFeatureCatalog,
  getSaasPlans,
  saveSaasPlans,
  getPublicSaasPlans,
  getPublicSaasPlansByAudience,
  getDefaultPublicPlan,
  getSaasPlanById,
  getEffectiveSaasPlanForUser,
  resolveAiEntitlements,
  resetAiCreditsIfNeeded,
} from '@/lib/server/saas-plans';
export {
  roadmapPromotionCampaign,
  canQualifyForRoadmapPromotion,
  getRoadmapPromotionSnapshot,
  applyRoadmapPromotionToSubscription,
  isSubscriptionPeriodExpired,
  getSubscriptionCycleRemaining,
  defaultSaasPlans,
  saasFeatureCatalog,
  getSaasPlans,
  saveSaasPlans,
  getPublicSaasPlans,
  getPublicSaasPlansByAudience,
  getDefaultPublicPlan,
  getSaasPlanById,
  getEffectiveSaasPlanForUser,
  resolveAiEntitlements,
  resetAiCreditsIfNeeded,
};

const coreFeatures: SaasFeatureKey[] = [
  'dashboard',
  'document_summary',
  'generate_documents',
  'history',
  'client_portal',
  'tutorials',
];

function addDays(isoDate: string, days: number) {
  const base = new Date(isoDate);
  base.setDate(base.getDate() + days);
  return base.toISOString();
}

async function getFileSizeSafe(filePath: string) {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

export async function assignUserPlan(
  userId: string,
  planId: string,
  status: 'trial' | 'active' | 'upgrade_required' | 'suspended' = 'active',
  customConfiguration?: CustomPlanConfiguration | null,
) {
  const [user, plan] = await Promise.all([getStoredUserById(userId), getSaasPlanById(planId)]);
  if (!plan) {
    throw new Error('Plan not found');
  }
  if (!user) {
    throw new Error('User not found');
  }

  const currentPeriodStart = new Date().toISOString();
  const currentPeriodEnd = (plan.billingModel === 'subscription' || plan.billingModel === 'free' || plan.id === 'workspace-build-your-own')
    ? addDays(currentPeriodStart, 30)
    : undefined;
  const aiEntitlements = resolveAiEntitlements(plan, customConfiguration, user.subscription);
  const updatedUser = {
    ...user,
    subscription: {
      planId: plan.id,
      planName: plan.name,
      status,
      billingProvider: plan.billingModel === 'free' || plan.billingModel === 'custom' ? user.subscription?.billingProvider : 'razorpay' as const,
      startedAt: currentPeriodStart,
      currentPeriodStart,
      currentPeriodEnd,
      renewalDate: currentPeriodEnd,
      lastPaymentAt: status === 'active' && plan.billingModel !== 'free' ? currentPeriodStart : user.subscription?.lastPaymentAt,
      lastOrderId: user.subscription?.lastOrderId,
      customConfiguration: customConfiguration || user.subscription?.customConfiguration,
      roadmapPromoCampaignId: user.subscription?.roadmapPromoCampaignId,
      roadmapPromoQualifiedAt: user.subscription?.roadmapPromoQualifiedAt,
      roadmapPromoValidUntil: user.subscription?.roadmapPromoValidUntil,
      roadmapPromoLabel: user.subscription?.roadmapPromoLabel,
      aiTrialLimit: aiEntitlements.aiTrialLimit,
      aiTrialUsed: aiEntitlements.aiTrialUsed,
      monthlyAiCredits: aiEntitlements.monthlyAiCredits,
      remainingAiCredits: aiEntitlements.remainingAiCredits,
      aiCreditsResetAt: currentPeriodEnd,
    },
  };
  await upsertStoredUser(updatedUser);
  return updatedUser;
}

export async function getUserUsageSummary(user: User, preloadedHistory?: Awaited<ReturnType<typeof getHistoryEntries>>) {
  const history = preloadedHistory || await getHistoryEntries();
  const plan = await getEffectiveSaasPlanForUser(user);
  const refreshedSubscription = resetAiCreditsIfNeeded(user.subscription);
  const cycleStartAt = user.subscription?.currentPeriodStart || user.subscription?.startedAt || user.createdAt;
  const cycleEndAt = user.subscription?.currentPeriodEnd;
  const generatedDocuments = history.filter((entry) => (
    entry.generatedBy?.toLowerCase() === user.email.toLowerCase()
    || entry.clientEmail?.toLowerCase() === user.email.toLowerCase()
  ) && new Date(entry.generatedAt).getTime() >= new Date(cycleStartAt).getTime()
    && (!cycleEndAt || new Date(entry.generatedAt).getTime() <= new Date(cycleEndAt).getTime())).length;
  const planFreeLimit = plan?.freeDocumentGenerations ?? 5;
  const planMaxLimit = plan?.maxDocumentGenerations ?? planFreeLimit;
  const percentUsed = planMaxLimit > 0 ? Math.min(100, Math.round((generatedDocuments / planMaxLimit) * 100)) : 0;
  const thresholdState = generatedDocuments >= planMaxLimit
    ? 'limit_reached'
    : percentUsed >= 90
      ? 'critical'
      : percentUsed >= 75
        ? 'watch'
        : 'healthy';

  const usage: SaasUsageSummary = {
    totalGeneratedDocuments: generatedDocuments,
    freeGeneratedDocuments: Math.min(generatedDocuments, planFreeLimit),
    remainingGenerations: Math.max(planMaxLimit - generatedDocuments, 0),
    remainingAiTrialRuns: Math.max((refreshedSubscription?.aiTrialLimit || 0) - (refreshedSubscription?.aiTrialUsed || 0), 0),
    remainingAiCredits: Math.max(refreshedSubscription?.remainingAiCredits || 0, 0),
    limitReached: generatedDocuments >= planMaxLimit,
    thresholdState,
    thresholdPercentUsed: percentUsed,
    cycleStartAt,
    cycleEndAt,
  };

  return {
    plan,
    usage,
  };
}

export async function canUserAccessFeature(user: User, feature: SaasFeatureKey) {
  if (user.role === 'admin' || user.role === 'hr' || user.role === 'legal' || user.role === 'employee') {
    return true;
  }

  const plan = await getEffectiveSaasPlanForUser(user);
  const features = new Set(plan?.includedFeatures || coreFeatures);
  return features.has(feature);
}

export async function getAiEntitlementSnapshot(user: User) {
  if (user.role === 'admin' || user.role === 'hr' || user.role === 'legal' || user.role === 'employee') {
    return {
      allowed: true,
      remainingTrialRuns: Number.POSITIVE_INFINITY,
      remainingCredits: Number.POSITIVE_INFINITY,
      monthlyCredits: Number.POSITIVE_INFINITY,
      reason: 'Workspace admin access',
    };
  }

  const refreshedSubscription = resetAiCreditsIfNeeded(user.subscription);
  const remainingTrialRuns = Math.max((refreshedSubscription?.aiTrialLimit || 0) - (refreshedSubscription?.aiTrialUsed || 0), 0);
  const remainingCredits = Math.max(refreshedSubscription?.remainingAiCredits || 0, 0);
  const monthlyCredits = Math.max(refreshedSubscription?.monthlyAiCredits || 0, 0);

  if (remainingCredits > 0) {
    return {
      allowed: true,
      remainingTrialRuns,
      remainingCredits,
      monthlyCredits,
      reason: 'Paid AI credits available',
    };
  }

  if (remainingTrialRuns > 0) {
    return {
      allowed: true,
      remainingTrialRuns,
      remainingCredits,
      monthlyCredits,
      reason: 'Free AI trial runs available',
    };
  }

  return {
    allowed: false,
    remainingTrialRuns,
    remainingCredits,
    monthlyCredits,
    reason: 'Upgrade required for continued AI usage',
  };
}

export async function consumeAiUsageByEmail(email: string) {
  const users = await getStoredUsers();
  const normalizedEmail = email.trim().toLowerCase();
  const targetUser = users.find((user) => user.email.trim().toLowerCase() === normalizedEmail);

  if (!targetUser) {
    throw new Error('User not found.');
  }

  if (targetUser.role === 'admin' || targetUser.role === 'hr' || targetUser.role === 'legal' || targetUser.role === 'employee') {
    return getAiEntitlementSnapshot(targetUser);
  }

  const refreshedSubscription = resetAiCreditsIfNeeded(targetUser.subscription);
  if (!refreshedSubscription) {
    throw new Error('Subscription is not configured for this user.');
  }
  const remainingCredits = Math.max(refreshedSubscription?.remainingAiCredits || 0, 0);
  const remainingTrialRuns = Math.max((refreshedSubscription?.aiTrialLimit || 0) - (refreshedSubscription?.aiTrialUsed || 0), 0);

  if (remainingCredits <= 0 && remainingTrialRuns <= 0) {
    throw new Error('AI usage limit reached. Upgrade to docrud Workspace Pro or configure a custom AI-ready workspace plan.');
  }

  const nextUsers: StoredUser[] = users.map((user) => {
    if (user.id !== targetUser.id) {
      return user;
    }

    return {
      ...user,
      subscription: {
        ...refreshedSubscription,
        remainingAiCredits: remainingCredits > 0 ? remainingCredits - 1 : remainingCredits,
        aiTrialUsed: remainingCredits > 0 ? (refreshedSubscription?.aiTrialUsed || 0) : ((refreshedSubscription?.aiTrialUsed || 0) + 1),
      },
    };
  });

  await saveStoredUsers(nextUsers);
  const updatedUser = nextUsers.find((user) => user.id === targetUser.id) || targetUser;
  return getAiEntitlementSnapshot(updatedUser);
}

export async function getSaasOverview(): Promise<SaasOverview> {
  const [plans, users, history, businessSettings, fileTransfers, mailboxThreads, virtualIdStats, certificateStats, billingTransactions, historySize, usersSize, transfersSize, mailboxSize, parserHistorySize, billingSize, virtualIdsSize, certificatesSize] = await Promise.all([
    getSaasPlans(),
    getStoredUsers(),
    getHistoryEntries(),
    getAllBusinessSettings(),
    getFileTransfers(),
    getInternalMailThreads(),
    getVirtualIdAdminStats(),
    getCertificateAdminStats(),
    getBillingTransactions(),
    getFileSizeSafe(historyFilePath),
    getFileSizeSafe(usersPath),
    getFileSizeSafe(fileTransfersPath),
    getFileSizeSafe(internalMailboxPath),
    getFileSizeSafe(parserHistoryPath),
    getFileSizeSafe(billingTransactionsPath),
    getFileSizeSafe(virtualIdsPath),
    getFileSizeSafe(certificatesPath),
  ]);
  const businessUsers = users.filter((user) => user.role === 'client');
  const teamMembers = users.filter((user) => user.role === 'member');
  const businessSettingsMap = new Map(businessSettings.map((entry) => [entry.organizationId, entry]));

  const businessUsage = await Promise.all(
    businessUsers.map(async (user) => {
      const { plan, usage } = await getUserUsageSummary(user, history);
      const settings = businessSettingsMap.get(user.id);
      const checklistValues = Object.values(settings?.workspaceSetupChecklist || {});
      const setupReadinessScore = checklistValues.length === 0 ? 0 : Math.round((checklistValues.filter(Boolean).length / checklistValues.length) * 100);
      return {
        userId: user.id,
        name: user.name,
        email: user.email,
        organizationName: user.organizationName,
        industry: settings?.industry,
        companySize: settings?.companySize,
        workspacePreset: settings?.workspacePreset,
        onboardingCompleted: settings?.onboardingCompleted,
        setupReadinessScore,
        planId: plan?.id || user.subscription?.planId,
        planName: plan?.name || user.subscription?.planName,
        status: user.subscription?.status,
        generatedDocuments: usage.totalGeneratedDocuments,
        remainingGenerations: usage.remainingGenerations,
      };
    }),
  );

  const industryDistributionMap = new Map<string, number>();
  const workspacePresetDistributionMap = new Map<string, number>();
  businessUsers.forEach((user) => {
    const settings = businessSettingsMap.get(user.id);
    const industryLabel = settings?.industry || 'unclassified';
    const workspacePreset = settings?.workspacePreset || 'unset';
    industryDistributionMap.set(industryLabel, (industryDistributionMap.get(industryLabel) || 0) + 1);
    workspacePresetDistributionMap.set(workspacePreset, (workspacePresetDistributionMap.get(workspacePreset) || 0) + 1);
  });

  const onboardingCompletedAccounts = businessUsers.filter((user) => businessSettingsMap.get(user.id)?.onboardingCompleted).length;
  const onboardingInProgressAccounts = businessUsers.length - onboardingCompletedAccounts;
  const setupReadyAccounts = businessUsers.filter((user) => {
    const checklist = businessSettingsMap.get(user.id)?.workspaceSetupChecklist;
    return checklist && Object.values(checklist).every(Boolean);
  }).length;
  const eligiblePromotionUsers = businessUsers.filter((user) => user.subscription?.roadmapPromoQualifiedAt);
  const paidBusinessAccounts = businessUsers.filter((user) => user.subscription?.status === 'active' && user.subscription?.planId && user.subscription.planId !== 'workspace-trial').length;
  const trialBusinessAccounts = businessUsers.filter((user) => user.subscription?.status === 'trial').length;
  const policyAcceptedAccounts = businessUsers.filter((user) => user.policyAcceptance?.acceptedAt).length;
  const recentLogins24h = businessUsers.filter((user) => {
    if (!user.lastLogin) return false;
    return Date.now() - new Date(user.lastLogin).getTime() <= 24 * 60 * 60 * 1000;
  }).length;
  const averageSetupReadiness = businessUsage.length
    ? Math.round(businessUsage.reduce((sum, entry) => sum + (entry.setupReadinessScore || 0), 0) / businessUsage.length)
    : 0;
  const activeFileTransfers = fileTransfers.filter((entry) => !entry.revokedAt && (!entry.expiresAt || new Date(entry.expiresAt).getTime() > Date.now())).length;
  const recentActivityAt = [
    ...history.map((entry) => entry.generatedAt),
    ...fileTransfers.map((entry) => entry.updatedAt || entry.createdAt),
    ...mailboxThreads.map((entry) => entry.updatedAt || entry.createdAt),
    ...businessUsers.map((entry) => entry.lastLogin || entry.createdAt),
  ]
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];

  const totalStorageBytes = historySize + usersSize + transfersSize + mailboxSize + parserHistorySize + billingSize + virtualIdsSize + certificatesSize;
  const storageEntries = [
    { label: 'Document history', size: historySize },
    { label: 'Users', size: usersSize },
    { label: 'File transfers', size: transfersSize },
    { label: 'Internal mailbox', size: mailboxSize },
    { label: 'Parser history', size: parserHistorySize },
    { label: 'Billing transactions', size: billingSize },
    { label: 'Virtual IDs', size: virtualIdsSize },
    { label: 'Certificates', size: certificatesSize },
  ];
  const largestStore = storageEntries.sort((left, right) => right.size - left.size)[0] || { label: 'No data', size: 0 };
  const memoryUsage = process.memoryUsage();
  const memoryRssMb = Math.round(memoryUsage.rss / (1024 * 1024));
  const memoryUsedMb = Math.round(memoryUsage.heapUsed / (1024 * 1024));
  const memoryTotalMb = Math.max(1, Math.round(memoryUsage.heapTotal / (1024 * 1024)));
  const memoryPressurePercent = Math.min(100, Math.round((memoryUsedMb / memoryTotalMb) * 100));
  const activeTenantRate = businessUsers.length === 0 ? 0 : Math.round((businessUsers.filter((user) => user.subscription?.status === 'active' || user.subscription?.status === 'trial').length / businessUsers.length) * 100);
  const softwareScore = Math.round(((activeTenantRate * 0.4) + ((businessUsers.length === 0 ? 100 : Math.round((setupReadyAccounts / businessUsers.length) * 100)) * 0.3) + ((policyAcceptedAccounts === 0 && businessUsers.length > 0 ? 0 : Math.round((policyAcceptedAccounts / Math.max(businessUsers.length, 1)) * 100)) * 0.3)));
  const softwareStatus = softwareScore >= 75 ? 'healthy' : softwareScore >= 50 ? 'watch' : 'critical';
  const serverStatus = memoryPressurePercent >= 90 ? 'critical' : memoryPressurePercent >= 75 ? 'watch' : 'healthy';
  const storageStatus = totalStorageBytes >= 250 * 1024 * 1024 ? 'critical' : totalStorageBytes >= 75 * 1024 * 1024 ? 'watch' : 'healthy';
  const recommendations: NonNullable<SaasOverview['platformHealth']>['recommendations'] = [];

  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const paid = billingTransactions.filter((t) => t && t.status === 'paid');
  const paidAtMs = (t: (typeof paid)[number]) => new Date(t.paidAt || t.updatedAt || t.createdAt).getTime();
  const paid24h = paid.filter((t) => now - paidAtMs(t) <= dayMs);
  const paid7d = paid.filter((t) => now - paidAtMs(t) <= 7 * dayMs);
  const paid30d = paid.filter((t) => now - paidAtMs(t) <= 30 * dayMs);
  const sum = (list: typeof paid) => list.reduce((acc, t) => acc + (t.amountInPaise || 0), 0);
  const lastPaidAt = paid
    .slice()
    .sort((a, b) => paidAtMs(b) - paidAtMs(a))[0]?.paidAt;

  const topProductMap7d = new Map<string, { amountInPaise: number; transactions: number }>();
  paid7d.forEach((t) => {
    const label = (t.productLabel || t.planName || t.productType || 'subscription').trim().slice(0, 80);
    const existing = topProductMap7d.get(label) || { amountInPaise: 0, transactions: 0 };
    topProductMap7d.set(label, { amountInPaise: existing.amountInPaise + (t.amountInPaise || 0), transactions: existing.transactions + 1 });
  });
  const topProducts7d = Array.from(topProductMap7d.entries())
    .sort((a, b) => b[1].amountInPaise - a[1].amountInPaise)
    .slice(0, 8)
    .map(([label, item]) => ({ label, ...item }));

  if ((businessUsers.length === 0 ? 0 : Math.round((onboardingCompletedAccounts / businessUsers.length) * 100)) < 60) {
    recommendations.push({
      id: 'improve-onboarding',
      title: 'Tighten business onboarding completion',
      detail: 'A large share of tenant workspaces are still not fully configured. Push the guided setup checklist and starter templates more aggressively.',
      priority: 'high',
    });
  }
  if ((businessUsers.filter((user) => user.subscription?.status === 'upgrade_required').length) > 0) {
    recommendations.push({
      id: 'upgrade-recovery',
      title: 'Recover accounts at upgrade threshold',
      detail: 'Several organizations have already hit plan pressure. Use billing nudges and plan-delta messaging to convert them before they stall.',
      priority: 'high',
    });
  }
  if (trialBusinessAccounts > paidBusinessAccounts) {
    recommendations.push({
      id: 'trial-conversion',
      title: 'Focus on trial-to-paid conversion',
      detail: 'Trials currently outnumber paid active businesses. Highlight internal mailbox, governed sharing, and team controls during the first week.',
      priority: 'medium',
    });
  }
  if (memoryPressurePercent >= 75) {
    recommendations.push({
      id: 'memory-watch',
      title: 'Watch runtime memory pressure',
      detail: 'Current heap utilization is elevated. Keep an eye on long-lived dev sessions, larger transfer payloads, and heavy analytics views.',
      priority: memoryPressurePercent >= 90 ? 'high' : 'medium',
    });
  }
  if (storageStatus !== 'healthy') {
    recommendations.push({
      id: 'storage-pressure',
      title: 'Storage footprint is climbing',
      detail: `The largest data surface right now is ${largestStore.label}. Archive low-value payloads and review retention for heavy transfer or history files.`,
      priority: storageStatus === 'critical' ? 'high' : 'medium',
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: 'platform-steady',
      title: 'Platform is operating within healthy bounds',
      detail: 'Adoption, setup readiness, and storage pressure are currently in a stable range. The next best move is to deepen paid feature adoption.',
      priority: 'low',
    });
  }

  return {
    plans,
    totalBusinessAccounts: businessUsers.length,
    activeBusinessAccounts: businessUsers.filter((user) => user.subscription?.status === 'active' || user.subscription?.status === 'trial').length,
    upgradeRequiredAccounts: businessUsers.filter((user) => user.subscription?.status === 'upgrade_required').length,
    paidBusinessAccounts,
    trialBusinessAccounts,
    income: {
      currency: 'INR',
      totalPaidInPaise: sum(paid),
      paid24hInPaise: sum(paid24h),
      paid7dInPaise: sum(paid7d),
      paid30dInPaise: sum(paid30d),
      paidTransactions: paid.length,
      lastPaidAt,
      topProducts7d,
    },
    totalGeneratedDocuments: history.length,
    totalFileTransfers: fileTransfers.length,
    activeFileTransfers,
    totalInternalMailboxThreads: mailboxThreads.length,
    totalVirtualIds: virtualIdStats.totalCards,
    totalCertificateRecords: certificateStats.totalCertificates,
    totalVirtualIdScans: virtualIdStats.totalScans,
    totalCertificateDownloads: certificateStats.totalDownloads,
    totalStorageBytes,
    onboardingCompletedAccounts,
    onboardingInProgressAccounts,
    onboardingCompletionRate: businessUsers.length === 0 ? 0 : Math.round((onboardingCompletedAccounts / businessUsers.length) * 100),
    setupReadyAccounts,
    averageSetupReadiness,
    policyAcceptanceRate: businessUsers.length === 0 ? 100 : Math.round((policyAcceptedAccounts / businessUsers.length) * 100),
    recentLogins24h,
    planDistribution: plans.map((plan) => ({
      planId: plan.id,
      planName: plan.name,
      businesses: businessUsers.filter((user) => user.subscription?.planId === plan.id).length,
    })),
    industryDistribution: Array.from(industryDistributionMap.entries()).map(([industry, businesses]) => ({ industry, businesses })),
    workspacePresetDistribution: Array.from(workspacePresetDistributionMap.entries()).map(([preset, businesses]) => ({ preset, businesses })),
    recentSignups: [...businessUsers]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 6)
      .map((user) => {
        const settings = businessSettingsMap.get(user.id);
        return {
          userId: user.id,
          organizationName: user.organizationName,
          email: user.email,
          industry: settings?.industry,
          workspacePreset: settings?.workspacePreset,
          createdAt: user.createdAt,
        };
      }),
    businessUsage,
    totalTeamMembers: teamMembers.length,
    activeTeamMembers: teamMembers.filter((user) => user.isActive !== false).length,
    collaborationEnabledAccounts: businessUsers.filter((user) => {
      const plan = plans.find((entry) => entry.id === user.subscription?.planId);
      return Boolean(plan?.includedFeatures?.includes('team_workspace'));
    }).length,
    moduleUsage: {
      virtualIds: {
        cards: virtualIdStats.totalCards,
        scans: virtualIdStats.totalScans,
        opens: virtualIdStats.totalOpens,
        downloads: virtualIdStats.totalDownloads,
      },
      certificates: {
        records: certificateStats.totalCertificates,
        opens: certificateStats.totalOpens,
        downloads: certificateStats.totalDownloads,
        verifies: certificateStats.totalVerifies,
      },
    },
    roadmapPromotion: {
      campaignId: roadmapPromotionCampaign.campaignId,
      label: roadmapPromotionCampaign.label,
      cutoffAt: roadmapPromotionCampaign.cutoffAt,
      validUntil: roadmapPromotionCampaign.validUntil,
      eligibleAccounts: eligiblePromotionUsers.length,
      activeEligibleAccounts: eligiblePromotionUsers.filter((user) => user.subscription?.status === 'active' || user.subscription?.status === 'trial').length,
      recentQualifiedAccounts: [...eligiblePromotionUsers]
        .sort((left, right) => new Date(right.subscription?.roadmapPromoQualifiedAt || right.createdAt).getTime() - new Date(left.subscription?.roadmapPromoQualifiedAt || left.createdAt).getTime())
        .slice(0, 6)
        .map((user) => ({
          userId: user.id,
          organizationName: user.organizationName,
          email: user.email,
          qualifiedAt: user.subscription?.roadmapPromoQualifiedAt || user.createdAt,
        })),
    },
    platformHealth: {
      software: {
        status: softwareStatus,
        score: softwareScore,
        activeTenantRate,
        setupCompletionRate: businessUsers.length === 0 ? 100 : Math.round((onboardingCompletedAccounts / businessUsers.length) * 100),
        recentActivityAt,
        insight: softwareStatus === 'healthy'
          ? 'Tenant adoption and workspace readiness are tracking in a healthy range.'
          : softwareStatus === 'watch'
            ? 'Adoption is present, but setup quality or conversion pressure needs attention.'
            : 'Platform value is being discovered, but setup completion and tenant health need intervention.',
      },
      server: {
        status: serverStatus,
        runtime: isDatabaseConfigured() ? 'database' : 'file',
        memoryUsedMb,
        memoryRssMb,
        memoryPressurePercent,
        nodeVersion: process.version,
        insight: serverStatus === 'healthy'
          ? 'Runtime memory pressure is within a comfortable operating band.'
          : serverStatus === 'watch'
            ? 'Server memory use is elevated and should be watched during heavier workspace activity.'
            : 'Server memory pressure is high. Review heavy payload flows and long-running processes.',
      },
      storage: {
        status: storageStatus,
        totalEstimatedBytes: totalStorageBytes,
        largestStoreLabel: largestStore.label,
        largestStoreBytes: largestStore.size,
        managedFiles: fileTransfers.length,
        insight: storageStatus === 'healthy'
          ? 'Storage footprint is still well within a manageable range.'
          : storageStatus === 'watch'
            ? 'Storage growth is noticeable. Review transfers, history retention, and bulky parser payloads.'
            : 'Storage usage is becoming a risk area and should be actively governed.',
      },
      recommendations,
    },
  };
}
