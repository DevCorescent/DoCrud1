'use client';

/**
 * The welcome card's illustration: a professional waving hello, standing behind
 * the briefcase, document and magnifier that were already there.
 *
 * PURE SVG + CSS KEYFRAMES. No animation library (the project has none, and the
 * marquee and Explore strip already animate this way), no GIF or video, no
 * JavaScript loop, no state and no timers — so there is nothing to clean up and
 * nothing that can differ between the server and client render. The component
 * is a pure function of its props and is safe to render anywhere.
 *
 * MOVEMENT IS PER-PART, NOT PER-IMAGE. The arm rotates about the shoulder, the
 * hand rotates about the wrist INSIDE the arm's own rotation (which is what
 * makes it read as a wave rather than a swinging limb), and the body and props
 * drift a pixel or two on their own slower cycles. Nothing rotates the whole
 * illustration.
 *
 * The wave is deliberately unhurried: about two seconds of waving, then five
 * seconds at rest, on a 7s loop. The RESTING pose already has the hand up in a
 * friendly greeting, so `prefers-reduced-motion` can switch every animation off
 * and still leave a character mid-hello rather than a stiff figure.
 *
 * Decorative only — `aria-hidden`. The greeting text beside it carries the
 * meaning.
 */

/** Unique enough to scope the keyframes without a CSS-module build step. */
const P = 'awc';

