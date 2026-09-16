'use client';

/**
 * Job matches — the individual branch's final step before authentication.
 *
 * ═══ THE NUMBER IS THE ENGINE'S ═══
 *
 * The figure is the candidate's real job-match count: how many published
 * postings the recommendation engine recommends for the skills they just
 * chose, counted by the same rule as the homepage "Job matches" tile (see
 * lib/server/onboarding-match-count.ts). It is not a corpus-wide total and not
 * a domain filter. It arrives through lib/onboarding-jobs.ts, which throws on
 * any failure, so a broken read is shown as an error with a retry — never as
 * "no matches", which is a real answer with a different meaning.
 *
 * ═══ WHAT IS SHOWN, AND HOW ═══
 *
 *  · The card starts at 0 and counts up in fives to the display bucket — the
 *    real count floored to a multiple of five — so no frame shows a value the
 *    engine did not reach. Under five the bucket is 0: the card reads 0 and the
 *    copy says a few roles match, rather than a "0+" that reads as a bug.
 *  · No list. Browsing belongs on /jobs, which already does it properly, and
 *    the matches themselves are behind the account this step asks for.
 *  · The source design printed `(skills.length || 1) * 3137 + 1862` as
 *    "Matches". Invented, and not carried over. Its Google and Email buttons
 *    set `authenticated: true` in local state and nothing else; there is no
 *    fake sign-in here — the CTA goes to the real gate.
 */

import { ArrowRight, RotateCcw } from 'lucide-react';
import { formatRecommendedJobCount } from '@/lib/onboarding-jobs';
import MatchCounter from './MatchCounter';
import { OnboardingProgress, StepHeading } from './StepChrome';

export default function JobPreviewStep({
  total,
  bucket,
  status,
  direction,
  firstName,
  onRetry,
  onLogin,
  step = 6,
  stepTotal = 6,
}: {
  /** The engine's count for this candidate. */
  total: number;
  /** `total` floored to a multiple of five — what the card displays. */
  bucket: number;
  status: 'loading' | 'ready' | 'error';
  /** The direction the person chose, used only in copy. */
  direction: string;
  firstName: string;
  onRetry: () => void;
  onLogin: () => void;
  step?: number;
  stepTotal?: number;
}) {
  const possessive = firstName.trim() ? `${firstName.trim()}'s` : 'Your';
  const ready = status === 'ready';

  const description = ready && bucket > 0
    ? `${formatRecommendedJobCount(total)} jobs match your skills right now. Create your account to see them and apply.`
    : ready && total > 0
      ? 'A few jobs match your skills right now. Create your account to see them and apply.'
      : `Jobs matched to your skills in ${direction}.`;

  return (
    <div className="step-panel">
      <OnboardingProgress step={step} total={stepTotal} />

      {/* The card is on screen from the start at 0; it climbs only once the
          real count has arrived. A failed read hides it — an error is not a
          number. */}
      {status !== 'error' && (
        <div className="match-card">
          <div className="match-card-brand">
            <span className="match-card-mark" aria-hidden="true">D</span>
            <span>docrud</span>
          </div>
          {ready ? <MatchCounter bucket={bucket} /> : <div className="match-card-number">0</div>}
          <div className="match-card-caption">Job matches</div>
        </div>
      )}

      <div className="preview-heading">
        <StepHeading
          eyebrow="Opportunities / 06"
          title={`${possessive} shortlist`}
          description={description}
        />
      </div>

      {status === 'loading' && (
        <p className="jobs-status" role="status">Counting your matches…</p>
      )}

      {status === 'error' && (
        <div className="jobs-status jobs-status-error" role="alert">
          <p>We couldn&apos;t count your matches just now. This is a loading problem, not an empty result.</p>
          <button type="button" className="jobs-retry" onClick={onRetry}>
            <RotateCcw aria-hidden="true" />
            <span>Try again</span>
          </button>
        </div>
      )}

      {ready && total === 0 && (
        <p className="jobs-status" role="status">
          No jobs match your skills yet. Your choices are saved — sign in and
          we&apos;ll tell you when something matching opens.
        </p>
      )}

      <div className="job-preview-actions">
        <button type="button" className="primary-button" onClick={onLogin}>
          <span>Create your account to apply</span>
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
