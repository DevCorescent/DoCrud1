'use client';

/**
 * ATS visibility inside the profile.
 *
 * TWO DIFFERENT SCORES, DELIBERATELY NOT MERGED:
 *
 *   Resume Quality — how complete and ATS-readable the document is. It is a
 *     property of the resume alone, so it is meaningful with no job in sight.
 *     Already computed at upload time and stored on resumeFiles[].atsScore
 *     (see app/api/profile/upload-resume/route.ts); nothing is recomputed here.
 *
 *   ATS Match — how compatible that resume is with ONE job description. It
 *     cannot exist without a job description, so it is only ever shown when a
 *     real evaluation has been run.
 *
 * Presenting a quality score as a "match" would tell someone they are an 82%
 * fit for a job they never applied to. The two are labelled separately
 * throughout, and neither borrows the other's wording.
 *
 * NOTHING IS EVALUATED HERE. This component reads existing data only — it
 * never calls POST /api/ats/evaluate, so opening a profile costs no scoring
 * work and a resume upload never silently runs a match against no job.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, FileText, History, Loader2 } from 'lucide-react';
import { displayScore, formatHistoryDate, scoreTone, TONE_CLASSES, TONE_LABEL } from './ats-view-model';

/** The stored per-resume quality score, exactly as the profile already holds it. */
export interface ProfileResumeFile {
  id: string;
  fileName: string;
  uploadedAt: string;
  atsScore?: {
    score: number;
    grade: string;
    breakdown?: Record<string, number>;
    tips?: string[];
  } | null;
}

interface LatestMatch {
  id: string;
  jobTitle: string;
  resumeName: string | null;
  overallScore: number;
  label: string;
  createdAt: string;
}

const PANEL = 'rounded-[13px] border border-slate-200 bg-white dark:border-white/[0.07] dark:bg-white/[0.03]';
const MUTED = 'text-slate-600 dark:text-white/40';
const HEADING = 'text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-white/25';

