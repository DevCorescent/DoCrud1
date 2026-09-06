/**
 * One company's open jobs, ranked by the viewer's match.
 *
 * THE EXPENSIVE WORK LIVES HERE, not on the homepage. Ranking runs only once a
 * visitor has actually chosen a company, and only over that company's postings
 * — never the whole corpus.
 *
 * IT REUSES THE EXISTING ENGINE. `buildRecProfile` + `recommendMatch` are the
 * same functions /api/recommendations/jobs uses, called with the same
 * arguments. Nothing about scoring, weighting or ordering is reimplemented, and
 * a signed-out visitor simply gets the jobs unranked rather than a fabricated
 * score.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { getProfileFields } from '@/lib/server/user-profiles';
import { getPublishedHiringJobs } from '@/lib/server/hiring';
import { mergeResumeSignals } from '@/lib/server/recommend-profile';
import {
  buildRecProfile, hasProfileSignals, recommendMatch, type RecJob,
} from '@/lib/server/job-recommend';
import { logoKey, getCompanyLogo } from '@/lib/company-logos';
import { isValidApplyUrl } from '@/lib/jobs-ui';
import { paginate } from '@/lib/server/job-api/queries';

export const dynamic = 'force-dynamic';

/**
 * The ranked list for one company and one viewer, briefly remembered.
 *
 * Ranking reads EVERY published posting (the corpus is a few thousand and most
 * of its bytes are descriptions), filters to this employer, and scores each one
 * against the viewer's profile. Page 1 pays that. Without this, so did page 2,
 * and page 3 — asking for twenty more roles re-read and re-scored the whole
 * corpus, which is the most expensive possible way to slice an array that was
 * already computed a second earlier.
 *
 * Keyed by company AND viewer, because the ORDER is personal — two people
 * paging the same employer must never be served each other's ranking. Short
 * TTL so a newly published role appears without a deploy, and bounded so a
 * crawler walking every company cannot grow it without limit.
 */
const RANK_TTL = 60_000;
const RANK_MAX = 64;
type RankedEntry = { at: number; value: RankedJob[] };
const rankCache = new Map<string, RankedEntry>();

function readRanked(key: string): RankedJob[] | null {
  const hit = rankCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > RANK_TTL) { rankCache.delete(key); return null; }
  return hit.value;
}

function writeRanked(key: string, value: RankedJob[]) {
  /* Oldest out first. A Map iterates in insertion order, so the first key is
     the least recently written. */
  if (rankCache.size >= RANK_MAX) {
    const oldest = rankCache.keys().next().value;
    if (oldest !== undefined) rankCache.delete(oldest);
  }
  rankCache.set(key, { at: Date.now(), value });
}

