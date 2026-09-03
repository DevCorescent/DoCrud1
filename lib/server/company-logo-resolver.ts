/**
 * Company logo resolution — one lookup per COMPANY, never per job.
 *
 * ═══ WHAT THE AUDIT FOUND, AND WHY THIS FILE IS SHAPED THIS WAY ═══
 *
 * None of the nine ATS providers exposes a company website, domain or logo.
 * Every URL they emit is ATS-hosted — boards.greenhouse.io, jobs.lever.co,
 * <slug>.bamboohr.com — so a job's URL identifies the JOB BOARD, not the
 * employer. Deriving `razorpay.com` from the name "Razorpay" would be a guess,
 * and a guess that resolves is worse than no logo: it can silently render a
 * different company's brand mark.
 *
 * So resolution runs in strict priority and STOPS at the first trustworthy
 * answer:
 *
 *   0. a mark a SUPER ADMIN uploaded                 (human-chosen, highest)
 *   1. a verified override in lib/company-logos.ts   (human-checked)
 *   2. a logo the SOURCE supplied                    (authoritative)
 *   3. a website an operator configured              (human-supplied domain)
 *   4. nothing — the caller renders initials
 *
 * Step 0 exists so an operator can fix a wrong or missing mark without a
 * deployment. It is checked FIRST and returns immediately, which is what makes
 * it impossible for anything automatic to overwrite an admin's choice.
 *
 * There is deliberately no step that invents a domain. `NOT_FOUND` is a real
 * answer and is cached, so a company with no discoverable logo is not
 * re-probed on every scrape.
 *
 * ═══ ONE RESOLUTION PER COMPANY ═══
 *
 * Keyed by `logoKey(name)`, the same identity the job corpus groups on. 1,000
 * AECOM jobs and 300 Razorpay jobs produce TWO resolutions, not 1,300 —
 * `resolveMany` collapses to unique ids before doing any work.
 *
 * ═══ IT CAN NEVER BREAK INGESTION ═══
 *
 * Nothing here throws. Every failure returns a status. A scrape that cannot
 * reach a logo host still ingests its jobs.
 */
import { getVerifiedCompanyLogo, logoKey } from '@/lib/company-logos';
import type { CompanyLogoOverrides } from '@/lib/company-logo-uploads';
import {
  getCompanyDomainDiscovery, isActionableCandidate,
} from '@/lib/server/company-domain-discovery';

export type LogoStatus = 'found' | 'not_found' | 'failed';
export type LogoSource = 'admin_upload' | 'verified' | 'source' | 'website' | 'none';

export interface ResolvedCompanyLogo {
  id: string;
  name: string;
  logoUrl: string;
  status: LogoStatus;
  source: LogoSource;
  checkedAt: number;
}

/** What a caller knows about a company before resolution. */
export interface CompanyHint {
  name: string;
  /** A logo the SOURCE supplied. Authoritative — no provider does today. */
  sourceLogoUrl?: string;
  /** A website an operator configured. Never derived from the name. */
  websiteUrl?: string;
}

/* ── Cache ────────────────────────────────────────────────────────────────
   In-process and bounded. A found logo is stable for a long time; a miss is
   re-checked sooner in case a website or an override is added, and a transient
   failure is retried soonest. Re-probing a permanently logo-less company on
   every scrape would be pure waste. */
const TTL: Record<LogoStatus, number> = {
  found: 24 * 60 * 60_000,
  not_found: 6 * 60 * 60_000,
  failed: 15 * 60_000,
};
const MAX_ENTRIES = 512;
const cache = new Map<string, ResolvedCompanyLogo>();

/** Test seam. */
export function clearCompanyLogoCache(): void { cache.clear(); }

/**
 * Drop ONE company's cached resolution.
 *
 * Called when an operator changes that company's website: the previous answer
 * was computed from different inputs and is now wrong, but every OTHER
 * company's answer is still valid and must not be thrown away.
 */
export function invalidateCompanyLogo(name: string): void {
  const id = logoKey(name);
  if (id) cache.delete(id);
}
export function companyLogoCacheSize(): number { return cache.size; }

/**
 * The stored Super Admin uploads.
 *
 * Imported lazily so this module stays importable from contexts that must not
 * pull in the configuration store, and so a test can inject its own via
 * `deps.overrides` without touching disk.
 */
async function loadAdminOverrides(): Promise<CompanyLogoOverrides> {
  const { getHomepageConfig } = await import('@/lib/server/homepage-config');
  return (await getHomepageConfig()).companyLogos ?? {};
}

function remember(entry: ResolvedCompanyLogo): ResolvedCompanyLogo {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(entry.id, entry);
  return entry;
}

function fresh(entry: ResolvedCompanyLogo, now: number): boolean {
  return now - entry.checkedAt < TTL[entry.status];
}

