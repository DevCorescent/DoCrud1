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

/** Normalizes a display name to its registry key: "MindTickle" → "mindtickle". */
export function logoKey(organizationName?: string | null): string {
  return (organizationName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The verified logo for a company, or null when we have none. Null is a real
 * answer — the caller renders initials rather than inventing a logo.
 */
export function getCompanyLogo(organizationName?: string | null): CompanyLogo | null {
  const key = logoKey(organizationName);
  return key ? REGISTRY[key] ?? null : null;
}
