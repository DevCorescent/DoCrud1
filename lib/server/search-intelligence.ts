/**
 * Query understanding for Docrud global search — server entry point.
 *
 * The deterministic rules (taxonomy, intent, roles, skills, locations) now live
 * in lib/search-understanding.ts so the client-side rankers can share exactly
 * the same interpretation of a query. This module adds the one thing that
 * cannot run in a browser: optional LLM enrichment through the project's
 * existing Groq client.
 *
 * Everything from the rules layer is re-exported, so existing imports of this
 * module are unchanged.
 */

import { generateAiText, isAiConfigured, parseStructuredJson } from '@/lib/server/ai';
import { normalize, understandQuerySync, type QueryUnderstanding } from '@/lib/search-understanding';

export * from '@/lib/search-understanding';

/* ── Optional LLM enrichment ──────────────────────────────────────────────── */

const aiCache = new Map<string, { data: Partial<QueryUnderstanding>; ts: number }>();
const AI_TTL = 10 * 60_000;
const AI_TIMEOUT_MS = 2_500;

/**
 * Ask the existing Groq client to widen the vocabulary. Additive only: it can
 * contribute skills/roles/domains/related terms, never remove or override what
 * the rules found, and never decides visibility. Any failure is swallowed.
 */
async function enrichWithAi(u: QueryUnderstanding): Promise<Partial<QueryUnderstanding> | null> {
  if (!isAiConfigured()) return null;
  const key = normalize(u.raw);
  const hit = aiCache.get(key);
  if (hit && Date.now() - hit.ts < AI_TTL) return hit.data;

  try {
    const text = await Promise.race([
      generateAiText([
        {
          role: 'system',
          content: 'You expand marketplace search queries. Reply with JSON only. Use lowercase single words or short phrases that would realistically appear in a freelancer profile, company page, service listing or job post. Never invent place names.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            query: u.raw,
            alreadyFound: { skills: u.skills, roles: u.roles, domains: u.domains },
            outputJsonShape: { skills: ['string'], roles: ['string'], domains: ['string'], related: ['string'] },
            rules: ['max 8 items per array', 'no sentences', 'no explanations'],
          }),
        },
      ], { jsonMode: true }),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('ai-timeout')), AI_TIMEOUT_MS)),
    ]);

    const parsed = parseStructuredJson<{ skills?: unknown; roles?: unknown; domains?: unknown; related?: unknown }>(text);
    const list = (v: unknown) => (Array.isArray(v) ? v : [])
      .map((x) => normalize(String(x)))
      .filter((x) => x.length >= 2 && x.length <= 40)
      .slice(0, 8);

    const data: Partial<QueryUnderstanding> = {
      skills: list(parsed.skills),
      roles: list(parsed.roles),
      domains: list(parsed.domains),
      expanded: list(parsed.related),
    };
    aiCache.set(key, { data, ts: Date.now() });
    return data;
  } catch {
    // Quota, timeout, bad JSON, network — the deterministic result stands.
    return null;
  }
}

/**
 * Full understanding. `useAi` lets callers skip the network entirely (used for
 * short/typeahead queries so keystrokes never hit the LLM).
 */
export async function understandQuery(
  raw: string,
  opts: { locationVocab?: Set<string>; useAi?: boolean } = {},
): Promise<QueryUnderstanding> {
  const base = understandQuerySync(raw, opts.locationVocab);
  if (!opts.useAi) return base;

  const ai = await enrichWithAi(base);
  if (!ai) return base;

  const merge = (a: string[], b?: string[]) => Array.from(new Set([...a, ...(b ?? [])]));
  return {
    ...base,
    skills: merge(base.skills, ai.skills),
    roles: merge(base.roles, ai.roles),
    domains: merge(base.domains, ai.domains),
    expanded: merge(base.expanded, ai.expanded).filter((t) => !base.terms.includes(t)),
    source: 'rules+ai',
  };
}
