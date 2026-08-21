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
 * viewer crosses a copy boundary.
 *
 * There is no autoplay: the row moves only when the viewer moves it. What the
 * rewind buys is that scrolling left or right never reaches an end.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUp, Users } from 'lucide-react';

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
  upraised, upraisePending, onUpraise,
}: {
  person: PersonRecommendation;
  following: boolean;
  pending: boolean;
  onToggle: (id: string) => void;
  upraised: boolean;
  upraisePending: boolean;
  onUpraise: (id: string) => void;
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

      <div className="pymk-actions">
        <button
          type="button"
          disabled={pending}
          onClick={() => onToggle(person.userId)}
          aria-label={following ? `Unfollow ${person.name}` : `Follow ${person.name}`}
          className={following ? 'pymk-btn pymk-btn-on' : 'pymk-btn'}
        >
          {following ? 'Following' : 'Follow'}
        </button>

        {/* Secondary action — icon only. Same handler and endpoint as before;
            aria-pressed is what carries the on/off state now that the label
            no longer changes. */}
        <button
          type="button"
          disabled={upraisePending}
          onClick={() => onUpraise(person.userId)}
          aria-pressed={upraised}
          aria-label="Upraise"
          title="Upraise"
          className={upraised ? 'pymk-up pymk-up-on' : 'pymk-up'}
        >
          <ArrowUp className="pymk-up-icon" aria-hidden="true" />
        </button>
      </div>
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
  /* Upraise is a separate toggle with its own in-flight guard, so a pending
     follow never blocks it and vice versa. */
  const [upraised, setUpraised] = useState<Set<string>>(new Set());
  const [upraisePending, setUpraisePending] = useState<Set<string>>(new Set());
  const upraiseInFlight = useRef<Set<string>>(new Set());
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

  /* Which of these people the viewer has already upraised. One request for the
     whole strip, from the endpoint that already exists — not one call per card,
     and no separate upraise store of our own. */
  useEffect(() => {
    let cancelled = false;
    fetch('/api/upraise/my-list')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { upraisedIds?: string[] } | null) => {
        if (cancelled || !Array.isArray(d?.upraisedIds)) return;
        setUpraised(new Set(d!.upraisedIds));
      })
      .catch(() => {});
    return () => { cancelled = true; };
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

  /* Optimistic, with rollback, through the existing toggle endpoint. The
     response is authoritative: an upraise that was already recorded settles to
     whatever the server reports rather than to what the click assumed. */
  const toggleUpraise = useCallback(async (targetUserId: string) => {
    if (upraiseInFlight.current.has(targetUserId)) return;
    upraiseInFlight.current.add(targetUserId);
    const had = upraised.has(targetUserId);
    setUpraisePending((p) => new Set(p).add(targetUserId));
    setUpraised((prev) => { const n = new Set(prev); if (had) n.delete(targetUserId); else n.add(targetUserId); return n; });
    try {
      const res = await fetch(`/api/upraise/${encodeURIComponent(targetUserId)}`, { method: 'POST' });
      if (!res.ok) throw new Error('failed');
      const d = await res.json() as { hasUpraised?: boolean };
      if (typeof d.hasUpraised === 'boolean') {
        setUpraised((prev) => {
          const n = new Set(prev);
          if (d.hasUpraised) n.add(targetUserId); else n.delete(targetUserId);
          return n;
        });
      }
    } catch {
      setUpraised((prev) => { const n = new Set(prev); if (had) n.add(targetUserId); else n.delete(targetUserId); return n; });
    } finally {
      upraiseInFlight.current.delete(targetUserId);
      setUpraisePending((p) => { const n = new Set(p); n.delete(targetUserId); return n; });
    }
  }, [upraised]);

  // Nothing ranked, or still loading: render nothing rather than an empty shell.
  if (!people || people.length === 0) return null;

  return (
    <section className="pymk-shell" aria-label="People you may know">
      <style>{`
        /* A module, not another feed item: black first, glass second, and a
           trace of the purple already used for messaging. Colours are authored
           dark-only on purpose — light mode inverts this whole shell
           (globals.css inverts it with filter: invert(1) hue-rotate(180deg)), so a second
           light-mode palette here would be inverted too and come out dark on
           dark. The hue-rotate is what keeps the purple reading as purple in
           both themes. */
        .pymk-shell {
          position: relative;
          margin: 18px 0;
          /* No horizontal inset: the drifting row runs to both edges of the
             band, so cards enter and leave the frame instead of stopping
             short of it. The header keeps its own inset below. */
          padding: 14px 0 16px;
          /* Square on purpose: this is a band of the feed, not a card floating
             on it. Only the people inside are cards. */
          border-radius: 0;
          /* Two hairlines instead of an outline — an outline would redraw the
             rounded-card silhouette the radius just removed. */
          border: none;
          border-top: 1px solid rgba(180,150,255,0.07);
          border-bottom: 1px solid rgba(180,150,255,0.07);
          background:
            radial-gradient(circle at 18% 0%, rgba(150,110,255,0.065), transparent 42%),
            radial-gradient(circle at 88% 100%, rgba(120,90,220,0.035), transparent 48%),
            linear-gradient(135deg, rgba(8,8,11,0.98) 0%, rgba(20,15,30,0.96) 50%, rgba(8,8,11,0.99) 100%);
          backdrop-filter: blur(18px) saturate(120%);
          -webkit-backdrop-filter: blur(18px) saturate(120%);
          /* No drop shadow: a shadow is what makes a panel read as lifted off
             the page. The band sits in the page, so only the inner highlight
             stays. */
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.035);
        }
        @media (min-width: 640px) {
          .pymk-shell { padding: 16px 0 18px; }
        }
        /* Only the header is inset — the row itself is full-bleed. The wider
           inset lives here, after the base rule, so it actually wins: both
           selectors have the same specificity and source order decides. */
        .pymk-head { padding-left: 14px; padding-right: 14px; }
        @media (min-width: 640px) {
          .pymk-head { padding-left: 18px; padding-right: 18px; }
        }
        .pymk-strip {
          display: flex;
          /* stretch is belt-and-braces behind the fixed card height below: the
             row stays uniform even if a card ever loses its height. */
          align-items: stretch;
          gap: 10px;
          /* Cards are inset from the viewport edge; the band behind them still
             runs full width. Percentage card widths resolve against this
             padded content box, so the peek maths below stays correct. */
          padding-left: 16px;
          padding-right: 16px;
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
           the viewer the row scrolls. Each person is a rounded glass card
           against the square module band around them. */
        .pymk-person {
          flex: 0 0 auto;
          /* One whole card plus ~45% of the next, at any viewport.

             The visible run at rest is the strip minus its 16px left inset
             (the 16px right inset is scroll runway the next card shows
             through), so:
               W + gap + 0.45W = clientWidth - 16
               1.45W           = (content + 32) - 16 - gap
               W               = (content + 6px) / 1.45     [gap = 10px]
             Derived rather than hardcoded, so 390 / 414 / 430 all land on the
             same ratio instead of one width happening to look right. */
          width: calc((100% + 6px) / 1.45);
          /* A FIXED height, not a floor. Every card is identical regardless of
             name length, a missing headline, bio length or mutual count — the
             content inside is already clamped (name and headline to one line,
             bio to two, the mutual row to a min-height), so nothing can
             overflow this box. */
          height: 196px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          /* Width, flex and min-height above are untouched — only the surface
             below changed, so the peek ratio and scrolling behave as before. */
          padding: 12px 8px 10px;
          /* The people stay rounded — that contrast against the square band
             is what creates the feed → module → card hierarchy. */
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.07);
          background: rgba(255,255,255,0.035);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          box-shadow:
            0 6px 20px rgba(0,0,0,0.14),
            inset 0 1px 0 rgba(255,255,255,0.035);
        }

        /* Inside the card, glass is reserved for the small interactive parts —
           the avatar ring and the Follow control — so they read as controls
           rather than blending into the card surface behind them. */
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
        /* One row, so the card height is unchanged by the second action. */
        .pymk-actions {
          margin-top: auto;
          display: flex;
          align-items: stretch;
          gap: 5px;
          width: 100%;
        }
        .pymk-btn {
          flex: 1 1 auto;
          min-width: 0;
          height: 26px;
          border-radius: 8px;
          font-size: 11.5px;
          font-weight: 600;
          /* Colour only — height, radius, flex and type are as they were. */
          border: 1px solid rgba(180,150,255,0.14);
          background: rgba(150,110,255,0.08);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          color: rgba(255,255,255,0.82);
          transition: background-color 140ms ease, color 140ms ease, border-color 140ms ease;
        }
        .pymk-btn:hover { background-color: rgba(150,110,255,0.13); border-color: rgba(180,150,255,0.22); }
        .pymk-btn:disabled { opacity: 0.5; }
        .pymk-btn-on {
          border-color: rgba(255,255,255,0.09);
          color: rgba(255,255,255,0.46);
        }
        .pymk-btn-on:hover { color: rgba(255,255,255,0.72); }

        /* Secondary: quieter than Follow, same glass family, no colour. */
        .pymk-up {
          flex: 0 0 auto;
          /* Square at the same 26px row height, so the card does not grow. */
          height: 26px;
          width: 26px;
          padding: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.02);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          color: rgba(255,255,255,0.50);
          transition: background-color 140ms ease, color 140ms ease, border-color 140ms ease;
        }
        .pymk-up-icon { width: 15px; height: 15px; }
        .pymk-up:hover { background-color: rgba(255,255,255,0.06); color: rgba(255,255,255,0.80); }
        .pymk-up:disabled { opacity: 0.5; cursor: not-allowed; }
        .pymk-up-on {
          border-color: rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.82);
        }

        /* Inline style sets the resting colour, so the hover needs the same
           weight to win. Brighter, never neon. */
        .pymk-seeall:hover { color: rgba(214,200,255,0.95) !important; }

        .pymk-id:focus-visible, .pymk-btn:focus-visible, .pymk-seeall:focus-visible {
          outline: 2px solid rgba(255,255,255,0.55);
          outline-offset: 2px;
          border-radius: 8px;
        }
        /* The upraise button is round, so its focus ring must be too. */
        .pymk-up:focus-visible {
          outline: 2px solid rgba(255,255,255,0.55);
          outline-offset: 2px;
          border-radius: 999px;
        }

        /* Three people across from tablet up, with the fourth peeking so the
           row still reads as scrollable. */
        @media (min-width: 768px) {
          .pymk-person { width: calc((100% - 34px) / 3.35); }
        }
      `}</style>

      <div className="pymk-head mb-3 flex items-center justify-between">
        {/* Lowercase and unshouted — the section reads as a label, not a
            heading competing with the posts around it. */}
        <span
          className="inline-flex items-center gap-1.5 text-[13px] font-medium tracking-[0.02em]"
          style={{ color: 'rgba(255,255,255,0.78)' }}
        >
          <Users className="h-3.5 w-3.5" /> people you may know
        </span>
        <Link
          href="/people"
          className="pymk-seeall text-[12px] font-medium transition-colors"
          style={{ color: 'rgba(190,170,255,0.72)' }}
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
            upraised={upraised.has(p.userId)}
            upraisePending={upraisePending.has(p.userId)}
            onUpraise={toggleUpraise}
          />
        ))}
      </div>
    </section>
  );
}
