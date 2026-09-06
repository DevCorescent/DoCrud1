'use client';

/**
 * "Complete your profile" — the progress panel on a member's own profile.
 *
 * ═══ IT IS A CHECKLIST, SO IT IS BUILT LIKE ONE ═══
 *
 * Every incomplete section is one row: what to add, what it is worth, and a
 * chevron because tapping it opens the editor there. Rows in a list are
 * scannable in a way a paragraph of pills is not — the old layout wrapped nine
 * chips across several lines, so "what should I do next" meant reading all of
 * them and comparing percentages held in your head.
 *
 * ═══ COLLAPSED ON A PHONE ═══
 *
 * On a phone the panel opens as a single summary line: the score, how many
 * steps are left, and what they are collectively worth. Someone who has come to
 * look at their own profile should not have to scroll past a nine-item to-do
 * list to reach it. It expands on tap and stays expanded from `sm` up, where
 * there is room for it to simply be open.
 *
 * ═══ THE SCORE IS NOT RECOMPUTED HERE ═══
 *
 * `result` comes from lib/profile-score.ts — one definition of completeness,
 * shared with the server. This file decides how it looks and nothing else.
 */

import { useState } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import type { ProfileScoreResult, ProfileSectionResult } from '@/lib/profile-score';
import MatchPreferencesTrigger from './MatchPreferencesTrigger';

/** Which section of the profile editor each checklist row opens. */
const EDIT_SECTION_FOR: Partial<Record<ProfileSectionResult['id'], string>> = {
  photo: 'photo',
  headline: 'basic',
  bio: 'basic',
  location: 'basic',
  skills: 'skills',
  experience: 'experience',
  education: 'education',
  links: 'links',
  interests: 'interests',
  portfolio: 'portfolio',
  /* Deliberately absent: `preferences` does not live in the profile editor. It
     has its own dialog, opened by the row further down. */
};

/** What to call each section in a to-do row. */
const ACTION_LABEL: Partial<Record<ProfileSectionResult['id'], string>> = {
  photo: 'Add a profile photo',
  headline: 'Write a headline',
  bio: 'Write your about',
  skills: 'Add your skills',
  experience: 'Add experience',
  education: 'Add education',
  location: 'Add your location',
  interests: 'Add interests',
  portfolio: 'Add portfolio work',
  links: 'Add professional links',
};

