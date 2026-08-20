'use client';

/**
 * People you may know — a feed item, not a homepage section.
 *
 * Ranked candidates come from /api/recommendations/people (real follow graph
 * plus stored profile signals). Following uses the existing
 * /api/profile/follow endpoint the People page already calls — there is no
 * parallel follow system here. Mutual counts render only when the graph
 * actually produced one, so a zero is never dressed up as a number.
 *
 * The strip is natively scrolled. There is no autoplay, no interval, no scroll
 * listener and no animated marquee — the row moves only when the user moves it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal, Users, ArrowRight } from 'lucide-react';

export type PersonRecommendation = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
  shortBio: string | null;
  location: string | null;
  skills: string[];
  mutualCount: number;
  mutualAvatars: string[];
  isFollowing: boolean;
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

function PersonCard({
  person, following, pending, onToggle,
}: {
  person: PersonRecommendation;
  following: boolean;
  pending: boolean;
  onToggle: (id: string) => void;
}) {
  const [broken, setBroken] = useState(false);
  const profileHref = `/u/${person.userId}`;
  const secondary = person.headline || person.location || person.skills.slice(0, 2).join(' · ');
  const bio = person.shortBio || person.skills.slice(0, 3).join(' · ') || '';

  return (
    <article className="pymk-card">
      {/* Neutral brand watermark: a soft glass reflection, no colour. */}
      <span className="pymk-sheen" aria-hidden="true" />

      <Link
        href={profileHref}
        className="pymk-more"
        aria-label={`Open the full profile of ${person.name}`}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </Link>

      <Link href={profileHref} className="pymk-id" aria-label={`View ${person.name}`}>
        <span className="pymk-avatar">
          {person.avatarUrl && !broken
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={person.avatarUrl} alt="" onError={() => setBroken(true)} className="h-full w-full object-cover" data-no-invert />
            : <span className="text-[15px] font-bold text-white/55">{initials(person.name) || '?'}</span>}
        </span>
        <span className="pymk-name">{person.name}</span>
        {secondary && <span className="pymk-headline">{secondary}</span>}
      </Link>

      {/* Exactly two lines. The three-dot control opens the rest. */}
      <p className="pymk-bio">{bio}</p>

      {/* Only rendered when the follow graph actually produced mutuals. */}
      <div className="pymk-mutual">
        {person.mutualCount > 0 && (
          <>
            {person.mutualAvatars.length > 0 && (
              <span className="flex -space-x-1.5">
                {person.mutualAvatars.map((a, i) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img key={i} src={a} alt="" className="h-3.5 w-3.5 rounded-full border border-black/60 object-cover" data-no-invert />
                ))}
              </span>
            )}
            <span>{person.mutualCount} mutual{person.mutualCount === 1 ? '' : 's'}</span>
          </>
        )}
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() => onToggle(person.userId)}
        aria-label={following ? `Unfollow ${person.name}` : `Follow ${person.name}`}
        className={following ? 'pymk-btn pymk-btn-on' : 'pymk-btn'}
      >
        {following ? 'Following' : 'Follow'}
      </button>
    </article>
  );
}

