'use client';

/**
 * Shared behavior tracking utilities.
 *
 * Drop `useBehaviorTracker(featureId)` into any page/component to automatically:
 *  - Record how long the user spends on the feature
 *  - Track scroll depth (25 / 50 / 75 / 100 %)
 *  - Track first interaction (click)
 *
 * All events go to /api/user-activity (server-side user-activity.json)
 * AND to /api/telemetry/track (web-telemetry.json for analytics).
 */

import { useEffect, useRef, useCallback } from 'react';
import { getOrCreateSessionId, getOrCreateVisitorId, trackTelemetry } from '@/lib/telemetry-client';

// ── Low-level event fire ───────────────────────────────────────────────

interface BehaviorPayload {
  eventType: string;
  featureId?: string;
  tabId?: string;
  detail?: string;
  durationMs?: number;
}

async function postActivity(payload: BehaviorPayload) {
  try {
    await fetch('/api/user-activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch { /* non-fatal */ }
}

// ── Fire a feature_open telemetry event ───────────────────────────────

export function trackFeatureOpen(featureId: string, path?: string) {
  trackTelemetry({
    type: 'feature_open',
    surface: 'workspace',
    path: path ?? (typeof window !== 'undefined' ? window.location.pathname : '/'),
    featureId,
    sessionId: getOrCreateSessionId() || undefined,
    visitorId: getOrCreateVisitorId() || undefined,
  });
  void postActivity({ eventType: 'feature_action', featureId });
}

// ── Hook: tracks dwell time + scroll depth + first interaction ─────────

export function useBehaviorTracker(featureId: string, opts?: { trackScroll?: boolean; trackClicks?: boolean }) {
  const mountedAt   = useRef(Date.now());
  const scrollDepth = useRef(0);
  const interacted  = useRef(false);
  const sentMount   = useRef(false);

  const fire = useCallback((eventType: string, detail?: string, durationMs?: number) => {
    void postActivity({ eventType, featureId, detail, durationMs });
  }, [featureId]);

  // Record feature open
  useEffect(() => {
    if (sentMount.current) return;
    sentMount.current = true;
    trackFeatureOpen(featureId);
  }, [featureId]);

  // Record dwell time on unmount
  useEffect(() => {
    return () => {
      const dwellMs = Date.now() - mountedAt.current;
      if (dwellMs > 2000) { // only record if user spent > 2s
        fire('feature_action', `dwell:${Math.round(dwellMs / 1000)}s`, dwellMs);
      }
    };
  }, [fire]);

  // Scroll depth tracking
  useEffect(() => {
    if (!opts?.trackScroll) return;

    function handleScroll() {
      const el = document.documentElement;
      const pct = Math.round((el.scrollTop / (el.scrollHeight - el.clientHeight || 1)) * 100);
      const milestones = [25, 50, 75, 100];
      for (const m of milestones) {
        if (pct >= m && scrollDepth.current < m) {
          scrollDepth.current = m;
          fire('feature_action', `scroll:${m}%`);
        }
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [opts?.trackScroll, fire]);

  // First interaction tracking
  useEffect(() => {
    if (!opts?.trackClicks) return;

    function handleClick() {
      if (interacted.current) return;
      interacted.current = true;
      const timeToClickMs = Date.now() - mountedAt.current;
      fire('feature_action', `first_click:${Math.round(timeToClickMs / 1000)}s`);
    }

    document.addEventListener('click', handleClick, { once: true, passive: true });
    return () => document.removeEventListener('click', handleClick);
  }, [opts?.trackClicks, fire]);

  return { trackEvent: fire };
}

// ── Explicit action tracking ───────────────────────────────────────────

export function trackAction(featureId: string, action: string, detail?: string) {
  void postActivity({ eventType: 'feature_action', featureId, detail: `${action}${detail ? ':' + detail : ''}` });
}

export function trackSearch(query: string, surface: 'workspace' | 'public' = 'workspace') {
  trackTelemetry({
    type: 'search',
    surface,
    path: typeof window !== 'undefined' ? window.location.pathname : '/',
    query,
    sessionId: getOrCreateSessionId() || undefined,
    visitorId: getOrCreateVisitorId() || undefined,
  });
  void postActivity({ eventType: 'feature_action', featureId: 'search', detail: `query:${query.slice(0, 80)}` });
}
