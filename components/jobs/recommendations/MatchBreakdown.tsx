'use client';

/**
 * Phase 11 — "Why recommended?".
 *
 * Every line here comes from the server: the ranking engine's reasons, the
 * Phase 6 ATS score with its matched and missing skills, and the Phase 5
 * eligibility verdict. Nothing is computed in the browser.
 *
 * The tone is deliberately flat. A match breakdown is a description of overlap
 * between a résumé and a description — not encouragement, and not a prediction.
 * There is no "you're a great fit!" copy, because this file has no basis for it
 * and a hiring decision is not ours to forecast.
 */

import {
  ATS_TONE_CLASSES, atsAriaLabel, atsBandLabel, atsPercent, atsTone,
  eligibilityLabel, eligibilityTone,
} from '@/lib/job-ui-status';
import { FAINT, HEADING, MUTED, Pill, Sheet } from '../my/ui';
import type { RecommendationRow } from './RecommendationCard';

/** Human wording for the Phase 5 reason codes. Unknown codes are shown as-is. */
const REASON_TEXT: Record<string, string> = {
  LOCATION_MISMATCH: 'The location does not match your stated preference',
  WORK_MODE_MISMATCH: 'The work mode does not match your stated preference',
  EMPLOYMENT_TYPE_MISMATCH: 'The employment type does not match your stated preference',
  EXPERIENCE_MISMATCH: 'The stated experience requirement is outside your range',
  DOMAIN_MISMATCH: 'The domain does not match your stated preference',
  SALARY_MISMATCH: 'The stated salary is below your preference',
};

export default function MatchBreakdown({ job, open, onClose }: {
  job: RecommendationRow | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!job) return null;
  const scored = typeof job.atsScore === 'number';
  const band = atsBandLabel(job.atsBand);
  const reasons = job.matchReasons.filter(Boolean);

  return (
    <Sheet open={open} title={`Why ${job.title}?`} onClose={onClose}>
      <div className="space-y-5">
        {reasons.length > 0 ? (
          <section>
            <h3 className={HEADING}>Recommended because</h3>
            <ul className="mt-2 space-y-1.5">
              {reasons.map((r) => (
                <li key={r} className={`flex gap-2 text-[12.5px] leading-relaxed ${MUTED}`}>
                  <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-400 dark:bg-white/25" />
                  <span className="min-w-0 break-words">{r}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h3 className={HEADING}>ATS Match</h3>
          {scored ? (
            <>
              <p className="mt-2">
                <span
                  aria-label={atsAriaLabel(job.atsScore, job.atsBand)}
                  className={`inline-flex items-center rounded-full border px-2.5 py-[3px] text-[11px] font-semibold ${ATS_TONE_CLASSES[atsTone(job.atsScore, job.atsBand)]}`}
                >
                  <span aria-hidden>{atsPercent(job.atsScore)}%{band ? ` · ${band}` : ''}</span>
                </span>
              </p>
              {/* Says what the number is, and just as importantly what it is not. */}
              <p className={`mt-2 text-[11.5px] leading-relaxed ${FAINT}`}>
                How closely your profile and résumé line up with this job description.
                It is not a prediction of whether you will be hired.
              </p>
            </>
          ) : (
            <p className={`mt-2 text-[12.5px] ${MUTED}`}>
              Not scored yet — add skills or upload a résumé to your profile and this
              role will be matched against it.
            </p>
          )}
        </section>

        {job.matchedSkills.length > 0 ? (
          <section>
            <h3 className={HEADING}>Matched skills</h3>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {job.matchedSkills.map((s) => (
                <li key={s}
                  className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11.5px] font-medium text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-400/[0.08] dark:text-emerald-200/90">
                  <span aria-hidden>✓ </span>{s}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {job.missingRequiredSkills.length > 0 ? (
          <section>
            <h3 className={HEADING}>Missing required skills</h3>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {job.missingRequiredSkills.map((s) => (
                <li key={s}
                  className="rounded-full border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11.5px] font-medium text-rose-800 dark:border-rose-400/25 dark:bg-rose-400/[0.08] dark:text-rose-200/90">
                  {s}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {job.missingPreferredSkills.length > 0 ? (
          <section>
            <h3 className={HEADING}>Missing preferred skills</h3>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {job.missingPreferredSkills.map((s) => (
                <li key={s}
                  className="rounded-full border border-slate-300 bg-[#f8fafc] px-2.5 py-1 text-[11.5px] font-medium text-[#334155] dark:border-white/[0.10] dark:bg-[rgba(255,255,255,0.03)] dark:text-white/60">
                  {s}
                </li>
              ))}
            </ul>
            <p className={`mt-1.5 text-[11px] ${FAINT}`}>
              Preferred skills are nice-to-have. They are not required to apply.
            </p>
          </section>
        ) : null}

        {job.eligibility ? (
          <section>
            <h3 className={HEADING}>Eligibility</h3>
            <p className="mt-2">
              <Pill tone={eligibilityTone(job.eligibility.status)}>
                {eligibilityLabel(job.eligibility.status)}
              </Pill>
            </p>
            {job.eligibility.reasons.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {job.eligibility.reasons.map((code) => (
                  <li key={code} className={`text-[12px] leading-relaxed ${MUTED}`}>
                    {REASON_TEXT[code] ?? code}
                  </li>
                ))}
              </ul>
            ) : null}
            {job.eligibility.status === 'unknown' ? (
              <p className={`mt-2 text-[11.5px] leading-relaxed ${FAINT}`}>
                Neither your preferences nor this posting state enough to decide.
                That is not a rejection — you can still apply.
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </Sheet>
  );
}
