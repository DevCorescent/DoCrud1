'use client';

/**
 * The quiet line under the onboarding content.
 *
 * It exists to carry the opportunity count, so when no real count is available
 * the whole line is dropped rather than left reading "opportunities available
 * on Docrud" with nothing in front of it.
 */

import { useState } from 'react';
import { BriefcaseBusiness } from 'lucide-react';
import OpportunityCounter from './OpportunityCounter';

export default function OnboardingFooterNote() {
  const [hasCount, setHasCount] = useState<boolean | null>(null);

  /* Resolved and empty: say nothing at all. */
  if (hasCount === false) return null;

  return (
    <div className="onboarding-footer-note">
      <BriefcaseBusiness aria-hidden="true" />
      <span className="demo-note">
        <OpportunityCounter onResolved={setHasCount} /> opportunities available on Docrud
      </span>
    </div>
  );
}
