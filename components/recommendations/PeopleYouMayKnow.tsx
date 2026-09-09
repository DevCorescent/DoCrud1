'use client';

/**
 * Your Potential Connections — a feed item, not a homepage section.
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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/* A layout effect in the browser so the module never paints in the wrong shape
   for a frame; a plain effect on the server, where React warns about the
   former. */
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;
import Link from 'next/link';
import { ArrowUp, Compass, MapPin, Sparkles, Tag, Users } from 'lucide-react';
import { cachedJson } from '@/lib/client/request-cache';

/** Mirrors the API's own type — see app/api/recommendations/people/route.ts. */
export type PersonReason =
  | { kind: 'mutual'; count: number }
  | { kind: 'skills'; values: string[] }
  | { kind: 'interests'; values: string[] }
  | { kind: 'domain'; values: string[] }
  | { kind: 'location'; value: string }
  | { kind: 'discovery' };

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
  reasons?: PersonReason[];
};

/**
 * The reason, in words.
 *
 * Wording only — every fact here was computed by the ranking that put this
 * person in the row, so a card can never claim a match the score did not
 * actually use. `discovery` is the one that says nothing matched, and it is
 * styled differently for exactly that reason: it must not look like evidence.
 */
function describeReason(reason: PersonReason | undefined): {
  Icon: typeof Users; text: string; matched: boolean;
} {
  if (!reason) return { Icon: Compass, text: 'New to your network', matched: false };
  switch (reason.kind) {
    case 'mutual':
      return {
        Icon: Users,
        text: `${reason.count} mutual connection${reason.count === 1 ? '' : 's'}`,
        matched: true,
      };
    case 'skills':
      return { Icon: Sparkles, text: `Also works with ${listOf(reason.values)}`, matched: true };
    case 'interests':
      return { Icon: Tag, text: `Shares your interest in ${listOf(reason.values)}`, matched: true };
    case 'domain':
      return { Icon: Sparkles, text: `Similar role — ${listOf(reason.values)}`, matched: true };
    case 'location':
      return { Icon: MapPin, text: `Also in ${reason.value}`, matched: true };
    default:
      return { Icon: Compass, text: 'New to your network', matched: false };
  }
}

/** Two named things at most — the card is narrow, and "+3 more" reads as noise. */
function listOf(values: string[]): string {
  const shown = values.slice(0, 2);
  if (shown.length === 0) return 'similar work';
  if (shown.length === 1) return shown[0];
  return `${shown[0]} and ${shown[1]}`;
}

/** Below this the row is shorter than the viewport and looping is pointless. */
const MIN_FOR_LOOP = 4;

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

