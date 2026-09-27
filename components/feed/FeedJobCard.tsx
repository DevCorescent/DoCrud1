'use client';

/**
 * A job, as a card in the homepage grid.
 *
 * ═══ WHY THIS IS NOT JobSummaryCard ═══
 *
 * That card is built for the Jobs page, where it is one of a column of jobs and
 * can afford a full match panel, a description and an Apply button. Here it is
 * one tile among posts and people, at a third of the feed's width, and the job
 * has to be legible in the two seconds someone spends deciding whether to stop
 * scrolling.
 *
 * The two agree on everything that matters, because both read the same shared
 * modules: lib/job-urgency for the employer's timing, lib/job-match-tone for
 * what a percentage is worth, lib/jobs-ui for every label and the posted date,
 * and components/jobs/CompanyMark for the employer's logo. A role that reads
 * "82% · Strong, hiring immediately" here reads the same on the Jobs page, from
 * the same stored values.
 *
 * ═══ IT SHOWS WHAT THE SERVER ALREADY SENT ═══
 *
 * /api/recommendations/jobs has always returned the required skills, the date
 * it was posted, the match score, which of the skills the viewer actually has
 * and why it matched. This card used to render four of those fields and throw
 * the rest away — the information was already on the wire, already paid for,
 * and the card was the narrowest part of the pipe.
 *
 * Nothing here is invented. No field is shown unless the payload carries it:
 * a signed-out viewer gets no match rail rather than a zero, and an employer
 * who stated no urgency gets no chip rather than the calmest of the three,
 * because the tint is the employer's claim and not ours.
 */

import Link from 'next/link';
import { ArrowRight, MapPin, Sparkles } from 'lucide-react';
import CompanyMark from '@/components/jobs/CompanyMark';
import { jobUrgencyLabel, jobUrgencyTint } from '@/lib/job-urgency';
import { getJobMatchLabel, getJobMatchTone } from '@/lib/job-match-tone';
import {
  EMPLOYMENT_TYPE_LABELS, WORK_MODE_LABELS,
  formatPosted, jobDetailHref, jobSourceLabel, isValidApplyUrl,
} from '@/lib/jobs-ui';
import './feed-job-card.css';

export type FeedJob = {
  id: string;
  title: string;
  organizationName?: string;
  location?: string;
  employmentType?: string;
  workMode?: string;
  hiringUrgency?: string;
  /** Capped at four by the server. */
  preferredSkills?: string[];
  createdAt?: string;
  applyUrl?: string;
  /* Present only when the viewer has enough profile for the server to score
     against — see lib/server/recommendation-compute.ts. */
  matchScore?: number;
  matchReasons?: string[];
  matchSummary?: string;
  matchedSkills?: string[];
};

/** How many required skills fit before the card starts stacking rows. */
const SKILLS_SHOWN = 3;

/** The spine, the percentage and the lit skills all take this one colour, so a
    card cannot say "strong" in green while its rail is blue. */
const ACCENT: Record<string, string> = {
  green: 'rgba(110, 231, 183, 0.92)',
  blue: 'rgba(140, 190, 255, 0.92)',
  yellow: 'rgba(252, 211, 77, 0.92)',
  red: 'rgba(253, 164, 175, 0.92)',
};
/** No score means no claim: the neutral cool of the card's own family. */
const ACCENT_NEUTRAL = 'rgba(140,170,255,0.85)';

