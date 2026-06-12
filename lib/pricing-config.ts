import type { CustomPlanConfiguration, SaasFeatureKey } from '@/types/document';

export function sanitizeCustomPlanConfiguration(value: unknown): CustomPlanConfiguration | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const basePlanId = typeof payload.basePlanId === 'string' ? payload.basePlanId.trim() : '';
  if (!basePlanId) {
    return null;
  }

  const featureKeys = Array.isArray(payload.featureKeys)
    ? Array.from(new Set(payload.featureKeys.map((item) => String(item).trim()).filter(Boolean))) as SaasFeatureKey[]
    : [];

  const toPositiveNumber = (input: unknown) => {
    const numeric = typeof input === 'number' ? input : Number(input);
    return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : undefined;
  };

  return {
    source: 'pricing_builder',
    basePlanId,
    featureKeys,
    maxDocumentGenerations: toPositiveNumber(payload.maxDocumentGenerations),
    maxInternalUsers: toPositiveNumber(payload.maxInternalUsers),
    maxMailboxThreads: toPositiveNumber(payload.maxMailboxThreads),
    monthlyAiCredits: toPositiveNumber(payload.monthlyAiCredits),
    estimatedMonthlySubtotalInPaise: toPositiveNumber(payload.estimatedMonthlySubtotalInPaise),
    estimatedMonthlyTotalInPaise: toPositiveNumber(payload.estimatedMonthlyTotalInPaise),
  };
}

export function encodeCustomPlanConfiguration(config?: CustomPlanConfiguration | null) {
  if (!config) {
    return '';
  }

  return encodeURIComponent(JSON.stringify(config));
}

export function decodeCustomPlanConfiguration(raw?: string | null) {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    return sanitizeCustomPlanConfiguration(parsed);
  } catch {
    return null;
  }
}
