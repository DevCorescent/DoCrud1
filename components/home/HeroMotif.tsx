/**
 * The animated graphic beside the hero's words.
 *
 * ═══ WHY IT IS DRAWN ═══
 *
 * Five motifs, each a handful of circles and lines in one inline SVG, moved by
 * CSS. No canvas, no requestAnimationFrame, no library, nothing fetched — the
 * whole thing is a few hundred bytes of markup already in the page, and every
 * animation is a `transform` or an `opacity`, which the compositor runs off the
 * main thread. A hero that stutters while the feed is hydrating is worse than a
 * hero that does not move, and this cannot stutter: there is no JavaScript in
 * it to be blocked.
 *
 * ═══ WHY IT IS NOT A GIF OR A LOTTIE ═══
 *
 * Both are a network request on the critical path for something purely
 * decorative, both are fixed to one palette, and neither can take the banner's
 * own accent colour. These take `currentColor`, so Super Admin picking a colour
 * changes the animation with it.
 *
 * ═══ WHERE IT SITS ═══
 *
 * Opposite the copy: the words are bottom-left, this is centre-right. On a
 * phone there is no "opposite" — the words run the full width — so it moves to
 * the empty band above the headline, smaller and dimmer, where it reads as part
 * of the artwork rather than as something competing with it.
 */

import type { HeroMotif as HeroMotifKind } from '@/lib/hero-banner';
import './hero-motif.css';

/* One viewBox for all five, so the wrapper sizes them identically and a
   Super Admin swapping motifs sees the same footprint each time. */
const BOX = '0 0 200 200';

function Orbit() {
  return (
    <svg viewBox={BOX} className="hm-svg" aria-hidden focusable="false">
      <g className="hm-fade">
        <ellipse cx="100" cy="100" rx="82" ry="82" className="hm-ring" />
        <ellipse cx="100" cy="100" rx="58" ry="58" className="hm-ring hm-ring-2" />
        <ellipse cx="100" cy="100" rx="32" ry="32" className="hm-ring hm-ring-3" />
      </g>
      {/* Each point is a dot at the top of a group spun about the centre —
          rotation is one transform, and three rotations are three cheap
          composited layers rather than ninety keyframed positions. */}
      <g className="hm-spin hm-spin-a" style={{ transformOrigin: '100px 100px' }}>
        <circle cx="100" cy="18" r="5" className="hm-dot" />
      </g>
      <g className="hm-spin hm-spin-b" style={{ transformOrigin: '100px 100px' }}>
        <circle cx="100" cy="42" r="3.5" className="hm-dot hm-dot-soft" />
      </g>
      <g className="hm-spin hm-spin-c" style={{ transformOrigin: '100px 100px' }}>
        <circle cx="100" cy="68" r="2.5" className="hm-dot hm-dot-soft" />
      </g>
      <circle cx="100" cy="100" r="4" className="hm-dot hm-core" />
    </svg>
  );
}

function Nodes() {
  /* A fixed constellation rather than a random one: random points cluster and
     cross, and a hero is not the place to roll dice on the composition. */
  const pts: Array<[number, number, number]> = [
    [38, 62, 4.5], [104, 34, 3.5], [162, 74, 5], [70, 122, 4],
    [136, 148, 3.5], [30, 158, 3], [176, 128, 2.5],
  ];
  const links: Array<[number, number]> = [[0, 1], [1, 2], [0, 3], [3, 4], [2, 6], [3, 5], [4, 6], [1, 3]];
  return (
    <svg viewBox={BOX} className="hm-svg" aria-hidden focusable="false">
      <g className="hm-drift">
        <g className="hm-lines">
          {links.map(([a, z], i) => (
            <line
              key={i}
              x1={pts[a][0]} y1={pts[a][1]} x2={pts[z][0]} y2={pts[z][1]}
              className="hm-link"
              style={{ animationDelay: `${(i * 380) % 2600}ms` }}
            />
          ))}
        </g>
        {pts.map(([x, y, r], i) => (
          <circle
            key={i} cx={x} cy={y} r={r}
            className="hm-dot hm-blink"
            style={{ animationDelay: `${(i * 460) % 2800}ms` }}
          />
        ))}
      </g>
    </svg>
  );
}

function Stack() {
  return (
    <svg viewBox={BOX} className="hm-svg" aria-hidden focusable="false">
      <g className="hm-drift">
        <rect x="34" y="112" width="132" height="52" rx="12" className="hm-card hm-card-3" />
        <rect x="44" y="74"  width="112" height="52" rx="12" className="hm-card hm-card-2" />
        <rect x="54" y="36"  width="92"  height="52" rx="12" className="hm-card hm-card-1" />
        {/* Two rules of "text" on the top card, so it reads as a page. */}
        <rect x="66" y="52" width="46" height="4" rx="2" className="hm-rule" />
        <rect x="66" y="64" width="30" height="4" rx="2" className="hm-rule hm-rule-2" />
      </g>
    </svg>
  );
}

function Pulse() {
  return (
    <svg viewBox={BOX} className="hm-svg" aria-hidden focusable="false">
      {/* Three rings on the same keyframes, a third of the cycle apart, which
          is what makes one continuous outward wave from three elements. */}
      <circle cx="100" cy="100" r="30" className="hm-ring hm-wave" />
      <circle cx="100" cy="100" r="30" className="hm-ring hm-wave" style={{ animationDelay: '1200ms' }} />
      <circle cx="100" cy="100" r="30" className="hm-ring hm-wave" style={{ animationDelay: '2400ms' }} />
      <circle cx="100" cy="100" r="15" className="hm-dot hm-core hm-beat" />
    </svg>
  );
}

function Spark() {
  const bits: Array<[number, number, number]> = [
    [30, 3.5, 0], [58, 2.5, 900], [86, 4, 400], [114, 2.5, 1800],
    [142, 3.5, 1300], [170, 3, 2200],
  ];
  return (
    <svg viewBox={BOX} className="hm-svg" aria-hidden focusable="false">
      <g className="hm-fade">
        {bits.map(([x, r, delay], i) => (
          <circle
            key={i} cx={x} cy={190} r={r}
            className="hm-dot hm-rise"
            style={{ animationDelay: `${delay}ms`, animationDuration: `${5200 + i * 430}ms` }}
          />
        ))}
        <line x1="16" y1="192" x2="184" y2="192" className="hm-link hm-floor" />
      </g>
    </svg>
  );
}

const SHAPES: Record<Exclude<HeroMotifKind, 'none'>, () => JSX.Element> = {
  orbit: Orbit, nodes: Nodes, stack: Stack, pulse: Pulse, spark: Spark,
};

export default function HeroMotif({ kind, color }: { kind: HeroMotifKind; color?: string }) {
  if (kind === 'none') return null;
  const Shape = SHAPES[kind];
  if (!Shape) return null;
  /* The colour arrives as `color`, and everything inside paints in
     `currentColor` — one property to set, and the whole graphic follows it. */
  return (
    <div className="hm" style={color ? { color } : undefined} aria-hidden>
      <Shape />
    </div>
  );
}