export default function FeedJobCard({ job }: { job: FeedJob }) {
  const tint = jobUrgencyTint(job.hiringUrgency);
  const urgency = jobUrgencyLabel(job.hiringUrgency);

  const employment = job.employmentType
    ? EMPLOYMENT_TYPE_LABELS[job.employmentType] ?? job.employmentType
    : null;
  const mode = job.workMode ? WORK_MODE_LABELS[job.workMode] ?? job.workMode : null;
  /* A remote role has no place to be, so the mode IS the location rather than
     being printed twice beside an empty one. */
  const place = job.workMode === 'remote' ? 'Remote' : (job.location || null);
  const showMode = mode && job.workMode !== 'remote';

  const org = job.organizationName || 'Hiring';
  const posted = formatPosted(job.createdAt);

  const score = typeof job.matchScore === 'number' && Number.isFinite(job.matchScore)
    ? Math.max(0, Math.min(100, Math.round(job.matchScore)))
    : null;
  const accent = score === null ? ACCENT_NEUTRAL : (ACCENT[getJobMatchTone(score)] ?? ACCENT_NEUTRAL);
  /* The single best reason, not the list: three lines of "why" on a tile this
     size is a paragraph competing with the job title above it. */
  const why = job.matchSummary || job.matchReasons?.[0] || '';

  /* Matched against the viewer's own skills, compared case-insensitively and
     shown exactly as the employer wrote them. */
  const mine = new Set((job.matchedSkills ?? []).map((s) => s.toLowerCase()));
  const skills = (job.preferredSkills ?? []).filter(Boolean);
  /* Sorted so the ones the viewer HAS come first — with only three slots, the
     two that matter should not fall off the end by accident of input order. */
  const ordered = [...skills].sort((a, b) => Number(mine.has(b.toLowerCase())) - Number(mine.has(a.toLowerCase())));
  const shown = ordered.slice(0, SKILLS_SHOWN);
  /* Counted from what is actually rendered. A hard-coded overflow number goes
     wrong the moment the slice above changes. */
  const overflow = ordered.length - shown.length;

  const external = isValidApplyUrl(job.applyUrl) ? jobSourceLabel(job.applyUrl) : '';

  return (
    <Link
      href={jobDetailHref(job.id)}
      className="fjc group"
      style={{ '--fjc-accent': accent } as React.CSSProperties}
      aria-label={`${job.title} at ${org}${score !== null ? `, ${score}% match` : ''}`}
    >
      <div className="fjc-top">
        <span className="fjc-kind">Open role</span>
        {urgency ? (
          <>
            {posted && <span className="fjc-posted">{posted}</span>}
            <span
              className="fjc-urgency"
              style={{ background: tint!.chipBackground, borderColor: tint!.chipBorderColor, color: tint!.chipColor }}
            >
              {urgency}
            </span>
          </>
        ) : (
          posted && <span className="fjc-posted fjc-posted-end">{posted}</span>
        )}
      </div>

      <div className="fjc-org">
        <CompanyMark company={org} size={26} />
        <span className="fjc-org-n">{org}</span>
      </div>

      <div className="fjc-title">{job.title}</div>

      {score !== null && (
        <div className="fjc-match">
          <div className="fjc-match-h">
            <span className="fjc-match-n">{score}% match</span>
            <span className="fjc-match-l">{getJobMatchLabel(score)}</span>
          </div>
          <div className="fjc-bar" aria-hidden>
            <i style={{ width: `${Math.max(2, score)}%` }} />
          </div>
          {why && (
            <div className="fjc-why">
              <Sparkles className="fjc-why-i" aria-hidden />
              <span className="fjc-why-t">{why}</span>
            </div>
          )}
        </div>
      )}

      {(place || employment || showMode) && (
        <div className="fjc-facts">
          {place && (
            <span className="fjc-fact">
              <MapPin className="fjc-fact-i" aria-hidden />
              <span className="fjc-fact-t">{place}</span>
            </span>
          )}
          {employment && (
            <>
              {place && <span className="fjc-dot" aria-hidden />}
              <span className="fjc-fact-t">{employment}</span>
            </>
          )}
          {showMode && (
            <>
              {(place || employment) && <span className="fjc-dot" aria-hidden />}
              <span className="fjc-fact-t">{mode}</span>
            </>
          )}
        </div>
      )}

      {shown.length > 0 && (
        <div className="fjc-skills">
          {shown.map((s) => (
            <span key={s} className={mine.has(s.toLowerCase()) ? 'fjc-skill fjc-skill-on' : 'fjc-skill'}>
              {s}
            </span>
          ))}
          {overflow > 0 && <span className="fjc-more">+{overflow}</span>}
        </div>
      )}

      <div className="fjc-foot">
        <span className="fjc-cta">
          View role
          <ArrowRight className="fjc-cta-i" aria-hidden />
        </span>
        {external && <span className="fjc-src">{external}</span>}
      </div>
    </Link>
  );
}
