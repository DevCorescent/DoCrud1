'use client';

/**
 * The homepage hero: a full-bleed image slider that runs behind the navigation.
 *
 * ═══ WHAT IT SHOWS ═══
 *
 * The banners Super Admin already manages (/api/public/ad-banners) — an image,
 * a headline, a line under it and up to one link each. Nothing here invents a
 * slide: with no banners configured the component renders nothing at all
 * rather than a placeholder, so an unconfigured deployment gets its feed
 * straight away instead of an empty frame.
 *
 * ═══ WHY THE IMAGE IS A BACKGROUND AND NOT A PICTURE ═══
 *
 * A hero has to hold text at every width, and an <img> laid out in the flow
 * changes height with its own aspect ratio — at 390px a 16:9 banner is 220px
 * tall, at 1600px it is 900px, and the headline sits somewhere different on
 * every screen. The frame owns the height; the image covers it. The gradient
 * over it is what makes white text legible on a photograph nobody vetted.
 *
 * ═══ THE BLEED ═══
 *
 * The picture is bigger than the space the slider occupies in the flow. It runs
 * up behind the announcement bar and the navigation — which are glass, and so
 * pick up whatever is passing under them — and out to both edges of the screen
 * past the content column's gutters. Only the images move; the headline, the
 * button and the dots stay inside the slider's own box, so nothing is hidden
 * under the bar it is bleeding beneath.
 *
 * Both distances are MEASURED, not guessed. The gutter is 24px at one
 * breakpoint and 48px at another, the bar's height is published as
 * `--dc-topnav-h` and changes when it wraps, and the announcement bar above can
 * be dismissed at any moment. A ResizeObserver on the page and the element
 * keeps three custom properties in step with what is actually on screen.
 *
 * ═══ MOVEMENT ═══
 *
 * Slides advance every seven seconds, and the clock restarts on every change so
 * a slide you asked for gets its full time. Hover, focus and a hidden tab all
 * pause it. Swipe works because the track is a scroller with snap points — no
 * drag handler, no library, and the native momentum a phone user expects. The
 * image drifts, the copy rises in sequence as its slide arrives, and the whole
 * picture lags the page slightly as you scroll away from it. Every one of those
 * stops for `prefers-reduced-motion`.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import HeroMotif from '@/components/home/HeroMotif';
import { heroBannerIsShowable, type HeroBanner } from '@/lib/hero-banner';
import './home-hero-slider.css';

const INTERVAL = 7000;

/** How far the picture lags the page as it scrolls away, and the most it may
    lag by. A quarter is enough to read as depth; much more and the image is
    visibly sliding around inside its own frame. */
const PARALLAX = 0.24;
const PARALLAX_MAX = 90;

/**
 * How the slide moves.
 *
 * `scrollTo({ behavior: 'smooth' })` was doing this before, and a browser's
 * built-in smooth scroll is tuned for "jump to an anchor": a short, flat curve
 * that arrives with a stop. Over a full slide width it reads cheap, and it is
 * not adjustable — there is no duration and no easing to pass it.
 *
 * This is the curve instead. Slow to leave, quick through the middle, and a
 * long settle at the end, which is what makes a large object look heavy rather
 * than flicked. The duration grows a little when the jump is more than one
 * slide, but not in proportion — crossing three slides in three times the time
 * is a slideshow nobody waits for.
 */
const GLIDE_MS = 760;
const GLIDE_MAX_MS = 1080;

/** easeInOutQuint. Symmetrical, and gentler at both ends than a cubic. */
function glide(t: number): number {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}

/**
 * A URL as a CSS value.
 *
 * `url(` + the string + `)` is wrong and quietly so: an unquoted url() token
 * cannot contain a parenthesis, a quote or a space, and a banner whose address
 * has any of them — a data URI with `fill="url(#g)"` inside it, an uploaded
 * file called `hero (2).jpg` — parses to nothing, leaving a black frame with
 * no error anywhere. Quote it, and escape what would close the quote.
 */
function cssUrl(src: string): string {
  return `url("${src.replace(/["\\]/g, encodeURIComponent)}")`;
}

