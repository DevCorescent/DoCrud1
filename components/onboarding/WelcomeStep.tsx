'use client';

/**
 * Welcome — the first onboarding step.
 *
 * The visual design is transferred from the onboarding design source. Two
 * things deliberately differ, both because the source was a prototype:
 *
 *  1. THE COMPANY ROW IS THE HOMEPAGE'S OWN. The source hardcoded a Microsoft
 *     plate showing "▦" and a Google plate showing "G" — invented marks for
 *     companies with no jobs here and no entry in Docrud's verified registry.
 *     Those are gone, and so is the static four-plate row that replaced them.
 *
 *     This now renders <TrustedCompanies/>, the same marquee the homepage
 *     shows, on the same live source (/api/public/hiring-companies, derived
 *     from published jobs). One component, one data source: the two rows
 *     cannot drift apart, and a company that stops hiring leaves both at once.
 *     It renders nothing at all when nobody is hiring — an empty strip is a
 *     survivable Welcome screen; a fabricated one is not.
 *
 *  2. THE RESUME IS OPTIONAL, AND IS NOT PARSED HERE. Attaching one is the
 *     primary action and carries straight on to the Name step, where what was
 *     read is shown for checking. It is never required: "Continue without
 *     resume" is always there, and the file is validated against the parser's
 *     own rules before either path is taken.
 *     Nothing is uploaded or read on this screen:
 *     /api/onboarding/parse-resume returns 401 without a session and this step
 *     is pre-auth, so extraction waits until after authentication rather than
 *     being faked. See lib/onboarding-resume.ts.
 */

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, UploadCloud, X } from 'lucide-react';
import { RESUME_ACCEPT, validateResumeUpload, type ExtractionState } from '@/lib/onboarding-resume';
import TrustedCompanies from '@/components/home/TrustedCompanies';

/** The hero word alternates on a timer, exactly as in the source. */

const heroWords = [
  'Jobs',
  'Candidates',
  'Company',
  'Services',
  'Gigs',
  'Projects',
] as const;

/** The hero word alternates on a timer, exactly as in the source. */
function useHeroWord() {
  const [word, setWord] = useState<(typeof heroWords)[number]>('Jobs');

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const id = setInterval(() => {
      setWord(current => {
        const currentIndex = heroWords.indexOf(current);
        return heroWords[(currentIndex + 1) % heroWords.length];
      });
    }, 2600);

    return () => clearInterval(id);
  }, []);

  return word;
}

export default function WelcomeStep({
  onContinue,
  resume,
  onResumeChange,
  extraction,
  onLogin,
}: {
  onContinue: () => void;
  /** The attached resume, owned by the flow. Null when none was chosen. */
  resume: File | null;
  onResumeChange: (file: File | null) => void;
  /** What the read produced, so the status can be honest about which it was. */
  extraction: ExtractionState;
  /** Hands off to the existing Docrud login route. */
  onLogin: () => void;
}) {
  const heroWord = useHeroWord();
  const fileRef = useRef<HTMLInputElement>(null);
  const [resumeError, setResumeError] = useState('');

  const pick = (file: File | null) => {
    const rejection = validateResumeUpload(file);
    if (rejection) { setResumeError(rejection.message); onResumeChange(null); return; }
    setResumeError('');
    onResumeChange(file);
    /* A résumé that passed validation is enough to move on. The read runs in
       the flow and fills the next steps in as it resolves, so the person lands
       on Name and checks what was found rather than waiting on this screen.
       Removing a résumé calls this with null and must NOT advance. */
    if (file) onContinue();
  };

  return (
    <div className="step-panel">
      <div className="welcome-hero">
       <h1 className="hero-heading">
  Find Your
  <br />
  <span>
    Best-Fit{' '}
    <span
      key={heroWord}
      className={`hero-toggle-word ${
        heroWord === 'Jobs'
          ? 'hero-word-jobs'
          : heroWord === 'Candidates'
            ? 'hero-word-candidates'
            : 'hero-word-default'
      }`}
    >
      {heroWord}
    </span>
  </span>
</h1>
      </div>

      <p className="step-copy welcome-description">
        Upload your resume and discover opportunities matched to your skills,
        experience and goals.
      </p>

      {/* TrustedCompanies renders nothing when nobody is hiring, so the
          heading is the only thing to guard here. */}
      <div className="welcome-companies">
        <p className="field-label">Discover. Explore. Connect.</p>
          {/* The same marquee the homepage uses, on the same live source, so
              this row can never drift from it. Pinned list left empty: the
              onboarding row is purely "who is hiring right now". */}
          <div className="welcome-company-marquee">
            <TrustedCompanies label="" items={[]} />
        </div>
      </div>

      <div className="welcome-actions">
        <button
          type="button"
          className="primary-button"
          onClick={() => fileRef.current?.click()}
        >
          <UploadCloud aria-hidden="true" />
          <span>Upload Resume</span>
        </button>
        {/* Optional. Continue works with or without it. */}
        <input
          ref={fileRef}
          type="file"
          accept={RESUME_ACCEPT}
          className="onb-visually-hidden"
          id="onboarding-resume"
          onChange={event => pick(event.target.files?.[0] ?? null)}
        />
        {resume ? (
          <div className="resume-chosen">
            <Check aria-hidden="true" />
            <span className="resume-chosen-name">{resume.name}</span>
            <button
              type="button"
              className="role-chip-remove"
              aria-label={`Remove ${resume.name}`}
              onClick={() => { pick(null); setResumeError(''); if (fileRef.current) fileRef.current.value = ''; }}
            >
              <X aria-hidden="true" />
            </button>
          </div>
        ) : null}
        {resumeError && <p className="resume-error" role="alert">{resumeError}</p>}

        {/* One line per real outcome. Nothing claims the résumé was analysed
            unless it actually was, and none of these block Continue. */}
        {resume && extraction.status === 'parsing' && (
          <p className="resume-status" role="status">Reading your resume…</p>
        )}
        {resume && extraction.status === 'done' && (
          <p className="resume-status resume-status-ok" role="status">
            Read it — we&apos;ve filled in what we found. You can change all of it.
          </p>
        )}
        {resume && extraction.status === 'empty' && (
          <p className="resume-status" role="status">
            We read it but couldn&apos;t pick much out — you can fill things in yourself.
          </p>
        )}
        {resume && extraction.status === 'failed' && (
          <p className="resume-status resume-status-warn" role="status">
            {extraction.message} You can still continue and fill things in yourself.
          </p>
        )}
        {/* A résumé is optional, so there is always a way past it. Plain text,
            no surface of its own — it must not compete with the primary. */}
        <button type="button" className="continue-without-resume" onClick={onContinue}>
          {/* Once a résumé is attached the "without" is no longer true — this is
              then just the way on, reached by coming back to this step. */}
          <span>Continue</span>
          <ArrowRight aria-hidden="true" />
        </button>

        <button type="button" className="login-link" onClick={onLogin}>
          <span>Already have an account?</span>
          <span className="login-link-emphasis">Login</span>
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
