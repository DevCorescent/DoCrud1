'use client';

/**
 * The shared "which feed modules exist, and where do they go" hook.
 *
 * Both feed surfaces — the homepage and the Feed tab (/published) — need the
 * same three things: a per-session seed, a probe for which modules actually
 * have data, and the Super Admin composition config. This is that logic in one
 * place so the two surfaces cannot drift into different cadences.
 *
 * It only decides whether a slot is worth reserving. Every module still
 * fetches its own data through its own existing endpoint — nothing here is a
 * second data source, and no request made here is used to render anything.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { cachedJson } from '@/lib/client/request-cache';
import { getSessionSeed, planModuleSlots, type FeedModuleKind } from '@/lib/feed-composition';

type FeedCompositionCfg = { minLeadPosts: number; minModuleGap: number; maxModulesPerPage: number };

export function useFeedModuleSlots(): Map<number, { kind: FeedModuleKind; adIndex: number }> {
  const seed = useMemo(() => getSessionSeed(), []);
  const [adCount, setAdCount] = useState(0);
  const [hasPeople, setHasPeople] = useState(false);
  const [hasJobs, setHasJobs] = useState(false);
  const [cfg, setCfg] = useState<FeedCompositionCfg | null>(null);
  const probed = useRef(false);

  useEffect(() => {
    if (probed.current) return;
    probed.current = true;
    /* One probe per page load. A kind with no eligible data must report false —
       reserving a slot for a module that renders nothing would leave a hole and
       push the others out of the visible window. allSettled throughout: if any
       of these fail the feed still renders, just without that module. */
    void Promise.allSettled([
      /* Through the shared cache: the people strip and the jobs carousel each
         ask for the same URL when they mount, so a raw fetch here made the
         homepage request both endpoints twice per load. */
      cachedJson<{ people?: unknown[] }>('/api/recommendations/people').catch(() => ({ people: [] })),
      fetch('/api/ads/serve').then((r) => (r.ok ? r.json() : { ads: [] })),
      cachedJson<{ jobs?: unknown[] }>('/api/recommendations/jobs').catch(() => ({ jobs: [] })),
      fetch('/api/feed-config').then((r) => (r.ok ? r.json() : {})),
    ]).then(([pe, ad, jb, conf]) => {
      if (pe.status === 'fulfilled') setHasPeople((pe.value?.people?.length ?? 0) > 0);
      if (ad.status === 'fulfilled') setAdCount(ad.value?.ads?.length ?? 0);
      if (jb.status === 'fulfilled') setHasJobs((jb.value?.jobs?.length ?? 0) > 0);
      if (conf.status === 'fulfilled') {
        const comp = (conf.value as { composition?: FeedCompositionCfg })?.composition;
        if (comp) setCfg(comp);
      }
    });
  }, []);

  return useMemo(
    () => planModuleSlots(
      { people: hasPeople, ads: adCount, jobs: hasJobs },
      {
        seed,
        minLeadPosts: cfg?.minLeadPosts,
        minGap: cfg?.minModuleGap,
        maxModules: cfg?.maxModulesPerPage,
      },
    ),
    [hasPeople, adCount, hasJobs, seed, cfg],
  );
}
