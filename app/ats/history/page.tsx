/**
 * /ats/history — past ATS evaluations for the signed-in member.
 *
 * A new route alongside /ats/evaluate. Neither touches /resume-ats.
 */
import { Suspense } from 'react';
import type { Metadata } from 'next';
import AtsHistoryPage from '@/components/ats/AtsHistoryPage';

export const metadata: Metadata = {
  title: 'ATS Evaluation History | Docrud',
  description: 'Every resume-to-job evaluation you have run.',
};

export default function Page() {
  /* The client reads `?report=` via useSearchParams, which Next requires to sit
     inside a Suspense boundary so the rest of the route can still prerender. */
  return (
    <Suspense fallback={null}>
      <AtsHistoryPage />
    </Suspense>
  );
}
