'use client';

/**
 * Talent preview — the business branch's final step before authentication.
 *
 * Purely presentational: it receives resolved metrics and prints them. All
 * counting lives in lib/onboarding-talent.ts, which documents what each number
 * actually is.
 *
 * ═══ THE NUMBERS ARE PEOPLE, AND THEY ARE CALLED PEOPLE ═══
 *
 * Every metric counts PROFESSIONALS — non-business accounts in the public
 * directory whose own profile lists that skill. The label says "professionals
 * with X" and never "applicants": nobody counted here has applied to anything.
 * No individual is named, shown or linked; only counts reach this component.
 *
 * ═══ WHAT THE SOURCE DID ═══
 *
 * It printed `(skills.length || 1) * 3137 + 4210` as a headline figure and
 * called them matched professionals. Invented, and not carried over. There is
 * no single headline number here at all, because the honest data is per-skill
 * and summing it would double-count anyone listing two of the chosen skills.
 */

import { ArrowRight, RotateCcw, Users } from 'lucide-react';
import type { TalentMetric } from '@/lib/onboarding-talent';
import { OnboardingProgress, StepHeading } from './StepChrome';

export default function TalentPreviewStep({
  metrics,
  status,
  spaceLabel,
  firstName,
  onRetry,
  onLogin,
  step = 6,
  total = 6,
}: {
  metrics: readonly TalentMetric[];
  status: 'loading' | 'ready' | 'error';
  /** The industry chosen earlier, used only in copy. */
  spaceLabel: string;
  firstName: string;
  onRetry: () => void;
  onLogin: () => void;
  step?: number;
  total?: number;
}) {
  const possessive = firstName.trim() ? `${firstName.trim()}'s` : 'Your';
  const anyFound = metrics.some(metric => metric.actualCount > 0);

  return (
    <div className="step-panel">
      <OnboardingProgress step={step} total={total} />

      <StepHeading
        eyebrow="Talent / 06"
        title={`${possessive} talent pool`}
        description={
          status === 'ready' && anyFound
            ? `Professionals on Docrud already listing the skills you need${spaceLabel ? `, for ${spaceLabel}` : ''}.`
            : 'Professionals on Docrud listing the skills you need.'
        }
      />

      {status === 'loading' && (
        <p className="jobs-status" role="status">Counting professionals…</p>
      )}

      {status === 'error' && (
        <div className="jobs-status jobs-status-error" role="alert">
          <p>We couldn&apos;t load the directory just now. This is a loading problem, not an empty result.</p>
          <button type="button" className="jobs-retry" onClick={onRetry}>
            <RotateCcw aria-hidden="true" />
            <span>Try again</span>
          </button>
        </div>
      )}

      {status === 'ready' && (
        <>
          <ul className="talent-metrics">
            {metrics.map(metric => (
              <li className="talent-metric" key={metric.skillId}>
                <strong>{metric.displayCount}</strong>
                <span>professionals with {metric.label}</span>
                <small>Listed on their own public Docrud profile.</small>
              </li>
            ))}
          </ul>

          {!anyFound && (
            <p className="jobs-status talent-note" role="status">
              No professionals list these skills publicly yet. Post a role and we&apos;ll
              put it in front of people as they join.
            </p>
          )}

          <p className="demo-note talent-note">
            <Users aria-hidden="true" /> Counts are people whose public profile lists
            the skill, rounded down to the nearest five. They are not applicants,
            and each skill is counted on its own.
          </p>
        </>
      )}

      <div className="talent-actions">
        <button type="button" className="primary-button" onClick={onLogin}>
          <span>Create your account to start hiring</span>
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