export default function ProfileCompletionCard({
  result,
  onComplete,
  onOpenPreferences,
  preferences,
  preferenceVisibility,
}: {
  result: ProfileScoreResult;
  onComplete: (focusSection?: string | null) => void;
  onOpenPreferences?: () => void;
  preferences?: object | null;
  preferenceVisibility?: Record<string, string> | null;
}) {
  const { score, sections } = result;

  /* Work preferences get their own row below, so they are taken out of the
     to-do list — one task must not appear as two things to do. */
  const preferencesSection = sections.find((s) => s.id === 'preferences');
  const missing = sections.filter((s) => !s.complete && s.id !== 'preferences');
  const done = sections.filter((s) => s.complete);
  const available = missing.reduce((n, s) => n + s.weight, 0)
    + (preferencesSection && !preferencesSection.complete ? preferencesSection.weight : 0);
  const stepsLeft = missing.length + (preferencesSection && !preferencesSection.complete ? 1 : 0);

  const isComplete = score >= 100;
  const almost = score >= 80 && score < 100;
  const [open, setOpen] = useState(false);

  /* 100%: no warning, no CTA, no missing list — just a quiet confirmation. */
  if (isComplete) {
    return (
      <div className="mb-6 flex items-center gap-2.5 rounded-[16px] border border-emerald-400/[0.18] bg-emerald-400/[0.05] px-4 py-3">
        <span aria-hidden className="text-[13px] text-emerald-300/90">&#10003;</span>
        <p className="text-[12.5px] text-white/60">
          <span className="font-semibold text-white/85">Profile complete</span>
          {' · '}Your profile is ready to help you build your presence and discover opportunities.
        </p>
      </div>
    );
  }

  const accent = almost ? 'rgba(52,211,153,0.85)' : 'rgba(255,255,255,0.55)';

  return (
    <section className="mb-6 overflow-hidden rounded-[18px] border border-white/[0.07] bg-gradient-to-b from-white/[0.045] to-white/[0.015]">

      {/* ── Summary. A button on a phone (it opens the panel), a plain header
             from `sm` up, where the panel is always open. ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="profile-completion-detail"
        className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02] sm:cursor-default sm:hover:bg-transparent"
      >
        {/* Score. A ring rather than a bar: it is one number about one thing,
            and it reads at a glance without needing a scale beside it. */}
        <span className="relative shrink-0" style={{ width: 44, height: 44 }}>
          <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden>
            <circle cx="22" cy="22" r="19" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3.5" />
            <circle
              cx="22" cy="22" r="19" fill="none" stroke={accent} strokeWidth="3.5" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 19}
              strokeDashoffset={(2 * Math.PI * 19) * (1 - Math.min(100, Math.max(0, score)) / 100)}
              transform="rotate(-90 22 22)"
              style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)' }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold tabular-nums tracking-tight text-white"
            role="status" aria-label={`Profile strength ${score} percent`}>
            {score}%
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold tracking-[-0.01em] text-white/90">
            {almost ? "You're almost there" : 'Complete your profile'}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-white/40">
            {stepsLeft === 0
              ? 'Everything here is done.'
              : `${stepsLeft} step${stepsLeft === 1 ? '' : 's'} left · worth ${available}% more`}
          </span>
        </span>

        {/* The affordance exists only where the panel actually collapses. */}
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 text-white/35 transition-transform sm:hidden ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* ── Detail ── */}
      <div id="profile-completion-detail" className={`${open ? 'block' : 'hidden'} sm:block`}>
        <div className="border-t border-white/[0.06] px-4 pb-4 pt-3.5">

          <p className="text-[12px] leading-[1.6] text-white/40">
            A fuller profile is easier to find and matches more accurately. Profiles past
            80% carry noticeably more signal.
          </p>

          {missing.length > 0 && (
            <>
              <p className="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/25">
                Still to add
              </p>
              {/* Rows, not chips: one line each, weights right-aligned in a
                  column so they can be compared without re-reading the labels.
                  Two columns from `sm` up, where the width is there. */}
              {/* `max-w-3xl` so the weight column stays NEAR its label. Left
                  unconstrained on a wide screen the row stretched the full card
                  width and put "+9%" some 500px from "Write a headline", which
                  reads as two unrelated columns rather than one row. */}
              <ul className="grid max-w-3xl gap-0.5 sm:grid-cols-2 sm:gap-x-6">
                {missing.map((sec) => (
                  <li key={sec.id}>
                    <button
                      type="button"
                      onClick={() => onComplete(EDIT_SECTION_FOR[sec.id] ?? null)}
                      className="group flex w-full items-center gap-2.5 rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-white/[0.04]"
                    >
                      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/20 transition-colors group-hover:bg-white/45" />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/60 transition-colors group-hover:text-white/90">
                        {ACTION_LABEL[sec.id] ?? `Add ${sec.label}`}
                      </span>
                      <span className="shrink-0 text-[11px] font-semibold tabular-nums text-emerald-300/60">
                        +{sec.weight}%
                      </span>
                      <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-white/15 transition-colors group-hover:text-white/40" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {onOpenPreferences && (
            <div className="mt-3">
              <MatchPreferencesTrigger
                variant="row"
                preferences={preferences}
                visibility={preferenceVisibility}
                weight={preferencesSection?.weight}
                complete={Boolean(preferencesSection?.complete)}
                onOpen={onOpenPreferences}
              />
            </div>
          )}

          {done.length > 0 && (
            /* Quiet, and deliberately last. What is finished is reassurance,
               not a task; it should not compete with the list above it. */
            <p className="mt-3.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-white/22">
              <Check aria-hidden className="mt-[1px] h-3 w-3 shrink-0 text-emerald-300/40" />
              <span className="min-w-0">{done.map((s) => s.label).join(' · ')}</span>
            </p>
          )}

          <button
            type="button"
            onClick={() => onComplete(null)}
            className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-[11px] border border-white/[0.12] bg-white/[0.06] px-4 py-2.5 text-[12.5px] font-semibold text-white/80 transition hover:bg-white/[0.11] hover:text-white active:scale-[0.99] sm:w-auto"
          >
            Complete profile
            <ChevronRight aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}
