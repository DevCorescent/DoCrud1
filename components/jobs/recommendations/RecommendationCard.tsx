'use client';

/**
 * Phase 11 — one recommended job.
 *
 * Every value on this card is a fact the server sent. Nothing is derived,
 * inferred or filled in:
 *
 *   · the ATS chip appears only when the server actually scored the viewer —
 *     an unscored row shows no percentage rather than a 0%;
 *   · the eligibility chip appears only when preferences were stated;
 *   · the reasons are the ranking engine's own strings, never generated here;
 *   · "Posted N days ago" is rendered from the real timestamp, and no
 *     "freshness score" is invented from it.
 *
 * THE RECOMMENDATION SCORE IS NOT SHOWN. It is an internal ranking number; the
 * card communicates the ORDER it produced and the reasons behind it, which is
 * what the reader can actually act on.
 */

import Link from 'next/link';
import { ArrowUpRight, Info } from 'lucide-react';
import {
  ATS_TONE_CLASSES, atsAriaLabel, atsBandLabel, atsPercent, atsTone,
  eligibilityLabel, eligibilityTone, postedAgo,
} from '@/lib/job-ui-status';
import { EMPLOYMENT_TYPE_LABELS, WORK_MODE_LABELS, formatJobLocation } from '@/lib/jobs-ui';
import { FAINT, FOCUS, GHOST_BTN, MUTED, PANEL, Pill } from '../my/ui';

export interface RecommendationRow {
  id: string;
  title: string;
  organizationName: string;
  location?: string;
  workMode?: string;
  employmentType?: string;
  createdAt?: string;
  matchReasons: string[];
  /** One sentence naming why this suits the viewer. Absent when nothing does. */
  matchSummary?: string;
  /** Per-dimension breakdown from the relevance scorer, strongest first. */
  matchFactors?: Array<{ kind: string; label: string; detail: string; points: number; max: number }>;
  /** Requirements the viewer already has, by name. */
  relevanceMatchedSkills?: string[];
  /** Requirements the posting leans on that the viewer does not show. */
  relevanceMissingSkills?: string[];
  atsScore: number | null;
  atsBand: string | null;
  matchedSkills: string[];
  missingRequiredSkills: string[];
  missingPreferredSkills: string[];
  eligibility: { status: string; reasons: string[] } | null;
}

export default function RecommendationCard({ job, onExplain }: {
  job: RecommendationRow;
  onExplain: (job: RecommendationRow) => void;
}) {
  const href = `/jobs/${encodeURIComponent(job.id)}`;
  const posted = postedAgo(job.createdAt);
  const facts = [
    formatJobLocation(job.location, job.workMode),
    job.employmentType ? EMPLOYMENT_TYPE_LABELS[job.employmentType] ?? job.employmentType : '',
    job.workMode ? WORK_MODE_LABELS[job.workMode] ?? job.workMode : '',
  ].filter(Boolean);
  const reasons = job.matchReasons.filter(Boolean).slice(0, 3);
  const scored = typeof job.atsScore === 'number';
  const band = atsBandLabel(job.atsBand);

  return (
    <li className={`${PANEL} p-4`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* The whole title is the link, so the card has ONE unambiguous
              destination for both a pointer and a screen reader — rather than a
              clickable div wrapping other controls. */}
          <h3 className="text-[14.5px] font-bold leading-snug text-slate-900 dark:text-white">
            {/* inline-block with a little vertical padding so the tap target
                clears 24px even when the title fits on one line — on a phone it
                wraps and is taller anyway, but a desktop single-liner was 19px. */}
            <Link href={href}
              className={`${FOCUS} inline-block rounded-[4px] py-[3px] hover:underline underline-offset-2`}>
              {job.title}
            </Link>
          </h3>
          <p className={`mt-0.5 truncate text-[12.5px] ${MUTED}`}>{job.organizationName}</p>
        </div>

        {scored ? (
          <div className="shrink-0 text-right">
            <p className="text-[17px] font-bold leading-none text-slate-900 dark:text-white">
              {atsPercent(job.atsScore)}%
            </p>
            <p className={`mt-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] ${FAINT}`}>
              ATS Match
            </p>
          </div>
        ) : null}
      </div>

      {facts.length > 0 ? (
        <p className={`mt-2 text-[12.5px] ${MUTED}`}>{facts.join(' · ')}</p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {/* Score and band always travel together, and the band is the engine's
            own word — never one this file decided. */}
        {scored ? (
          <span
            aria-label={atsAriaLabel(job.atsScore, job.atsBand)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-semibold ${ATS_TONE_CLASSES[atsTone(job.atsScore, job.atsBand)]}`}
          >
            <span aria-hidden>ATS Match {atsPercent(job.atsScore)}%{band ? ` · ${band}` : ''}</span>
          </span>
        ) : null}

        {/* Only when the server returned a verdict. A member who stated no
            preferences sees no chip at all, not "Not stated". */}
        {job.eligibility ? (
          <Pill tone={eligibilityTone(job.eligibility.status)}>
            {eligibilityLabel(job.eligibility.status)}
          </Pill>
        ) : null}

        {posted ? <span className={`text-[11px] ${FAINT}`}>{posted}</span> : null}
      </div>

      {reasons.length > 0 ? (
        <div className="mt-3">
          <p className={`text-[9.5px] font-semibold uppercase tracking-[0.12em] ${FAINT}`}>
            Recommended because
          </p>
          <ul className="mt-1.5 space-y-1">
            {reasons.map((reason) => (
              <li key={reason} className={`flex gap-2 text-[12px] leading-snug ${MUTED}`}>
                <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-400 dark:bg-white/25" />
                <span className="min-w-0 break-words">{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={href} className={`${GHOST_BTN} ${FOCUS}`}>
          View job <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
        {/* Shown only when there is something real to explain. */}
        {reasons.length > 0 || scored || job.eligibility ? (
          <button type="button" onClick={() => onExplain(job)}
            aria-label={`Why ${job.title} is recommended`}
            className={`${GHOST_BTN} ${FOCUS}`}>
            <Info className="h-3.5 w-3.5" aria-hidden /> Why recommended?
          </button>
        ) : null}
      </div>
    </li>
  );
}
