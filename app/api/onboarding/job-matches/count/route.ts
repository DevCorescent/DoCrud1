/**
 * POST /api/onboarding/job-matches/count — how many published postings match
 * a candidate's onboarding answers. One integer and its display bucket.
 *
 * ═══ THE SAME NUMBER THE HOMEPAGE WOULD SHOW ═══
 *
 * The count is produced by lib/server/onboarding-match-count.ts, which scores
 * the published corpus with the recommendation engine exactly as the homepage
 * "Job matches" tile does — same profile builder, same scorer, same
 * `isRecommended` rule. The answers become the profile the way signup will
 * persist them, so the figure here is the figure the member sees on the
 * homepage the moment their account exists.
 *
 * ═══ PRE-AUTH, AND WHAT THAT MEANS ═══
 *
 * No session is read, because there is none yet. Nothing user-scoped is read
 * either: the only inputs are the answers in the body and the public corpus.
 * The answers pass through `coerceOnboarding` — the same caps the signup and
 * OAuth-intent paths apply — and the route is rate-limited per address with
 * the shared limiter, in the same order signup/start does it.
 *
 * The recommendations API is untouched: this does not call it, relax it, or
 * share its per-member caches. Applied-job exclusion belongs to the signed-in
 * personalized feed; a candidate with no account has applied to nothing.
 *
 * ═══ A FAILED READ IS NOT ZERO ═══
 *
 * A corpus read failure reaches the catch and answers 503 with no `total`.
 * "0 matches" is the engine's answer for a profile with no signals and only
 * ever that; it is never what a broken read looks like.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPublishedHiringJobs } from '@/lib/server/hiring';
import { readHiringCorpusVersion } from '@/lib/server/db/hiring-jobs-collection';
import { corpusVersionKey } from '@/lib/server/recommendation-refresh';
import { recFeaturesFor } from '@/lib/server/recommendation-features';
import { hasProfileSignals } from '@/lib/server/job-recommend';
import { coerceOnboarding } from '@/lib/server/oauth-intent';
import { enforceRateLimits, getClientIp, RATE_POLICIES } from '@/lib/server/security/rate-limit';
import {
  countOnboardingMatches, matchBucket, matchCountKey, memoizedMatchCount, onboardingRecProfile,
} from '@/lib/server/onboarding-match-count';

export const dynamic = 'force-dynamic';

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await enforceRateLimits([
      { key: `onboarding:match-count:ip:${ip}`, policy: RATE_POLICIES.onboardingMatchCountIp },
    ]);
    if (limited) return limited;

    /* A body that is not a JSON object is an invalid request, not a candidate
       with no matches — it is refused, never counted as zero. */
    let body: unknown;
    try { body = await req.json(); } catch { body = undefined; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
    }
    const answers = coerceOnboarding((body as { onboarding?: unknown }).onboarding) ?? {};

    /* No skills means nothing to match on. That is the engine's 0 — the same
       0 the homepage tile shows a member whose profile carries no signals —
       and it costs no corpus read. */
    if (!hasProfileSignals(onboardingRecProfile(answers))) {
      return NextResponse.json({ total: 0, bucket: 0 }, NO_STORE);
    }

    /* The published corpus and its version, as the personalized feed reads
       them. NOT `.catch(() => [])` on the corpus: a storage failure must reach
       the catch below and answer 503, never render as "no matches". */
    const [jobs, version] = await Promise.all([
      getPublishedHiringJobs(),
      readHiringCorpusVersion().catch(() => null),
    ]);
    const versionKey = corpusVersionKey(version);

    const total = await memoizedMatchCount(matchCountKey(versionKey, answers), async () => {
      /* Derived once per corpus version and shared with the personalized feed.
         `null` means the scorer scans descriptions inline — slower, never different. */
      const features = await recFeaturesFor(versionKey, jobs as unknown as Array<Record<string, unknown>>).catch(() => null);
      return countOnboardingMatches(jobs as unknown as Array<Record<string, unknown>>, answers, Date.now(), features);
    });

    return NextResponse.json({ total, bucket: matchBucket(total) }, NO_STORE);
  } catch {
    return NextResponse.json({ error: 'Job matches are temporarily unavailable.' }, { status: 503 });
  }
}
