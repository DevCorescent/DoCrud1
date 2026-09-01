/**
 * Stable job identity.
 *
 * ONE question is answered here: "have I seen this exact posting before?"
 * Nothing in this file writes, fetches or normalizes content — it takes an
 * already-normalized job and returns a key plus the reason that key was chosen.
 *
 * WHY IDENTITY IS RANKED, NOT COMBINED. Three signals are available and they
 * are not equally trustworthy, so they are tried in order and the FIRST one
 * that applies wins. Blending them (hashing all three together) would mean a
 * job whose description was edited got a different key from the same job
 * yesterday, and the platform would store it twice.
 *
 *   1. EXTERNAL ID  - `sourceId` + the provider's own job id. The provider
 *      guarantees this is stable for the life of the posting, which is exactly
 *      the guarantee identity needs. Always preferred when present.
 *
 *   2. CANONICAL URL - the posting's own address with tracking noise removed.
 *      Reliable but weaker: a provider may serve one posting at several URLs,
 *      or reuse a slug.
 *
 *   3. FINGERPRINT  - a hash of company + normalized title + location + source.
 *      A LAST RESORT, and deliberately conservative. It is scoped to one
 *      source, so it can never merge postings from two different providers.
 *
 * THE CONSERVATIVE BIAS. Where two jobs are ambiguous the system keeps them
 * apart. Storing the same job twice is a visible, fixable annoyance; merging
 * two different jobs destroys one of them and is not recoverable from the
 * stored data. Every rule below is written with that asymmetry in mind.
 */
import { createHash } from 'crypto';
import { normalizeJobTitle } from '@/lib/server/job-import';

/** Which signal produced an identity. Stored in run reports so it is auditable. */
export type IdentityBasis = 'external_id' | 'canonical_url' | 'fingerprint';

export interface JobIdentity {
  /** The dedup key. Stable across runs for the same posting. */
  key: string;
  basis: IdentityBasis;
}

/* -- URL canonicalization ------------------------------------------------ */

/**
 * Query parameters that never identify a posting.
 *
 * An explicit REMOVE list rather than a strip-everything rule: many boards put
 * the job id in the query string (`?gh_jid=123`, `?jobId=456`), so dropping
 * unknown parameters would collapse every posting on such a board into one.
 * Only parameters known to be analytics or referral noise are removed;
 * anything unrecognized is KEPT, because keeping a parameter can at worst
 * split one job into two, while dropping one can merge two into one.
 */
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
  'gclid', 'gclsrc', 'dclid', 'fbclid', 'msclkid', 'yclid', 'twclid',
  'mc_cid', 'mc_eid', 'igshid', 'ttclid', 'li_fat_id',
  '_ga', '_gl', '_hsenc', '_hsmi', 'hsa_acc', 'hsa_cam', 'hsa_grp',
  'ref', 'referer', 'referrer', 'trk', 'trkinfo', 'src', 'source_id',
  'campaign', 'campaignid', 'adgroupid', 'adid', 'utm', 'spm',
]);

/**
 * A posting URL reduced to the part that identifies it.
 *
 * Returns '' for anything that is not a usable absolute http(s) URL. A caller
 * must treat '' as "no URL signal" and never as a key, or every malformed URL
 * in a batch would dedup against every other.
 *
 * Deterministic by construction: the surviving parameters are sorted, so two
 * orderings of the same query produce one key.
 */
export function canonicalizeJobUrl(raw: string): string {
  const input = String(raw ?? '').trim();
  if (!input) return '';

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return '';
  }
  /* Only web URLs identify a posting. A javascript: or data: value reaching
     here is malformed input, not an address. */
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  if (!url.hostname) return '';

  /* http and https of the same address are the same posting, so the scheme is
     normalized away rather than being allowed to split one job into two. */
  url.protocol = 'https:';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  /* A default port is the same address written differently. */
  if (url.port === '443' || url.port === '80') url.port = '';
  /* A fragment addresses a position within a page, never a different posting. */
  url.hash = '';
  url.username = '';
  url.password = '';

  /* Names are collected BEFORE deleting: mutating the params while iterating
     them skips entries. Array.from rather than a spread so the file compiles
     against the project's existing tsconfig target. */
  const names: string[] = [];
  url.searchParams.forEach((_value, name) => { names.push(name); });
  for (const name of names) {
    if (TRACKING_PARAMS.has(name.toLowerCase())) url.searchParams.delete(name);
  }
  /* Sorted so ?a=1&b=2 and ?b=2&a=1 are one key. */
  url.searchParams.sort();

  /* A trailing slash is a formatting difference, not a different page - but
     the root path must keep its slash to stay a valid URL. */
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  }

  const query = url.searchParams.toString();
  return `https://${url.host}${url.pathname}${query ? `?${query}` : ''}`;
}

/* -- Identity ------------------------------------------------------------ */

const hash = (value: string): string =>
  createHash('sha256').update(value).digest('hex').slice(0, 32);

/** The identity inputs. A subset of the canonical draft, so tests need no job. */
export interface IdentityInput {
  /** The adapter that produced this, e.g. 'lever:acme'. Always scopes the key. */
  sourceId: string;
  /** The provider's own id for the posting, when it supplied one. */
  sourceJobId?: string;
  /** Canonicalized or raw - this function canonicalizes defensively. */
  canonicalUrl?: string;
  organizationName?: string;
  title?: string;
  location?: string;
}

const norm = (v?: string): string =>
  String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The identity of one posting, and why.
 *
 * EVERY key is scoped by `sourceId`. Two providers advertising the same real
 * vacancy therefore produce two records, on purpose: proving that two postings
 * are the same employer vacancy needs evidence this layer does not have, and
 * `dedupGroupId` on the canonical model is the field reserved for that
 * question once a later phase can answer it. Same-source repetition - the
 * actual problem, since every run re-fetches the whole board - is fully
 * handled here.
 */
export function jobIdentity(input: IdentityInput): JobIdentity {
  const source = norm(input.sourceId) || 'unknown';

  const externalId = String(input.sourceJobId ?? '').trim();
  if (externalId) {
    /* Hashed rather than concatenated raw: provider ids contain slashes,
       spaces and unicode, and a raw key would be ambiguous the moment one
       contained the separator. */
    return { key: `eid:${hash(`${source} ${externalId}`)}`, basis: 'external_id' };
  }

  const url = canonicalizeJobUrl(input.canonicalUrl ?? '');
  if (url) {
    return { key: `url:${hash(`${source} ${url}`)}`, basis: 'canonical_url' };
  }

  /* LAST RESORT. Company + normalized title + location, scoped to the source.
     This is the weakest signal and the known risk applies directly to it: two
     genuinely different openings for the same role, company and city WILL
     collide here. That is accepted only because it is reached only when the
     provider gave neither an id nor a usable URL, which for the adapters in
     this repo does not happen - every ATS provider supplies both. `basis`
     records when it was used, so a run report can surface it. */
  const fingerprint = [
    source,
    norm(input.organizationName),
    normalizeJobTitle(String(input.title ?? '')),
    norm(input.location),
  ].join(' ');
  return { key: `fp:${hash(fingerprint)}`, basis: 'fingerprint' };
}

/** True when two identities refer to the same posting. */
export function sameJob(a: JobIdentity, b: JobIdentity): boolean {
  return a.key === b.key;
}
