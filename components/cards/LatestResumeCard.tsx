'use client';

import Link from 'next/link';
import { Bookmark, Mail, MapPin } from 'lucide-react';

import { Button } from '@/components/ui/button';

type ResumeLike = {
  id: string;
  slug: string;
  displayName: string;
  avatarDataUrl?: string;
  headline?: string;
  location?: string;
  category: string;
  skills: string[];
  tags: string[];
  summary?: string;
  updatedAt: string;
};

function deriveExperienceLabel(entry: ResumeLike) {
  const candidates = [...(entry.tags || []), entry.headline || '', entry.summary || ''].map((v) => String(v || '').toLowerCase());
  for (const text of candidates) {
    const m = text.match(/(\d{1,2})\s*(\+)?\s*(yrs|yr|years|year)\b/);
    if (m?.[1]) return `${m[1]} yrs exp`;
  }
  return '';
}

export default function LatestResumeCard(props: {
  entry: ResumeLike;
  shortlisted: boolean;
  onToggleShortlist: (id: string) => void;
  isAuthenticated: boolean;
  onRequestLogin?: () => void;
}) {
  const { entry } = props;
  const expLabel = deriveExperienceLabel(entry);
  const shownSkillsDesktop = entry.skills.slice(0, 4);
  const extraSkillsDesktop = Math.max(0, entry.skills.length - shownSkillsDesktop.length);
  const shownSkillsMobile = entry.skills.slice(0, 5);
  const extraSkillsMobile = Math.max(0, entry.skills.length - shownSkillsMobile.length);

  return (
    <article className="min-w-0 rounded-[22px] border border-white/60 bg-white/75 p-4 shadow-[0_18px_52px_rgba(15,23,42,0.07)] backdrop-blur-2xl transition hover:-translate-y-[1px] hover:shadow-[0_22px_64px_rgba(15,23,42,0.09)] sm:p-5">
      <header className="flex items-start gap-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,rgba(37,99,235,0.18),rgba(168,85,247,0.16))]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_28%,rgba(255,255,255,0.92),transparent_60%)]" />
          {entry.avatarDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.avatarDataUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : null}
          <div className="relative flex h-full w-full items-center justify-center text-[14px] font-semibold text-slate-900">
            {(entry.displayName || 'Talent').slice(0, 2).toUpperCase()}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[18px] font-semibold leading-6 text-slate-950">{entry.displayName}</p>
              <p className="mt-1 truncate text-sm font-medium text-slate-600">{entry.headline || entry.category}</p>
            </div>
            <div className="shrink-0">
              <button
                type="button"
                onClick={() => props.onToggleShortlist(entry.id)}
                className={`grid h-10 w-10 place-items-center rounded-2xl border shadow-sm transition ${
                  props.shortlisted
                    ? 'border-amber-200/40 bg-[linear-gradient(135deg,rgba(245,158,11,0.95),rgba(251,191,36,0.92))] text-slate-950'
                    : 'border-white/60 bg-white/80 text-slate-700 hover:bg-white'
                }`}
                aria-label={props.shortlisted ? 'Remove from shortlist' : 'Save to shortlist'}
              >
                <Bookmark className={`mx-auto h-5 w-5 ${props.shortlisted ? 'fill-slate-950 text-slate-950' : ''}`} />
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 sm:text-xs">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span className="truncate">{entry.location || 'Remote'}</span>
            </span>
            <span className="text-slate-300">·</span>
            <span className="truncate">{entry.category}</span>
            {expLabel ? (
              <>
                <span className="text-slate-300">·</span>
                <span className="truncate">{expLabel}</span>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <p className="mt-3 hidden line-clamp-4 text-sm leading-6 text-slate-600 sm:block">
        {entry.summary || 'Strong profile ready for real projects. Open the profile to see skills and resume preview.'}
      </p>
      <p className="mt-3 line-clamp-4 text-[13px] leading-6 text-slate-600 sm:hidden">
        {entry.summary || 'Strong profile ready for real projects. Open the profile to see skills and resume preview.'}
      </p>

      <div className="mt-4 flex flex-wrap gap-2 sm:hidden">
        {shownSkillsMobile.map((skill) => (
          <span key={`${entry.id}-m-${skill}`} className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-slate-700">
            {skill}
          </span>
        ))}
        {extraSkillsMobile ? (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-slate-700">+{extraSkillsMobile}</span>
        ) : null}
      </div>

      <div className="mt-4 hidden sm:flex sm:flex-wrap sm:gap-2">
        {shownSkillsDesktop.map((skill) => (
          <span key={`${entry.id}-d-${skill}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {skill}
          </span>
        ))}
        {extraSkillsDesktop ? (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">+{extraSkillsDesktop}</span>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
        <Button
          asChild
          type="button"
          className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-[14px] font-semibold text-slate-700 shadow-[0_10px_26px_rgba(15,23,42,0.04)] hover:bg-slate-50"
          onClick={(event) => {
            if (props.isAuthenticated) return;
            event.preventDefault();
            props.onRequestLogin?.();
          }}
        >
          <Link href={`/talent/${entry.slug}#contact`} className="inline-flex min-w-0 items-center justify-center gap-2 whitespace-nowrap">
            <Mail className="h-4 w-4 shrink-0" />
            <span className="truncate">Message</span>
          </Link>
        </Button>
        <Button
          asChild
          type="button"
          className="h-11 rounded-2xl bg-slate-950 px-3 text-[14px] font-semibold text-white shadow-[0_14px_34px_rgba(2,6,23,0.22)] hover:bg-slate-900"
        >
          <Link href={`/talent/${entry.slug}`} className="inline-flex min-w-0 items-center justify-center whitespace-nowrap">
            <span className="truncate">View profile</span>
          </Link>
        </Button>
      </div>
    </article>
  );
}