export default function AnimatedWelcomeCharacter({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 150 118"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <style>{`
        /* view-box keeps transform-origin in the same coordinates as the
           geometry below, so each origin is simply the joint's own point. */
        .${P}-part { transform-box: view-box; }

        /* Two-and-a-bit waves, then rest. The pause is most of the cycle. */
        @keyframes ${P}-wave {
          0%, 60%, 96%, 100% { transform: rotate(0deg); }
          65%                { transform: rotate(-15deg); }
          70%                { transform: rotate(11deg); }
          76%                { transform: rotate(-13deg); }
          82%                { transform: rotate(9deg); }
          89%                { transform: rotate(-5deg); }
        }
        /* The wrist runs inside the arm's rotation — this is the difference
           between a wave and a limb swinging from the shoulder. */
        @keyframes ${P}-hand {
          0%, 60%, 96%, 100% { transform: rotate(0deg); }
          67%                { transform: rotate(9deg); }
          74%                { transform: rotate(-9deg); }
          81%                { transform: rotate(7deg); }
          88%                { transform: rotate(-4deg); }
        }
        /* Idle: a breath, not a bounce. */
        @keyframes ${P}-idle {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-2px); }
        }
        @keyframes ${P}-head {
          0%, 100% { transform: rotate(0deg); }
          50%      { transform: rotate(1.8deg); }
        }
        @keyframes ${P}-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-1.5px); }
        }

        .${P}-arm   { animation: ${P}-wave 7s cubic-bezier(0.45,0,0.55,1) infinite;
                      transform-origin: 75px 60px; }
        .${P}-hand  { animation: ${P}-hand 7s cubic-bezier(0.45,0,0.55,1) infinite;
                      transform-origin: 60.5px 36px; }
        .${P}-body  { animation: ${P}-idle 4.6s ease-in-out infinite;
                      transform-origin: 88px 70px; }
        .${P}-head  { animation: ${P}-head 6.2s ease-in-out infinite;
                      transform-origin: 88px 46px; }
        .${P}-doc   { animation: ${P}-float 6.8s ease-in-out infinite;
                      transform-origin: 63px 68px; animation-delay: -1.4s; }
        .${P}-glass { animation: ${P}-float 7.6s ease-in-out infinite;
                      transform-origin: 126px 82px; animation-delay: -3.1s; }

        /* Reduced motion: everything stops. The base pose is already the hand
           raised in greeting, so the character stays friendly, not frozen. */
        @media (prefers-reduced-motion: reduce) {
          .${P}-arm, .${P}-hand, .${P}-body,
          .${P}-head, .${P}-doc, .${P}-glass { animation: none; }
        }
      `}</style>

      {/* ── Character (behind everything) ─────────────────────────────── */}
      <g className={`${P}-part ${P}-body`}>
        {/* Hoodie */}
        <path
          d="M74 60c0-7.2 6.3-12 14-12s14 4.8 14 12v34a4 4 0 0 1-4 4H78a4 4 0 0 1-4-4V60Z"
          fill="#17181c"
          stroke="rgba(255,255,255,0.13)"
          strokeWidth="1"
        />
        {/* Hood roll behind the neck */}
        <path d="M78 58c3.5 3 6.5 4.4 10 4.4s6.5-1.4 10-4.4" stroke="rgba(255,255,255,0.10)" strokeWidth="1.4" strokeLinecap="round" />
        {/* Resting arm, character's left */}
        <path d="M101 62c4.6 2.4 6.6 8 6.4 14.6-.1 4.6-.6 8.4-1.4 11.4" stroke="#17181c" strokeWidth="7.5" strokeLinecap="round" />
        <path d="M101 62c4.6 2.4 6.6 8 6.4 14.6-.1 4.6-.6 8.4-1.4 11.4" stroke="rgba(255,255,255,0.09)" strokeWidth="1" strokeLinecap="round" fill="none" />
        <circle cx="105.6" cy="90" r="3.6" fill="#a8836e" />

        {/* Head, hair and face */}
        <g className={`${P}-part ${P}-head`}>
          {/* Neck */}
          <rect x="84" y="42" width="8" height="9" rx="3" fill="#9c7965" />
          <ellipse cx="88" cy="33" rx="13" ry="14" fill="#b9917c" />
          {/* Hair */}
          <path
            d="M75 31c0-8.3 5.8-14 13-14s13 5.7 13 14c0 1.9-.3 3.4-.8 4.6-.7-4.5-2.6-6.6-4.6-7.4-2.6-1-5.2.6-7.6.6-3.4 0-6.5-2.2-9 .3-1.5 1.5-2.4 3.9-2.9 6.7-.7-1.3-1.1-2.9-1.1-4.8Z"
            fill="#111216"
          />
          <ellipse cx="83.4" cy="33.6" rx="1.5" ry="1.9" fill="#15161a" />
          <ellipse cx="92.6" cy="33.6" rx="1.5" ry="1.9" fill="#15161a" />
          <path d="M85.6 38.4c1.5 1.2 3.3 1.2 4.8 0" stroke="#15161a" strokeWidth="1.3" strokeLinecap="round" />
        </g>

        {/* Waving arm — rotates about the shoulder */}
        <g className={`${P}-part ${P}-arm`}>
          <path d="M75 60 66.5 47 60.5 37" stroke="#17181c" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M75 60 66.5 47 60.5 37" stroke="rgba(255,255,255,0.09)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          {/* Hand — rotates about the wrist, inside the arm's rotation */}
          <g className={`${P}-part ${P}-hand`}>
            <ellipse cx="59" cy="31.5" rx="5.2" ry="6" fill="#b9917c" />
            <path d="M56.4 27.2v-3.4M59.2 26.4v-4.1M62 27.2v-3.1" stroke="#b9917c" strokeWidth="2.4" strokeLinecap="round" />
          </g>
        </g>
      </g>

      {/* ── Document card ─────────────────────────────────────────────── */}
      <g className={`${P}-part ${P}-doc`}>
        <g transform="rotate(-5 63 68)">
          <rect x="43" y="53" width="40" height="31" rx="4.5" fill="#1b1c20" stroke="rgba(255,255,255,0.14)" />
          <circle cx="51.5" cy="61.5" r="3.6" fill="none" stroke="rgba(255,255,255,0.30)" strokeWidth="1.4" />
          <rect x="58" y="60" width="18" height="2.4" rx="1.2" fill="rgba(255,255,255,0.26)" />
          <rect x="49" y="69" width="28" height="2.2" rx="1.1" fill="rgba(255,255,255,0.16)" />
          <rect x="49" y="75" width="21" height="2.2" rx="1.1" fill="rgba(255,255,255,0.12)" />
        </g>
      </g>

      {/* ── Green spheres ─────────────────────────────────────────────── */}
      <circle cx="35" cy="99" r="10.5" fill="#1f5c42" />
      <circle cx="31.5" cy="95" r="3.4" fill="rgba(255,255,255,0.09)" />
      <circle cx="53" cy="103" r="7.5" fill="#1a4f38" />
      <circle cx="50.6" cy="100" r="2.4" fill="rgba(255,255,255,0.08)" />

      {/* ── Briefcase (in front) ──────────────────────────────────────── */}
      <path d="M79 76v-4a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v4" stroke="rgba(255,255,255,0.22)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <rect x="64" y="76" width="48" height="34" rx="6" fill="#1b1c20" stroke="rgba(255,255,255,0.15)" />
      <rect x="64" y="89" width="48" height="2.6" fill="rgba(255,255,255,0.09)" />
      <rect x="82" y="86" width="12" height="9" rx="2.2" fill="rgba(255,255,255,0.16)" />

      {/* ── Magnifying glass ──────────────────────────────────────────── */}
      <g className={`${P}-part ${P}-glass`}>
        <circle cx="126" cy="82" r="12" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.26)" strokeWidth="2.6" />
        <path d="M134.6 91.2 141 98" stroke="rgba(255,255,255,0.26)" strokeWidth="4" strokeLinecap="round" />
      </g>
    </svg>
  );
}
