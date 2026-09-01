'use client';

/**
 * The small contextual illustration beside each step.
 *
 * INLINE SVG, NOT PHOTOGRAPHY. Three reasons, in order: a stock photo of
 * strangers in an office tells a poster nothing about the field they are
 * filling in; a raster asset large enough not to look cheap is tens of
 * kilobytes on a step that renders in milliseconds; and these draw in
 * `currentColor`, so they follow the theme instead of needing a light copy and
 * a dark copy of every file.
 *
 * They are decoration. Each is `aria-hidden` and none carries information that
 * is not already in the step's heading, so a screen reader loses nothing.
 *
 * TO USE REAL ARTWORK LATER: replace a case in `StepArt` with an <img> (or
 * next/image) pointing at the asset. The sizing box and the responsive
 * behaviour are here, not in the caller, so nothing else has to change.
 */
import type { StepId } from '@/lib/jobs/post-wizard';

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function Basics() {
  return (
    <>
      <rect x="8" y="20" width="48" height="34" rx="5" {...STROKE} />
      <path d="M24 20v-4a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4" {...STROKE} />
      <path d="M8 33h48" {...STROKE} />
      <circle cx="32" cy="33" r="3" {...STROKE} />
      <path d="M18 44h10M36 44h10" {...STROKE} opacity={0.5} />
    </>
  );
}

function Details() {
  return (
    <>
      <rect x="12" y="10" width="40" height="44" rx="5" {...STROKE} />
      <path d="M20 22h24M20 30h24M20 38h16M20 46h10" {...STROKE} />
    </>
  );
}

function Requirements() {
  return (
    <>
      <rect x="10" y="12" width="44" height="40" rx="5" {...STROKE} />
      <path d="M18 24l4 4 7-8" {...STROKE} />
      <path d="M18 40l4 4 7-8" {...STROKE} />
      <path d="M34 26h12M34 42h12" {...STROKE} opacity={0.6} />
    </>
  );
}

function Compensation() {
  return (
    <>
      <circle cx="32" cy="32" r="20" {...STROKE} />
      <path d="M32 20v24" {...STROKE} />
      <path d="M38 26a6 6 0 0 0-6-4h-1a5 5 0 0 0 0 10h2a5 5 0 0 1 0 10h-1a6 6 0 0 1-6-4" {...STROKE} />
    </>
  );
}

function Screening() {
  return (
    <>
      <path d="M32 10l18 7v13c0 11-7.6 19.6-18 24-10.4-4.4-18-13-18-24V17z" {...STROKE} />
      <path d="M24 31l6 6 11-12" {...STROKE} />
    </>
  );
}

function Preview() {
  return (
    <>
      <path d="M4 32s10-14 28-14 28 14 28 14-10 14-28 14S4 32 4 32z" {...STROKE} />
      <circle cx="32" cy="32" r="7" {...STROKE} />
    </>
  );
}

function Publish() {
  return (
    <>
      <path d="M32 8l6 12 13 2-9.5 9 2.3 13L32 37.8 20.2 44l2.3-13L13 22l13-2z" {...STROKE} />
    </>
  );
}

const ART: Record<StepId, () => JSX.Element> = {
  basics: Basics,
  details: Details,
  requirements: Requirements,
  compensation: Compensation,
  screening: Screening,
  preview: Preview,
  publish: Publish,
};

export function StepArt({ step, className = '' }: { step: StepId; className?: string }) {
  const Art = ART[step] ?? Details;
  return (
    <svg
      viewBox="0 0 64 64"
      role="presentation"
      aria-hidden
      className={`h-16 w-16 shrink-0 text-sky-600/70 dark:text-sky-300/50 ${className}`}
    >
      <Art />
    </svg>
  );
}
