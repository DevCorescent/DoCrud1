/**
 * POST /api/ats/evaluate — deterministic resume ↔ job-description scoring.
 *
 * A NEW endpoint. /api/ai/resume-ats and its LLM-scored engine are untouched
 * and still serve /resume-ats exactly as before; the two answer different
 * questions and neither imports the other.
 *
 * This route owns exactly two things — the session, and finding the caller's
 * own stored resume. Everything else (validation, normalization, scoring,
 * response shaping) is `runAtsEvaluation` in lib/server/ats/api.ts, which is
 * pure and covered by scripts/ats-api.selftest.ts.
 *
 * NO MODEL IS CALLED. The score is arithmetic over rules in lib/server/ats, so
 * the same resume and job description always return the same numbers.
 */
import { NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { getProfileData } from '@/lib/server/user-profiles';
import { runAtsEvaluation, MAX_RESUME_CHARS, MAX_JD_CHARS, type AtsApiError, type AtsApiResponse } from '@/lib/server/ats/api';
import { buildAtsReportRecord, saveAtsReport } from '@/lib/server/ats/reports';
import { rateLimit, RATE_POLICIES, getClientIp } from '@/lib/server/security/rate-limit';
import crypto from 'node:crypto';
import { atsLog, AtsStorageUnavailableError, logUserRef, safeFileName } from '@/lib/server/ats/safety';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A body larger than both limits together cannot be valid, so it is refused unread. */
const MAX_BODY_BYTES = (MAX_RESUME_CHARS + MAX_JD_CHARS) * 2;

/**
 * Codes this ROUTE can emit. A superset of the API layer's own union: the two
 * statuses only a route can produce (429 from the limiter, 401 from the
 * session) plus INTERNAL_ERROR for an unexpected throw. Declared here rather
 * than widening lib/server/ats/api.ts, which is frozen — the API layer's
 * contract is unchanged and every code it already returns still passes through.
 */
type AtsRouteErrorCode = AtsApiError['error']['code'] | 'RATE_LIMITED' | 'INTERNAL_ERROR';

function errorResponse(status: number, code: AtsRouteErrorCode, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  try {
    /* ── Authentication: the same mechanism every other route uses ── */
    const session = await getAuthSession();
    const userId = await resolveSessionUserId(session);
    if (!userId) {
      return errorResponse(401, 'UNAUTHORIZED', 'Sign in to evaluate a resume.');
    }

    /* Rate limiting, using the project's existing Mongo-backed limiter — no new
       dependency and no per-route Map. The account key is the primary control;
       the IP key is a coarse secondary one that catches a single actor cycling
       through accounts. Counted BEFORE the body is read, so an oversized or
       malformed payload still costs an attempt. */
    const ip = getClientIp(request as unknown as Parameters<typeof getClientIp>[0]);
    for (const [key, policy] of [
      [`ats:evaluate:${userId}`, RATE_POLICIES.atsEvaluateAccount] as const,
      [`ats:evaluate:ip:${ip}`, RATE_POLICIES.atsEvaluateIp] as const,
    ]) {
      const decision = await rateLimit(key, policy);
      if (!decision.allowed) {
        atsLog('ATS_RATE_LIMITED', { route: 'evaluate', user: logUserRef(userId) });
        return NextResponse.json(
          { error: { code: 'RATE_LIMITED', message: 'Too many ATS evaluations. Please try again later.' } },
          { status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds) } },
        );
      }
    }

    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return errorResponse(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return errorResponse(400, 'INVALID_INPUT', 'Request body must be valid JSON.');
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      return errorResponse(400, 'INVALID_INPUT', 'Request body must be a JSON object.');
    }

    const body = payload as Record<string, unknown>;

    /**
     * `resumeId` reuses what Docrud has ALREADY parsed.
     *
     * The resume is looked up in the caller's OWN profile and nowhere else, so
     * an id belonging to another member cannot resolve — ownership is a
     * property of where the lookup happens, not a check that could be
     * forgotten. Costs one profile read and re-parses nothing.
     */
    let resumeId: string | null = null;
    let resumeName: string | null = null;

    if (typeof body.resumeId === 'string' && body.resumeId.trim()) {
      const profile = await getProfileData(userId);
      const entry = (profile.resumeFiles ?? []).find((file) => file.id === body.resumeId);
      if (!entry) {
        return errorResponse(404, 'NOT_FOUND', 'No stored resume was found for this account with that id.');
      }
      if (!entry.parsedData) {
        return errorResponse(422, 'UNPROCESSABLE', 'That stored resume has no parsed data to evaluate.');
      }
      resumeId = entry.id;
      resumeName = entry.fileName ? safeFileName(entry.fileName) : null;
      body.parsedResume = entry.parsedData;
      delete body.resumeId;
    } else if (typeof body.resumeName === 'string') {
      /* A label for the history row when the resume was uploaded or pasted.
         It NAMES the record and reaches no scorer, so it cannot affect a score. */
      resumeName = safeFileName(body.resumeName);
    }

    const startedAt = Date.now();
    atsLog('ATS_EVALUATION_STARTED', {
      user: logUserRef(userId),
      source: resumeId ? 'stored' : 'inline',
      jdChars: typeof body.jobDescription === 'string' ? body.jobDescription.length : 0,
    });

    const result = runAtsEvaluation(body);

    if (result.status !== 200) {
      atsLog('ATS_EVALUATION_FAILED', {
        user: logUserRef(userId), status: result.status,
        reason: (result.body as AtsApiError).error.code, ms: Date.now() - startedAt,
      });
    }

    /* History. Written from the SERVER'S OWN result — there is no path by which
       a client-supplied score, id or userId reaches a stored field. Best-effort
       on purpose: a failed history write must never turn a successful
       evaluation into an error the member sees. */
    if (result.status === 200) {
      const evaluated = result.body as AtsApiResponse;
      const reportId = crypto.randomUUID();
      await saveAtsReport(buildAtsReportRecord({
        id: reportId,
        userId,
        resumeId,
        resumeName,
        jobTitle: typeof body.jobTitle === 'string' ? body.jobTitle.trim().slice(0, 200) : '',
        jobDescription: typeof body.jobDescription === 'string' ? body.jobDescription : '',
        createdAt: new Date().toISOString(),
        result: evaluated,
      })).catch((err) => {
        /* In production a missing database is a deployment fault, not a user
           error: it is logged loudly, and the evaluation is still returned
           rather than failed, because the score itself is correct. */
        atsLog(
          err instanceof AtsStorageUnavailableError ? 'ATS_STORAGE_UNAVAILABLE' : 'ATS_HISTORY_WRITE_FAILED',
          { user: logUserRef(userId), reason: String((err as Error)?.name ?? 'error') },
        );
      });

      atsLog('ATS_EVALUATION_COMPLETED', {
        user: logUserRef(userId), score: evaluated.score,
        requirements: evaluated.keywords.length, ms: Date.now() - startedAt,
      });
      return NextResponse.json({ ...evaluated, reportId }, { status: 200 });
    }

    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    /* Logged in full server-side; nothing from the thrown value is forwarded.
       An error's message can carry file paths, connection strings and stack
       frames, none of which belong in a client response. */
    console.error('[ats] evaluate route error:', err);
    return errorResponse(500, 'INTERNAL_ERROR', 'Something went wrong while processing your request.');
  }
}

/** Anything other than POST. Stated explicitly so the 405 carries the same JSON shape. */
export async function GET() {
  return errorResponse(405, 'INVALID_INPUT', 'Use POST to evaluate a resume.');
}
