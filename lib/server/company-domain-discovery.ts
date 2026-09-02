/**
 * Company domain discovery — the seam, and today's honest answer.
 *
 * ═══ THE MISSING HALF ═══
 *
 * DoCrud already has the second half of the problem solved:
 *
 *     trusted domain  →  favicon  →  logo  →  cache  →  CompanyLogo
 *
 * What it has never had is the first half:
 *
 *     "AECOM"  →  ???  →  aecom.com
 *
 * Every existing logo got its domain from a HUMAN. scripts/fetch-company-logos.ts
 * carries a hand-written map (`atlan: 'atlan.com'`, `razorpay: 'razorpay.com'`)
 * and its header is explicit: each domain "is one a human confirmed — never
 * derived from a job's applyUrl (that host is the ATS, not the employer) and
 * never guessed from a display name."
 *
 * ═══ WHY THIS FILE IS A NO-OP ═══
 *
 * A full audit of the repository found no trustworthy discovery source: no
 * search integration, no company database, no organization records carrying a
 * website, and no ATS provider that reports one. Every provider URL identifies
 * the JOB BOARD — boards.greenhouse.io, jobs.lever.co, jobs.ashbyhq.com — not
 * the employer.
 *
 * The only mechanism that would work without one is `name + ".com"`, and that
 * is forbidden for a good reason: a domain answering 200 is not evidence it
 * belongs to the company, and a favicon existing is not evidence either. The
 * failure mode is rendering another company's brand mark, which is worse than
 * showing initials.
 *
 * So this returns NOT_FOUND. Deliberately, and not as a placeholder to fill in
 * with a heuristic later.
 *
 * ═══ WHAT IT BUYS ═══
 *
 * The resolver already calls through this interface. A future trusted provider
 * — a licensed enrichment API, an internal company registry — implements
 * `resolve()` and is injected. Nothing else changes: not CompanyLogo, not the
 * resolver's priority, not Source Status, not Company Explorer, not the jobs
 * page.
 */

export type DomainConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface CompanyDomainCandidate {
  companyId: string;
  companyName: string;
  websiteUrl: string;
  confidence: DomainConfidence;
  source: 'verified' | 'admin' | 'provider' | 'trusted-enrichment' | 'existing-company-data';
}

export interface CompanyDomainResolution {
  status: 'FOUND' | 'NOT_FOUND' | 'FAILED_TEMPORARILY';
  candidate?: CompanyDomainCandidate;
}

export interface CompanyDomainDiscovery {
  resolve(company: { id: string; name: string }): Promise<CompanyDomainResolution>;
}

/**
 * The current implementation. Finds nothing, and says so.
 *
 * It takes the company as an argument and ignores it ON PURPOSE — there is
 * nothing it could legitimately do with a name that would not be a guess.
 */
export const NoopCompanyDomainDiscovery: CompanyDomainDiscovery = {
  async resolve(): Promise<CompanyDomainResolution> {
    return { status: 'NOT_FOUND' };
  },
};

/**
 * Only a candidate this confident may be used without a human confirming it.
 *
 * MEDIUM and LOW are treated as NOT_FOUND by the resolver. A "probably right"
 * company logo is the exact failure this system exists to prevent, so the bar
 * for acting unattended is the highest one.
 */
export const MIN_AUTO_CONFIDENCE: DomainConfidence = 'HIGH';

export function isActionableCandidate(res: CompanyDomainResolution): boolean {
  return res.status === 'FOUND'
    && Boolean(res.candidate?.websiteUrl)
    && res.candidate?.confidence === MIN_AUTO_CONFIDENCE;
}

/** The discovery in force. Swapped for a real provider when one exists. */
let active: CompanyDomainDiscovery = NoopCompanyDomainDiscovery;

export function getCompanyDomainDiscovery(): CompanyDomainDiscovery { return active; }

/** Injection point — for a future provider, and for tests. */
export function setCompanyDomainDiscovery(next: CompanyDomainDiscovery | null): void {
  active = next ?? NoopCompanyDomainDiscovery;
}
