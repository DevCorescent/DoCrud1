/**
 * Shared individual-account provisioning.
 *
 * The peer of lib/server/business-provisioning.ts, and it exists for the same
 * reason: two entry points now create individual accounts — the standalone
 * signup form (/api/individual/signup) and the onboarding flow, which creates
 * one only AFTER the emailed code comes back (/api/onboarding/signup/verify).
 * One function, so the two cannot drift into producing different accounts.
 *
 * It creates ONLY the account row. Referral activation and welcome mail stay
 * with the callers, which have the request origin; the caller also decides
 * whether the address is verified, because only it knows how the person got
 * here.
 */
import { applyRoadmapPromotionToSubscription, getDefaultPublicPlan } from '@/lib/server/saas';
import { buildPolicyAcceptance } from '@/lib/policy-consent';
import { createPasswordHash } from '@/lib/server/security';
import { getStoredUsers, saveStoredUsers, type StoredUser } from '@/lib/server/users';

export type IndividualProvisionInput = {
  name: string;
  /** Caller must pass an already-normalized email. */
  email: string;
  /** The plaintext password, when the caller is holding one. */
  password?: string;
  /**
   * A password ALREADY hashed by `createPasswordHash`. The onboarding flow
   * hashes at the moment the password is received and never keeps the original,
   * so by the time the account is created there is nothing else to pass.
   */
  credentials?: { passwordHash: string; passwordSalt: string };
  profession?: string;
  referralCode?: string;
  policyContext: 'individual_signup';
  policyIp?: string;
};

export async function provisionIndividualAccount(
  input: IndividualProvisionInput,
): Promise<{ userId: string; user: StoredUser }> {
  const selectedPlan = await getDefaultPublicPlan('business');
  const now = new Date().toISOString();
  const userId = `individual-${Date.now()}`;
  const referralCode = typeof input.referralCode === 'string' ? input.referralCode.trim() : '';

  const secret = input.password
    ? createPasswordHash(input.password)
    : input.credentials;
  if (!secret?.passwordHash || !secret?.passwordSalt) {
    /* An account with no credential could never be signed into, and would sit
       in the user table owning an address nobody can reclaim. */
    throw new Error('An individual account needs a password.');
  }

  const newUser = {
    id: userId,
    name: input.name.trim(),
    email: input.email,
    role: 'individual' as const,
    accountType: 'individual' as const,
    permissions: ['self'],
    isActive: true,
    createdAt: now,
    organizationName: input.profession?.trim() || 'Individual Workspace',
    createdFromSignup: true,
    referredByCode: referralCode || undefined,
    policyAcceptance: buildPolicyAcceptance(input.policyContext, input.policyIp),
    subscription: applyRoadmapPromotionToSubscription({
      planId: selectedPlan.id,
      planName: selectedPlan.name,
      status: 'trial' as const,
      startedAt: now,
      aiTrialLimit: selectedPlan.freeAiRuns || 0,
      aiTrialUsed: 0,
      monthlyAiCredits: selectedPlan.monthlyAiCredits || 0,
      remainingAiCredits: selectedPlan.monthlyAiCredits || 0,
      aiCreditsResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }, now),
    passwordHash: secret.passwordHash,
    passwordSalt: secret.passwordSalt,
  } as StoredUser;

  const users = await getStoredUsers();
  users.push(newUser);
  await saveStoredUsers(users);

  return { userId, user: newUser };
}
