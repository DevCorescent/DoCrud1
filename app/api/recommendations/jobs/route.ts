/**
 * Recommended jobs for the viewer.
 *
 * Ranks the existing published hiring jobs against the viewer's EXISTING stored
 * profile using the deterministic scorer in lib/server/job-recommend.ts. The
 * profile is always the current SESSION's (resolveSessionUserId) — a client can
 * never request another user's recommendations. No new job system, no fabricated
 * postings; when there are no jobs it returns an empty list.
 */
import { NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { getProfileFields } from '@/lib/server/user-profiles';
import { getPublishedHiringJobs } from '@/lib/server/hiring';
import { getFeedConfig } from '@/lib/server/feed-config';
import { buildRecProfile, hasProfileSignals, isRecommended, recommendMatch, type RecJob } from '@/lib/server/job-recommend';
import { mergeResumeSignals } from '@/lib/server/recommend-profile';
import { isValidApplyUrl } from '@/lib/jobs-ui';
import { registerRecommendationCache, rememberViewerCount } from '@/lib/server/recommendation-cache';
import { getHiringApplications } from '@/lib/server/hiring';
import { personalizedPage } from '@/lib/server/job-api/personalized';
import { buildEligibilityProfile } from '@/lib/server/job-sources/eligibility';
import type { MatchCandidate } from '@/lib/server/job-sources/ats-match';

export const dynamic = 'force-dynamic';

/* ─── per-viewer result cache ─────────────────────────────────────────────
   Ranking scores every published posting against the viewer's profile. One
   homepage load asked for it TWICE — the headline count and the recommended
   carousel — and the jobs page asks again, so the same 360-job scoring pass ran
   three times for one visit and returned identical results each time.

   Keyed by viewer AND scope, because the trimmed row and the full recommended
   set are different payloads. Session-scoped by construction: a signed-out
   viewer is keyed 'anon' and can never be served another member's data. Same
   one-minute window and same shape the people route already uses. */
type RecsPayload = { jobs: unknown[]; total: number };
type CachedRecs = { payload: RecsPayload; ts: number };

/** Inside this window the cached answer is served as-is. */
const CACHE_TTL = 60_000;
/**
 * Past CACHE_TTL but inside this window the cached answer is STILL served —
 * immediately — while a single background pass refreshes it.
 *
 * Why: an expired entry used to mean the caller waited for a full recompute.
 * Measured, that is ~560 ms with a warm corpus and tens of seconds with a cold
 * one, and it lands on a real person opening the page. The result served is one
 * this same code computed minutes ago with the same algorithm, so nothing about
 * ranking changes — only who waits for it. A job write clears the cache
 * outright (see recommendation-cache.ts), so a genuinely new posting is never
 * hidden behind staleness.
 */
const STALE_TTL = 10 * 60_000;

const cache = new Map<string, CachedRecs>();
/* Registered so a job write can clear it — see lib/server/recommendation-cache.ts. */
registerRecommendationCache(cache);

/**
 * Background refreshes in flight, keyed exactly like the cache.
 *
 * Single-flight: twenty stale requests trigger ONE recompute, not twenty. A
 * failed refresh removes its entry so the next request may retry, and never
 * poisons the cached value that is still being served.
 */
const refreshing = new Map<string, Promise<void>>();

/**
 * The ranking pass. Identical to what the route always did — extracted only so
 * a background refresh can run it without duplicating a line of logic.
 */
async function computeRecommendations(
  meId: string | null,
  scope: 'row' | 'recommended',
): Promise<RecsPayload> {
    const config = await getFeedConfig();
    if (!config.jobs.enabled) return { jobs: [], total: 0 };

    /* The job list and the viewer's profile are independent reads; they were
       being awaited one after the other. */
    const [jobs, fields] = await Promise.all([
      getPublishedHiringJobs().catch(() => [] as Awaited<ReturnType<typeof getPublishedHiringJobs>>),
      meId
        /* resumeFiles joins the projection so an uploaded CV can fill in
           signals the member never typed — see lib/server/recommend-profile.ts.
           It is the same single read, one field wider. */
        ? getProfileFields(meId, ['headline', 'skills', 'location', 'experience', 'interests', 'resumeFiles']).catch(() => null)
        : Promise.resolve(null),
    ]);
    if (!Array.isArray(jobs) || jobs.length === 0) return { jobs: [], total: 0 };

    /* Profile first, parsed resume second. The scorer is unchanged; it is
       simply given a fuller description of the viewer. */
    const signals = mergeResumeSignals(
      fields as Parameters<typeof mergeResumeSignals>[0],
      (fields as { resumeFiles?: Parameters<typeof mergeResumeSignals>[1] })?.resumeFiles,
    );
    const profile = buildRecProfile(signals as Parameters<typeof buildRecProfile>[0]);
    const showMatch = hasProfileSignals(profile);
    const now = Date.now();

    const scored = (jobs as unknown as Array<Record<string, unknown>>).map((j) => {
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
      const match = recommendMatch(profile, recJob, now);
      const job: Record<string, unknown> = {
        id: recJob.id,
        title: recJob.title || 'Open role',
        organizationName: recJob.organizationName,
        location: recJob.location,
        employmentType: recJob.employmentType,
        workMode: recJob.workMode,
        preferredSkills: (recJob.preferredSkills ?? []).slice(0, 4),
        // The REAL original application URL (Ashby/Lever/Greenhouse) carried through
        // untouched — powers the "Apply Now" action + source attribution in the UI.
        applyUrl: isValidApplyUrl(String(j.applyUrl ?? '')) ? String(j.applyUrl) : '',
        createdAt: recJob.createdAt,
      };
      if (showMatch) {
        job.matchScore = match.score;
        job.matchReasons = match.reasons;
        /* The specifics behind the number. Empty fields are omitted rather
           than sent as empty arrays, so a card can test for presence. */
        if (match.summary) job.matchSummary = match.summary;
        if (match.factors.length) job.matchFactors = match.factors;
        if (match.matchedSkills.length) job.matchedSkills = match.matchedSkills.slice(0, 12);
        if (match.missingSkills.length) job.missingSkills = match.missingSkills.slice(0, 8);
      }
      return { score: showMatch ? match.score : 0, recommended: showMatch && isRecommended(match), job };
    });

    scored.sort((a, b) => b.score - a.score || Date.parse(String(b.job.createdAt)) - Date.parse(String(a.job.createdAt)));
    /* THE RECOMMENDED SET: roles that genuinely overlap the viewer's profile
       (a shared skill or a matching role), not merely everything that scored
       above zero — "remote" and "posted recently" alone score 18 on every
       listing, which made the old count read like the whole job board. With no
       profile signals nothing can be recommended, and the count is honestly 0.

       `total` is that set's real size, BEFORE maxCards trims the carousel, so
       the homepage headline never shrinks to the size of a row. */
    const recommended = scored.filter((s) => s.recommended);
    const total = recommended.length;

    /* scope 'recommended' returns the whole recommended set instead of the
       carousel's worth — what /jobs?recommended=1 renders, so the page can
       never show fewer roles than the headline promised. */
    const list = scope === 'recommended'
      ? recommended.map((s) => s.job)
      : scored.slice(0, config.jobs.maxCards).map((s) => s.job);

    const payload: RecsPayload = { jobs: list, total };
    cache.set(`${meId ?? 'anon'}:${scope}`, { payload, ts: Date.now() });
    /* Remembered so the homepage can render this number on the NEXT server
       render without re-running the ranking that produced it. */
    if (meId) rememberViewerCount(meId, 'jobs', total);
    return payload;
}

/**
 * Phase 11 — the personalized page: ranked, applied-excluded, ATS- and
 * eligibility-enriched.
 *
 * A SEPARATE SCOPE ON PURPOSE. The homepage carousel and the jobs directory
 * both read the scopes above and neither wants the cost of an ATS pass, so
 * this path is entered only when it is asked for by name. Their payloads are
 * untouched.
 *
 * The ranking itself is NOT redone here — the same scorer orders the list, and
 * personalizedPage preserves that order exactly.
 */
async function computePersonalized(
  meId: string | null,
  page: number,
  pageSize: number,
) {
  const config = await getFeedConfig();
  if (!config.jobs.enabled || !meId) {
    return { items: [], page: 1, pageSize, total: 0, scored: false };
  }

  const [jobs, fields, applications] = await Promise.all([
    getPublishedHiringJobs().catch(() => [] as Awaited<ReturnType<typeof getPublishedHiringJobs>>),
    getProfileFields(meId, ['headline', 'bio', 'skills', 'location', 'experience', 'interests', 'resumeFiles']).catch(() => null),
    /* Scoped to THIS viewer. The applied set is the reason a job leaves the
       feed, so it must never be another member's. */
    getHiringApplications().then((all) => all.filter((a) => a?.candidateUserId === meId)).catch(() => []),
  ]);
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return { items: [], page: 1, pageSize, total: 0, scored: false };
  }

  const signals = mergeResumeSignals(
    fields as Parameters<typeof mergeResumeSignals>[0],
    (fields as { resumeFiles?: Parameters<typeof mergeResumeSignals>[1] })?.resumeFiles,
  );
  const profile = buildRecProfile(signals as Parameters<typeof buildRecProfile>[0]);
  const showMatch = hasProfileSignals(profile);
  const now = Date.now();

  /* The SAME ranking pass the other scopes use, so the personalized feed and
     the carousel cannot disagree about which jobs matched or why. */
  const reasons = new Map<string, string[]>();
  const summaries = new Map<string, string>();
  const factors = new Map<string, Array<{ kind: string; label: string; detail: string; points: number; max: number }>>();
  const missing = new Map<string, string[]>();
  const scored = (jobs as unknown as Array<Record<string, unknown>>).map((j) => {
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
    const match = recommendMatch(profile, recJob, now);
    if (showMatch) {
      reasons.set(recJob.id, match.reasons);
      /* Filled in the SAME pass that produced the score, so the explanation a
         person reads is the one that actually ranked the job — not a second
         pass that could disagree with the first. */
      if (match.summary) summaries.set(recJob.id, match.summary);
      if (match.factors.length) factors.set(recJob.id, match.factors);
      if (match.missingSkills.length) missing.set(recJob.id, match.missingSkills.slice(0, 8));
    }
    return { score: showMatch ? match.score : 0, recommended: showMatch && isRecommended(match), raw: j, createdAt: recJob.createdAt };
  });

  scored.sort((a, b) => b.score - a.score || Date.parse(String(b.createdAt)) - Date.parse(String(a.createdAt)));
  const ranked = scored.filter((s) => s.recommended).map((s) => s.raw);

  /* A candidate is built only when there is something real to score against.
     With no signals the rows carry a null ATS score rather than a fabricated
     zero — see personalized.ts. */
  const candidate: MatchCandidate | null = showMatch
    ? {
        id: meId,
        profile: {
          headline: signals.headline,
          bio: (fields as { bio?: string } | null)?.bio,
          skills: signals.skills,
          location: signals.location,
          interests: signals.interests,
          /* No `domain` is passed: the member profile has no domain field, so
             there is nothing truthful to send. Phase 6 redistributes the domain
             weight across the components it can actually measure rather than
             scoring a guess. */
        },
      }
    : null;

  /* Preferences the member actually stated. Today that is LOCATION ONLY: the
     profile has no stored work-mode, employment-type, salary or domain
     preference, so those Phase 5 rules cannot fire and correctly report
     `unknown`. buildEligibilityProfile returns an empty profile when nothing
     was stated, and an empty profile decides nothing — eligibility then stays
     null rather than becoming a guess. */
  const prefs = buildEligibilityProfile({ location: signals.location });
  const hasPrefs = Object.keys(prefs).length > 0;

  return personalizedPage({
    rankedJobs: ranked as never,
    candidate,
    appliedJobIds: new Set(applications.map((a) => String(a.jobId))),
    eligibilityProfile: hasPrefs ? prefs : null,
    reasonsByJobId: reasons,
    summaryByJobId: summaries,
    factorsByJobId: factors,
    missingByJobId: missing,
    page,
    pageSize,
  });
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const rawScope = params.get('scope');

    /* Phase 11's personalized feed. Handled before the cached scopes because it
       is paged and enriched, and shares nothing with their payload shape. */
    if (rawScope === 'personalized') {
      const session = await getAuthSession().catch(() => null);
      const meId = session?.user ? await resolveSessionUserId(session).catch(() => null) : null;
      if (!meId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      const payload = await computePersonalized(
        meId,
        Number(params.get('page')) || 1,
        Number(params.get('pageSize')) || 20,
      );
      return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
    }

    const scope = rawScope === 'recommended' ? 'recommended' : 'row';

    // Viewer signals from the stored profile — never client-supplied.
    const session = await getAuthSession().catch(() => null);
    const meId = session?.user ? await resolveSessionUserId(session).catch(() => null) : null;

    const cacheKey = `${meId ?? 'anon'}:${scope}`;
    const hit = cache.get(cacheKey);
    const age = hit ? Date.now() - hit.ts : Infinity;

    // Fresh — serve it.
    if (hit && age < CACHE_TTL) {
      return NextResponse.json(hit.payload, { headers: { 'Cache-Control': 'no-store' } });
    }

    /* Stale but usable — serve it NOW and refresh behind the response, so the
       person waiting gets last minute's answer instead of this minute's delay.
       Single-flighted, so concurrent stale readers share one recompute. */
    if (hit && age < STALE_TTL) {
      if (!refreshing.has(cacheKey)) {
        const run = computeRecommendations(meId, scope)
          .then(() => undefined)
          .catch((error) => { console.error('[recommendations/jobs] background refresh failed', error); })
          .finally(() => { refreshing.delete(cacheKey); });
        refreshing.set(cacheKey, run);
      }
      return NextResponse.json(hit.payload, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Nothing usable cached — this caller has to wait for the real thing.
    const payload = await computeRecommendations(meId, scope);
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[recommendations/jobs] GET error', error);
    return NextResponse.json({ jobs: [], total: 0 }, { status: 200 });
  }
}
