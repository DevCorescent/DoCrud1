'use client';

/**
 * A preview of the posting, rendered from the composer's own form state.
 *
 * NO BACKEND. It reads the same object the form is about to POST, so it can
 * never disagree with what will be saved and it costs no request — a preview
 * that fetched would be showing a different job from the one being edited.
 *
 * It deliberately resembles the public job detail view rather than reproducing
 * it: the same information in the same order (title, poster, meta chips,
 * description, responsibilities, requirements, skills), at a size that fits
 * beside a form. Duplicating the real page would be a second thing to keep in
 * step for no gain, so this shows what a candidate will read, not a pixel copy.
 */
import { Briefcase, MapPin } from 'lucide-react';
import { EMPLOYMENT_TYPE_LABELS, WORK_MODE_LABELS, EXPERIENCE_LABELS } from '@/lib/jobs-ui';

export interface JobPreviewData {
  title: string;
  department: string;
  location: string;
  employmentType: string;
  workMode: string;
  experienceLevel: string;
  description: string;
  responsibilities: string;
  requirements: string;
  preferredSkills: string;
}

/** Who the job will be posted as. Drawn from the signed-in profile, never typed. */
export interface JobPreviewPoster {
  name: string;
  headline?: string;
  location?: string;
  avatarUrl?: string;
}

const CARD = 'rounded-2xl border border-slate-200 bg-white dark:border-white/[0.07] dark:bg-white/[0.02]';
const MUTED = 'text-slate-600 dark:text-white/40';
const CHIP = 'inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/55';

/** The composer stores these as newline-separated text; the job stores arrays. */
const lines = (value: string): string[] =>
  value.split('\n').map((line) => line.trim()).filter(Boolean);

export default function JobPostPreview({
  data, poster,
}: {
  data: JobPreviewData;
  poster: JobPreviewPoster | null;
}) {
  const responsibilities = lines(data.responsibilities);
  const requirements = lines(data.requirements);
  const skills = lines(data.preferredSkills);

  const meta = [
    EMPLOYMENT_TYPE_LABELS[data.employmentType] ?? data.employmentType,
    WORK_MODE_LABELS[data.workMode] ?? data.workMode,
    EXPERIENCE_LABELS[data.experienceLevel]
      ? `${EXPERIENCE_LABELS[data.experienceLevel]} level`
      : data.experienceLevel,
  ].filter(Boolean);

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="border-b border-slate-200 px-4 py-2.5 dark:border-white/[0.06]">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-white/30">
          Preview — how candidates will see this
        </p>
      </div>

      <div className="p-4 sm:p-5">
        <h3 className="text-[17px] font-bold leading-tight tracking-[-0.01em] sm:text-[19px]">
          {data.title.trim() || 'Untitled role'}
        </h3>

        {/* The poster is an INDIVIDUAL, and the preview says so plainly rather
            than dressing a person up as a company. */}
        {poster && (
          <div className="mt-3 flex items-center gap-2.5">
            {poster.avatarUrl
              ? <img src={poster.avatarUrl} alt="" aria-hidden className="h-8 w-8 shrink-0 rounded-full object-cover" />
              : (
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[12px] font-bold text-slate-600 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-white/50"
                >
                  {poster.name.trim().charAt(0).toUpperCase() || '?'}
                </span>
              )}
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-semibold">
                {poster.name}
                <span className={`ml-1.5 font-normal ${MUTED}`}>· Individual</span>
              </p>
              {(poster.headline || poster.location) && (
                <p className={`truncate text-[11.5px] ${MUTED}`}>
                  {[poster.headline, poster.location].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {data.location.trim() && (
            <span className={CHIP}><MapPin className="h-3 w-3" aria-hidden />{data.location.trim()}</span>
          )}
          {meta.map((label) => <span key={label} className={CHIP}>{label}</span>)}
          {data.department.trim() && (
            <span className={CHIP}><Briefcase className="h-3 w-3" aria-hidden />{data.department.trim()}</span>
          )}
        </div>

        {data.description.trim()
          ? (
            <p className="mt-4 whitespace-pre-line text-[13px] leading-relaxed text-slate-700 dark:text-white/60">
              {data.description.trim()}
            </p>
          )
          : <p className={`mt-4 text-[13px] italic ${MUTED}`}>No description yet.</p>}

        {responsibilities.length > 0 && (
          <PreviewList title="Responsibilities" items={responsibilities} />
        )}
        {requirements.length > 0 && (
          <PreviewList title="Requirements" items={requirements} />
        )}

        {skills.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-white/30">Skills</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {skills.map((skill) => <span key={skill} className={CHIP}>{skill}</span>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-white/30">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-[12.5px] leading-relaxed text-slate-700 dark:text-white/55">
            <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-400 dark:bg-white/25" />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
