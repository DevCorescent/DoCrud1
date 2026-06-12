import { CustomPlanConfiguration, SaasFeatureKey, SaasPlan, User } from '@/types/document';
import { getSaasPlansFromRepository, saveSaasPlansToRepository } from '@/lib/server/repositories';

// In-memory cache for saas plans — refreshed every 60 s. Plans change rarely
// (admin action) so a short TTL gives near-zero DB overhead on JWT refreshes.
let plansCache: { plans: SaasPlan[]; expiresAt: number } | null = null;
const PLANS_CACHE_TTL_MS = 60_000;

function invalidatePlansCache() {
  plansCache = null;
}

function addDays(isoDate: string, days: number) {
  const base = new Date(isoDate);
  base.setDate(base.getDate() + days);
  return base.toISOString();
}

export const roadmapPromotionCampaign = {
  campaignId: 'roadmap-april-2026-upgrade-window',
  label: 'Purchase today and get all new upgrades free for 3 months',
  cutoffAt: '2026-04-14T23:59:59+05:30',
  validUntil: '2026-07-14T23:59:59+05:30',
};

export function canQualifyForRoadmapPromotion(at = new Date()) {
  return at.getTime() <= new Date(roadmapPromotionCampaign.cutoffAt).getTime();
}

export function getRoadmapPromotionSnapshot(subscription?: User['subscription']) {
  return {
    campaignId: roadmapPromotionCampaign.campaignId,
    label: roadmapPromotionCampaign.label,
    cutoffAt: roadmapPromotionCampaign.cutoffAt,
    validUntil: subscription?.roadmapPromoValidUntil || roadmapPromotionCampaign.validUntil,
    eligible: Boolean(subscription?.roadmapPromoQualifiedAt),
    qualifiedAt: subscription?.roadmapPromoQualifiedAt,
  };
}

export function applyRoadmapPromotionToSubscription(subscription: User['subscription'] | undefined, atIso = new Date().toISOString()) {
  if (!subscription) {
    return subscription;
  }

  if (subscription.roadmapPromoQualifiedAt) {
    return {
      ...subscription,
      roadmapPromoCampaignId: subscription.roadmapPromoCampaignId || roadmapPromotionCampaign.campaignId,
      roadmapPromoValidUntil: subscription.roadmapPromoValidUntil || roadmapPromotionCampaign.validUntil,
      roadmapPromoLabel: subscription.roadmapPromoLabel || roadmapPromotionCampaign.label,
    };
  }

  if (!canQualifyForRoadmapPromotion(new Date(atIso))) {
    return subscription;
  }

  return {
    ...subscription,
    roadmapPromoCampaignId: roadmapPromotionCampaign.campaignId,
    roadmapPromoQualifiedAt: atIso,
    roadmapPromoValidUntil: roadmapPromotionCampaign.validUntil,
    roadmapPromoLabel: roadmapPromotionCampaign.label,
  };
}

const aiFeatureKeys: SaasFeatureKey[] = ['doxpert', 'analytics', 'ai_copilot'];
const workspaceFeatureSet: SaasFeatureKey[] = [
  'dashboard',
  'document_summary',
  'generate_documents',
  'history',
  'client_portal',
  'tutorials',
  'talent_directory',
  'gigs',
  'file_manager',
  'roles_permissions',
  'approvals',
  'versions',
  'clauses',
  'audit',
  'bulk_ops',
  'renewals',
  'integrations',
  'organizations',
  'branding',
  'team_workspace',
  'deal_room',
  'hiring_desk',
  'docrudians',
  'virtual_id',
  'e_certificates',
  'editable_sheet_shares',
  'document_encrypter',
];
const trialWorkspaceFeatures = workspaceFeatureSet.filter((feature) => !aiFeatureKeys.includes(feature));
const fullWorkspaceFeatures = Array.from(new Set<SaasFeatureKey>([...workspaceFeatureSet, ...aiFeatureKeys]));
const defaultTrialAiRuns = 6;
const defaultProAiCredits = 300;

export function isSubscriptionPeriodExpired(subscription?: User['subscription'] | null) {
  if (!subscription?.currentPeriodEnd) return false;
  const end = new Date(subscription.currentPeriodEnd);
  return Number.isFinite(end.getTime()) && end.getTime() <= Date.now();
}

export function getSubscriptionCycleRemaining(params: {
  maxPerCycle?: number;
  used?: number;
}) {
  const max = Math.max(0, Math.round(params.maxPerCycle || 0));
  const used = Math.max(0, Math.round(params.used || 0));
  if (!max) {
    return { maxPerCycle: 0, used, remaining: 0 };
  }
  return { maxPerCycle: max, used, remaining: Math.max(max - used, 0) };
}

/**
 * Only one base plan exists: the free workspace tier.
 * All upgrades go through Docrud Infinity (handled in /api/billing/infinity).
 */
