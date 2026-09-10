'use client';

/**
 * "Complete your profile to get matched" — the searcher's own standing, in the
 * corner of the screen they are searching from.
 *
 * ═══ WHY IT IS HERE ═══
 *
 * TYRAI is where it becomes obvious that matching runs on what people have
 * filled in: you watch other members come back with a percentage against a
 * requirement. This is the moment someone will care that their own profile is
 * at 61%, and it is the only moment the product had nothing to say about it.
 *
 * ═══ ONE NUMBER, ONE CALCULATION ═══
 *
 * The score is /api/me/badge's, which the server derives with
 * calculateProfileScore() — the same function the profile page renders and the
 * same one the people ranking multiplies by. The threshold in the copy is
 * PROFILE_INDEX_THRESHOLD, which is the constant the ranking reads. Nothing
 * here recomputes or restates either of them, so the promise the panel makes
 * is a description of what the ranking does rather than a claim about it.
 *
 * ═══ WHAT IT PROMISES ═══
 *
 * That a profile at or above the threshold is ranked at full strength, and one
 * below it is not. It does NOT say an incomplete profile is hidden, because it
 * is not: search still returns it, lower. Saying otherwise would be a threat
 * the code does not carry out.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronRight, X } from 'lucide-react';
import { PROFILE_INDEX_THRESHOLD } from '@/lib/profile-score';

interface MissingSection { id: string; label: string; weight: number }

interface Badge {
  profileScore: number | null;
  profileMissing?: MissingSection[];
}

export default function ProfileReadiness({ open }: { open: boolean }) {
  const [badge, setBadge] = useState<Badge | null>(null);
  const [panel, setPanel] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  /* Once per opening of the overlay, and only while it is open: this is a
     number about the person, and it can change while they are away fixing it. */
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch('/api/me/badge', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => { if (alive && body) setBadge(body); })
      .catch(() => {});
    return () => { alive = false; };
  }, [open]);

  useEffect(() => { if (!open) setPanel(false); }, [open]);

  /* Escape closes the panel and nothing else. Registered on the capture phase
     so it runs before the overlay's own Escape handler, which would otherwise
     close the whole of TYRAI out from under a panel the person was reading. */
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setPanel(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPanel(false);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onDown);
    };
  }, [panel]);

  const toggle = useCallback(() => setPanel((p) => !p), []);

  /* Signed out, or the score could not be read: say nothing rather than
     showing a zero somebody would read as their own. */
  const score = badge?.profileScore;
  if (typeof score !== 'number') return null;

  const ready = score >= PROFILE_INDEX_THRESHOLD;
  const missing = badge?.profileMissing ?? [];
  const C = 2 * Math.PI * 13;

  return (
    <div className="aim-rd" ref={rootRef}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={panel}
        className={ready ? 'aim-rd-btn aim-rd-btn-ok' : 'aim-rd-btn'}
        title={ready
          ? `Your profile is ${score}% complete and indexed at full strength`
          : `Your profile is ${score}% complete — ${PROFILE_INDEX_THRESHOLD}% is indexed better`}
      >
        <span className="aim-rd-ring">
          <svg viewBox="0 0 30 30" aria-hidden>
            <circle className="aim-rd-track" cx="15" cy="15" r="13" />
            <circle
              className="aim-rd-arc"
              cx="15"
              cy="15"
              r="13"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - Math.max(0, Math.min(100, score)) / 100)}
            />
          </svg>
          <span className="aim-rd-num">{score}</span>
        </span>
        {/* Two shapes for two places. On a desktop this is a pill in the
            corner and one phrase is all that fits beside the ring. On a phone
            it is a bar across the bottom of the screen, which has room for the
            whole sentence and for what the sentence is actually about — so it
            says both rather than making somebody tap to find out. */}
        <span className="aim-rd-label">
          {ready ? 'Profile ready' : 'Complete your profile'}
        </span>

        <span className="aim-rd-bar-copy">
          <span className="aim-rd-h">
            {ready ? 'Your profile is matched in full' : 'Complete your profile to get matched'}
          </span>
          <span className="aim-rd-s">
            {ready
              ? `Above ${PROFILE_INDEX_THRESHOLD}% — indexed at full strength`
              : `${score}% done · profiles above ${PROFILE_INDEX_THRESHOLD}% are indexed better`}
          </span>
        </span>
        <ChevronRight className="aim-rd-chev h-4 w-4" aria-hidden />
      </button>

      {panel && (
        <div className="aim-rd-panel" role="dialog" aria-label="Profile readiness">
          <div className="aim-rd-head">
            <p className="aim-rd-title">
              {ready ? 'Your profile is being matched in full' : 'Complete your profile to get matched'}
            </p>
            <button type="button" onClick={() => setPanel(false)} aria-label="Close" className="aim-rd-x">
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          <p className="aim-rd-score">
            <span className="aim-rd-score-n">{score}%</span>
            <span className="aim-rd-score-c">complete</span>
          </p>
          <span className="aim-rd-bar" aria-hidden>
            <span className="aim-rd-bar-fill" style={{ width: `${Math.max(2, Math.min(100, score))}%` }} />
            {/* Where the line is, drawn on the bar itself. */}
            <span className="aim-rd-bar-mark" style={{ left: `${PROFILE_INDEX_THRESHOLD}%` }} />
          </span>

          <p className="aim-rd-copy">
            {ready
              ? `You are above ${PROFILE_INDEX_THRESHOLD}%, so your profile is indexed at full strength — searches like this one rank you on everything you have filled in.`
              : `Profiles above ${PROFILE_INDEX_THRESHOLD}% complete are indexed better. Yours still appears in results; it is ranked below the profiles that are finished.`}
          </p>

          {missing.length > 0 && (
            <>
              <p className="aim-rd-sub">Still missing</p>
              <div className="aim-rd-miss">
                {missing.map((m) => (
                  <span key={m.id} className="aim-rd-chip">
                    {m.label}
                    <span className="aim-rd-chip-w">+{m.weight}%</span>
                  </span>
                ))}
              </div>
            </>
          )}

          {/* "How you want to be matched" is a section of the profile page, so
              one link covers every missing section including that one. */}
          <a className="aim-rd-cta" href="/profile">
            {ready ? 'Review your profile' : 'Complete your profile'}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      )}
    </div>
  );
}