function Person({
  person, following, pending, onToggle,
  upraised, upraisePending, onUpraise,
  /* True for the duplicate copies that only exist to give the scroller
     runway. They are the SAME seven people repeated, so a screen reader that
     announces them announces the row three times, and tabbing crosses 21
     identical cards to leave the module. Copies are decoration; only one copy
     is in the accessibility tree and the tab order. */
  presentational = false,
}: {
  person: PersonRecommendation;
  following: boolean;
  pending: boolean;
  onToggle: (id: string) => void;
  upraised: boolean;
  upraisePending: boolean;
  onUpraise: (id: string) => void;
  presentational?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  /* Headline or location ONLY — never a fallback to skills. The old fallback
     ran alongside a bio that fell back to the same list, so a member with no
     headline got "SQL · Python" stacked directly on "SQL · Python · HTML".
     Anyone with neither simply shows their name and the reason below it. */
  const secondary = person.headline || person.location || '';
  const why = describeReason(person.reasons?.[0]);

  const inert = presentational ? -1 : undefined;

  return (
    <article className="pymk-person" aria-hidden={presentational || undefined}>
      <Link href={`/u/${person.userId}`} className="pymk-id" tabIndex={inert}>
        <span className="pymk-avatar">
          {person.avatarUrl && !broken
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={person.avatarUrl} alt={person.name} onError={() => setBroken(true)} className="h-full w-full object-cover" data-no-invert />
            : <span className="text-[15px] font-bold text-white/55">{initials(person.name) || '?'}</span>}
        </span>
        <span className="pymk-name">{person.name}</span>
        {/* Rendered even when empty. Roughly half these members have no
            headline, and skipping the element moved their reason pill and
            Follow button up by a line — so a row of cards had its parts at
            three different heights. The slot is always there; only the text
            is optional. */}
        <span className="pymk-headline">{secondary}</span>
      </Link>

      {/* Why this person is here. Two clamped lines, fixed box, so the row
          stays uniform however long the reason runs. */}
      <p className={why.matched ? 'pymk-why' : 'pymk-why pymk-why-quiet'}>
        <why.Icon className="pymk-why-icon" aria-hidden="true" />
        <span className="pymk-why-text">{why.text}</span>
      </p>

      {/* Only rendered when the follow graph actually produced mutuals. */}
      <div className="pymk-mutual">
        {person.mutualCount > 0 && (
          <>
            {person.mutualAvatars.length > 0 && (
              <span className="flex -space-x-1.5">
                {person.mutualAvatars.map((a, i) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img key={i} src={a} alt="" className="h-3.5 w-3.5 rounded-[4px] border border-black/60 object-cover" data-no-invert />
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
          tabIndex={inert}
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
          tabIndex={inert}
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

const CARD_CSS = `
        /* A person, shaped for a column.
           Deliberately not a post card: a post is a header above a body above
           a row of actions, and this is one horizontal line. It is also flatter
           — no lift, a tighter radius — so a face never competes with a photo
           somebody posted. */
        .pymk-row {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
          padding: 12px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.07);
          background: linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.022) 100%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.055);
          transition: border-color 180ms ease, background 180ms ease;
        }
        .pymk-row:hover {
          border-color: rgba(255,255,255,0.15);
          background: linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.032) 100%);
        }
        .pymk-row-id {
          display: flex;
          align-items: center;
          gap: 11px;
          min-width: 0;
          flex: 1 1 auto;
          text-decoration: none;
        }
        .pymk-row-avatar { width: 46px; height: 46px; border-radius: 13px; }
        .pymk-row-text { display: flex; flex-direction: column; min-width: 0; }
        .pymk-row-name {
          font-size: 12.5px;
          font-weight: 650;
          line-height: 1.25;
          letter-spacing: -0.012em;
          color: rgba(255,255,255,0.92);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        /* A reserved slot, as in the tile: roughly half these members have no
           headline, and skipping the line moved everything below it up. */
        .pymk-row-headline {
          height: 13px;
          margin-top: 1px;
          font-size: 10.5px;
          font-weight: 500;
          line-height: 13px;
          color: rgba(255,255,255,0.54);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        /* One line here, not two: the reason sits beside a face rather than
           under it, and a second line would push the card taller than the
           avatar for no gain. */
        .pymk-row-why {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-top: 4px;
          min-width: 0;
          font-size: 10px;
          line-height: 13px;
          color: rgba(226,226,232,0.72);
        }
        .pymk-row-why-quiet { color: rgba(255,255,255,0.46); }
        .pymk-row-why-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pymk-row-actions { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
        .pymk-row-actions .pymk-btn { flex: 0 0 auto; padding: 0 14px; }
        .pymk-row-id:focus-visible {
          outline: 2px solid rgba(255,255,255,0.55);
          outline-offset: 2px;
          border-radius: 10px;
        }

        /* ── The edges ──
           The row is endless, so there is ALWAYS a card part-way off each
           side; without this they end at a hard vertical cut that reads as a
           clipping bug rather than as more content. A mask fades the cards
           themselves out into the band, which is why it is a mask and not two
           gradient overlays: an overlay has to match whatever is behind it,
           and this band sits on a page whose background moves. The mask is
           applied to the scroller's padding box, so it stays pinned at the
           edges while the content slides underneath it. */
        .pymk-avatar {
          display: flex; align-items: center; justify-content: center;
          width: 56px; height: 56px;
          flex-shrink: 0;
          overflow: hidden;
          /* Squircle. A rounded square reads as a profile tile rather than a
             chat bubble, and it lines up with the square corners of the card
             and the reason pill below it. */
          /* Outer radius minus the padding between them, so the curves are
             concentric rather than two unrelated roundings. */
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.12);
          background: linear-gradient(180deg, rgba(255,255,255,0.085), rgba(255,255,255,0.025));
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.10),
            0 4px 12px rgba(0,0,0,0.28);
        }
        .pymk-why-icon { width: 11px; height: 11px; flex: 0 0 auto; opacity: 0.75; }
        .pymk-btn {
          flex: 1 1 auto;
          min-width: 0;
          height: 26px;
          border-radius: 8px;
          font-size: 11.5px;
          font-weight: 600;
          /* Colour only — height, radius, flex and type are as they were. */
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.07);
          color: rgba(255,255,255,0.90);
          transition: background-color 140ms ease, color 140ms ease, border-color 140ms ease;
        }
        .pymk-btn:hover { background-color: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.28); }
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
          border-radius: 9px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.02);
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
        .pymk-up:focus-visible {
          outline: 2px solid rgba(255,255,255,0.55);
          outline-offset: 2px;
          border-radius: 9px;
        }

        /* Three people across from tablet up, with the fourth peeking so the
           row still reads as scrollable. */
`;

/**
 * The card styles, on their own.
 *
 * A suggested person is now shown in two places: inside this module on a
 * phone, and as a card of its own among the posts on the desktop grid — where
 * this component does not render at all. The rules a card needs therefore
 * cannot live only in the module's own <style>, or the scattered cards would
 * arrive unstyled. The feed renders this once; the module includes it below.
 */
export function PersonCardStyles() {
  return <style>{CARD_CSS}</style>;
}

const STRIP_CSS = `
        .pymk-shell {
          position: relative;
          /* The strip inside scrolls horizontally; without this the shell
             reports its content width as a minimum and grows its container. */
          min-width: 0;
          margin: 18px 0;
          /* No horizontal inset: the drifting row runs to both edges of the
             band, so cards enter and leave the frame instead of stopping
             short of it. The header keeps its own inset below. */
          padding: 14px 0 4px;
          /* Square on purpose: this is a band of the feed, not a card floating
             on it. Only the people inside are cards. */
          border-radius: 0;
          /* Two hairlines instead of an outline — an outline would redraw the
             rounded-card silhouette the radius just removed. */
          border: none;
          border-top: 1px solid rgba(255,255,255,0.075);
          border-bottom: 1px solid rgba(255,255,255,0.075);
          /* Neutral, and quieter than the cards it holds. The section is
             marked out by its two hairlines and the faint lift below, not by
             a colour — a tinted band competes with the posts either side of
             it, which is the opposite of highlighting the section. */
          background: linear-gradient(180deg, rgba(255,255,255,0.030) 0%, rgba(255,255,255,0.012) 100%);
          backdrop-filter: blur(18px) saturate(120%);
          -webkit-backdrop-filter: blur(18px) saturate(120%);
          /* No drop shadow: a shadow is what makes a panel read as lifted off
             the page. The band sits in the page, so only the inner highlight
             stays. */
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.035);
        }
        @media (min-width: 640px) {
          .pymk-shell { padding: 16px 0 6px; }
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
          /* ── Room for the hover ──
             A card lifts 2px and grows its shadow on hover, and this scroller
             clips vertically — overflow-x: auto forces overflow-y to a
             clipping value, so "visible" is not available here. Without this
             padding the raised card had its top edge sliced off at exactly the
             moment the pointer drew attention to it.

             The space is not new: the header's 12px bottom margin moved in
             here, and the shell gave up 12px of its bottom padding below. The
             band is the same height it was; the room is simply INSIDE the clip
             now instead of outside it, which is the whole point. */
          padding-top: 12px;
          padding-bottom: 14px;
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

        /* ══ On the feed's grid ══
           The module's cell spans the full width, and this lays the people out
           on the very same columns the posts use — same count, same 24px
           gutter — so the block reads as part of the grid rather than as a
           panel dropped into it. The column count comes from FeedBento. */
        .pymk-strip {
          --pymk-fade: 28px;
          -webkit-mask-image: linear-gradient(
            to right,
            transparent 0,
            #000 var(--pymk-fade),
            #000 calc(100% - var(--pymk-fade)),
            transparent 100%
          );
          mask-image: linear-gradient(
            to right,
            transparent 0,
            #000 var(--pymk-fade),
            #000 calc(100% - var(--pymk-fade)),
            transparent 100%
          );
        }
        @media (min-width: 1024px) {
          /* Wider, because the band is wider and a 28px fade on 1300px reads
             as a smudge at the edge rather than as depth. */
          .pymk-strip { --pymk-fade: 56px; }
        }

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
          height: 208px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          /* Width, flex and min-height above are untouched — only the surface
             below changed, so the peek ratio and scrolling behave as before. */
          padding: 14px 10px 12px;
          /* The people stay rounded — that contrast against the square band
             is what creates the feed → module → card hierarchy. */
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.075);
          /* Glass: a light top edge falling away down the card, a real blur
             behind it, and a lifted top highlight. */
          /* No backdrop filter on the person cards. There are twenty-one of
             them in the strip (three copies of seven), each one re-sampling
             what is behind it every frame the row moves — and what is behind
             them is the band's own flat gradient, so the blur had almost
             nothing to blur. The band itself still has one, which is where the
             glass actually reads. */
          background: linear-gradient(180deg, rgba(255,255,255,0.085) 0%, rgba(255,255,255,0.032) 100%);
          box-shadow:
            0 10px 30px rgba(0,0,0,0.26),
            inset 0 1px 0 rgba(255,255,255,0.08);
          transition: border-color 180ms ease, background 180ms ease, transform 180ms ease, box-shadow 180ms ease;
        }
        .pymk-person:hover {
          border-color: rgba(255,255,255,0.18);
          background: linear-gradient(180deg, rgba(255,255,255,0.105) 0%, rgba(255,255,255,0.042) 100%);
          box-shadow:
            0 14px 38px rgba(0,0,0,0.32),
            inset 0 1px 0 rgba(255,255,255,0.10);
          transform: translateY(-2px);
        }

        /* Inside the card, glass is reserved for the small interactive parts —
           the avatar ring and the Follow control — so they read as controls
           rather than blending into the card surface behind them. */
        .pymk-id { display: flex; flex-direction: column; align-items: center; width: 100%; text-decoration: none; }
        .pymk-name {
          margin-top: 10px;
          max-width: 100%;
          font-size: 12.5px;
          font-weight: 650;
          line-height: 1.25;
          letter-spacing: -0.012em;
          color: rgba(255,255,255,0.92);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pymk-headline {
          margin-top: 3px;
          max-width: 100%;
          /* A reserved slot, not a line of text that may or may not exist. */
          height: 13px;
          font-size: 10.5px;
          font-weight: 500;
          line-height: 13px;
          letter-spacing: 0.005em;
          color: rgba(255,255,255,0.54);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        /* The reason pill.
           A fixed box — two clamped lines — so a long reason cannot make one
           card taller than its neighbours. Left-aligned inside a centred card
           on purpose: it is a sentence, and centred two-line sentences ragged
           on both edges are what make a card look homemade. */
        .pymk-why {
          margin-top: 9px;
          width: 100%;
          height: 34px;
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 4px 7px;
          border-radius: 9px;
          text-align: left;
          font-size: 10px;
          line-height: 13px;
          border: 1px solid rgba(255,255,255,0.075);
          background: rgba(255,255,255,0.042);
          color: rgba(255,255,255,0.74);
        }
        .pymk-why-text {
          min-width: 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        /* Discovery fill matched on NOTHING. It gets no accent, so a card with
           real evidence is never visually equal to one without any. */
        .pymk-why-quiet {
          border-color: rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.022);
          color: rgba(255,255,255,0.50);
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
          color: rgba(255,255,255,0.52);
        }
        /* One row, so the card height is unchanged by the second action. */
        .pymk-actions {
          margin-top: auto;
          display: flex;
          align-items: stretch;
          gap: 5px;
          width: 100%;
        }
        .pymk-seeall:hover { color: rgba(255,255,255,0.95) !important; }

        .pymk-id:focus-visible, .pymk-btn:focus-visible, .pymk-seeall:focus-visible {
          outline: 2px solid rgba(255,255,255,0.55);
          outline-offset: 2px;
          border-radius: 8px;
        }
        @media (min-width: 768px) {
          .pymk-person { width: calc((100% - 34px) / 3.35); }
        }

        /* ── Desktop: a full-stretch slider ──
           The band runs the whole width of the feed here, so the card width is
           FIXED rather than a fraction: how many people are on screen then
           follows the width of the monitor instead of always being the same
           three, stretched. Content is flush with the feed's own columns —
           an inset would have the row start a few pixels off every post
           beside it. */
        @media (min-width: 1024px) {
          .pymk-shell { margin: 0; padding: 16px 0 6px; }
          .pymk-head { padding-left: 0; padding-right: 0; }
          .pymk-strip { padding-left: 0; padding-right: 0; gap: 12px; }
          .pymk-person { width: 268px; height: 214px; padding: 14px 10px 12px; }
          .pymk-avatar { width: 58px; height: 58px; }
          .pymk-name { font-size: 13px; }
        }

        /* The arrows. A horizontal row is trivial to move on a touchscreen and
           genuinely awkward with a mouse, so they exist only where the pointer
           does. Header-right rather than floating over the cards: an overlay
           would cover the person underneath it. */
      `;

/**
 * The same person, shaped for a column of the feed rather than for a strip.
 *
 * One horizontal line — face, who they are, why they are here, and the action
 * — because at a full column's width the centred tile leaves most of the card
 * empty. It is also the point of difference from a post card: a post is a
 * header above a body above a row of actions, and this is deliberately not
 * that shape.
 */
export function PersonRow({
  person, following, pending, onToggle, upraised, upraisePending, onUpraise,
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
  const secondary = person.headline || person.location || '';
  const why = describeReason(person.reasons?.[0]);

  return (
    <article className="pymk-row">
      <Link href={`/u/${person.userId}`} className="pymk-row-id">
        <span className="pymk-avatar pymk-row-avatar">
          {person.avatarUrl && !broken
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={person.avatarUrl} alt={person.name} onError={() => setBroken(true)} className="h-full w-full object-cover" data-no-invert />
            : <span className="text-[14px] font-bold text-white/55">{initials(person.name) || '?'}</span>}
        </span>
        <span className="pymk-row-text">
          <span className="pymk-row-name">{person.name}</span>
          <span className="pymk-row-headline">{secondary}</span>
          <span className={why.matched ? 'pymk-row-why' : 'pymk-row-why pymk-row-why-quiet'}>
            <why.Icon className="pymk-why-icon" aria-hidden="true" />
            <span className="pymk-row-why-text">{why.text}</span>
          </span>
        </span>
      </Link>

      <span className="pymk-row-actions">
        <button
          type="button"
          disabled={pending}
          onClick={() => onToggle(person.userId)}
          aria-label={following ? `Unfollow ${person.name}` : `Follow ${person.name}`}
          className={following ? 'pymk-btn pymk-btn-on' : 'pymk-btn'}
        >
          {following ? 'Following' : 'Follow'}
        </button>
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
      </span>
    </article>
  );
}

/**
 * The people, and the two things you can do to them.
 *
 * A hook rather than component state because the recommendations are shown in
 * two shapes now: as a horizontal strip on a phone, and as individual cards
 * mixed into the desktop feed among the posts. Both need the same list and the
 * same follow state — two copies would let a Follow register in one place and
 * not the other.
 */
export function usePeopleRecommendations() {
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

  /* One request for the lifetime of the page. No polling, no refetch on scroll. */
  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    /* Same endpoint the homepage Connections count reads. cachedJson collapses
       the pair into one request instead of two identical round trips. */
    cachedJson<{ people?: PersonRecommendation[] }>('/api/recommendations/people')
      .then((d) => setPeople(Array.isArray(d.people) ? d.people : []))
      .catch(() => setPeople([]));
  }, []);

  /* Which of these people the viewer has already upraised. One request for the
     whole set, from the endpoint that already exists — not one call per card,
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

  return { people, following, pending, toggle, upraised, upraisePending, toggleUpraise };
}

export default function PeopleYouMayKnow() {
  const { people, following, pending, toggle, upraised, upraisePending, toggleUpraise } =
    usePeopleRecommendations();
  const stripRef = useRef<HTMLDivElement | null>(null);
  const copyWidth = useRef(0);

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

  const rewind = useCallback(() => {
    const el = stripRef.current;
    const one = copyWidth.current;
    if (!el || one <= 0) return;
    if (el.scrollLeft < one * 0.5) el.scrollLeft += one;
    else if (el.scrollLeft > one * 1.5) el.scrollLeft -= one;
  }, []);

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
      raf = requestAnimationFrame(() => { raf = 0; rewind(); });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [loop, rewind]);

  // Nothing ranked, or still loading: render nothing rather than an empty shell.
  if (!people || people.length === 0) return null;

  return (
    <section className="pymk-shell" aria-label="Your Potential Connections">
      <style>{`${CARD_CSS}${STRIP_CSS}`}</style>

      <div className="pymk-head flex items-center justify-between">
        {/* Lowercase and unshouted — the section reads as a label, not a
            heading competing with the posts around it. */}
        <span
          className="inline-flex items-center gap-1.5 text-[13px] font-medium tracking-[0.02em]"
          style={{ color: 'rgba(255,255,255,0.78)' }}
        >
          <Users className="h-3.5 w-3.5" /> Your Potential Connections
        </span>
        <span className="flex items-center gap-3">
          <Link
            href="/people"
            className="pymk-seeall text-[12px] font-medium transition-colors"
            style={{ color: 'rgba(255,255,255,0.60)' }}
          >
            See all
          </Link>
        </span>
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
            presentational={loop && copy !== 1}
          />
        ))}
      </div>
    </section>
  );
}