export const defaultSaasPlans: SaasPlan[] = [
  {
    id: 'workspace-trial',
    name: 'docrud Free',
    description: 'Free workspace with core features. Upgrade to Docrud Infinity to unlock everything.',
    targetAudience: 'business',
    priceLabel: 'Free',
    amountInPaise: 0,
    billingModel: 'free',
    includedFeatures: trialWorkspaceFeatures,
    freeDocumentGenerations: 50,
    maxDocumentGenerations: 150,
    freeAiRuns: defaultTrialAiRuns,
    monthlyAiCredits: 0,
    maxInternalUsers: 10,
    maxMailboxThreads: 500,
    maxTalentConnectsPerCycle: 5,
    maxGigProposalsPerCycle: 10,
    maxMarketplaceTemplatePublishes: 1,
    overagePriceLabel: 'Upgrade to Docrud Infinity to unlock unlimited access',
    watermarkOnFreeGenerations: false,
    isPublic: false,   // not shown as a purchasable option — it is the automatic default
    isDefault: true,
    active: true,
    ctaLabel: 'Get Started Free',
    createdAt: '2026-04-15T00:00:00.000Z',
    updatedAt: '2026-06-08T00:00:00.000Z',
  },
];

export const saasFeatureCatalog: Array<{ key: SaasFeatureKey; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'document_summary', label: 'Document Summary' },
  { key: 'generate_documents', label: 'E-sign Documents' },
  { key: 'history', label: 'History' },
  { key: 'client_portal', label: 'Client Portal' },
  { key: 'tutorials', label: 'Tutorials' },
  { key: 'talent_directory', label: 'Talent Directory' },
  { key: 'gigs', label: 'Gigs Studio' },
  { key: 'doxpert', label: 'DoXpert AI Advisor' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'file_manager', label: 'File Manager' },
  { key: 'roles_permissions', label: 'Roles & Permissions' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'versions', label: 'Versions' },
  { key: 'clauses', label: 'Clauses' },
  { key: 'audit', label: 'Audit' },
  { key: 'bulk_ops', label: 'Bulk Ops' },
  { key: 'renewals', label: 'Renewals' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'organizations', label: 'Organizations' },
  { key: 'ai_copilot', label: 'AI Copilot' },
  { key: 'api_docs', label: 'API Docs' },
  { key: 'branding', label: 'Branding Controls' },
  { key: 'team_workspace', label: 'Team Workspace + Internal Mailbox' },
  { key: 'deal_room', label: 'Board Room Workflows' },
  { key: 'hiring_desk', label: 'Hiring Desk + ATS Job Matching' },
  { key: 'docrudians', label: 'Docrudians Community' },
  { key: 'virtual_id', label: 'Virtual ID Cards' },
  { key: 'e_certificates', label: 'E-Certificates' },
  { key: 'editable_sheet_shares', label: 'Editable Sheet Shares' },
  { key: 'document_encrypter', label: 'Document Encrypter' },
];

export async function getSaasPlans() {
  if (plansCache && plansCache.expiresAt > Date.now()) {
    return plansCache.plans;
  }

  const storedPlans = await getSaasPlansFromRepository(defaultSaasPlans);
  const storedPlanMap = new Map(storedPlans.map((plan) => [plan.id, plan]));

  const merged = defaultSaasPlans.map((standard) => {
    const stored = storedPlanMap.get(standard.id);
    if (!stored) {
      return standard;
    }

    return {
      ...stored,
      id: standard.id,
      name: standard.name,
      targetAudience: stored.targetAudience || standard.targetAudience || 'business',
      billingModel: stored.billingModel || standard.billingModel,
      priceLabel: stored.priceLabel || standard.priceLabel,
      amountInPaise: stored.amountInPaise ?? standard.amountInPaise,
      includedFeatures: Array.from(new Set([...(stored.includedFeatures || []), ...(standard.includedFeatures || [])])),
      description: standard.description || stored.description,
      ctaLabel: standard.ctaLabel || stored.ctaLabel,
      overagePriceLabel: stored.overagePriceLabel || standard.overagePriceLabel,
      monthlyAiCredits: stored.monthlyAiCredits ?? standard.monthlyAiCredits,
      freeAiRuns: stored.freeAiRuns ?? standard.freeAiRuns,
      freeDocumentGenerations: stored.freeDocumentGenerations ?? standard.freeDocumentGenerations,
      maxDocumentGenerations: stored.maxDocumentGenerations ?? standard.maxDocumentGenerations,
      maxInternalUsers: stored.maxInternalUsers ?? standard.maxInternalUsers,
      maxMailboxThreads: stored.maxMailboxThreads ?? standard.maxMailboxThreads,
      watermarkOnFreeGenerations: stored.watermarkOnFreeGenerations ?? standard.watermarkOnFreeGenerations,
      isPublic: stored.isPublic ?? standard.isPublic,
      isDefault: stored.isDefault ?? standard.isDefault,
      active: stored.active ?? standard.active,
      createdAt: stored.createdAt || standard.createdAt,
      updatedAt: stored.updatedAt || standard.updatedAt,
    };
  });

  plansCache = { plans: merged, expiresAt: Date.now() + PLANS_CACHE_TTL_MS };
  return merged;
}

