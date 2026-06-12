import { requiredPolicyIds, policyCompany } from '@/lib/policies';

export function buildPolicyAcceptance(via: 'login' | 'business_signup' | 'individual_signup' | 'admin_created', ipAddress?: string) {
  return {
    version: policyCompany.policyVersion,
    acceptedAt: new Date().toISOString(),
    via,
    requiredPolicyIds: [...requiredPolicyIds],
    ipAddress,
  };
}
