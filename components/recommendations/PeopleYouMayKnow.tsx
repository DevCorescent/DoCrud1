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
 * The strip is natively scrolled and endless: the list is rendered three times
 * and the scroll offset is silently rewound by one copy width whenever the
 * viewer crosses a copy boundary. There is no autoplay, no interval and no
 * animation — the row moves only when the viewer moves it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';

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

/** Below this the row is shorter than the viewport and looping is pointless. */
const MIN_FOR_LOOP = 4;

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

function Person({
  person, following, pending, onToggle,
}: {
  person: PersonRecommendation;
  following: boolean;
  pending: boolean;
  onToggle: (id: string) => void;
}) {
  const [broken, setBroken] = useState(false);
  const secondary = person.headline || person.location || person.skills.slice(0, 2).join(' · ');
  const bio = person.shortBio || person.skills.slice(0, 3).join(' · ') || '';

  return (
    <article className="pymk-person">
      <Link href={`/u/${person.userId}`} className="pymk-id">
        <span className="pymk-avatar">
          {person.avatarUrl && !broken
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={person.avatarUrl} alt={person.name} onError={() => setBroken(true)} className="h-full w-full object-cover" data-no-invert />
            : <span className="text-[15px] font-bold text-white/55">{initials(person.name) || '?'}</span>}
        </span>
        <span className="pymk-name">{person.name}</span>
        {secondary && <span className="pymk-headline">{secondary}</span>}
      </Link>

      {/* Exactly two lines, clamped, so a long bio cannot grow the row. */}
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
     read the same stale Set. A ref is updated synchronously. */
  const inFlight = useRef<Set<string>>(new Set());
  const fetched = useRef(false);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const copyWidth = useRef(0);

  /* One request for the lifetime of the module. No polling, no refetch on scroll. */
  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    fetch('/api/recommendations/people')
      .then((r) => (r.ok ? r.json() : { people: [] }))
      .then((d: { people?: PersonRecommendation[] }) => setPeople(Array.isArray(d.people) ? d.people : []))
      .catch(() => setPeople([]));
  }, []);

  const list = useMemo(() => people ?? [], [people]);
  const loop = list.length >= MIN_FOR_LOOP;

  /* Three identical copies. Only a fraction of one copy is ever on screen, so
     no viewer sees the same person twice; the copies exist purely to give the
     scroller room to be rewound without the content changing under the hand. */
  const rendered = useMemo(
    () => (loop
      ? [0, 1, 2].flatMap((copy) => list.map((p) => ({ p, copy })))
      : list.map((p) => ({ p, copy: 0 }))),
    [list, loop],
  );

  /* Park the viewer in the middle copy, and keep the copy width current. */
  useEffect(() => {
    if (!loop) return;
    const el = stripRef.current;
    if (!el) return;
    const measure = () => {
      /* Measure the pitch from the elements themselves. scrollWidth / 3 is
         off by two thirds of a flex gap, and that error accumulates into a
         visible drift after a few laps. */
      const kids = el.children;
      const n = kids.length / 3;
      const first = kids[0] as HTMLElement | undefined;
      const second = kids[n] as HTMLElement | undefined;
      const one = first && second ? second.offsetLeft - first.offsetLeft : el.scrollWidth / 3;
      copyWidth.current = one;
      if (el.scrollLeft < 1) el.scrollLeft = one;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loop, rendered.length]);

  /* The one scroll listener in the module, and the only way to make a native
     scroller endless: when the viewer leaves the middle copy, shift the offset
     by exactly one copy. The pixels either side are identical, so nothing
     visibly moves and momentum is left to the browser. */
  useEffect(() => {
    if (!loop) return;
    const el = stripRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const one = copyWidth.current;
        if (one <= 0) return;
        if (el.scrollLeft < one * 0.5) el.scrollLeft += one;
        else if (el.scrollLeft > one * 1.5) el.scrollLeft -= one;
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [loop]);

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
        /* No container box: the module is a header plus a row of people sitting
           directly on the feed background, with breathing room either side. */
        .pymk-shell {
          margin-top: 18px;
          margin-bottom: 22px;
        }
        .pymk-strip {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding-bottom: 2px;
          overflow-x: auto;
          overflow-y: hidden;
          flex-wrap: nowrap;
          touch-action: pan-x;
          overscroll-behavior-x: contain;
          -webkit-overflow-scrolling: touch;
          scroll-behavior: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .pymk-strip::-webkit-scrollbar { display: none; }

        /* One full person plus roughly half of the next, which is what tells
           the viewer the row scrolls. No card, no border, no background. */
        .pymk-person {
          flex: 0 0 auto;
          width: calc(62% - 5px);
          /* A fixed floor keeps the Follow controls on one line across the row
             even when a person has no headline. */
          min-height: 178px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 2px 4px 0;
          background: none;
          border: none;
          box-shadow: none;
        }

        /* Glass is kept to the small interactive parts — the avatar ring and
           the Follow control. Nothing draws a rectangle around a person. */
        .pymk-id { display: flex; flex-direction: column; align-items: center; width: 100%; text-decoration: none; }
        .pymk-avatar {
          display: flex; align-items: center; justify-content: center;
          width: 54px; height: 54px;
          flex-shrink: 0;
          overflow: hidden;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.10);
          background: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.015));
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          box-shadow: 0 0 0 3px rgba(255,255,255,0.022);
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
        .pymk-bio {
          margin-top: 5px;
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
          margin-top: 3px;
          font-size: 10px;
          font-weight: 500;
          color: rgba(255,255,255,0.34);
        }
        .pymk-btn {
          margin-top: auto;
          width: 100%;
          height: 26px;
          border-radius: 8px;
          font-size: 11.5px;
          font-weight: 600;
          border: 1px solid rgba(255,255,255,0.14);
          background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          color: rgba(255,255,255,0.88);
          transition: background-color 140ms ease, color 140ms ease, border-color 140ms ease;
        }
        .pymk-btn:hover { background-color: rgba(255,255,255,0.07); border-color: rgba(255,255,255,0.22); }
        .pymk-btn:disabled { opacity: 0.5; }
        .pymk-btn-on {
          border-color: rgba(255,255,255,0.09);
          color: rgba(255,255,255,0.46);
        }
        .pymk-btn-on:hover { color: rgba(255,255,255,0.72); }

        .pymk-id:focus-visible, .pymk-btn:focus-visible, .pymk-seeall:focus-visible {
          outline: 2px solid rgba(255,255,255,0.55);
          outline-offset: 2px;
          border-radius: 8px;
        }

        /* Three people across from tablet up, with the fourth peeking so the
           row still reads as scrollable. */
        @media (min-width: 768px) {
          .pymk-person { width: calc((100% - 34px) / 3.35); }
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

      <div className="pymk-strip" ref={stripRef}>
        {rendered.map(({ p, copy }) => (
          <Person
            key={`${copy}-${p.userId}`}
            person={p}
            following={following.has(p.userId)}
            pending={pending.has(p.userId)}
            onToggle={toggle}
          />
        ))}
      </div>
    </section>
  );
}
