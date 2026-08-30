/**
 * /ats/evaluate — the deterministic ATS evaluator.
 *
 * A NEW route, deliberately alongside /resume-ats rather than replacing it.
 * The two are different products: /resume-ats scores a resume on its own with
 * an LLM, this one scores a resume AGAINST one job description with fixed
 * rules. Neither imports the other, so this page cannot regress that one.
 */
import type { Metadata } from 'next';
import AtsEvaluatorPage from '@/components/ats/AtsEvaluatorPage';

export const metadata: Metadata = {
  title: 'ATS Resume Evaluator | Docrud',
  description: 'See how well your resume matches a specific job before you apply.',
};

export default function Page() {
  return <AtsEvaluatorPage />;
}
