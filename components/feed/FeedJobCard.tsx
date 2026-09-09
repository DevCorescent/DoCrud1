'use client';

/**
 * A job, as a card in the homepage grid.
 *
 * ═══ WHY THIS IS NOT JobSummaryCard ═══
 *
 * That card is built for the Jobs page, where it is one of a column of jobs and
 * can afford a logo, a match panel, a skills row and an Apply button. Here it
 * is one tile among posts and people, at a third of the feed's width, and the
 * job has to be legible in the two seconds someone spends deciding whether to
 * stop scrolling. So: who is hiring, for what, where, and how soon.
 *
 * The two agree on everything that matters — both take their urgency tint from
 * lib/job-urgency.ts, so a role that reads as "hiring now" here reads the same
 * on the Jobs page, from the same stored value.
 *
 * ═══ THE COLOUR IS THE EMPLOYER'S CLAIM, NOT OURS ═══
 *
 * A card is tinted only when the posting actually states an urgency. No stated
 * urgency means no tint — not the calmest of the three — because the tint is
 * information the employer supplied, and inventing it would put a timeline in
 * their mouth.
 */

import Link from 'next/link';
import { Briefcase, MapPin } from 'lucide-react';
import { jobUrgencyLabel, jobUrgencyTint } from '@/lib/job-urgency';

export type FeedJob = {
  id: string;
  title: string;
  organizationName?: string;
  location?: string;
  employmentType?: string;
  workMode?: string;
  hiringUrgency?: string;
};

const EMPLOYMENT: Record<string, string> = {
  full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract',
  internship: 'Internship', freelance: 'Freelance',
};
const WORK_MODE: Record<string, string> = {
  remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site',
};

export default function FeedJobCard({ job }: { job: FeedJob }) {
  const tint = jobUrgencyTint(job.hiringUrgency);
  const urgency = jobUrgencyLabel(job.hiringUrgency);
  const employment = job.employmentType ? EMPLOYMENT[job.employmentType] ?? job.employmentType : null;
  const mode = job.workMode ? WORK_MODE[job.workMode] ?? job.workMode : null;
  /* A remote role has no place to be, so the mode IS the location rather than
     being printed twice beside an empty one. */
  const place = job.workMode === 'remote' ? 'Remote' : (job.location || null);

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="feed-job group block rounded-[16px] border p-4 transition"
      style={tint
        ? { background: tint.background, borderColor: tint.borderColor }
        : undefined}
    >
      <span className="flex items-center gap-2">
        <span className="feed-job-mark">
          <Briefcase className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="feed-job-org min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
          {job.organizationName || 'Hiring'}
        </span>
        {urgency && (
          <span
            className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: tint!.chipBackground, borderColor: tint!.chipBorderColor, color: tint!.chipColor }}
          >
            {urgency}
          </span>
        )}
      </span>

      <span className="feed-job-title mt-2.5 block text-[14.5px] font-semibold leading-snug tracking-[-0.012em] text-white/92 transition-colors group-hover:text-white">
        {job.title}
      </span>

      <span className="feed-job-meta mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-white/58">
        {place && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
            {place}
          </span>
        )}
        {employment && <span>{employment}</span>}
        {mode && job.workMode !== 'remote' && <span>{mode}</span>}
      </span>
    </Link>
  );
}

/**
 * The card's own rules, rendered once by the feed.
 *
 * The tint arrives as an inline style because it is data; everything that does
 * NOT depend on the posting lives here, including the untinted default — a job
 * with no stated urgency still has to look like a card.
 */
export function FeedJobCardStyles() {
  return (
    <style>{`
      .feed-job {
        border-color: rgba(255,255,255,0.075);
        background: linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
      }
      .feed-job:hover { border-color: rgba(255,255,255,0.17); }
      .feed-job-mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px; height: 26px;
        flex: 0 0 auto;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.05);
        color: rgba(255,255,255,0.62);
      }
      .feed-job:focus-visible {
        outline: 2px solid rgba(255,255,255,0.55);
        outline-offset: 2px;
      }
    `}</style>
  );
}
