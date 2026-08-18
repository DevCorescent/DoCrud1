/**
 * §35 client-side funnel tracking.
 *
 * Thin wrapper over the existing POST /api/services/analytics/track — no new
 * endpoint, no new store. Fire-and-forget: analytics must never block or break
 * a user flow, so every failure is swallowed.
 *
 * Server-side events (enquiry submitted, booking submitted/accepted/declined,
 * service completed, review submitted, service saved, provider responded) are
 * recorded in their API routes at the successful state transition instead, so a
 * failed request can never be counted as a conversion.
 */
import type { AnalyticsEventType } from '@/lib/server/services';

export type ServiceEventSource = 'profile' | 'catalogue' | 'direct';

const VISITOR_KEY = 'docrud:svc-visitor';
/** Impressions already sent this page-load, so one render never counts twice. */
const seenImpressions = new Set<string>();

function visitorId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

export function trackServiceEvent(
  serviceId: string,
  type: AnalyticsEventType,
  options: { source?: ServiceEventSource; metadata?: Record<string, string | number | boolean> } = {},
): void {
  if (typeof window === 'undefined' || !serviceId) return;
  try {
    void fetch('/api/services/analytics/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        serviceId,
        type,
        visitorId: visitorId(),
        source: options.source ?? 'direct',
        ...(options.metadata ? { metadata: options.metadata } : {}),
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* analytics is best-effort */
  }
}

/** Impression, deduped per service for this page-load. */
export function trackServiceImpression(
  serviceId: string,
  options: { source?: ServiceEventSource; metadata?: Record<string, string | number | boolean> } = {},
): void {
  if (!serviceId || seenImpressions.has(serviceId)) return;
  seenImpressions.add(serviceId);
  trackServiceEvent(serviceId, 'service_impression', options);
}

/** Call when the listing set changes enough that new impressions are genuine. */
export function resetImpressionDedupe(): void {
  seenImpressions.clear();
}