/* ── URL safety ───────────────────────────────────────────────────────────*/

/** Hosts that must never be fetched — SSRF, in every shape it usually arrives. */
const BLOCKED_HOST = /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|.*\.local|.*\.internal|metadata\.google\.internal)/i;

/**
 * Whether a URL may be fetched for logo discovery.
 *
 * External input decides this, so it is an allow-list: https or http only, a
 * hostname with a dot, and nothing that resolves toward the machine or the
 * private network. `file:`, `data:`, `blob:` and `javascript:` are rejected by
 * the protocol check before anything else runs.
 */
export function isSafeLogoUrl(raw: unknown): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  let u: URL;
  try { u = new URL(s); } catch { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const host = u.hostname.toLowerCase();
  if (!host || !host.includes('.')) return false;
  if (BLOCKED_HOST.test(host)) return false;
  /* A bare IPv4 literal is never a company website and is the usual way an
     SSRF probe reaches an internal service. */
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  return true;
}

/* ── Resolution ───────────────────────────────────────────────────────────*/

const MAX_LOGO_BYTES = 512 * 1024;
const IMAGE_TYPE = /^image\/(png|jpe?g|svg\+xml|webp|gif|x-icon|vnd\.microsoft\.icon)/i;

export interface ResolverDeps {
  /** Injected in tests. Returns headers only — the bytes are never stored here. */
  head?: (url: string) => Promise<{ ok: boolean; contentType: string; contentLength: number } | null>;
  now?: () => number;
  /** Injected in tests. Defaults to the stored Super Admin uploads. */
  overrides?: () => Promise<CompanyLogoOverrides>;
}

