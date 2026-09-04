'use client';

/**
 * Job preview — the individual branch's final step before authentication.
 *
 * Its job is to show real product value before login, so every fact on screen
 * comes from /api/jobs/public. See lib/onboarding-jobs.ts for the data layer
 * and for why there is no match score here.
 *
 * ═══ WHAT THE SOURCE DID, AND WHAT THIS DOES INSTEAD ═══
 *
 *  · The source printed `(skills.length || 1) * 3137 + 1862` as a "Matches"
 *    figure. Invented. The number here is the job feed's own `total` for the
 *    chosen direction, unrounded, and it is labelled "open roles" because that
 *    is what it counts — these are not personalised matches and are not called
 *    matches.
 *  · The source's Google and Email buttons set `authenticated: true` in local
 *    state and nothing else. There is no fake sign-in here; the CTA goes to the
 *    real /login route, which is where applying has to start.
 *
 * ═══ THE COUNT, NOT THE LISTINGS ═══
 *
 * This step shows how much work is out there and then asks for an account. It
 * deliberately does NOT list individual jobs: browsing belongs on /jobs, which
 * already does it properly, and a four-row teaser here mostly showed four
 * near-identical titles from one employer.
 *
 * The figure is still the job feed's own `total` for the person's chosen
 * directions — nothing is estimated, and the empty and error states below stay
 * distinct so a failed request is never dressed up as "no jobs".
 */

import { ArrowRight, RotateCcw } from 'lucide-react';
import { formatRecommendedJobCount } from '@/lib/onboarding-jobs';
import { OnboardingProgress, StepHeading } from './StepChrome';

export default function JobPreviewStep({
  total,
  status,
  direction,
  firstName,
  onRetry,
  onLogin,
  step = 6,
  stepTotal = 6,
}: {
  /** The feed's own count for this query. */
  total: number;
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

  return (
    <div className="step-panel">
      <OnboardingProgress step={step} total={stepTotal} />

      {/* The figure is shown only once a real count has arrived. */}
      {status === 'ready' && total > 0 && (
        <div className="match-card">
          <div className="match-card-brand">
            <span className="match-card-mark" aria-hidden="true">D</span>
            <span>docrud</span>
          </div>
          <div className="match-card-number">{formatRecommendedJobCount(total)}</div>
          <div className="match-card-caption">Open roles</div>
        </div>
      )}

      <div className="preview-heading">
        <StepHeading
          eyebrow="Opportunities / 06"
          title={`${possessive} shortlist`}
          description={
            status === 'ready' && total > 0
              ? `${formatRecommendedJobCount(total)} open roles matching ${direction} right now. Create your account to see them and apply.`
              : `Open roles in ${direction}.`
          }
        />
      </div>

      {status === 'loading' && (
        <p className="jobs-status" role="status">Loading open roles…</p>
      )}

      {status === 'error' && (
        <div className="jobs-status jobs-status-error" role="alert">
          <p>We couldn&apos;t load jobs just now. This is a loading problem, not an empty result.</p>
          <button type="button" className="jobs-retry" onClick={onRetry}>
            <RotateCcw aria-hidden="true" />
            <span>Try again</span>
          </button>
        </div>
      )}

      {status === 'ready' && total === 0 && (
        <p className="jobs-status" role="status">
          No open roles in {direction} right now. Your choices are saved — sign in
          and we&apos;ll tell you when something matching opens.
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
