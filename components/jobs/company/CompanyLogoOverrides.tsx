'use client';

/**
 * Loads the Super Admin logo overrides into the shared lookup, once per visit.
 *
 * Mounted in the root layout so every surface that shows a company — job
 * cards, job detail, Company Explorer, the homepage strip, onboarding — reads
 * the same answer. Renders nothing.
 *
 * It writes into `lib/company-logos`, which is the ONE place logo selection is
 * decided (see that module's header). There is deliberately no per-component
 * fetching: fifty job cards must not mean fifty requests.
 */

import { useEffect } from 'react';
import { setCompanyLogoOverrides } from '@/lib/company-logos';

export default function CompanyLogoOverrides() {
  useEffect(() => {
    let alive = true;
    fetch('/api/company-logos', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.logos) setCompanyLogoOverrides(d.logos); })
      /* A failure leaves the registry as it was: every company keeps whatever
         logo it already had. Nothing is broken by this not loading. */
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return null;
}