/** Confirm a candidate URL actually serves a bounded image. Never throws. */
async function verifyImage(url: string, deps: ResolverDeps): Promise<boolean> {
  if (!isSafeLogoUrl(url)) return false;
  const head = deps.head ?? defaultHead;
  try {
    const res = await head(url);
    if (!res || !res.ok) return false;
    if (!IMAGE_TYPE.test(res.contentType)) return false;
    if (res.contentLength > MAX_LOGO_BYTES) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * A bounded redirect chain, every hop re-validated.
 *
 * MEASURED, not assumed. Rejecting every 3xx outright looked safe but was
 * over-strict: `nagarro.com/favicon.ico` and `erm.com/favicon.ico` both answer
 * 301 — the ordinary apex-to-www redirect — so two real companies resolved to
 * initials while `aecom.com` and `taskus.com`, which answer 200, resolved fine.
 *
 * The protection is unchanged in substance: `redirect: 'manual'` still means
 * nothing is followed blind, EVERY destination is re-validated by
 * isSafeLogoUrl before the next request, and the chain is hard-bounded. A
 * redirect pointing at an internal address is refused exactly as a direct one
 * is — at any hop.
 */
/* TWO, measured against the real corpus: `nagarro.com/favicon.ico` answers
   301 to `www.nagarro.com/favicon.ico`, which answers 302 to a CDN path — an
   ordinary apex → www → asset-host chain. One hop resolved ERM and TaskUs but
   not Nagarro. Two is still a hard bound, and every hop is re-validated. */
const MAX_REDIRECTS = 2;

async function headOnce(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  try {
    return await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'user-agent': 'DoCrudLogoResolver/1.0 (+https://docrud.com)' },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function defaultHead(url: string) {
  let target = url;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const res = await headOnce(target);

      if (res.status >= 300 && res.status < 400) {
        if (hop === MAX_REDIRECTS) return null;
        const location = res.headers.get('location');
        if (!location) return null;
        /* Resolved against the CURRENT url so a relative Location works, then
           re-validated — a redirect must never be a way around the allow-list. */
        let next: string;
        try { next = new URL(location, target).toString(); } catch { return null; }
        if (!isSafeLogoUrl(next)) return null;
        target = next;
        continue;
      }

      return {
        ok: res.ok,
        contentType: res.headers.get('content-type') ?? '',
        contentLength: Number(res.headers.get('content-length') ?? 0),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve ONE company. Cached by identity; never throws.
 *
 * A verified override always wins — it is human-checked, and a discovered
 * asset must never be able to replace it.
 */
export async function resolveCompanyLogo(
  hint: CompanyHint,
  deps: ResolverDeps = {},
): Promise<ResolvedCompanyLogo> {
  const now = (deps.now ?? Date.now)();
  const id = logoKey(hint.name);
  if (!id) {
    return { id: '', name: hint.name, logoUrl: '', status: 'not_found', source: 'none', checkedAt: now };
  }

  const cached = cache.get(id);
  if (cached && fresh(cached, now)) return cached;

  /* 0. A mark a Super Admin uploaded. The highest authority there is: a human
        looked at this company and chose this file. Returned immediately, with
        no network call and without consulting anything below, which is exactly
        what stops an automatic answer from replacing it. */
  try {
    const uploaded = (await (deps.overrides ?? loadAdminOverrides)())[id];
    if (uploaded?.url) {
      return remember({
        id, name: uploaded.name || hint.name, logoUrl: uploaded.url,
        status: 'found', source: 'admin_upload', checkedAt: now,
      });
    }
  } catch {
    /* The store being briefly unreadable must not break resolution — fall
       through to the automatic answers rather than reporting no logo. */
  }

  /* 1. Verified override. Checked first and returned immediately — no network. */
  const verified = getVerifiedCompanyLogo(hint.name);
  if (verified) {
    return remember({ id, name: verified.name, logoUrl: verified.src, status: 'found', source: 'verified', checkedAt: now });
  }

  /* 2. A logo the source supplied. Still validated — a source is not a reason
        to skip the safety checks. */
  if (hint.sourceLogoUrl && await verifyImage(hint.sourceLogoUrl, deps)) {
    return remember({ id, name: hint.name, logoUrl: hint.sourceLogoUrl, status: 'found', source: 'source', checkedAt: now });
  }

  /* 3. An operator-configured website. NEVER a domain derived from the name. */
  if (hint.websiteUrl && isSafeLogoUrl(hint.websiteUrl)) {
    try {
      const origin = new URL(hint.websiteUrl).origin;
      const candidate = `${origin}/favicon.ico`;
      if (await verifyImage(candidate, deps)) {
        return remember({ id, name: hint.name, logoUrl: candidate, status: 'found', source: 'website', checkedAt: now });
      }
    } catch { /* an unparseable website is simply not a source of a logo */ }
  }

  /* 4. Trusted domain discovery — the seam. Today's implementation finds
        nothing (see company-domain-discovery.ts): no provider reports a
        company website and nothing in the repository can supply one without
        guessing. A future trusted provider drops in here and every surface
        picks it up with no further change.

        Only a HIGH-confidence candidate is acted on unattended. Anything
        weaker is treated as not found — a "probably right" brand mark is the
        precise failure this system exists to prevent. */
  try {
    const discovered = await getCompanyDomainDiscovery().resolve({ id, name: hint.name });
    if (isActionableCandidate(discovered) && isSafeLogoUrl(discovered.candidate!.websiteUrl)) {
      const origin = new URL(discovered.candidate!.websiteUrl).origin;
      const candidate = `${origin}/favicon.ico`;
      if (await verifyImage(candidate, deps)) {
        return remember({ id, name: hint.name, logoUrl: candidate, status: 'found', source: 'website', checkedAt: now });
      }
    }
    /* A provider that is momentarily down must not be recorded as "this
       company has no website" for six hours. */
    if (discovered.status === 'FAILED_TEMPORARILY') {
      return remember({ id, name: hint.name, logoUrl: '', status: 'failed', source: 'none', checkedAt: now });
    }
  } catch {
    /* Discovery is best effort and can never break resolution. */
  }

  /* 5. Nothing trustworthy. Recorded so it is not re-probed every scrape. */
  return remember({ id, name: hint.name, logoUrl: '', status: 'not_found', source: 'none', checkedAt: now });
}

/**
 * Resolve MANY companies — one lookup per unique identity.
 *
 * THE POINT OF THIS FUNCTION. Given 1,000 AECOM jobs and 300 Razorpay jobs it
 * performs exactly two resolutions. Callers pass whatever they have; the
 * collapse happens here so no caller has to remember to do it.
 */
export async function resolveCompanyLogos(
  hints: readonly CompanyHint[],
  deps: ResolverDeps = {},
): Promise<Map<string, ResolvedCompanyLogo>> {
  const unique = new Map<string, CompanyHint>();
  for (const hint of hints) {
    const id = logoKey(hint.name);
    if (!id) continue;
    const existing = unique.get(id);
    /* Merge what each mention knows: one job may carry a source logo, another
       a website. Neither is discarded because the other came first. */
    if (existing) {
      unique.set(id, {
        name: existing.name,
        sourceLogoUrl: existing.sourceLogoUrl || hint.sourceLogoUrl,
        websiteUrl: existing.websiteUrl || hint.websiteUrl,
      });
    } else {
      unique.set(id, hint);
    }
  }

  const out = new Map<string, ResolvedCompanyLogo>();
  /* Sequential on purpose: this runs inside ingestion, and a burst of parallel
     requests to a logo host is exactly the behaviour a scraper must not have.
     Cache hits cost nothing, so a warm run does no I/O at all. */
  for (const [id, hint] of Array.from(unique.entries())) {
    out.set(id, await resolveCompanyLogo(hint, deps));
  }
  return out;
}
