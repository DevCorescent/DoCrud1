/**
 * Shared business-account provisioning.
 *
 * The credentials business signup (/api/saas/signup) and the Google OAuth
 * business flow (lib/server/auth.ts) must create IDENTICAL business accounts —
 * same StoredUser shape, same workspace settings, same starter templates. This
 * is that creation in one place so the two entry points cannot drift, and so
 * Google signup produces an account equivalent to the form + verified email +
 * successful signup, differing only in how the identity was authenticated.
 *
 * It creates ONLY a business account: role 'client', accountType 'business',
 * its own organizationId. No personal/individual profile, no employeeId, no
 * individualUserId is attached. `password` is omitted for OAuth accounts (the
 * Google identity is the credential); it is never faked.
 *
 * Referral activation and welcome email stay with the callers — they need the
 * request origin — so this function is exactly "create the business account and
 * its workspace", nothing tied to one transport.
 */

import { createPasswordHash } from '@/lib/server/security';
import { applyRoadmapPromotionToSubscription, getDefaultPublicPlan } from '@/lib/server/saas';
import { buildPolicyAcceptance } from '@/lib/policy-consent';
import { saveBusinessSettings, seedStarterTemplatesForBusiness } from '@/lib/server/business';
import { getStoredUsers, saveStoredUsers, type StoredUser } from '@/lib/server/users';
import { BusinessSettings } from '@/types/document';

export type BusinessProvisionInput = {
  name: string;
  /** Caller must pass an already-normalized email. */
  email: string;
  organizationName: string;
  organizationDomain?: string;
  industry?: string;
  companySize?: string;
  primaryUseCase?: string;
  workspacePreset?: string;
  referralCode?: string;
  /** Omitted for OAuth (Google) accounts — never invent a fake password. */
  password?: string;
  /** policy-consent context (the credentials and Google flows both use 'business_signup'). */
  policyContext: 'login' | 'business_signup' | 'individual_signup' | 'admin_created';
  policyIp?: string;
  /** Id prefix so the source is legible: 'user' (credentials) / 'business-google'. */
  idPrefix?: string;
};

export async function provisionBusinessAccount(
  input: BusinessProvisionInput,
): Promise<{ userId: string; user: StoredUser }> {
  const defaultPlan = await getDefaultPublicPlan('business');
  const now = new Date().toISOString();
  const userId = `${input.idPrefix ?? 'user'}-${Date.now()}`;
  const organizationName = input.organizationName.trim();
  const referralCode = typeof input.referralCode === 'string' ? input.referralCode.trim() : '';

  const newUser: StoredUser = {
    id: userId,
    name: input.name.trim(),
    email: input.email,
    role: 'client',
    accountType: 'business',
    permissions: ['all'],
    isActive: true,
    createdAt: now,
    organizationId: userId,
    organizationName,
    organizationDomain: input.organizationDomain?.trim() || undefined,
    createdFromSignup: true,
    referredByCode: referralCode || undefined,
    policyAcceptance: buildPolicyAcceptance(input.policyContext, input.policyIp),
    subscription: defaultPlan ? applyRoadmapPromotionToSubscription({
      planId: defaultPlan.id,
      planName: defaultPlan.name,
      status: 'trial' as const,
      startedAt: now,
      aiTrialLimit: defaultPlan.freeAiRuns || 0,
      aiTrialUsed: 0,
      monthlyAiCredits: defaultPlan.monthlyAiCredits || 0,
      remainingAiCredits: defaultPlan.monthlyAiCredits || 0,
      aiCreditsResetAt: defaultPlan.billingModel === 'free' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : undefined,
    }, now) : undefined,
    ...(input.password ? createPasswordHash(input.password) : {}),
  } as StoredUser;

  const users = await getStoredUsers();
  users.push(newUser);
  await saveStoredUsers(users);

  const businessSettings: BusinessSettings = {
    organizationId: userId,
    organizationName,
    displayName: organizationName,
    industry: input.industry?.trim() || 'technology',
    companySize: input.companySize?.trim() || '1-25',
    primaryUseCase: input.primaryUseCase?.trim() || '',
    workspacePreset: input.workspacePreset?.trim() || 'executive_control',
    onboardingCompleted: true,
    onboardingCompletedAt: now,
    starterTemplatesSeededAt: now,
    supportEmail: input.email,
    supportPhone: '',
    accentColor: '#2719FF',
    watermarkLabel: 'docrud workspace',
    letterheadMode: 'default',
    letterheadImageDataUrl: '',
    letterheadHtml: '',
    businessDescription: input.primaryUseCase?.trim() || '',
    workspaceSetupChecklist: {
      profileConfigured: true,
      brandingConfigured: true,
      starterTemplatesReady: true,
      signaturesReady: false,
      firstDocumentGenerated: false,
    },
    updatedAt: now,
  };
  await saveBusinessSettings(businessSettings);
  await seedStarterTemplatesForBusiness(businessSettings);

  return { userId, user: newUser };
}
