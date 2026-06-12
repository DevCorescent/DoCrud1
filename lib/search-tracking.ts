'use client';

/**
 * Centralised search tracking utility.
 *
 * Every search input in the platform imports `useSearchTracker(context)`.
 * It returns a `track(query, resultsCount)` function that:
 *  - Debounces to 600 ms so we don't flood on every keystroke
 *  - Deduplicates: won't re-fire the same query+results combination twice in a row
 *  - Sends to /api/telemetry/track with full enrichment (context, resultsCount, hasResults, queryLength)
 *  - Also updates the in-memory realtime search store via /api/telemetry/ping (fire-and-forget)
 *
 * SEARCH_CONTEXTS — one canonical name per search surface.
 * Keep in sync with SearchTab in SuperAdminPanel (used as display labels there).
 */

import { useCallback, useRef } from 'react';
import { trackTelemetry, getOrCreateSessionId, getOrCreateVisitorId } from './telemetry-client';

export const SEARCH_CONTEXTS = {
  GLOBAL:            'global_search',
  PUBLISHED_FEED:    'published_feed',
  PUBLIC_HOMEPAGE:   'public_homepage',
  FILE_DRIVE:        'file_drive',
  FILE_TRANSFERS:    'file_transfers',
  SUPPORT:           'support',
  TUTORIALS:         'tutorials',
  RECENTS:           'recents',
  PUBLIC_GIGS:       'public_gigs',
  GIGS_WORKSPACE:    'gigs_workspace',
  PEOPLE:            'people',
  KNOWLEDGE_BASE:    'knowledge_base',
  DOCUMENTS:         'documents',
  FORMS:             'forms',
  CLIENT_PORTAL:     'client_portal',
  DOCSHEET:          'docsheet',
  TEMPLATE_MARKET:   'template_marketplace',
  ADMIN_USERS:       'admin_users',
  ADMIN_DOCS:        'admin_documents',
  ADMIN_GIGS:        'admin_gigs',
  ADMIN_PEOPLE:      'admin_people',
  ADMIN_FEEDS:       'admin_feeds',
} as const;

export type SearchContext = typeof SEARCH_CONTEXTS[keyof typeof SEARCH_CONTEXTS];

/** Human-readable labels for the super admin search intel panel */
export const SEARCH_CONTEXT_LABELS: Record<string, string> = {
  global_search:        'Global Search Bar',
  published_feed:       'Published Feed',
  public_homepage:      'Public Homepage',
  file_drive:           'File Drive (Ddrive)',
  file_transfers:       'File Transfers',
  support:              'Support Center',
  tutorials:            'Tutorials Center',
  recents:              'Recents',
  public_gigs:          'Public Gigs Feed',
  gigs_workspace:       'Workspace Gigs',
  people:               'People / Network',
  knowledge_base:       'Knowledge Base',
  documents:            'Documents',
  forms:                'Forms Center',
  client_portal:        'Client Portal',
  docsheet:             'DocSheet',
  template_marketplace: 'Template Marketplace',
  admin_users:          'Admin › Users',
  admin_documents:      'Admin › Documents',
  admin_gigs:           'Admin › Gigs',
  admin_people:         'Admin › People',
  admin_feeds:          'Admin › Feeds',
};

function getSurface(context: string): 'workspace' | 'public' {
  const publicContexts = new Set(['published_feed', 'public_homepage', 'public_gigs']);
  const adminContexts = new Set(['admin_users', 'admin_documents', 'admin_gigs', 'admin_people', 'admin_feeds']);
  if (publicContexts.has(context)) return 'public';
  if (adminContexts.has(context)) return 'workspace';
  return 'workspace';
}

/**
 * useSearchTracker — drop into any component that has a search input.
 *
 * @param context - one of SEARCH_CONTEXTS values
 * @returns `track(query, resultsCount?)` — call after results are known
 *
 * Usage:
 *   const trackSearch = useSearchTracker(SEARCH_CONTEXTS.FILE_DRIVE);
 *   // after fetch resolves:
 *   trackSearch(query, results.length);
 */
export function useSearchTracker(context: SearchContext) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFiredRef = useRef<string>('');    // "query::count" — prevents duplicate fires

  const track = useCallback((query: string, resultsCount?: number) => {
    const trimmed = query.trim();
    if (trimmed.length < 1) return;

    const fingerprint = `${trimmed}::${resultsCount ?? -1}`;
    if (fingerprint === lastFiredRef.current) return; // exact duplicate, skip

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      lastFiredRef.current = fingerprint;
      const rCount = typeof resultsCount === 'number' ? resultsCount : undefined;
      trackTelemetry({
        type: 'search',
        surface: getSurface(context),
        path: typeof window !== 'undefined' ? window.location.pathname : '/',
        query: trimmed,
        searchContext: context,
        resultsCount: rCount,
        hasResults: rCount !== undefined ? rCount > 0 : undefined,
        queryLength: trimmed.length,
        sessionId: getOrCreateSessionId() || undefined,
        visitorId: getOrCreateVisitorId() || undefined,
      });
    }, 600); // 600 ms debounce — fires after user pauses typing
  }, [context]);

  return track;
}

/**
 * Lightweight synchronous version for components that don't need the debounce
 * (e.g. when a user explicitly submits a search form or presses Enter).
 */
export function fireSearchEvent(input: {
  query: string;
  context: SearchContext;
  resultsCount?: number;
  path?: string;
}) {
  const trimmed = input.query.trim();
  if (!trimmed) return;
  trackTelemetry({
    type: 'search',
    surface: getSurface(input.context),
    path: input.path ?? (typeof window !== 'undefined' ? window.location.pathname : '/'),
    query: trimmed,
    searchContext: input.context,
    resultsCount: input.resultsCount,
    hasResults: input.resultsCount !== undefined ? input.resultsCount > 0 : undefined,
    queryLength: trimmed.length,
    sessionId: getOrCreateSessionId() || undefined,
    visitorId: getOrCreateVisitorId() || undefined,
  });
}