type RankedJob = {
  raw: Record<string, unknown>;
  recJob: RecJob;
  match: ReturnType<typeof recommendMatch> | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: { companyId: string } },
) {
  const companyId = logoKey(params.companyId);
  if (!companyId) return NextResponse.json({ error: 'Unknown company.' }, { status: 404 });

  const session = await getAuthSession().catch(() => null);
  const meId = session?.user ? await resolveSessionUserId(session).catch(() => null) : null;

  const q = request.nextUrl.searchParams;
  const cacheKey = `${companyId}::${meId ?? 'anon'}`;
  const cached = readRanked(cacheKey);

  if (cached) return respond(cached, companyId, q);

  /* The job list and the viewer's profile are independent. */
  const [allJobs, fields] = await Promise.all([
    getPublishedHiringJobs().catch(() => []),
    meId
      ? getProfileFields(meId, ['headline', 'skills', 'location', 'experience', 'interests', 'resumeFiles'])
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  /* Scoped by the SAME identity the strip and the logo registry use, so a
     company whose name the scraper spells three ways resolves to one page. */
  const jobs = (allJobs as unknown as Array<Record<string, unknown>>)
    .filter((j) => logoKey(String(j.organizationName ?? '')) === companyId);

  if (jobs.length === 0) {
    return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
  }

  const signals = mergeResumeSignals(
    fields as Parameters<typeof mergeResumeSignals>[0],
    (fields as { resumeFiles?: Parameters<typeof mergeResumeSignals>[1] })?.resumeFiles,
  );
  const profile = buildRecProfile(signals as Parameters<typeof buildRecProfile>[0]);
  /* No profile means no score. An unscored job is returned WITHOUT a number
     rather than with a zero, which would read as "you are a bad fit". */
  const scored = hasProfileSignals(profile);
  const now = Date.now();

  /* RANK on a lightweight key, PAGE, then serialize only that page.
     A company can hold a thousand postings — AECOM currently has 1,001 — and
     building a row object for every one of them produced a 362 KB response to
     show twenty. Scoring still covers the whole set, because the ORDER depends
     on it; only the serialization is bounded. */
  const ranked = jobs.map((j) => {
    const recJob: RecJob = {
      id: String(j.id ?? ''),
      title: String(j.title ?? ''),
      organizationName: String(j.organizationName ?? ''),
      location: String(j.location ?? ''),
      employmentType: String(j.employmentType ?? ''),
      workMode: String(j.workMode ?? ''),
      experienceLevel: String(j.experienceLevel ?? ''),
      description: String(j.description ?? ''),
      preferredSkills: Array.isArray(j.preferredSkills) ? (j.preferredSkills as string[]) : [],
      targetRoleKeywords: Array.isArray(j.targetRoleKeywords) ? (j.targetRoleKeywords as string[]) : [],
      createdAt: String(j.createdAt ?? ''),
    };
    const match = scored ? recommendMatch(profile, recJob, now) : null;
    return { raw: j, recJob, match };
  });

  /* DESCENDING by match, then by id so a tie is stable across requests and
     paging can never repeat or skip a role. Unscored keeps newest-first. */
  ranked.sort((a, b) => scored
    ? (b.match?.score ?? 0) - (a.match?.score ?? 0) || a.recJob.id.localeCompare(b.recJob.id)
    : String(b.recJob.createdAt).localeCompare(String(a.recJob.createdAt))
      || a.recJob.id.localeCompare(b.recJob.id));

  writeRanked(cacheKey, ranked);
  return respond(ranked, companyId, q);
}

/**
 * Page and serialize an already-ranked list.
 *
 * Split out so the cached path and the freshly-ranked path produce byte-for-byte
 * the same response — a cache that answers differently from the thing it caches
 * is worse than no cache.
 */
function respond(ranked: RankedJob[], companyId: string, q: URLSearchParams) {
  const displayName = String(ranked[0]?.recJob.organizationName ?? '');
  const logo = getCompanyLogo(displayName);
  const page = paginate(ranked, q.get('page') ?? undefined, q.get('pageSize') ?? undefined);

  const rows = page.items.map(({ raw, recJob, match }) => ({
    id: recJob.id,
    title: recJob.title || 'Open role',
    location: recJob.location,
    employmentType: recJob.employmentType,
    workMode: recJob.workMode,
    experienceLevel: recJob.experienceLevel,
    preferredSkills: (recJob.preferredSkills ?? []).slice(0, 6),
    createdAt: recJob.createdAt,
    applyUrl: isValidApplyUrl(String(raw.applyUrl ?? '')) ? String(raw.applyUrl) : '',
    ...(match ? { matchScore: match.score, matchReasons: match.reasons } : {}),
  }));

  /* Insights describe the WHOLE company, not the page — an average over twenty
     rows would change as the visitor pages, which is not what "your average"
     means. Computed from the scores actually produced; with no profile there
     are none, so the block is omitted rather than filled with zeroes. */
  const withScores = ranked.filter((r) => typeof r.match?.score === 'number')
    .map((r) => r.match!.score);
  const insights = withScores.length > 0
    ? {
        averageMatch: Math.round(withScores.reduce((sum, s) => sum + s, 0) / withScores.length),
        topMatch: Math.max(...withScores),
        scoredJobs: withScores.length,
      }
    : null;

  return NextResponse.json({
    company: {
      id: companyId,
      name: logo?.name ?? displayName,
      logoUrl: logo?.src ?? '',
      /* The company's REAL total, not the page size. */
      jobCount: page.total,
    },
    insights,
    jobs: rows,
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
  });
}
