/**
 * Minimal robots.txt handling. Honors the applicable User-agent group's
 * Disallow/Allow (longest-match wins) and Crawl-delay. If robots.txt cannot be
 * fetched, we fail OPEN for the specific page (common practice) — but the host
 * allowlist and rate limiting still bound what we do.
 */

export interface Robots {
  allows(pathname: string): boolean;
  crawlDelayMs(): number;
}

interface Rule { allow: boolean; path: string }

const ALLOW_ALL: Robots = { allows: () => true, crawlDelayMs: () => 0 };

export function parseRobots(txt: string, ua: string): Robots {
  const uaLower = ua.toLowerCase();
  // Split into agent groups.
  const lines = txt.split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  const groups: { agents: string[]; rules: Rule[]; delay?: number }[] = [];
  let cur: { agents: string[]; rules: Rule[]; delay?: number } | null = null;
  let expectingAgent = false;

  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!cur || !expectingAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(value.toLowerCase());
      expectingAgent = true;
    } else if (cur) {
      expectingAgent = false;
      if (field === 'disallow') cur.rules.push({ allow: false, path: value });
      else if (field === 'allow') cur.rules.push({ allow: true, path: value });
      else if (field === 'crawl-delay') { const d = Number(value); if (Number.isFinite(d)) cur.delay = d; }
    }
  }

  // Pick the most specific matching group: our UA token, else '*'.
  const applicable = groups.filter((g) => g.agents.some((a) => a === '*' || uaLower.includes(a) || a.includes(uaLower.split('/')[0])));
  const specific = applicable.find((g) => g.agents.some((a) => a !== '*')) || applicable.find((g) => g.agents.includes('*'));
  if (!specific) return ALLOW_ALL;

  const rules = specific.rules;
  const delayMs = specific.delay ? specific.delay * 1000 : 0;

  return {
    crawlDelayMs: () => delayMs,
    allows: (pathname: string) => {
      let best: Rule | null = null;
      for (const r of rules) {
        if (r.path === '') continue; // empty Disallow => allow everything
        if (pathname.startsWith(r.path) && (!best || r.path.length > best.path.length)) best = r;
      }
      return best ? best.allow : true;
    },
  };
}

export async function fetchRobots(
  origin: string,
  ua: string,
  fetchText: (url: string) => Promise<{ status: number; text: string } | null>,
): Promise<Robots> {
  try {
    const res = await fetchText(`${origin}/robots.txt`);
    if (!res || res.status !== 200 || !res.text) return ALLOW_ALL;
    return parseRobots(res.text, ua);
  } catch {
    return ALLOW_ALL;
  }
}