/** Shared button shape, so this section adds no sixth button variant. */
/* `dark:text-[#020617]` rather than `dark:text-slate-900`: a global rule in
   app/globals.css lightens ANY element whose class string contains
   `text-slate-900` for dark mode, and its companion rule that restores dark
   text on white controls matches only the exact token `bg-white` — not
   `dark:bg-white`. A white button labelled `dark:text-slate-900` therefore
   rendered near-white on white, 1:1 contrast, invisible. An arbitrary hex
   value is the same colour and matches neither selector. */
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-slate-900 px-3.5 py-2 text-[12px] font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:bg-white dark:text-[#020617] dark:hover:bg-white/90';
const BTN_QUIET =
  'inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-slate-300 px-3.5 py-2 text-[12px] font-semibold transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-white/[0.12] dark:hover:bg-white/[0.06]';

export default function ProfileAtsSection({
  resumeFiles,
  onUploadClick,
}: {
  /** Passed in from the profile's own state — this component refetches nothing. */
  resumeFiles: ProfileResumeFile[];
  /** Scrolls to / opens the profile's existing resume uploader. */
  onUploadClick?: () => void;
}) {
  const [latest, setLatest] = useState<LatestMatch | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(true);

  const resume = resumeFiles[0] ?? null;
  const quality = resume?.atsScore?.score;

  /* The most recent evaluation only. The endpoint sorts by createdAt DESC and
     the limit is applied in the query, so this reads ONE row — never the whole
     history — and it is scoped to the session's own user server-side. */
  useEffect(() => {
    let active = true;
    fetch('/api/ats/reports?limit=1', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active) return;
        setLatest((data?.items?.[0] as LatestMatch | undefined) ?? null);
      })
      .catch(() => { /* the rest of the section still works */ })
      .finally(() => { if (active) setLoadingLatest(false); });
    return () => { active = false; };
  }, []);

  /* ── No resume yet ── */
  if (!resume) {
    return (
      <div className={`${PANEL} mt-4 p-4`}>
        <p className={HEADING}>ATS</p>
        <p className="mt-2 text-[13px] font-semibold">Upload your resume to check ATS compatibility</p>
        <p className={`mt-1 text-[11.5px] leading-relaxed ${MUTED}`}>
          Docrud scores how readable your resume is, then matches it against any job description you paste.
        </p>
        {onUploadClick && (
          <button type="button" onClick={onUploadClick} className={`${BTN_PRIMARY} mt-3`}>
            Upload Resume
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2.5">

      {/* ── Resume quality ── */}
      <div className={`${PANEL} p-4`}>
        <p className={HEADING}>Resume quality</p>

        <div className="mt-2.5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[13px] font-semibold">
              <FileText className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
              <span className="min-w-0 truncate">{resume.fileName}</span>
            </p>
            <p className="mt-1 text-[11.5px] text-emerald-700 dark:text-emerald-400/80">Parsed ✓</p>
          </div>

          {typeof quality === 'number' && <ScoreBadge score={quality} />}
        </div>

        {typeof quality === 'number' ? (
          <>
            <Meter score={quality} />
            <p className={`mt-2 text-[11.5px] leading-relaxed ${MUTED}`}>
              How complete and machine-readable this resume is. It is <strong className="font-semibold">not</strong> a
              match score — matching needs a specific job description.
            </p>
          </>
        ) : (
          <p className={`mt-2 text-[11.5px] ${MUTED}`}>
            No quality score was recorded for this resume. Re-upload it to generate one.
          </p>
        )}
      </div>

      {/* ── Latest job match ── */}
      <div className={`${PANEL} p-4`}>
        <p className={HEADING}>Latest job match</p>

        {loadingLatest && (
          <p className={`mt-2.5 flex items-center gap-2 text-[12px] ${MUTED}`} aria-live="polite">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading your latest analysis…
          </p>
        )}

        {!loadingLatest && !latest && (
          <>
            <p className={`mt-2 text-[12px] leading-relaxed ${MUTED}`}>
              Run an ATS analysis against a job to see your match percentage.
            </p>
            <Link href="/ats/evaluate" className={`${BTN_PRIMARY} mt-3`}>
              Analyze a Job <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </>
        )}

        {!loadingLatest && latest && (
          <>
            <div className="mt-2.5 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{latest.jobTitle}</p>
                <p className={`mt-1 truncate text-[11.5px] ${MUTED}`}>
                  {latest.resumeName ? `Resume: ${latest.resumeName}` : 'Resume: uploaded for that evaluation'}
                </p>
                <p className={`mt-0.5 text-[11.5px] ${MUTED}`}>Analyzed {formatHistoryDate(latest.createdAt)}</p>
              </div>
              <ScoreBadge score={latest.overallScore} caption={latest.label} />
            </div>
            <Meter score={latest.overallScore} />
          </>
        )}

        {/* Buttons wrap rather than overflow on a narrow screen. */}
        <div className="mt-3 flex flex-wrap gap-2">
          {latest && (
            <Link href={`/ats/history?report=${encodeURIComponent(latest.id)}`} className={BTN_PRIMARY}>
              View Full Analysis <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
          <Link href="/ats/evaluate" className={BTN_QUIET}>Check Match Against a Job</Link>
          <Link href="/ats/history" className={BTN_QUIET}>
            <History className="h-3.5 w-3.5" aria-hidden /> View History
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * A score with its band word.
 *
 * The word is not decoration: colour alone is invisible to a red-green
 * colourblind reader and silent to a screen reader, so the band is always
 * spelled out beside the number.
 */
function ScoreBadge({ score, caption }: { score: number; caption?: string }) {
  const tone = scoreTone(score);
  return (
    <div className="shrink-0 text-right">
      <p className={`text-[22px] font-bold leading-none tabular-nums ${TONE_CLASSES[tone].text}`}>
        {displayScore(score)}<span className="text-[12px]">%</span>
      </p>
      <p className={`mt-1 text-[11px] font-semibold ${TONE_CLASSES[tone].text}`}>
        {caption ?? TONE_LABEL[tone]}
      </p>
    </div>
  );
}

function Meter({ score }: { score: number }) {
  const tone = scoreTone(score);
  return (
    <div
      className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/[0.07]"
      role="meter"
      aria-valuenow={displayScore(score)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${displayScore(score)} out of 100, ${TONE_LABEL[tone]}`}
    >
      <div
        className={`h-full rounded-full ${TONE_CLASSES[tone].ring.replace(/stroke-/g, 'bg-')}`}
        style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
      />
    </div>
  );
}