export default function PeopleYouMayKnow() {
  const [people, setPeople] = useState<PersonRecommendation[] | null>(null);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  /* State alone cannot gate a double submit: several clicks in one tick all
     read the same stale Set. A ref is updated synchronously, so the second
     click in the same tick already sees the request in flight. */
  const inFlight = useRef<Set<string>>(new Set());
  const fetched = useRef(false);

  /* One request for the lifetime of the module. No polling, no refetch on scroll. */
  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    fetch('/api/recommendations/people')
      .then((r) => (r.ok ? r.json() : { people: [] }))
      .then((d: { people?: PersonRecommendation[] }) => setPeople(Array.isArray(d.people) ? d.people : []))
      .catch(() => setPeople([]));
  }, []);

  /* Reuses the follow endpoint the People page already calls. Optimistic, with
     rollback if the request fails, and guarded against a double submit. */
  const toggle = useCallback(async (targetUserId: string) => {
    if (inFlight.current.has(targetUserId)) return;
    inFlight.current.add(targetUserId);
    const already = following.has(targetUserId);
    setPending((p) => new Set(p).add(targetUserId));
    setFollowing((prev) => { const n = new Set(prev); if (already) n.delete(targetUserId); else n.add(targetUserId); return n; });
    try {
      const res = await fetch('/api/profile/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId, action: already ? 'unfollow' : 'follow' }),
      });
      if (!res.ok) throw new Error('failed');
    } catch {
      setFollowing((prev) => { const n = new Set(prev); if (already) n.add(targetUserId); else n.delete(targetUserId); return n; });
    } finally {
      inFlight.current.delete(targetUserId);
      setPending((p) => { const n = new Set(p); n.delete(targetUserId); return n; });
    }
  }, [following]);

  // Nothing ranked, or still loading: render nothing rather than an empty shell.
  if (!people || people.length === 0) return null;

  return (
    <section className="pymk-shell" aria-label="People you may know">
      <style>{`
        .pymk-shell {
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.07);
          background: rgba(255,255,255,0.02);
          padding: 12px 10px;
        }
        .pymk-strip {
          display: flex;
          align-items: stretch;
          gap: 8px;
          overflow-x: auto;
          overflow-y: hidden;
          flex-wrap: nowrap;
          touch-action: pan-x;
          overscroll-behavior-x: contain;
          -webkit-overflow-scrolling: touch;
          scroll-snap-type: x proximity;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .pymk-strip::-webkit-scrollbar { display: none; }

        /* One full card plus roughly half of the next, so the row announces
           that it scrolls without a second full card fitting. */
        .pymk-card, .pymk-tail {
          flex: 0 0 auto;
          width: calc(62% - 4px);
          scroll-snap-align: start;
        }

        .pymk-card {
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          min-height: 182px;
          padding: 11px 10px 10px;
          border-radius: 13px;
          border: 1px solid rgba(255,255,255,0.10);
          background:
            linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.018) 46%, rgba(255,255,255,0.028) 100%);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          box-shadow: 0 1px 2px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05);
        }

        /* Neutral watermark glow. Silver only, no hue. */
        .pymk-sheen {
          position: absolute;
          top: -46px; left: 50%;
          width: 168px; height: 104px;
          transform: translateX(-50%);
          pointer-events: none;
          background: radial-gradient(circle at 50% 50%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.05) 42%, rgba(255,255,255,0) 72%);
        }

        .pymk-more {
          position: absolute;
          top: 5px; right: 5px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 22px; height: 22px;
          border-radius: 7px;
          color: rgba(255,255,255,0.30);
          transition: color 140ms ease, background-color 140ms ease;
        }
        .pymk-more:hover { color: rgba(255,255,255,0.75); background: rgba(255,255,255,0.07); }

        .pymk-id { position: relative; display: flex; flex-direction: column; align-items: center; width: 100%; }
        .pymk-avatar {
          display: flex; align-items: center; justify-content: center;
          width: 50px; height: 50px;
          flex-shrink: 0;
          overflow: hidden;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          box-shadow: 0 0 0 3px rgba(255,255,255,0.028);
        }
        .pymk-name {
          margin-top: 8px;
          max-width: 100%;
          font-size: 12.5px;
          font-weight: 700;
          line-height: 1.25;
          color: rgba(255,255,255,0.92);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pymk-headline {
          margin-top: 2px;
          max-width: 100%;
          font-size: 10.5px;
          font-weight: 500;
          line-height: 1.25;
          color: rgba(255,255,255,0.44);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        /* Exactly two lines, clamped, so the bio can never grow the card. */
        .pymk-bio {
          margin-top: 6px;
          width: 100%;
          height: 27px;
          font-size: 10.5px;
          line-height: 13.5px;
          color: rgba(255,255,255,0.36);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .pymk-mutual {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          min-height: 15px;
          margin-top: 4px;
          font-size: 10px;
          font-weight: 500;
          color: rgba(255,255,255,0.34);
        }
        .pymk-btn {
          margin-top: auto;
          width: 100%;
          height: 27px;
          border-radius: 8px;
          font-size: 11.5px;
          font-weight: 600;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.10);
          color: rgba(255,255,255,0.88);
          transition: background-color 140ms ease, color 140ms ease;
        }
        .pymk-btn:hover { background: rgba(255,255,255,0.15); }
        .pymk-btn:disabled { opacity: 0.5; }
        .pymk-btn-on {
          border-color: rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.46);
        }
        .pymk-btn-on:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.72); }

        /* Tail card: reaching the end lands on the full People page rather than
           looping duplicated profiles back around. */
        .pymk-tail {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 7px;
          min-height: 182px;
          border-radius: 13px;
          border: 1px dashed rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.015);
          font-size: 11.5px;
          font-weight: 600;
          color: rgba(255,255,255,0.42);
          transition: background-color 140ms ease, color 140ms ease;
        }
        .pymk-tail:hover { background: rgba(255,255,255,0.045); color: rgba(255,255,255,0.78); }

        .pymk-more:focus-visible, .pymk-id:focus-visible, .pymk-btn:focus-visible, .pymk-tail:focus-visible, .pymk-seeall:focus-visible {
          outline: 2px solid rgba(255,255,255,0.55);
          outline-offset: 2px;
          border-radius: 8px;
        }

        /* Exactly three cards from tablet up, sized off the real container width. */
        @media (min-width: 768px) {
          .pymk-card, .pymk-tail { width: calc((100% - 16px) / 3); }
          .pymk-card { min-height: 190px; }
          .pymk-tail { min-height: 190px; }
          .pymk-avatar { width: 54px; height: 54px; }
        }
      `}</style>

      <div className="mb-2.5 flex items-center justify-between px-0.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.10em] text-white/28">
          <Users className="h-3 w-3" /> People you may know
        </span>
        <Link
          href="/people"
          className="pymk-seeall text-[11px] font-semibold text-white/35 transition-colors hover:text-white/70"
        >
          See all
        </Link>
      </div>

      <div className="pymk-strip">
        {people.map((p) => (
          <PersonCard
            key={p.userId}
            person={p}
            following={following.has(p.userId)}
            pending={pending.has(p.userId)}
            onToggle={toggle}
          />
        ))}
        <Link href="/people" className="pymk-tail" aria-label="See all people">
          <ArrowRight className="h-4 w-4" />
          See all people
        </Link>
      </div>
    </section>
  );
}
