'use client';

/**
 * Welcome — the first onboarding step.
 *
 * The visual design is transferred from the onboarding design source. Two
 * things deliberately differ, both because the source was a prototype:
 *
 *  1. COMPANY PLATES ARE REAL. The source hardcoded a Microsoft plate showing
 *     "▦" and a Google plate showing "G" — invented marks for companies that
 *     are not in Docrud's verified registry (lib/company-logos.ts) and that
 *     have no jobs here. Those are gone. The plates now come from
 *     /api/company-explorer, which is public, reads no session, and is backed
 *     by getHiringCompanies() — so "companies hiring now" is a true statement
 *     about real employers with live roles. The plate treatment itself is
 *     unchanged; only its contents became honest.
 *
 *     When the endpoint returns nothing, or fails, or has no company with a
 *     verified mark, the whole section is not rendered. An empty strip is a
 *     survivable Welcome screen; a fabricated one is not.
 *
 *  2. THE RESUME IS OPTIONAL, AND IS NOT PARSED HERE. Attaching one is a real
 *     file choice, validated against the parser's own rules, and Continue is
 *     the way forward whether or not one is attached — it is never required.
 *     Nothing is uploaded or read on this screen:
 *     /api/onboarding/parse-resume returns 401 without a session and this step
 *     is pre-auth, so extraction waits until after authentication rather than
 *     being faked. See lib/onboarding-resume.ts.
 */

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, FileText, Globe2, Sparkles, UploadCloud, X } from 'lucide-react';
import { RESUME_ACCEPT, validateResumeUpload } from '@/lib/onboarding-resume';
import CompanyLogo from '@/components/jobs/company/CompanyLogo';

/** How many plates the strip shows. The source showed two. */
const MAX_PLATES = 4;

type CompanyPlate = { id: string; name: string; logoUrl: string };

/**
 * Real employers with live roles, for the "hiring now" strip.
 *
 * Only companies with a resolvable mark are kept: the plate is a mark beside a
 * name, and a row of monograms reads as a loading state rather than a row of
 * employers — the same rule the company explorer already applies.
 */
function useHiringCompanies(): CompanyPlate[] {
  const [plates, setPlates] = useState<CompanyPlate[]>([]);

  useEffect(() => {
    let live = true;
    fetch('/api/company-explorer')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!live || !data) return;
        const tiles = Array.isArray(data.companies) ? data.companies : [];
        setPlates(
          tiles
            .filter((tile: CompanyPlate) => tile?.name && tile?.logoUrl)
            .slice(0, MAX_PLATES)
            .map((tile: CompanyPlate) => ({ id: tile.id, name: tile.name, logoUrl: tile.logoUrl })),
        );
      })
      /* A missing strip is fine. Nothing here is worth an error state. */
      .catch(() => {});
    return () => { live = false; };
  }, []);

  return plates;
}

/** The hero word alternates on a timer, exactly as in the source. */
function useHeroWord(): 'Jobs' | 'Candidates' {
  const [word, setWord] = useState<'Jobs' | 'Candidates'>('Jobs');

  useEffect(() => {
    /* Readers who ask for less motion get the first word and no swapping —
       the CSS can suppress the entrance animation but not a state change. */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setWord(w => (w === 'Jobs' ? 'Candidates' : 'Jobs')), 2600);
    return () => clearInterval(id);
  }, []);

  return word;
}

export default function WelcomeStep({
  onContinue,
  resume,
  onResumeChange,
  onLogin,
}: {
  onContinue: () => void;
  /** The attached resume, owned by the flow. Null when none was chosen. */
  resume: File | null;
  onResumeChange: (file: File | null) => void;
  /** Hands off to the existing Docrud login route. */
  onLogin: () => void;
}) {
  const heroWord = useHeroWord();
  const companies = useHiringCompanies();
  const fileRef = useRef<HTMLInputElement>(null);
  const [resumeError, setResumeError] = useState('');

  const pick = (file: File | null) => {
    const rejection = validateResumeUpload(file);
    if (rejection) { setResumeError(rejection.message); onResumeChange(null); return; }
    setResumeError('');
    onResumeChange(file);
  };

  return (
    <div className="step-panel">
      <div className="welcome-hero">
        <h1 className="hero-heading">
          Find Your<br />
          <span>
            Best-Fit{' '}
            <span
              key={heroWord}
              className={`hero-toggle-word ${heroWord === 'Jobs' ? 'hero-word-jobs' : 'hero-word-candidates'}`}
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

      <div className="welcome-pills">
        <span className="feature-pill"><FileText aria-hidden="true" /> <span>Resume Matching</span></span>
        <span className="feature-pill"><Sparkles aria-hidden="true" /> <span>Personalized</span></span>
        <span className="feature-pill"><Globe2 aria-hidden="true" /> <span>Multiple Industries</span></span>
      </div>

      {/* Rendered only when there are real companies to show. */}
      {companies.length > 0 && (
        <div className="welcome-companies">
          <p className="field-label">Explore opportunities from companies hiring now</p>
          <div className="welcome-company-plates">
            {companies.map(company => (
              <div className="logo-plate" key={company.id}>
                <CompanyLogo name={company.name} logoUrl={company.logoUrl} size={22} rounded={6} />
                <span>{company.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="welcome-actions">
        <button type="button" className="primary-button" onClick={onContinue}>
          <span>Find Best Jobs</span>
          <ArrowRight aria-hidden="true" />
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
        ) : (
          <button type="button" className="login-option" onClick={() => fileRef.current?.click()}>
            <UploadCloud aria-hidden="true" />
            <span>Attach your resume (optional)</span>
          </button>
        )}
        {resumeError && <p className="resume-error" role="alert">{resumeError}</p>}
        <button type="button" className="login-link" onClick={onLogin}>
          <span>Already have an account?</span>
          <span className="login-link-emphasis">Login</span>
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
