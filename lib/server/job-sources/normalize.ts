/**
 * The one normalization path from a source adapter to the canonical job.
 *
 * Every adapter returns `NormalizedJob` (lib/server/job-scraper/types.ts),
 * which despite its name is the RAW provider shape: whatever the board sent,
 * lightly tidied. This module turns that into a `CanonicalJobDraft` - the
 * subset of `HiringJobPosting` that a source can legitimately state - so that
 * two adapters describing the same vacancy produce byte-identical output.
 *
 * WHAT IS REUSED, DELIBERATELY. The enum tables and the title normalizer come
 * from lib/server/job-import.ts and the HTML/list helpers from
 * lib/server/job-scraper/normalize.ts. Both already back the CSV import path
 * and are already tested. A second copy of "what does Full Time mean" is how
 * a CSV import and an adapter import end up disagreeing, so there is none.
 *
 * WHAT THIS DOES NOT DO:
 *  - It does not decide identity. That is identity.ts.
 *  - It does not write. That is ingest.ts.
 *  - It does not classify domain or parse a location into city/state. Those
 *    are Phase 4, and the canonical fields for them are left absent rather
 *    than filled with a guess.
 *
 * ABSENT IS NOT EMPTY. A field the source did not state is left undefined, not
 * set to '' or 0. `salaryMin: 0` renders as a salary of zero and is a lie the
 * employer never told; `undefined` is the truth that they said nothing.
 */
import type { HiringJobPosting } from '@/types/document';
import type { NormalizedJob } from '@/lib/server/job-scraper/types';
import {
  EMPLOYMENT_ALIASES, EXPERIENCE_ALIASES, LIMITS, WORKMODE_ALIASES,
  jobContentHash, normalizeEnum, normalizeJobTitle,
} from '@/lib/server/job-import';
import { htmlToText, clip, clipList } from '@/lib/server/job-scraper/normalize';
import { decodeEntities } from '@/lib/server/job-scraper/html';
import { normalizeIndiaLocation } from '@/lib/server/job-scraper/india';
import { canonicalizeJobUrl, jobIdentity, type JobIdentity } from './identity';

/**
 * What a source is allowed to state about a job.
 *
 * Ownership fields (organizationId, createdByUserId, status, minimumAtsScore)
 * are deliberately absent: they are the platform's, not the provider's, and
 * ingest.ts supplies them. A draft therefore cannot overwrite who owns a
 * posting no matter what a board returns.
 */
export type CanonicalJobDraft = Pick<HiringJobPosting,
  | 'title' | 'organizationName' | 'location' | 'department' | 'description'
  | 'responsibilities' | 'requirements' | 'preferredSkills' | 'targetRoleKeywords'
  | 'employmentType' | 'workMode' | 'experienceLevel'
  | 'sourceId' | 'sourceJobId' | 'sourceUrl' | 'canonicalUrl'
  | 'normalizedTitle' | 'contentHash' | 'applyUrl' | 'isActive'
> & {
  postedAt?: string;
  /** The identity this draft resolves to, and the signal that produced it. */
  identity: JobIdentity;
};

/**
 * Collapse whitespace without touching the words.
 *
 * Non-breaking spaces and zero-width characters are the usual noise in scraped
 * text and are invisible in a diff, so two otherwise identical titles hash
 * differently. They are folded to ordinary spaces rather than deleted, because
 * deleting a NBSP would join two words.
 */
