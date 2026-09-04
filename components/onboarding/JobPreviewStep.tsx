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
 * ═══ NOTHING IS INVENTED PER JOB ═══
 *
 * Title, company, location, work mode, employment type and posted date are
 * printed only when the record carries them; a missing field is omitted rather
 * than filled in. Company marks come from CompanyLogo, which shows initials
 * rather than inventing a logo. There is no salary, no score and no badge that
 * the API did not supply.
 *
 * Presentation of those fields is Docrud's own: formatJobLocation, the
 * employment-type labels, formatPosted and jobDetailHref all come from
 * lib/jobs-ui.ts, so a job reads here exactly as it reads everywhere else in
 * the app — "Full-time" rather than the raw `full_time`, and the same
 * India-aware location rules. None of it is re-implemented.
 */

import Link from 'next/link';
import { ArrowRight, BriefcaseBusiness, RotateCcw } from 'lucide-react';
import CompanyLogo from '@/components/jobs/company/CompanyLogo';
import {
  EMPLOYMENT_TYPE_LABELS, formatJobLocation, formatPosted, jobDetailHref,
} from '@/lib/jobs-ui';
import { formatRecommendedJobCount, type JobPreview } from '@/lib/onboarding-jobs';
import { OnboardingProgress, StepHeading } from './StepChrome';

/**
 * The secondary line, built only from fields the record actually has, and
 * formatted by the app's own helpers rather than printed raw.
 */
function metaLine(job: JobPreview): string {
  return [
    formatJobLocation(job.location, job.workMode),
    job.employmentType ? EMPLOYMENT_TYPE_LABELS[job.employmentType] ?? job.employmentType : '',
    formatPosted(job.postedAt),
  ].filter(Boolean).join(' · ');
}

export default function JobPreviewStep({
  jobs,
  total,
  status,
  direction,
  firstName,
  onRetry,
  onLogin,
  step = 6,
  stepTotal = 6,
}: {
  jobs: readonly JobPreview[];
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
              ? `${formatRecommendedJobCount(total)} open roles matching ${direction} right now. Here are the newest — sign in to apply.`
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

      {status === 'ready' && jobs.length === 0 && (
        <p className="jobs-status" role="status">
          No open roles in {direction} right now. Your choices are saved — sign in
          and we&apos;ll tell you when something matching opens.
        </p>
      )}

      {status === 'ready' && jobs.length > 0 && (
        <ul className="job-preview-list">
          {jobs.map(job => {
            const meta = metaLine(job);
            return (
              <li key={job.id}>
                <Link href={jobDetailHref(job.id)} className="job-preview-card">
                  {job.organizationName ? (
                    <CompanyLogo name={job.organizationName} size={33} rounded={9} />
                  ) : (
                    <span className="job-icon" aria-hidden="true"><BriefcaseBusiness /></span>
                  )}
                  <span className="job-preview-body">
                    <strong>{job.title}</strong>
                    {(job.organizationName || meta) && (
                      <span className="job-preview-meta">
                        {[job.organizationName, meta].filter(Boolean).join(' — ')}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
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
