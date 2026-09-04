/**
 * The persistent frame for the onboarding flow: background canvas, wash, and
 * the glass card that step content renders into.
 *
 * Mount this ONCE, above whatever switches between steps, and let the steps
 * change inside `children`. The canvas is a keyless sibling of `children`, so
 * React keeps the same DOM nodes across a step change and the marquee never
 * restarts. Do not render a shell (or a canvas) per step.
 *
 * The structure mirrors the design source exactly: no header chrome, the card
 * centred in the viewport, and a single quiet note beneath it. `navigation` is
 * the Back/Continue bar, which the Welcome and final steps do not show.
 *
 * The three faces the design uses are loaded here through next/font rather
 * than the @fontsource packages the source used, so no dependency is added and
 * the faces are fetched on this route only — the rest of the app keeps loading
 * Manrope by itself. They are exposed as CSS variables that onboarding.css
 * reads.
 */
import type { ReactNode } from 'react';
import { Outfit, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import OnboardingCanvas from './OnboardingCanvas';
import OnboardingFooterNote from './OnboardingFooterNote';
import './onboarding.css';

const headingFont = Outfit({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-onb-heading',
  fallback: ['system-ui', '-apple-system', 'sans-serif'],
});

const sansFont = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-onb-sans',
  fallback: ['system-ui', '-apple-system', 'sans-serif'],
});

const monoFont = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-onb-mono',
  fallback: ['ui-monospace', 'SFMono-Regular', 'monospace'],
});

export default function OnboardingShell({
  children,
  navigation,
}: {
  children: ReactNode;
  /** The Back/Continue bar. Omitted on steps that carry their own actions. */
  navigation?: ReactNode;
}) {
  const fontVars = `${headingFont.variable} ${sansFont.variable} ${monoFont.variable}`;

  return (
    <div className={`docrud-onboarding ${fontVars}`}>
      {/* Decorative only: aria-hidden, pointer-events:none, and below the
          stage in z-order, so it can never take a click or a tab stop. */}
      <OnboardingCanvas />
      <div className="onboarding-wash" aria-hidden="true" />

      <div className="onboarding-stage">
        <main className="onboarding-body">
          <section className="onboarding-card-wrap" aria-label="Docrud onboarding">
            <div className="onboarding-card">
              <div className="onboarding-card-inner">
                <div className="card-body">{children}</div>
                {navigation && <div className="card-footer">{navigation}</div>}
              </div>
            </div>
            <OnboardingFooterNote />
          </section>
        </main>
      </div>
    </div>
  );
}