export function tidyText(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[   ]/g, ' ')
    .replace(/[​-‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Company name, tidied but NOT semantically rewritten.
 *
 * Only formatting noise goes: whitespace, and a trailing legal suffix is left
 * ALONE. "Acme" and "Acme Inc." are plausibly the same employer, but deciding
 * that is a judgement this layer cannot make safely - and since identity is
 * scoped per source, it never needs to.
 */
export function tidyCompany(raw: unknown): string {
  return clip(tidyText(raw), LIMITS.organizationName);
}

/**
 * Description as plain text.
 *
 * Boards return HTML, entity-escaped text, or plain text depending on the
 * provider. `htmlToText` is the existing converter the scraper already uses,
 * so an Ashby description and a Greenhouse one end up in the same shape.
 * Paragraph breaks survive; only runs of blank lines collapse.
 */
export function tidyDescription(raw: unknown): string {
  const input = String(raw ?? '');
  /* htmlToText short-circuits on input with no '<' and returns it verbatim
     (see job-scraper/html.ts), so an entity-escaped PLAIN-TEXT description —
     which several boards do return — kept its "&amp;" and "&nbsp;" raw. The
     branch is explicit rather than decoding unconditionally, because
     htmlToText already decodes the tagged path and running it twice would
     turn a literal "&amp;lt;" into "<". */
  const text = input.includes('<') ? htmlToText(input) : decodeEntities(input);
  return clip(
    text.replace(/[   ]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    LIMITS.description,
  );
}

/**
 * Location text, canonicalized only where the platform already understands it.
 *
 * `normalizeIndiaLocation` maps a recognized Indian city alias onto its
 * canonical display name ("Bangalore" to "Bengaluru") and returns everything
 * else untouched. That matters beyond tidiness: the Jobs feed's India filters
 * match on these names, so a posting normalized here is findable, and one that
 * is not recognized is left exactly as the employer wrote it rather than being
 * guessed at.
 */
export function tidyLocation(raw: unknown): string {
  const text = tidyText(raw);
  if (!text) return '';
  return clip(normalizeIndiaLocation(text), LIMITS.location);
}

/** A list, de-noised and de-duplicated, order preserved. */
function tidyList(items: unknown): string[] {
  const arr = Array.isArray(items) ? items : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    const value = tidyText(item);
    if (!value) continue;
    /* Case-insensitive de-dup, but the FIRST spelling is what is kept: the
       provider's capitalization is theirs to choose. */
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return clipList(out, LIMITS.arrayItems, LIMITS.arrayItemLen);
}

/**
 * A timestamp the platform is willing to state.
 *
 * Returns undefined for anything unparseable, and for a date in the future or
 * absurdly far past - a board that returns a placeholder like 0 or 9999 must
 * not set a posting's date to 1970 or 2286, because later phases age postings
 * off using it.
 */
export function tidyPostedAt(raw: unknown, now = Date.now()): string | undefined {
  const text = String(raw ?? '').trim();
  if (!text) return undefined;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return undefined;
  /* One day of slack for clock skew between the provider and this server. */
  if (ms > now + 86_400_000) return undefined;
  if (ms < Date.parse('2000-01-01T00:00:00.000Z')) return undefined;
  return new Date(ms).toISOString();
}

/**
 * Turn one adapter result into a canonical draft.
 *
 * Deterministic: the same input always produces the same output, including the
 * identity and the content hash. `now` is injectable so a test can assert that
 * without depending on the clock.
 */
export function normalizeSourceJob(
  job: NormalizedJob,
  options: { sourceId?: string; now?: number } = {},
): CanonicalJobDraft {
  const now = options.now ?? Date.now();
  /* The runner knows which configured source it claimed; the adapter also
     stamps one. The runner's wins when given, because that is the id the queue
     and the health records are keyed by. */
  const sourceId = tidyText(options.sourceId || job.source) || 'unknown';

  const title = clip(tidyText(job.title), LIMITS.title);
  const organizationName = tidyCompany(job.organizationName);
  const location = tidyLocation(job.location);

  /* The posting page identifies the job; the apply link is where a candidate
     is sent. They are often the same, and either may be missing, so identity
     prefers the posting URL and falls back to the apply URL. */
  const sourceUrl = tidyText(job.jobUrl);
  const applyRaw = tidyText(job.applyUrl);
  const canonicalUrl = canonicalizeJobUrl(sourceUrl) || canonicalizeJobUrl(applyRaw);

  /* TRIMMED ONLY, never whitespace-collapsed. An external id is an opaque
     provider token: "a b" and "a  b" are two different postings, and running
     it through tidyText folded them into one key — which is the one failure
     mode this whole layer exists to prevent. Trimming is safe because leading
     and trailing space is transport noise, not part of the token. */
  const sourceJobId = String(job.externalId ?? '').trim() || undefined;

  const responsibilities = tidyList(job.responsibilities);
  const requirements = tidyList(job.requirements);
  const preferredSkills = tidyList(job.preferredSkills);
  const description = tidyDescription(job.description);

  /* An unrecognized enum falls back to the model's own default rather than
     rejecting the posting: the CSV importer rejects a bad row because a human
     can fix the sheet, but dropping a real vacancy because a board wrote
     "Full-time (Permanent)" would silently lose source data. */
  const employmentType = normalizeEnum(String(job.employmentType ?? ''), EMPLOYMENT_ALIASES) ?? 'full_time';
  const workMode = normalizeEnum(String(job.workMode ?? ''), WORKMODE_ALIASES) ?? 'onsite';
  const experienceLevel = normalizeEnum(String(job.experienceLevel ?? ''), EXPERIENCE_ALIASES) ?? 'associate';

  /* Keywords the source stated, else derived from the title exactly as the
     existing posting paths derive them. */
  const targetRoleKeywords = tidyList(
    Array.isArray(job.targetRoleKeywords) && job.targetRoleKeywords.length
      ? job.targetRoleKeywords
      : title.split(/\s+/),
  );

  const draft: CanonicalJobDraft = {
    title,
    organizationName,
    location,
    department: clip(tidyText(job.department), LIMITS.department),
    description,
    responsibilities,
    requirements,
    preferredSkills,
    targetRoleKeywords,
    employmentType,
    workMode,
    experienceLevel,
    sourceId,
    sourceJobId,
    sourceUrl: sourceUrl || undefined,
    canonicalUrl: canonicalUrl || undefined,
    applyUrl: clip(applyRaw || sourceUrl, LIMITS.applyUrl) || undefined,
    normalizedTitle: normalizeJobTitle(title),
    /* Reuses the Phase 1 hash so "has this posting's content changed?" is
       answered the same way everywhere. */
    /* Only the fields jobContentHash defines. The enums are deliberately NOT
       part of it: the Phase 1 hash answers "did the CONTENT change", and a
       board correcting its own employmentType label must not read as a
       rewritten posting. */
    contentHash: jobContentHash({
      title, organizationName, location,
      description, responsibilities, requirements, preferredSkills,
    }),
    isActive: job.isActive !== false,
    postedAt: tidyPostedAt(job.postedAt, now),
    identity: jobIdentity({
      sourceId, sourceJobId, canonicalUrl,
      organizationName, title, location,
    }),
  };

  return draft;
}

/**
 * Whether a draft carries enough to be a real posting.
 *
 * A title and a company are the floor - without either there is nothing to
 * show a candidate. Rejected drafts are REPORTED by the caller, never dropped
 * in silence.
 */
export function draftIsUsable(draft: CanonicalJobDraft): boolean {
  return Boolean(draft.title.trim() && draft.organizationName.trim());
}