export async function saveSaasPlans(plans: SaasPlan[]) {
  invalidatePlansCache();
  await saveSaasPlansToRepository(plans);
}

export async function getPublicSaasPlans() {
  const plans = await getSaasPlans();
  return plans.filter((plan) => plan.isPublic && plan.active);
}

export async function getPublicSaasPlansByAudience(targetAudience: 'business' | 'individual') {
  const plans = await getPublicSaasPlans();
  const matched = plans.filter((plan) => (plan.targetAudience || 'business') === targetAudience);
  return matched.length ? matched : plans;
}

export async function getDefaultPublicPlan(targetAudience: 'business' | 'individual' = 'business') {
  const plans = await getSaasPlans();
  return plans.find((plan) => plan.isDefault && plan.active && (plan.targetAudience || 'business') === targetAudience)
    || plans.find((plan) => plan.active && (plan.targetAudience || 'business') === targetAudience)
    || plans.find((plan) => plan.id === 'workspace-trial')
    || plans[0];
}

export async function getSaasPlanById(planId?: string) {
  const plans = await getSaasPlans();
  return plans.find((plan) => plan.id === planId) || null;
}

function mergePlanWithCustomConfiguration(plan: SaasPlan | null, customConfiguration?: CustomPlanConfiguration | null) {
  if (!plan) {
    return null;
  }

  if (!customConfiguration) {
    return plan;
  }

  return {
    ...plan,
    name: `${plan.name} Custom`,
    includedFeatures: Array.from(new Set([...(plan.includedFeatures || []), ...(customConfiguration.featureKeys || [])])),
    maxDocumentGenerations: Math.max(plan.maxDocumentGenerations || 0, customConfiguration.maxDocumentGenerations || 0),
    maxInternalUsers: Math.max(plan.maxInternalUsers || 0, customConfiguration.maxInternalUsers || 0),
    maxMailboxThreads: Math.max(plan.maxMailboxThreads || 0, customConfiguration.maxMailboxThreads || 0),
  };
}

type UserPlanCarrier = {
  subscription?: User['subscription'] | null;
};

export async function getEffectiveSaasPlanForUser(user?: UserPlanCarrier | null) {
  if (!user?.subscription?.planId) {
    return null;
  }

  const plan = await getSaasPlanById(user.subscription.planId);
  return mergePlanWithCustomConfiguration(plan, user.subscription.customConfiguration);
}

function getCustomPlanAiCredits(customConfiguration?: CustomPlanConfiguration | null) {
  if (!customConfiguration) {
    return 0;
  }

  if (typeof customConfiguration.monthlyAiCredits === 'number' && customConfiguration.monthlyAiCredits > 0) {
    return customConfiguration.monthlyAiCredits;
  }

  const selectedAiFeatures = (customConfiguration.featureKeys || []).filter((feature) => aiFeatureKeys.includes(feature));
  return selectedAiFeatures.length ? 120 + (selectedAiFeatures.length * 60) : 0;
}

export function resolveAiEntitlements(
  plan: SaasPlan,
  customConfiguration?: CustomPlanConfiguration | null,
  existing?: User['subscription'],
) {
  const isTrialWorkspace = plan.id === 'workspace-trial';
  const monthlyAiCredits = plan.id === 'workspace-build-your-own'
    ? getCustomPlanAiCredits(customConfiguration)
    : (plan.monthlyAiCredits || 0);
  const freeAiRuns = plan.freeAiRuns ?? (isTrialWorkspace ? defaultTrialAiRuns : 0);
  const aiTrialUsed = isTrialWorkspace ? Math.min(existing?.aiTrialUsed || 0, freeAiRuns) : 0;

  return {
    aiTrialLimit: freeAiRuns,
    aiTrialUsed,
    monthlyAiCredits,
    remainingAiCredits: monthlyAiCredits,
  };
}

export function resetAiCreditsIfNeeded(subscription?: User['subscription']) {
  if (!subscription || !subscription.monthlyAiCredits || subscription.monthlyAiCredits <= 0) {
    return subscription;
  }

  const resetAt = subscription.aiCreditsResetAt || subscription.currentPeriodEnd;
  if (!resetAt || new Date(resetAt).getTime() > Date.now()) {
    return subscription;
  }

  return {
    ...subscription,
    remainingAiCredits: subscription.monthlyAiCredits,
    aiCreditsResetAt: subscription.currentPeriodEnd || addDays(new Date().toISOString(), 30),
  };
}
