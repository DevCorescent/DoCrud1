type TelemetrySurface = 'public' | 'workspace';
type WebTelemetryEventType =
  | 'page_view'
  | 'page_leave'
  | 'cta_click'
  | 'search'
  | 'login'
  | 'signup'
  | 'feature_open';

type TelemetryEventPayload = {
  type: WebTelemetryEventType;
  surface: TelemetrySurface;
  path: string;
  title?: string;
  referrer?: string;
  durationMs?: number;
  query?: string;
  featureId?: string;
  ctaId?: string;
  visitorId?: string;
  sessionId?: string;
  userId?: string;
  userRole?: string;
  // Search enrichment
  searchContext?: string;
  resultsCount?: number;
  hasResults?: boolean;
  queryLength?: number;
};

function safeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readCookie(name: string) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1));
}

function writeCookie(name: string, value: string, days = 365) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; Expires=${expires}; Path=/; SameSite=Lax`;
}

export function getOrCreateVisitorId() {
  if (typeof window === 'undefined') return null;
  const cookie = readCookie('docrud_vid');
  if (cookie) return cookie;
  const stored = window.localStorage.getItem('docrud_vid');
  if (stored) {
    writeCookie('docrud_vid', stored);
    return stored;
  }
  const next = safeId('v');
  window.localStorage.setItem('docrud_vid', next);
  writeCookie('docrud_vid', next);
  return next;
}

export function getOrCreateSessionId() {
  if (typeof window === 'undefined') return null;
  const stored = window.sessionStorage.getItem('docrud_sid');
  if (stored) return stored;
  const next = safeId('s');
  window.sessionStorage.setItem('docrud_sid', next);
  return next;
}

export function trackTelemetry(event: TelemetryEventPayload) {
  if (typeof window === 'undefined') return;
  const payload: TelemetryEventPayload = {
    ...event,
    visitorId: event.visitorId || getOrCreateVisitorId() || undefined,
    sessionId: event.sessionId || getOrCreateSessionId() || undefined,
    referrer: event.referrer || document.referrer || undefined,
    title: event.title || document.title || undefined,
  };

  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/telemetry/track', blob);
      return;
    }
  } catch {
    // ignore
  }

  fetch('/api/telemetry/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

