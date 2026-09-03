/**
 * Verified company logos — a static, curated registry.
 *
 * WHY A REGISTRY AND NOT A LOOKUP: the job model carries no company website. A
 * scraped job's only URL is its applyUrl, whose host is the ATS
 * (jobs.ashbyhq.com, jobs.lever.co…), never the employer. Deriving a domain
 * from the display name would be a guess, and a guessed logo is fabricated
 * company information — the exact thing this feed must not show. So each entry
 * below is a company whose official domain was confirmed by hand.
 *
 * WHY THE FILES ARE LOCAL: the logos are vendored under public/company-logos so
 * the browser makes NO third-party request while rendering the feed. A page of
 * 358 cards costs zero external logo calls; the assets are served from the same
 * origin and cached like any other static file.
 *
 * ADDING A COMPANY: confirm the employer's official domain, run
 *   npx tsx scripts/fetch-company-logos.ts
 * and add the entry here. A company with no entry is NOT an error — it falls
 * back to its monogram, which is the honest answer when we cannot prove a logo.
 *
 * ═══ SUPER ADMIN UPLOADS OUTRANK THIS REGISTRY ═══
 *
 * A logo an operator uploaded is checked BEFORE the table below, and this is
 * the single place that decision is made. The audit found three separate logo
 * renderers — the shared CompanyLogo component and private copies inside
 * JobSummaryCard and JobDetailPage — and all three ask THIS function. Putting
 * the override here means an upload reaches job cards, the job detail page, the
 * Company Explorer, the homepage and onboarding without any of them changing,
 * and without a fourth place that decides where a logo comes from.
 *
 * The overrides are injected rather than imported: this module is used on both
 * sides of the wire and must not reach for a database or a network call.
 */

type CompanyLogo = { src: string; name: string };

/** Keyed by the normalized organizationName (see logoKey). */
const REGISTRY: Record<string, CompanyLogo> = {
  ramp: { src: '/company-logos/ramp.png', name: 'Ramp' },
  postman: { src: '/company-logos/postman.png', name: 'Postman' },
  notion: { src: '/company-logos/notion.png', name: 'Notion' },
  vanta: { src: '/company-logos/vanta.png', name: 'Vanta' },
  druva: { src: '/company-logos/druva.png', name: 'Druva' },
  linear: { src: '/company-logos/linear.jpg', name: 'Linear' },
  razorpay: { src: '/company-logos/razorpay.png', name: 'Razorpay' },
  mindtickle: { src: '/company-logos/mindtickle.png', name: 'MindTickle' },
  posthog: { src: '/company-logos/posthog.png', name: 'PostHog' },
  groww: { src: '/company-logos/groww.png', name: 'Groww' },
  atlan: { src: '/company-logos/atlan.png', name: 'Atlan' },
};

/**
 * Marks uploaded through Super Admin, keyed like the registry.
 *
 * Module-level and replaced wholesale. On the server it is filled from the
 * stored configuration; in the browser, once, from the public endpoint.
 */
let overrides: Record<string, string> = {};
const listeners = new Set<() => void>();

/** Replaces the override set and tells anything rendering a logo to re-read. */
export function setCompanyLogoOverrides(next: Record<string, string> | null | undefined): void {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(next ?? {})) {
    const id = logoKey(key);
    const url = String(value ?? '').trim();
    /* A same-origin path or https only — never `javascript:` or `data:`, no
       matter what a stored record or an API response contained. */
    if (id && (url.startsWith('/') || url.startsWith('https://'))) clean[id] = url;
  }
  overrides = clean;
  listeners.forEach((fn) => { try { fn(); } catch { /* a bad listener must not stop the rest */ } });
}

/** Subscribe to override changes. Returns the unsubscribe function. */
export function subscribeCompanyLogoOverrides(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** A cheap identity for the current override set, for useSyncExternalStore. */
export function companyLogoOverrideVersion(): string {
  return String(Object.keys(overrides).length) + ':' + Object.values(overrides).join('|');
}

/** The uploaded mark for a company, if an operator set one. */
export function getCompanyLogoOverride(organizationName?: string | null): string | null {
  const key = logoKey(organizationName);
  return key ? overrides[key] ?? null : null;
}

/** Normalizes a display name to its registry key: "MindTickle" → "mindtickle". */
export function logoKey(organizationName?: string | null): string {
  return (organizationName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The verified logo for a company, or null when we have none. Null is a real
 * answer — the caller renders initials rather than inventing a logo.
 */
/**
 * The CURATED entry only — overrides deliberately not consulted.
 *
 * The resolver needs this to report an honest `source`: it handles uploads
 * itself at step 0, and if its step 1 asked `getCompanyLogo` it would receive
 * an uploaded mark and label it `verified`. Callers that just want "the logo"
 * should use `getCompanyLogo`.
 */
export function getVerifiedCompanyLogo(organizationName?: string | null): CompanyLogo | null {
  const key = logoKey(organizationName);
  return key ? REGISTRY[key] ?? null : null;
}

export function getCompanyLogo(organizationName?: string | null): CompanyLogo | null {
  const key = logoKey(organizationName);
  if (!key) return null;
  /* An operator's choice comes first, always. Nothing automatic can displace
     it — the registry below is only consulted when there is no upload. */
  const uploaded = overrides[key];
  if (uploaded) return { src: uploaded, name: organizationName || key };
  return REGISTRY[key] ?? null;
}
