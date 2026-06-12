import { getStoredUsers, saveStoredUsers } from '@/lib/server/auth';
import { getEffectiveSaasPlanForUser, getSubscriptionCycleRemaining, isSubscriptionPeriodExpired } from '@/lib/server/saas';

export async function getTalentConnectEntitlement(userId: string) {
  const users = await getStoredUsers();
  const user = users.find((entry) => entry.id === userId) || null;
  if (!user?.subscription) {
    return { ok: false as const, reason: 'No subscription found.' };
  }
  if (isSubscriptionPeriodExpired(user.subscription)) {
    return { ok: false as const, reason: 'Plan expired. Renew to continue.' };
  }

  const plan = await getEffectiveSaasPlanForUser(user);
  const remaining = getSubscriptionCycleRemaining({
    maxPerCycle: plan?.maxTalentConnectsPerCycle,
    used: user.subscription.talentConnectsUsed,
  });
  if (!remaining.maxPerCycle) {
    return { ok: false as const, reason: 'Talent Directory connect is not included on this plan.' };
  }
  if (remaining.remaining <= 0) {
    return { ok: false as const, reason: 'Talent Directory connect limit reached. Renew or upgrade.' };
  }

  return { ok: true as const, user, plan, remaining };
}

export async function consumeTalentConnectFromSubscription(userId: string) {
  const entitlement = await getTalentConnectEntitlement(userId);
  if (!entitlement.ok) return null;

  const users = await getStoredUsers();
  const next = users.map((entry) => {
    if (entry.id !== userId || !entry.subscription) return entry;
    return {
      ...entry,
      subscription: {
        ...entry.subscription,
        talentConnectsUsed: Math.max(0, Math.round(entry.subscription.talentConnectsUsed || 0)) + 1,
      },
    };
  });
  await saveStoredUsers(next);
  return { ok: true as const };
}

export async function getGigProposalEntitlement(userId: string) {
  const users = await getStoredUsers();
  const user = users.find((entry) => entry.id === userId) || null;
  if (!user?.subscription) {
    return { ok: false as const, reason: 'No subscription found.' };
  }
  if (isSubscriptionPeriodExpired(user.subscription)) {
    return { ok: false as const, reason: 'Plan expired. Renew to continue.' };
  }

  const plan = await getEffectiveSaasPlanForUser(user);
  const remaining = getSubscriptionCycleRemaining({
    maxPerCycle: plan?.maxGigProposalsPerCycle,
    used: user.subscription.gigProposalsUsed,
  });
  if (!remaining.maxPerCycle) {
    return { ok: false as const, reason: 'Gigs proposals are not included on this plan.' };
  }
  if (remaining.remaining <= 0) {
    return { ok: false as const, reason: 'Gigs proposal limit reached. Renew or upgrade.' };
  }

  return { ok: true as const, user, plan, remaining };
}

export async function consumeGigProposalFromSubscription(userId: string) {
  const entitlement = await getGigProposalEntitlement(userId);
  if (!entitlement.ok) return null;

  const users = await getStoredUsers();
  const next = users.map((entry) => {
    if (entry.id !== userId || !entry.subscription) return entry;
    return {
      ...entry,
      subscription: {
        ...entry.subscription,
        gigProposalsUsed: Math.max(0, Math.round(entry.subscription.gigProposalsUsed || 0)) + 1,
      },
    };
  });
  await saveStoredUsers(next);
  return { ok: true as const };
}

