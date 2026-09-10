'use client';

/**
 * A person, as an AI-mode result.
 *
 * ═══ WHY THIS IS NOT THE HOMEPAGE'S PERSON ROW ═══
 *
 * The recommendation row on the homepage answers "who might you know" — it
 * leads with mutual connections and a reason drawn from your graph. A search
 * result answers a different question: "how well does this person fit what I
 * just described, and who are they?" It has a score to show, the fields the
 * ranking actually matched on, and no mutuals to speak of.
 *
 * Bending one component to do both meant the row showed a name, a headline and
 * nothing else — no score, no location, no skills — while the ranking had all
 * of it in hand.
 *
 * ═══ IT SHOWS ONLY WHAT THE SEARCH RETURNED ═══
 *
 * Every field here comes from the result object. Nothing is inferred, and an
 * absent field is simply not rendered rather than filled with a placeholder:
 * a card that invents a headline is a card that misrepresents a person to
 * someone deciding whether to contact them.
 *
 * The one derived thing is which skills are lit: those are the skills this
 * person has that the QUERY asked for, intersected by the caller. It is the
 * same set the ranking scored on, so a lit chip and a high percentage never
 * disagree.
 */

import { useState } from 'react';
import { ArrowUpRight, MapPin, Sparkles } from 'lucide-react';

export interface AiPerson {
  userId: string;
  name: string;
  avatar: string | null;
  headline: string;
  bio: string;
  location: string | null;
  skills: string[];
  openToWork: boolean;
}

/** The score, as a ring. 40px, so it reads at a glance without shouting. */
function MatchRing({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  /* r=16 → circumference 100.53, so the dash offset is very nearly the
     percentage itself; the arc is drawn from the top by the -90° rotation in
     the stylesheet. */
  const C = 2 * Math.PI * 16;
  return (
    <span className="aim-p-score" title={`${pct}% match`}>
      <span className="aim-p-ring">
        <svg viewBox="0 0 40 40" aria-hidden>
          <circle className="aim-p-ring-track" cx="20" cy="20" r="16" />
          <circle
            className="aim-p-ring-arc"
            cx="20"
            cy="20"
            r="16"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - pct / 100)}
          />
        </svg>
        <span className="aim-p-ring-num">{pct}</span>
      </span>
      {/* A bare number on a card is a number nobody can act on. The word is
          what makes it a score rather than a count of something. */}
      <span className="aim-p-score-cap" aria-hidden>match</span>
      <span className="sr-only">{pct}% match</span>
    </span>
  );
}

export default function AiPersonCard({
  person,
  matchPercent,
  why,
  url,
  /** Lower-cased skills the query asked for. */
  highlight,
  following,
  pending,
  onToggle,
}: {
  person: AiPerson;
  matchPercent: number;
  why: string;
  url: string;
  highlight: Set<string>;
  following: boolean;
  pending: boolean;
  onToggle: (userId: string) => void;
}) {
  const { userId, name, avatar, headline, bio, location, skills, openToWork } = person;
  /* A stored avatar URL can 404 — the file was removed, the host is down. The
     initial is the fallback, the same one a person with no photo gets, rather
     than the browser's broken-image glyph. */
  const [broken, setBroken] = useState(false);
  const shown = skills.slice(0, 4);
  const rest = skills.length - shown.length;

  return (
    <article className="aim-p">
      {/* The whole card is the link. It sits under the content rather than
          wrapping it, so the Follow button stays a button — a button inside an
          anchor is invalid, and nesting them breaks keyboard activation. */}
      <a className="aim-p-hit" href={url} aria-label={`View ${name}'s profile`} />

      <div className="aim-p-top">
        <span className="aim-p-av">
          {avatar && !broken
            ? (
              <img
                src={avatar}
                alt=""
                loading="lazy"
                decoding="async"
                onError={() => setBroken(true)}
                data-no-invert
              />
            )
            : <span className="aim-p-av-i">{(name.trim()[0] || '?').toUpperCase()}</span>}
        </span>

        <span className="aim-p-id">
          <span className="aim-p-name-row">
            <span className="aim-p-name">{name}</span>
            {openToWork && <span className="aim-p-open">Open to work</span>}
          </span>
          {headline && <span className="aim-p-head">{headline}</span>}
          {location && (
            <span className="aim-p-loc">
              <MapPin className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
              {location}
            </span>
          )}
        </span>

        <MatchRing value={matchPercent} />
      </div>

      {bio && <p className="aim-p-bio">{bio}</p>}

      {shown.length > 0 && (
        <div className="aim-p-skills">
          {shown.map((s) => (
            <span
              key={s}
              className={highlight.has(s.toLowerCase()) ? 'aim-p-skill aim-p-skill-on' : 'aim-p-skill'}
            >
              {s}
            </span>
          ))}
          {rest > 0 && <span className="aim-p-more">+{rest}</span>}
        </div>
      )}

      {why && (
        <p className="aim-p-why">
          <Sparkles className="mt-[2px] h-3 w-3 shrink-0 opacity-70" aria-hidden />
          <span>{why}</span>
        </p>
      )}

      <div className="aim-p-foot">
        <button
          type="button"
          onClick={() => onToggle(userId)}
          disabled={pending}
          className={following ? 'aim-p-btn aim-p-btn-on' : 'aim-p-btn'}
        >
          {following ? 'Following' : 'Follow'}
        </button>
        {/* Not a link: the card already is one, and a second link to the same
            place is one more tab stop for nothing. */}
        <span className="aim-p-view">
          View profile
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </span>
      </div>
    </article>
  );
}