/**
 * The two artworks, as custom properties the stylesheet picks between.
 *
 * A media query in the stylesheet chooses which one is painted, so only the
 * one that matches is ever fetched — the phone never downloads the wide
 * artwork and the desktop never downloads the tall one. Doing this in
 * JavaScript instead would mean a resize listener, a re-render, and the wrong
 * picture on the screen until it ran.
 *
 * `load` is what keeps the other slides off the critical path. Every slide is
 * laid out from the first frame, so every background it names is fetched from
 * the first frame — four pictures competing for the connections the one you
 * can actually see needs. Until the page has settled, only the first slide
 * names its artwork; the rest resolve to `none` and cost nothing.
 */
function slideVars(b: HeroBanner, load: boolean): CSSProperties {
  if (!load) return { '--hhs-src': 'none', '--hhs-src-m': 'none' } as CSSProperties;
  const wide = b.imageUrl ? cssUrl(b.imageUrl) : 'none';
  const tall = b.imageUrlMobile ? cssUrl(b.imageUrlMobile) : wide;
  return { '--hhs-src': wide, '--hhs-src-m': tall } as CSSProperties;
}

/** The nearest ancestor that actually scrolls. On this page it is the shell's
    own scroller, not the window — a listener on `window` would never fire. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if (oy === 'auto' || oy === 'scroll') return n;
  }
  return null;
}

export default function HomeHeroSlider({ initialBanners = null }: { initialBanners?: HeroBanner[] | null }) {
  /* Seeded from the server render when there is one, so the hero paints with
     the first frame instead of after a round trip it could not even issue
     until this component had downloaded and mounted. */
  const seed = initialBanners && initialBanners.length > 0 ? initialBanners : null;
  const [banners, setBanners] = useState<HeroBanner[]>(seed ?? []);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  /* Whether the slides after the first may name their artwork yet. */
  const [warm, setWarm] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(false);
  /* The in-flight glide, and a flag that tells the scroll handler to keep its
     hands off while one is running. */
  const glideRef = useRef(0);
  const glidingRef = useRef(false);

  const pause = useCallback((on: boolean) => {
    pausedRef.current = on;
    /* Mirrored into state as well as the ref: the ref stops the timer, and the
       attribute it drives stops the dot's countdown from filling while the
       timer behind it is not running. */
    setPaused(on);
  }, []);

  /* Only when the server did not already say. The page seeds this on every
     document render, so in practice this fetch is for a slider mounted without
     one — and it is no longer `no-store`, so the route's own cache headers can
     do their job. */
  useEffect(() => {
    if (seed) return;
    let alive = true;
    fetch('/api/public/ad-banners')
      .then((r) => (r.ok ? r.json() : { banners: [] }))
      .then((d: { banners?: HeroBanner[] }) => {
        if (!alive || !Array.isArray(d.banners)) return;
        /* A banner is showable with a picture OR a colour — Super Admin can
           build a slide out of a ground and a motif and never upload
           anything. */
        setBanners(d.banners.filter((b) => b && heroBannerIsShowable(b) && b.active !== false));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [seed]);

  /* ── The other slides' artwork ──
     Held back until the browser has nothing better to do, then loaded all at
     once. Not "the neighbours of whatever is active": that sounds thriftier
     and is worse, because jumping from the first dot to the last would then
     scroll past two slides that had never been told what to paint. This way
     the first frame fetches one picture and, a moment later, nothing is ever
     blank. */
  useEffect(() => {
    if (warm || banners.length < 2) return;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    if (w.requestIdleCallback) {
      const h = w.requestIdleCallback(() => setWarm(true), { timeout: 2500 });
      return () => w.cancelIdleCallback?.(h);
    }
    const h = window.setTimeout(() => setWarm(true), 1200);
    return () => window.clearTimeout(h);
  }, [warm, banners.length]);

  /* ── How far to bleed ──
     Up: the distance from the top of the slider to the top of the scrolled
     content, which is where the fixed navigation bar sits. Sideways: whatever
     the content column is inset from each edge of the page.

     Measured in a layout effect's place — a plain effect after paint would show
     one frame of an unbled hero — and re-measured whenever anything resizes,
     because the gutter, the bar's height and the announcement bar above are all
     free to change without this component re-rendering. */
  useEffect(() => {
    const root = rootRef.current;
    if (!root || banners.length === 0) return;
    const scroller = scrollParent(root);

    const measure = () => {
      const r = root.getBoundingClientRect();
      const page = document.documentElement.clientWidth;
      const top = scroller
        ? r.top - scroller.getBoundingClientRect().top + scroller.scrollTop
        : r.top + window.scrollY;

      root.style.setProperty('--hhs-bleed', `${Math.max(0, Math.round(top))}px`);
      root.style.setProperty('--hhs-left', `${Math.max(0, Math.round(r.left))}px`);
      root.style.setProperty('--hhs-right', `${Math.max(0, Math.round(page - r.right))}px`);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    ro.observe(document.documentElement);
    /* Every ancestor up to the scroller, not just this element. A
       ResizeObserver reports SIZE, and what moves this element is something
       else changing height above it — the announcement bar arriving with the
       homepage config a moment after mount, or being dismissed. Neither of
       those resizes the hero, and without this the picture would start a
       banner's height short of the top of the page and stay that way. */
    for (let n = root.parentElement; n; n = n.parentElement) {
      ro.observe(n);
      if (n === scroller) break;
    }
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [banners.length]);

  /* ── The lag ──
     One custom property, written from a rAF-throttled scroll listener, and the
     transform that reads it lives on a layer of its own so it never fights the
     drift animation on the image itself. */
  useEffect(() => {
    const root = rootRef.current;
    if (!root || banners.length === 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const scroller = scrollParent(root);
    if (!scroller) return;

    let frame = 0;
    let last = -1;
    const apply = () => {
      frame = 0;
      const y = Math.min(PARALLAX_MAX, scroller.scrollTop * PARALLAX);
      const v = Math.round(y * 10) / 10;
      if (v === last) return;
      last = v;
      root.style.setProperty('--hhs-par', `${v}px`);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(apply); };

    apply();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [banners.length]);

  /* ── The glide ──
     A hand-driven scroll rather than `behavior: 'smooth'`.

     Three things the built-in could not do. It has one fixed curve, tuned for
     jumping to an anchor, which over a slide's width arrives with a stop
     instead of a settle. It fights `scroll-snap-type: mandatory`, because the
     browser keeps re-snapping a scroll position it did not initiate. And it
     gives nothing to hold on to, so the scroll handler below could not tell an
     animation it started from a person swiping — which is why the headline used
     to re-render once for every slide a long jump passed over. */
  const goTo = useCallback((i: number, animate = true) => {
    const track = trackRef.current;
    if (!track) return;
    const slide = track.children[i] as HTMLElement | undefined;
    if (!slide) return;

    const from = track.scrollLeft;
    const to = slide.offsetLeft;
    if (Math.abs(to - from) < 1) return;

    cancelAnimationFrame(glideRef.current);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animate || reduced) {
      track.scrollLeft = to;
      return;
    }

    /* Snap off for the duration. Left on, the browser treats every frame of
       this as a scroll it should correct, and the two argue all the way
       across. It goes back on at the end, where it is wanted: it is what
       catches a swipe. */
    track.style.scrollSnapType = 'none';
    glidingRef.current = true;

    const span = Math.abs(to - from) / Math.max(1, track.clientWidth);
    const ms = Math.min(GLIDE_MAX_MS, GLIDE_MS * (1 + (span - 1) * 0.22));
    const t0 = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      track.scrollLeft = from + (to - from) * glide(t);
      if (t < 1) {
        glideRef.current = requestAnimationFrame(step);
        return;
      }
      /* Land exactly, then hand the scroller back. Restoring snap while the
         position is a fraction of a pixel off would make it jump. */
      track.scrollLeft = to;
      track.style.scrollSnapType = '';
      glidingRef.current = false;
    };
    glideRef.current = requestAnimationFrame(step);
  }, []);

  /* Nothing should be mid-glide when this unmounts. */
  useEffect(() => () => cancelAnimationFrame(glideRef.current), []);

  /* Advance on a timer, but only while nobody is interacting with it and only
     when the page is actually on screen — a slider ticking in a background tab
     wakes the compositor for nobody.

     `active` is a dependency, so every change of slide restarts the clock and
     each one gets the full seven seconds. Without it the timer keeps its own
     schedule regardless: tap a dot six and a half seconds in and the slide you
     asked for is gone half a second later, which reads as the slider ignoring
     you. A swipe restarts it for the same reason, by way of the scroll
     handler below. */
  useEffect(() => {
    if (banners.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const id = window.setInterval(() => {
      if (pausedRef.current || document.hidden) return;
      setActive((prev) => {
        const next = (prev + 1) % banners.length;
        requestAnimationFrame(() => goTo(next));
        return next;
      });
    }, INTERVAL);
    return () => window.clearInterval(id);
  }, [banners.length, goTo, active]);

  /* Which slide is on screen, from the scroller itself rather than from the
     timer: a swipe changes the answer and the timer never hears about it.

     Ignored while a glide is running. The glide already set `active` to where
     it is going, and reading the scroller on the way would set it again to
     every slide passed over — the headline, the button and the motif are keyed
     on that, so a jump across three slides used to tear them down and rebuild
     them three times mid-flight. */
  const onScroll = useCallback(() => {
    if (glidingRef.current) return;
    const track = trackRef.current;
    if (!track) return;
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    setActive((prev) => (prev === i ? prev : i));
    /* A swipe is an interaction, and an interaction means the rest of the
       artwork is wanted now rather than at the next idle moment. */
    setWarm(true);
  }, []);

  if (banners.length === 0) return null;

  return (
    <section
      className="hhs"
      ref={rootRef}
      aria-label="Highlights"
      data-paused={paused ? 'true' : 'false'}
      onMouseEnter={() => pause(true)}
      onMouseLeave={() => pause(false)}
      onFocusCapture={() => pause(true)}
      onBlurCapture={() => pause(false)}
    >
      {/* The pictures, and only the pictures, live in the bleeding layer. */}
      <div className="hhs-track" ref={trackRef} onScroll={onScroll}>
        {banners.map((b, i) => (
          <article
            className="hhs-slide"
            key={b.id}
            data-on={i === active ? 'true' : 'false'}
            style={b.backgroundColor ? { backgroundColor: b.backgroundColor } : undefined}
            /* Four labelled images announced one after another is four things
               a screen reader has to read past. Only the one on screen. */
            aria-hidden={i !== active}
          >
            {/* Layers, outermost first: the lag is a transform on `.hhs-par`,
                the slow drift is a transform on the images inside it. Both on
                one element and the later animation simply wins.

                The image is painted twice — once sharp, once blurred — and the
                two are cross-faded by their masks down the tail of the frame.
                That is what makes the blur PROGRESSIVE: `filter` cannot be
                ramped across an element, so a second copy under a mask is how
                a picture goes soft in one direction only. */}
            <div className="hhs-par" style={slideVars(b, warm || i === 0)}>
              <div className="hhs-img" role="img" aria-label={b.title} />
              {/* The blurred copy, only where it can be seen.
                  It is a `blur(22px)` over the whole width of the frame, which
                  is the most expensive thing on this page to composite — and
                  four of them, one per slide, were being kept alive for three
                  tails nobody was looking at. The neighbours are included
                  because a swipe brings one of them half into view. */}
              {Math.abs(i - active) <= 1 && (
                <div className="hhs-img hhs-img-soft" aria-hidden />
              )}
            </div>
            <div className="hhs-veil" aria-hidden />
          </article>
        ))}
      </div>

      {/* The motif, opposite the words. Keyed with them, so a change of slide
          starts its animations from the beginning rather than dropping a new
          graphic into the middle of the old one's cycle. */}
      <HeroMotif
        key={`m-${banners[active]?.id ?? active}`}
        kind={banners[active]?.motif ?? 'none'}
        color={banners[active]?.accentColor}
      />

      {/* The words sit in the slider's own box rather than in the bleeding
          track, so they cannot end up under the navigation bar the picture is
          running beneath. They are keyed on the active banner so React
          replaces them and the entrance animation plays on every change. */}
      <div className="hhs-body" key={banners[active]?.id ?? active}>
        <h2 className="hhs-title">{banners[active]?.title}</h2>
        {banners[active]?.subtitle && <p className="hhs-sub">{banners[active].subtitle}</p>}
        {banners[active]?.ctaLabel && banners[active]?.ctaHref && (
          <Link href={banners[active].ctaHref!} className="hhs-cta">
            {banners[active].ctaLabel}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>

      {banners.length > 1 && (
        <div className="hhs-dots" role="tablist" aria-label="Choose a highlight">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={b.title}
              className={i === active ? 'hhs-dot hhs-dot-on' : 'hhs-dot'}
              /* The move starts on the NEXT frame, not this one — the same
                 way the timer does it. `setActive` queues a re-render that
                 swaps the headline, the button and the motif; starting the
                 glide in the same frame puts its first step in a frame React
                 is already busy committing. The curve leaves almost
                 stationary, so a frame's wait is invisible. */
              onClick={() => { setActive(i); requestAnimationFrame(() => goTo(i)); }}
            >
              {/* The countdown to the next slide, drawn inside the bar that is
                  already telling you where you are. */}
              <span className="hhs-dot-fill" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
