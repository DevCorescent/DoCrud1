'use client';

/**
 * The homepage.
 *
 * ═══ THE SHAPE, AND WHY ═══
 *
 * A persistent sidebar, a white panel with search at the top of it, a hero
 * with a rail of category tiles, and rails of cards below. The sidebar is the
 * whole point: Docrud has a dozen surfaces — gigs, jobs, talent, companies,
 * templates, DocWord, DocSheets, e-sign, the ATS — and a homepage that hides
 * them behind a menu makes a visitor guess what the product is. A column of
 * named destinations, always there, answers that in one glance.
 *
 * ═══ NOTHING HERE IS DECORATIVE ═══
 *
 * Every tile, card and row goes somewhere real. The Featured rail is the hero
 * banners the Super Admin already manages (lib/server/hero-banners.ts), so it
 * is editable without touching this file. The roles rail is live data from
 * /api/jobs/public. The search box is /api/search, answering as you type.
 *
 * ═══ WHAT IS DELIBERATELY NOT DONE HERE ═══
 *
 * The job corpus is a multi-megabyte read and `app/page.tsx` is careful never
 * to await it on the way to the first byte. So the roles rail fetches after
 * mount, behind a skeleton shaped like the card it will become. Moving that
 * server-side would undo work that was done on purpose.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronRight, ChevronLeft, ArrowRight, MapPin, Plug, Sparkles, ExternalLink,
  Hammer, Briefcase, GraduationCap,
  Code2, BarChart3, Palette, Boxes, Megaphone, TrendingUp, Landmark, Settings2,
  Scale, Headphones, HeartPulse, Wrench, PenLine, ShieldCheck, Compass, Users,
} from 'lucide-react';
import DiscoverShell from '@/components/home/discover/DiscoverShell';
import { companyJobsHref } from '@/lib/company-explorer';
import { getCompanyLogo } from '@/lib/company-logos';
/* Labels and formatters only. This note used to say `lib/jobs-ui` must not
   enter a client bundle; `components/jobs/board/JobsBoard` — a client component
   — has imported it from the same module for as long as that board has
   existed, so the maps are taken from there rather than copied into a second
   set that could disagree with the board's. */
import {
  EMPLOYMENT_TYPE_LABELS, WORK_MODE_LABELS, EXPERIENCE_LABELS,
  formatPosted, companyHue,
} from '@/lib/jobs-ui';
/* Projects have their own type labels; the work-mode ones are shared with jobs
   above, so they are not imported twice. */
import { PROJECT_TYPE_LABELS } from '@/lib/projects-ui';
/* The canonical category names. Pure data — the module has no imports at all,
   so it carries no server code into this bundle. */
import { JOB_DOMAIN_LABELS } from '@/lib/server/job-sources/taxonomy';
import { getJobMatchLabel } from '@/lib/job-match-tone';
import type { HeroBanner } from '@/lib/hero-banner';
/* The composer's own step labels, so the walkthrough's first screen cannot
   claim a step the wizard does not have. Pure data — no server imports. */
import { STEPS as WIZARD_STEPS } from '@/lib/jobs/post-wizard';
import './discover.css';


/* ── The category rail ────────────────────────────────────────────────────
   The reference's tiles carry a 3D render each. Ours carry a drawn motif: an
   illustration set that does not exist cannot be commissioned inside a
   stylesheet, and nine tiles with eight stock icons and one render would look
   worse than nine that agree with each other. Drawing them also means each one
   can take the tile's own colour without an asset per tint. */

interface Tile {
  label: string;
  note: string;
  href: string;
  motif: MotifKind;
  /* The `work` flag that used to be here marked the tiles that also appeared
     in a second "Get work done" rail. That rail was removed, and the five
     tiles it carried — DocWord, DocSheets, E-Sign, PDF Editor, Resume ATS —
     have now been removed from this one too, so the flag has nothing left to
     mark. Those tools are still reachable from the pages that link to them. */
  /** The pastel that pools under the artwork, and the ink the motif is drawn
      in. Two values rather than a whole palette per tile: the tile's face is
      glass, and this is a glow behind its bottom-right corner. */
  hue: [wash: string, ink: string];
}

/* Nine pastels, each one a wash rather than a fill — see `.dh-tile` in
   discover.css for why the colour pools in the corner instead of covering the
   card. They stay in the same family as the aurora on the ground, so a tile
   never looks like it was cut from a different page.

   The ink is the line colour for the motif, and is a muted mid-tone rather
   than the pastel itself: a pastel line on a pastel wash disappears. */
const TILES: Tile[] = [
  { label: 'Jobs', note: 'Open roles', href: '/jobs', motif: 'orbit', hue: ['rgba(134,216,188,.32)', '#4b9077'] },
  /* Internships are an employment type on jobs, so this is the board filtered
     rather than a second corpus — and `?employment=` is a filter the board now
     seeds from the URL, so the tile lands on a filtered board and not on an
     unfiltered one wearing a promise. */
  { label: 'Internships', note: 'Open to students', href: '/jobs?employment=internship', motif: 'rise', hue: ['rgba(252,212,144,.36)', '#a8802f'] },
  { label: 'Projects', note: 'Open briefs', href: '/projects', motif: 'grid', hue: ['rgba(168,182,250,.30)', '#6670b2'] },
  { label: 'Talent', note: 'Find people', href: '/people', motif: 'nodes', hue: ['rgba(255,178,178,.30)', '#b86e70'] },
  { label: 'Companies', note: 'Who is hiring', href: '/businesses', motif: 'stack', hue: ['rgba(196,172,246,.32)', '#8168b4'] },
];

/** The hover wash is the same hue with more of it — computed rather than
    listed, so a new tile needs one colour and not two. */
const stronger = (wash: string) =>
  wash.replace(/,\s*\.(\d+)\)$/, (_m, d: string) => `,.${Math.min(99, Math.round(Number(`0.${d}`) * 155))})`);

const tileVars = (t: Tile) => ({
  ['--t-wash' as string]: t.hue[0],
  ['--t-wash-on' as string]: stronger(t.hue[0]),
});

/* Only the five tiles above reach `Motif`, so a kind no tile names is a branch
   nothing can render. `lines`, `cells`, `pen` and `pulse` belonged to the five
   tool tiles and went with them. */
type MotifKind = 'rise' | 'orbit' | 'nodes' | 'stack' | 'grid';

/**
 * A tile's artwork.
 *
 * Flat geometry on purpose. It scales to any size, weighs nothing, needs no
 * asset pipeline, and — unlike a PNG render — is still crisp on the display
 * this will actually be looked at on. Drawn in the tile's own ink, which is a
 * muted mid-tone rather than the pastel itself: a pastel line on a pastel wash
 * disappears.
 */
function Motif({ kind, c = '#1d1d1f' }: { kind: MotifKind; c?: string }) {
  const common = { className: 'dh-tile-art', viewBox: '0 0 100 100', 'aria-hidden': true } as const;
  const s = { stroke: c, strokeWidth: 2.4, fill: 'none', strokeLinecap: 'round' as const };

  if (kind === 'orbit') {
    return (
      <svg {...common}>
        <ellipse cx="50" cy="52" rx="34" ry="14" {...s} opacity=".55" />
        <ellipse cx="50" cy="52" rx="14" ry="34" {...s} opacity=".35" />
        <circle cx="50" cy="52" r="10" fill={c} opacity=".9" />
        <circle cx="84" cy="52" r="4.5" fill={c} />
        <circle cx="50" cy="18" r="3.4" fill={c} opacity=".6" />
      </svg>
    );
  }
  if (kind === 'nodes') {
    return (
      <svg {...common}>
        <path d="M26 70 L50 40 L78 58 M50 40 L44 22" {...s} opacity=".5" />
        <circle cx="26" cy="70" r="7" fill={c} opacity=".85" />
        <circle cx="50" cy="40" r="9" fill={c} />
        <circle cx="78" cy="58" r="6" fill={c} opacity=".8" />
        <circle cx="44" cy="22" r="4.5" fill={c} opacity=".55" />
      </svg>
    );
  }
  if (kind === 'stack') {
    return (
      <svg {...common}>
        <rect x="18" y="56" width="58" height="26" rx="7" fill={c} opacity=".22" />
        <rect x="24" y="42" width="58" height="26" rx="7" fill={c} opacity=".42" />
        <rect x="30" y="28" width="58" height="26" rx="7" fill={c} opacity=".9" />
      </svg>
    );
  }
  if (kind === 'grid') {
    return (
      <svg {...common}>
        {[0, 1, 2].map((r) => [0, 1, 2].map((q) => (
          <rect
            key={`${r}-${q}`}
            x={22 + q * 22} y={22 + r * 22} width="17" height="17" rx="5"
            fill={c} opacity={0.24 + ((r + q) % 3) * 0.3}
          />
        )))}
      </svg>
    );
  }
  /* rise */
  return (
    <svg {...common}>
      <path d="M22 76 L40 58 L54 66 L80 30" {...s} strokeWidth="3.2" />
      <path d="M66 30 H80 V44" {...s} strokeWidth="3.2" />
      {[24, 44, 64].map((x, i) => (
        <rect key={x} x={x} y={80 - i * 6} width="10" height={i * 6 + 6} rx="3" fill={c} opacity=".3" />
      ))}
    </svg>
  );
}

/* ── A rail ───────────────────────────────────────────────────────────────
   Arrows that know whether there is anything that way, because an arrow that
   is always there and sometimes does nothing teaches people not to trust it. */

function useRail() {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const teardown = useRef<(() => void) | null>(null);
  const [edge, setEdge] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = nodeRef.current;
    if (!el) return;
    const slack = el.scrollWidth - el.clientWidth;
    setEdge({
      start: el.scrollLeft <= 4,
      /* `slack <= 4` means it does not scroll at all, and both arrows go. */
      end: slack <= 4 || el.scrollLeft >= slack - 4,
    });
  }, []);

  /**
   * A CALLBACK ref, not a plain one.
   *
   * Three of these rails fill from a fetch, and two things follow from that
   * which a mount-time effect gets wrong:
   *
   *   · the element the ref lands on can CHANGE — the company strip renders a
   *     different subtree while it is still a row of skeletons, so a `useEffect`
   *     keyed on mount attaches its listeners to a node that is then thrown
   *     away, and the real strip gets none;
   *   · adding children does not resize the scroller itself, so a
   *     ResizeObserver alone never fires and the arrows keep the state they had
   *     when the rail was empty — which is "nothing to scroll to", on a rail
   *     with eighteen things in it.
   *
   * So the listeners are installed against whatever node is current, and a
   * MutationObserver re-measures when its children change.
   */
  const ref = useCallback((node: HTMLDivElement | null) => {
    teardown.current?.();
    teardown.current = null;
    nodeRef.current = node;
    if (!node) return;

    node.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    const mo = new MutationObserver(measure);
    mo.observe(node, { childList: true });
    /* After layout, not during it: widths read in the ref callback are the
       pre-layout ones on the first pass. */
    const raf = requestAnimationFrame(measure);

    teardown.current = () => {
      cancelAnimationFrame(raf);
      node.removeEventListener('scroll', measure);
      ro.disconnect();
      mo.disconnect();
    };
  }, [measure]);

  /* NO `useEffect` CLEANUP HERE, deliberately.
     React calls a callback ref with `null` when the element goes away, and the
     callback tears the previous node down before it returns — so unmount is
     already handled. An effect cleanup that ALSO tore down broke this under
     `reactStrictMode`: the simulated unmount ran the cleanup, disconnected both
     observers and removed the scroll listener, and the remount never re-invoked
     the ref (same node, same callback identity), so nothing reinstalled them.
     The arrows then kept whatever state they had at first paint for the life of
     the page, and a rail that filled from a fetch never noticed. */

  /* By a viewport rather than by a fixed number of pixels, so one press moves
     one screenful whatever is in the rail and however wide the window is. */
  const nudge = useCallback((dir: -1 | 1) => {
    const el = nodeRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' });
  }, []);

  return { ref, edge, nudge };
}

function Rail({ children, label }: { children: React.ReactNode; label: string }) {
  const { ref, edge, nudge } = useRail();
  return (
    <div className="dh-rail-wrap">
      <button
        type="button" className="dh-arrow" data-side="l" data-off={edge.start ? '1' : '0'}
        onClick={() => nudge(-1)} aria-label={`Scroll ${label} left`} tabIndex={edge.start ? -1 : 0}
      >
        <ChevronLeft size={18} />
      </button>
      <div className="dh-rail" ref={ref} role="group" aria-label={label}>{children}</div>
      <button
        type="button" className="dh-arrow" data-side="r" data-off={edge.end ? '1' : '0'}
        onClick={() => nudge(1)} aria-label={`Scroll ${label} right`} tabIndex={edge.end ? -1 : 0}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

/* ── Companies that are hiring ────────────────────────────────────────────
   The top bar's centre. It replaces a search box, and it is a better use of
   that space on this page: search asks somebody to know what they want before
   the page has shown them anything, whereas this IS the answer — the employers
   with open roles right now, each one a click away from their jobs.

   `/api/company-explorer` rather than `/api/public/hiring-companies`, because
   only the former carries the `id` that `companyJobsHref` needs; the latter has
   the same names and counts but nothing to link to.

   `CompanyMark` is reused rather than reimplemented: it already resolves the
   verified logo, falls back to a hue-stable monogram, and — importantly here —
   never leaves a broken image when a logo file is missing, which is the case
   for 13 of the 24 companies in this list. */

interface HiringCompany { id: string; name: string; jobCount?: number }

/**
 * An employer's mark, for a light surface.
 *
 * `components/jobs/CompanyMark` exists and is deliberately NOT used here. Its
 * logo RESOLUTION is the valuable shared part and is reused below via
 * `getCompanyLogo`; its presentation is not portable — it draws the monogram
 * at `hsl(h 45% 18%)` with light text, which is right on the dark feed cards it
 * was written for and unreadable on this page. It is also `font-bold`, and
 * nothing here goes above 500.
 *
 * Thirteen of the twenty-four companies in this list have no logo file, so the
 * monogram is the common case rather than the exception.
 */
function CompanyBadge({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  const logo = getCompanyLogo(name);

  if (logo && !failed) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        className="dh-co-logo"
        src={logo.src}
        alt=""
        aria-hidden
        /* Not lazy: these are 19px and sit in the header, above the fold on
           every device. Lazy-loading them only delays the one row of images
           that is visible immediately. */
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }

  /* One letter for a one-word name — "Airbnb" as "AI" reads like a typo. */
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const mono = parts.length > 1
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : (parts[0]?.[0] ?? 'C').toUpperCase();

  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 360;

  return (
    <span className="dh-co-ini" aria-hidden style={{ ['--h' as string]: String(h) }}>
      {mono}
    </span>
  );
}

/** Enough to fill the strip and suggest more; the rail scrolls for the rest. */
const COMPANIES_SHOWN = 18;

/* ── The companies marquee ────────────────────────────────────────────────
   The row of employers, moving, pinned under the navbar.

   ═══ WHY IT IS STICKY AND NOT JUST FIRST ═══

   `.dh-scroll` is the page's scroller and the bar sits above it, so
   `position: sticky; top: 0` parks this at the top of the scrollport — flush
   under the bar, which is what "attached to the navbar" means here. Nothing
   had to move into the shell for that.

   ═══ IT GETS OUT OF THE WAY ═══

   Scrolling down hides it, scrolling back up brings it in. Measured against
   the scroller rather than the window, because `.dh` is fixed and the window
   never scrolls on this page — a window listener would have fired never. Same
   6px threshold the bottom nav uses, so a jittery trackpad does not flicker
   it, and it always shows again at the very top.

   ═══ A MARQUEE OF LINKS NEEDS BRAKES ═══

   These are links to real company boards, and a target that slides away is a
   target nobody can hit. It pauses on hover and on keyboard focus, and it does
   not move at all for a reader who asked for reduced motion. The track is
   duplicated so the loop has no seam; the copy is `aria-hidden` so a screen
   reader is not read every employer twice.
*/

function CompanyStrip() {
  const [companies, setCompanies] = useState<HiringCompany[] | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/company-explorer', { signal: ac.signal });
        const body = await res.json() as { companies?: HiringCompany[] };
        setCompanies(Array.isArray(body.companies) ? body.companies.slice(0, COMPANIES_SHOWN) : []);
      } catch { setCompanies([]); }
    })();
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const scroller = document.querySelector('.dh-scroll');
    if (!scroller) return;
    const THRESHOLD = 6;
    let last = scroller.scrollTop;
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const top = scroller.scrollTop;
        const delta = top - last;
        if (Math.abs(delta) < THRESHOLD) return;
        last = top;
        /* Always visible at the top, whichever way the last gesture went. */
        setHidden(top > 12 && delta > 0);
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, []);

  /* Shaped like the pills it becomes, so the bar does not jump when they land. */
  if (companies === null) {
    return (
      <div className="dh-cos-wrap" data-hide="0">
        <div className="dh-cos-mask">
          <div className="dh-cos-track" aria-hidden>
            {[112, 96, 128, 104, 118, 92].map((w, i) => (
              <div key={i} className="dh-sk dh-co-sk" style={{ width: w }} />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (companies.length === 0) return null;

  const row = (copy: boolean) => (
    <div className="dh-cos-run" aria-hidden={copy || undefined}>
      {companies.map((c) => (
        <Link
          key={`${copy ? 'b' : 'a'}-${c.id}`}
          href={companyJobsHref(c.id)}
          className="dh-co"
          title={`${c.name} — open roles`}
          tabIndex={copy ? -1 : undefined}
        >
          <CompanyBadge name={c.name} />
          <span className="dh-co-n">{c.name}</span>
          {typeof c.jobCount === 'number' && c.jobCount > 0 && (
            <span className="dh-co-c">{c.jobCount}</span>
          )}
        </Link>
      ))}
    </div>
  );

  return (
    <div className="dh-cos-wrap" data-hide={hidden ? '1' : '0'}>
      <div className="dh-cos-mask" role="group" aria-label="Companies hiring now">
        <div className="dh-cos-track">
          {row(false)}
          {row(true)}
        </div>
      </div>
    </div>
  );
}

/* ── Post an opportunity ──────────────────────────────────────────────────
   Where the employer chips used to sit. Three buttons, and the same three
   destinations the Jobs menu in the navbar offers — one list of places to post
   would have been better still, but the menu lives in the shell and this is the
   homepage, so what is shared is the hrefs rather than the markup. */

const POST_CTAS: Array<{ label: string; short: string; href: string; Icon: typeof MapPin }> = [
  { label: 'Post a job', short: 'Job', href: '/jobs/post', Icon: Briefcase },
  { label: 'Post an internship', short: 'Internship', href: '/jobs/post?kind=internship', Icon: GraduationCap },
  { label: 'Post a project', short: 'Project', href: '/projects/create', Icon: Hammer },
];

function PostCtas() {
  return (
    <div className="dh-pad dh-cta-row">
      {POST_CTAS.map((c, i) => (
        /* ── Two labels, one name ──
           Three buttons in one row on a phone leaves about 100px each, and
           "Post an internship" does not fit that at any size worth reading. So
           the visible word shortens and the ACCESSIBLE NAME does not: the
           `aria-label` carries the full sentence, so a screen reader still
           hears "Post an internship" where the screen has room only for
           "Internship" beside the icon. */
        <Link
          key={c.href}
          href={c.href}
          className="dh-cta"
          data-lead={i === 0 ? '1' : '0'}
          aria-label={c.label}
        >
          <c.Icon size={15} aria-hidden />
          <span className="dh-cta-l">{c.label}</span>
          <span className="dh-cta-s">{c.short}</span>
          <ArrowRight size={14} className="dh-cta-a" aria-hidden />
        </Link>
      ))}
    </div>
  );
}

/* ── Roles ────────────────────────────────────────────────────────────────── */

interface PublicJob {
  id: string;
  title: string;
  organizationName?: string | null;
  location?: string | null;
  workMode?: string | null;
  employmentType?: string | null;
}

const pretty = (v?: string | null) =>
  (v ?? '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()).trim();

function RolesRail() {
  const [jobs, setJobs] = useState<PublicJob[] | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/jobs/public?limit=12', { signal: ac.signal });
        const body = await res.json() as { items?: PublicJob[] };
        setJobs(Array.isArray(body.items) ? body.items : []);
      } catch { setJobs([]); }
    })();
    return () => ac.abort();
  }, []);

  if (jobs === null) {
    return (
      <Rail label="Open roles">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="dh-sk" style={{ width: 288, height: 158 }} />
        ))}
      </Rail>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="dh-empty">
        <div className="dh-empty-t">No open roles yet</div>
        <div className="dh-empty-s">
          Roles appear here as soon as companies publish them. <Link href="/jobs/post">Post the first one →</Link>
        </div>
      </div>
    );
  }

  return (
    <Rail label="Open roles">
      {jobs.map((j) => (
        <Link key={j.id} href={`/jobs/${j.id}`} className="dh-role">
          <div className="dh-role-top">
            <span className="dh-role-mark" aria-hidden>
              {(j.organizationName || j.title || '?').trim().charAt(0).toUpperCase()}
            </span>
            <span style={{ minWidth: 0 }}>
              <span className="dh-role-co" style={{ display: 'block' }}>
                {j.organizationName || 'Hiring on Docrud'}
              </span>
              {j.location && (
                <span className="dh-role-loc" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MapPin size={10} /> {j.location}
                </span>
              )}
            </span>
          </div>
          <div className="dh-role-t">{j.title}</div>
          <div className="dh-role-foot">
            {j.workMode && <span className="dh-chip" data-k="accent">{pretty(j.workMode)}</span>}
            {j.employmentType && <span className="dh-chip">{pretty(j.employmentType)}</span>}
          </div>
        </Link>
      ))}
    </Rail>
  );
}

/* ── Suggested people ─────────────────────────────────────────────────────
   ═══ ABOUT THE PICTURES ═══

   `avatarUrl` is optional on a Docrud profile and today NOBODY has set one —
   every card on this rail will show a monogram. So the monogram is not a
   placeholder to be tolerated until the real thing arrives; it is what this
   rail looks like, and it has to be good.

   Each one is a gradient picked deterministically from the person's id, so a
   given face is always the same colour — on this page, on a reload, and beside
   itself in another rail. Random colours per render would make the same person
   look like two people. */

interface Person {
  id: string;
  name: string;
  accountType?: string;
  profile?: {
    headline?: string | null;
    location?: string | null;
    avatarUrl?: string | null;
    skills?: string[] | null;
  } | null;
  stats?: { followers?: number } | null;
  upraiseCount?: number;
}

/* Pairs from the page's own pastel family, so a face never looks cut from a
   different palette. */
const FACE_HUES: Array<[string, string]> = [
  ['#aac4ff', '#7f9cf0'],
  ['#9fe0c4', '#6fc2a2'],
  ['#ffb8b8', '#f08e92'],
  ['#c9b2f7', '#a184e2'],
  ['#ffd79a', '#efb765'],
  ['#a8d8e8', '#79b4ca'],
  ['#f7b6de', '#dd8ec0'],
];

/** Stable across renders and reloads, because it is derived from the id rather
    than from a counter or `Math.random`. */
function faceHue(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FACE_HUES[h % FACE_HUES.length];
}

/** Up to two letters: "Devansh Tripathi" → DT, "HR Manager" → HM. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function PeopleRail() {
  const [people, setPeople] = useState<Person[] | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/public/people', { signal: ac.signal });
        const body = await res.json() as { people?: Person[] };
        setPeople(Array.isArray(body.people) ? body.people.slice(0, 14) : []);
      } catch { setPeople([]); }
    })();
    return () => ac.abort();
  }, []);

  if (people === null) {
    return (
      <Rail label="Suggested people">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="dh-sk" style={{ width: 214, height: 236, borderRadius: 22 }} />
        ))}
      </Rail>
    );
  }

  if (people.length === 0) {
    return (
      <div className="dh-empty">
        <div className="dh-empty-t">Nobody to suggest yet</div>
        <div className="dh-empty-s">
          People appear here as profiles are published. <Link href="/people">Browse the directory →</Link>
        </div>
      </div>
    );
  }

  return (
    <Rail label="Suggested people">
      {people.map((p) => {
        const [from, to] = faceHue(p.id);
        const photo = p.profile?.avatarUrl;
        /* Headline first, then where they are, then what kind of account it is
           — so a card is never just a name floating on its own. */
        const sub = p.profile?.headline
          || p.profile?.location
          || (p.accountType === 'business' ? 'Business account' : null);
        const skills = (p.profile?.skills ?? []).filter(Boolean).slice(0, 2);
        const followers = p.stats?.followers ?? 0;

        return (
          <Link key={p.id} href={`/u/${p.id}`} className="dh-person">
            <span
              className="dh-person-ring"
              style={{ ['--f-1' as string]: from, ['--f-2' as string]: to }}
            >
              <span className="dh-person-av">
                {photo
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={photo} alt="" loading="lazy" decoding="async" />
                  : <span className="dh-person-ini" aria-hidden>{initials(p.name)}</span>}
              </span>
            </span>
            <span className="dh-person-n">{p.name}</span>
            {sub && <span className="dh-person-h">{sub}</span>}
            {p.profile?.location && p.profile.headline && (
              <span className="dh-person-l"><MapPin size={10} /> {p.profile.location}</span>
            )}
            {skills.length > 0 && (
              <span className="dh-person-tags">
                {skills.map((sk) => <span key={sk} className="dh-chip">{sk}</span>)}
              </span>
            )}
            {followers > 0 && (
              <span className="dh-person-meta">{followers.toLocaleString()} followers</span>
            )}
            {/* Pinned to the bottom of every card. A rail stretches all of its
                cards to the height of the tallest, so a person with no headline
                and no skills was ending up with a hundred pixels of empty glass
                under their name — this gives that space a job and makes the
                whole card's affordance explicit.

                A span, not a link: the card already is one, and an anchor
                inside an anchor is invalid. */}
            <span className="dh-person-cta" aria-hidden>
              View profile <ArrowRight size={11} />
            </span>
          </Link>
        );
      })}
    </Rail>
  );
}

/* ── Docrud in numbers ─────────────────────────────────────────────────────
   A dark band, to break a long light page into chapters. Three cheap reads and
   nothing derived: the roles total comes from `/api/jobs/public`, which reports
   it WITHOUT sending the corpus; the company count is the explorer's own
   length; the people count is the public metrics endpoint's.

   ═══ ONLY NUMBERS THAT MEAN SOMETHING ═══

   A stat renders only when it is greater than zero, and the band only when at
   least two survive. A row of zeroes does not read as "a new marketplace", it
   reads as a broken page — and this deployment genuinely has 0 published
   documents, so that is the normal case, not a hypothetical.

   `gigs` is in the metrics payload and is deliberately not shown: gigs were
   removed from this product's surfaces. */

/* The page's own pastels, reused rather than a second palette invented beside
   it. `[wash, ink]` exactly as `TILES` uses them, so a city card and a category
   tile are recognisably the same product. */
const PASTELS: Array<[wash: string, ink: string]> = [
  ['rgba(134,216,188,.32)', '#3f7a64'],
  ['rgba(168,182,250,.30)', '#575f9c'],
  ['rgba(255,178,178,.30)', '#a05e60'],
  ['rgba(196,172,246,.32)', '#6f5a9c'],
  ['rgba(252,212,144,.36)', '#8e6b23'],
  ['rgba(150,206,222,.32)', '#417382'],
  ['rgba(246,174,216,.30)', '#96587f'],
  ['rgba(160,212,164,.32)', '#4e7a4c'],
];

/* Stable per-name, so a skill keeps its colour between visits and between
   sections without a colour being stored against it anywhere. */
function pastelFor(seed: string): React.CSSProperties {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const [wash, ink] = PASTELS[h % PASTELS.length];
  return { ['--t-wash' as string]: wash, ['--t-ink' as string]: ink };
}

interface Stat { k: string; n: number; label: string; href: string }

function NumbersBand() {
  const [stats, setStats] = useState<Stat[] | null>(null);
  /* Only companies the explorer actually gave a logo file for. A monogram
     stands in for a missing avatar elsewhere on this page, but here the point
     IS the logos — a row of letter tiles would be decoration pretending to be
     evidence. */
  const [logos, setLogos] = useState<Array<{ id: string; name: string; logoUrl: string }>>([]);

  useEffect(() => {
    let live = true;
    Promise.allSettled([
      fetch('/api/jobs/public?limit=1', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch('/api/company-explorer', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch('/api/public/homepage-metrics', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject())),
    ]).then(([jobs, cos, met]) => {
      if (!live) return;
      const out: Stat[] = [];
      const roles = jobs.status === 'fulfilled' ? Number(jobs.value?.total) || 0 : 0;
      const companies = cos.status === 'fulfilled' && Array.isArray(cos.value?.companies) ? cos.value.companies.length : 0;
      const people = met.status === 'fulfilled' ? Number(met.value?.people?.raw) || 0 : 0;
      const published = met.status === 'fulfilled' ? Number(met.value?.publishes?.raw) || 0 : 0;
      if (roles > 0) out.push({ k: 'roles', n: roles, label: 'open roles', href: '/jobs' });
      if (companies > 0) out.push({ k: 'cos', n: companies, label: 'companies hiring', href: '/businesses' });
      if (people > 0) out.push({ k: 'people', n: people, label: 'published profiles', href: '/people' });
      if (published > 0) out.push({ k: 'pub', n: published, label: 'things published', href: '/published' });
      setStats(out);
      if (cos.status === 'fulfilled' && Array.isArray(cos.value?.companies)) {
        setLogos(
          (cos.value.companies as Array<{ id: string; name: string; logoUrl?: string }>)
            .filter((c) => !!c.logoUrl)
            /* All of them. There are a dozen at most, and an arbitrary cap
               would drop real marks while the strip claims to show who is
               hiring. The row wraps rather than truncating. */
            .slice(0, 16)
            .map((c) => ({ id: c.id, name: c.name, logoUrl: c.logoUrl as string })),
        );
      }
    });
    return () => { live = false; };
  }, []);

  if (!stats || stats.length < 2) return null;

  return (
    <article className="dh-deck-c dh-band" aria-label="Docrud in numbers">
      <div className="dh-band-in">
        <div className="dh-band-h">
          <h2 className="dh-band-t">Everything here is live</h2>
          <p className="dh-band-s">
            Counted from the marketplace as it is right now, not a launch figure.
          </p>
        </div>
        <div className="dh-band-g">
          {stats.map((st) => (
            <Link key={st.k} href={st.href} className="dh-stat">
              <span className="dh-stat-n">{st.n.toLocaleString()}</span>
              <span className="dh-stat-l">{st.label}</span>
              <ArrowRight size={13} className="dh-stat-a" aria-hidden />
            </Link>
          ))}
        </div>

        {logos.length > 0 && (
          <div className="dh-band-logos">
            <span className="dh-band-logos-l">Hiring right now</span>
            <span className="dh-band-logos-r">
              {logos.map((c) => (
                <Link key={c.id} href={companyJobsHref(c.id)} className="dh-band-logo" title={`${c.name} — open roles`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.logoUrl} alt={c.name} loading="lazy" decoding="async" />
                </Link>
              ))}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

/* ── Explore categories, and what is trending in them ─────────────────────
   Two sections from ONE request, because they are two views of the same
   answer: `/api/jobs/public` carries a `domain` on every posting, and the
   taxonomy that names those domains is `JOB_DOMAIN_LABELS`.

   ═══ ONLY CATEGORIES THAT HAVE ROLES ═══

   A pill is rendered for a domain only when postings exist in it, and the
   count on it is the count the endpoint returned. The taxonomy lists eighteen
   domains; showing all eighteen would mean fourteen pills leading to an empty
   board. The classifier also leaves `domain` ABSENT when it is not confident
   (see job-sources/classify.ts), and those postings are simply not counted
   into any category rather than being filed under a guess.

   ═══ THE PANELS SHOW REAL ROLES, WITH NO RATINGS ═══

   The reference this is modelled on puts a star rating on every card. There is
   no rating anywhere in this product — not on a role, not on an employer — so
   the third line of each card is what the posting actually states: its work
   mode, its employment type and how long ago it was posted. A 4.8 invented to
   fill that line would be the most convincing lie on the page.

   ═══ WHERE A PILL GOES ═══

   `/jobs?q=<label>`, which the board seeds into its SEARCH box. The board has
   no domain filter, and adding one is a change to the board rather than a
   homepage section — so the pill lands on a real search for that category,
   visible and clearable in the box where it lands. It is not presented as an
   exact filter. */

interface ExploreRow {
  id: string;
  title?: string;
  organizationName?: string;
  location?: string;
  workMode?: string;
  employmentType?: string;
  domain?: string;
  postedAt?: string;
  createdAt?: string;
  shareUrl?: string;
}

/* One icon per domain, from the taxonomy's own keys. A domain with no icon
   listed falls back rather than rendering a blank box. */
const DOMAIN_ICON: Record<string, typeof MapPin> = {
  software: Code2,
  data: BarChart3,
  ai: Sparkles,
  design: Palette,
  product: Boxes,
  marketing: Megaphone,
  sales: TrendingUp,
  finance: Landmark,
  hr: Users,
  operations: Settings2,
  legal: Scale,
  support: Headphones,
  health: HeartPulse,
  education: GraduationCap,
  engineering: Wrench,
  writing: PenLine,
  security: ShieldCheck,
  other: Compass,
};

function ExploreCategories() {
  const [rows, setRows] = useState<ExploreRow[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/jobs/public?pageSize=48', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('jobs-failed'))))
      .then((d) => { if (live) setRows(Array.isArray(d?.items) ? d.items : []); })
      .catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, []);

  /* Counted from what came back, not from the taxonomy. */
  const cats = useMemo(() => {
    const by = new Map<string, number>();
    for (const r of rows ?? []) {
      const d = (r.domain ?? '').trim();
      if (!d || !(d in JOB_DOMAIN_LABELS)) continue;
      by.set(d, (by.get(d) ?? 0) + 1);
    }
    return Array.from(by.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([id, n]) => ({ id, n, label: JOB_DOMAIN_LABELS[id as keyof typeof JOB_DOMAIN_LABELS] }));
  }, [rows]);

  /* Three categories, busiest first, each with its three newest roles. */
  const panels = useMemo(() => {
    const newest = (a: ExploreRow, b: ExploreRow) =>
      Date.parse(b.postedAt || b.createdAt || '') - Date.parse(a.postedAt || a.createdAt || '');
    /* One role per title-and-employer inside a panel. The duplicates are real
       postings — the same role opened in two cities — so nothing is hidden:
       the board lists all of them and this panel is a sample of three. A sample
       that shows "Manager, Technical Solutions" twice out of three looks like a
       rendering fault, which is a worse misrepresentation than sampling
       distinctly. */
    const distinct = (list: ExploreRow[]) => {
      const seen = new Set<string>();
      const out: ExploreRow[] = [];
      for (const r of list) {
        const key = `${(r.title ?? '').trim().toLowerCase()}|${(r.organizationName ?? '').trim().toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(r);
        if (out.length === 3) break;
      }
      return out;
    };
    const built = cats.map((c) => ({
      ...c,
      roles: distinct((rows ?? []).filter((r) => (r.domain ?? '').trim() === c.id).sort(newest)),
    })).filter((p) => p.roles.length > 0);
    /* Three panels side by side, so prefer the busiest categories that have a
       full three distinct roles to show — a panel with one role in it leaves a
       void beside two full ones, which reads as a failed load rather than as a
       small category. Only if fewer than three categories can fill a panel do
       the short ones get used, because showing less is still better than
       showing nothing. */
    const full = built.filter((p) => p.roles.length === 3);
    return [...full, ...built.filter((p) => p.roles.length < 3)].slice(0, 3);
  }, [cats, rows]);

  if (rows !== null && cats.length === 0) return null;

  return (
    <>
      <div className="dh-pad dh-sec">
        <h2 className="dh-sec-t">Explore categories</h2>
        <span className="dh-sec-rule" aria-hidden />
        <Link href="/jobs" className="dh-sec-more">All roles <ArrowRight size={13} /></Link>
      </div>
      <div className="dh-pad">
        <div className="dh-cat-row">
          {rows === null
            ? [72, 96, 84, 110, 88, 78].map((w, i) => <span key={i} className="dh-sk dh-cat-sk" style={{ width: w }} />)
            : cats.map((c) => {
              const Icon = DOMAIN_ICON[c.id] ?? Compass;
              return (
                <Link
                  key={c.id}
                  href={`/jobs?q=${encodeURIComponent(c.label)}`}
                  className="dh-cat-p"
                  style={pastelFor(c.id)}
                >
                  <Icon size={14} aria-hidden />
                  <span>{c.label}</span>
                  <span className="dh-cat-n">{c.n}</span>
                </Link>
              );
            })}
        </div>
      </div>

      {panels.length > 0 && (
        <>
          <div className="dh-pad dh-sec">
            <h2 className="dh-sec-t">Where the roles are</h2>
            <span className="dh-sec-rule" aria-hidden />
          </div>
          <div className="dh-pad">
            <div className="dh-trend">
              {panels.map((p) => (
                <section key={p.id} className="dh-tp" style={pastelFor(p.id)} aria-label={p.label}>
                  <Link href={`/jobs?q=${encodeURIComponent(p.label)}`} className="dh-tp-h">
                    <span className="dh-tp-t">{p.label}</span>
                    <ArrowRight size={14} aria-hidden />
                  </Link>
                  <div className="dh-tp-l">
                    {p.roles.map((r) => {
                      const co = (r.organizationName ?? '').trim();
                      const facts = [
                        r.workMode ? WORK_MODE_LABELS[r.workMode] ?? r.workMode : null,
                        r.employmentType ? EMPLOYMENT_TYPE_LABELS[r.employmentType] ?? r.employmentType : null,
                      ].filter(Boolean).join(' · ');
                      return (
                        <Link key={r.id} href={r.shareUrl || `/jobs/${r.id}`} className="dh-tr">
                          <span className="dh-tr-m">
                            {co ? <OppMark name={co} /> : <span className="dh-opp-mono" aria-hidden>?</span>}
                          </span>
                          <span className="dh-tr-b">
                            {co && <span className="dh-tr-co">{co}</span>}
                            <span className="dh-tr-t">{r.title || 'Untitled role'}</span>
                            {/* What the posting states — never a rating. */}
                            <span className="dh-tr-s">
                              {facts}
                              {facts && ' · '}
                              {formatPosted(r.postedAt || r.createdAt)}
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ── What brings you here ─────────────────────────────────────────────────
   Four destinations, all of which exist. It asks rather than assumes, and
   every answer is one click from the thing it names. */

const INTENTS: Array<{ label: string; href: string; Icon: typeof MapPin }> = [
  { label: 'Find a job', href: '/jobs', Icon: Briefcase },
  { label: 'Hire someone', href: '/jobs/post', Icon: Users },
  { label: 'Take on projects', href: '/projects', Icon: Hammer },
  { label: 'Be found for my work', href: '/people', Icon: Sparkles },
];

function WhyHere({ softwareName }: { softwareName: string }) {
  return (
    <div className="dh-pad">
      <div className="dh-why">
        <p className="dh-why-q">What brings you to {softwareName} today?</p>
        <div className="dh-why-r">
          {INTENTS.map((i) => (
            <Link key={i.href} href={i.href} className="dh-why-b">
              <span className="dh-why-i" aria-hidden><i.Icon size={16} /></span>
              <span>{i.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Roles by city ────────────────────────────────────────────────────────
   A grid, and deliberately WITHOUT counts. Counting roles per city needs the
   whole corpus, which this page is careful never to load — see the note at the
   top of this file. A number here would have to come from a sample, and a
   wrong count on the homepage is worse than no count. The board these link to
   states the real one the moment it opens. */

const CITIES: Array<{ id: string; label: string; note: string }> = [
  { id: 'india', label: 'India', note: 'Everywhere in the country' },
  { id: 'bengaluru', label: 'Bengaluru', note: 'Karnataka' },
  { id: 'hyderabad', label: 'Hyderabad', note: 'Telangana' },
  { id: 'pune', label: 'Pune', note: 'Maharashtra' },
  { id: 'mumbai', label: 'Mumbai', note: 'Maharashtra' },
  { id: 'delhi-ncr', label: 'Delhi NCR', note: 'Delhi, Gurugram, Noida' },
  { id: 'chennai', label: 'Chennai', note: 'Tamil Nadu' },
  { id: 'remote-india', label: 'Remote', note: 'Anywhere in India' },
];

function CityGrid() {
  return (
    <div className="dh-pad">
      <div className="dh-city-g">
        {CITIES.map((c) => (
          <Link key={c.id} href={`/jobs?loc=${c.id}`} className="dh-city" style={pastelFor(c.id)}>
            <span className="dh-city-i" aria-hidden><MapPin size={15} /></span>
            <span className="dh-city-b">
              <span className="dh-city-t">{c.label}</span>
              <span className="dh-city-n">{c.note}</span>
            </span>
            <ArrowRight size={13} className="dh-city-a" aria-hidden />
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── Skills people list ───────────────────────────────────────────────────
   Counted from the published profiles the directory already serves, so a skill
   nobody has listed never appears and the number on a card is the number the
   directory will show. Hidden entirely when nobody has listed anything. */

function SkillGrid() {
  const [skills, setSkills] = useState<Array<[string, number]> | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/public/people', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('people-failed'))))
      .then((d) => {
        if (!live) return;
        const by = new Map<string, number>();
        for (const person of (Array.isArray(d?.people) ? d.people : [])) {
          for (const raw of (person?.profile?.skills ?? [])) {
            const t = String(raw || '').trim();
            if (t) by.set(t, (by.get(t) ?? 0) + 1);
          }
        }
        setSkills(Array.from(by.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12));
      })
      .catch(() => { if (live) setSkills([]); });
    return () => { live = false; };
  }, []);

  if (!skills || skills.length === 0) return null;

  return (
    <>
      <div className="dh-pad dh-sec">
        <h2 className="dh-sec-t">Skills people list</h2>
        <span className="dh-sec-rule" aria-hidden />
        <Link href="/people" className="dh-sec-more">Browse talent <ArrowRight size={13} /></Link>
      </div>
      <div className="dh-pad">
        <div className="dh-skill-g">
          {skills.map(([name, n]) => (
            <Link
              key={name}
              href={`/people?skill=${encodeURIComponent(name)}`}
              className="dh-skill"
              style={pastelFor(name)}
            >
              <span className="dh-skill-d" aria-hidden />
              <span className="dh-skill-t">{name}</span>
              <span className="dh-skill-n">{n.toLocaleString()} {n === 1 ? 'person' : 'people'}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}


/* ── Two ways in ──────────────────────────────────────────────────────────
   A dark panel pair, early on the page, because the first thing a visitor to a
   two-sided marketplace needs is to know which side they are on. Everything
   here is a route that exists; nothing is a number or a claim about activity,
   so it cannot go stale or be wrong about the data.

   Deliberately NOT a card grid — this page already has three of those. Two
   large panels read as a fork in the road, which is what it is. */

const PATHS: Array<{
  k: string; kicker: string; title: string; blurb: string;
  links: Array<{ label: string; note: string; href: string }>;
}> = [
  {
    k: 'work',
    kicker: 'Looking for work',
    title: 'Be found for what you actually do',
    blurb: 'Roles come straight from company career pages. You apply on the employer’s own site — nothing sits between you and the application.',
    links: [
      { label: 'Browse open roles', note: 'Filter by city, work mode and level', href: '/jobs' },
      { label: 'Publish your profile', note: 'Headline, skills and where you are', href: '/profile' },
      { label: 'See who is hiring', note: 'Companies and their open roles', href: '/businesses' },
    ],
  },
  {
    k: 'hire',
    kicker: 'Hiring',
    title: 'Reach people by the work they list',
    blurb: 'Post a role and it is matched against published profiles. Track applicants in the same place you posted from.',
    links: [
      { label: 'Post a role', note: 'Seven short steps, or draft it with AI', href: '/jobs/post' },
      { label: 'Browse talent', note: 'Search the directory by skill', href: '/people' },
      { label: 'Create a company page', note: 'Industry, location and open roles', href: '/businesses/create' },
    ],
  },
];

/* ── Opportunities ────────────────────────────────────────────────────────
   Two grids, one card. The upper one is ranked against the viewer's profile,
   the lower one is simply what came in most recently, and both draw the same
   `OppCard` so a role cannot describe itself differently depending on which
   grid it landed in.

   ═══ WHAT A CARD MAY SAY ═══

   Only fields `/api/jobs/public` actually returns: the title, the employer, the
   location, the work mode, the employment type, the seniority when the posting
   states one, the department, and when it was posted. There is NO PAY ON A JOB
   CARD anywhere in this product because the payload has no pay in it — a range
   invented to balance a card is a lie about somebody's job. `description` is
   returned too and is deliberately not rendered: it is raw employer HTML, and
   the card is not the place to inject it.

   ═══ THE MATCHED GRID IS EMPTY WHEN THERE IS NOTHING TO MATCH ═══

   `/api/recommendations/jobs` scores against the SESSION's stored profile and
   attaches `matchScore`/`matchReasons` only when that profile has signals to
   score — `hasProfileSignals` in lib/server/job-recommend.ts. A signed-out
   visitor is keyed 'anon' and gets the same postings back with no match data at
   all. So this section renders matches only when the payload really carries
   them, and otherwise says plainly that there is no profile to match against
   and offers to fix that. It never relabels recent postings as "matched to
   you": that is the one thing a section with this heading must not do. */

interface OppJob {
  id: string;
  title?: string;
  organizationName?: string;
  location?: string;
  workMode?: string;
  employmentType?: string;
  experienceLevel?: string | null;
  department?: string;
  postedAt?: string;
  createdAt?: string;
  shareUrl?: string;
  /** Present only when the server scored this against a real profile. */
  matchScore?: number;
  matchReasons?: string[];
}

/** The employer's mark at card size: the verified logo, or a hue-stable initial. */
function OppMark({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  const logo = getCompanyLogo(name);
  if (logo && !failed) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        className="dh-opp-logo"
        src={logo.src}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }
  /* A monogram, not a placeholder image: two thirds of these employers have no
     logo file, so the fallback is the common case and has to look deliberate. */
  const hue = companyHue(name || '?');
  return (
    <span
      className="dh-opp-mono"
      aria-hidden
      style={{ ['--h' as string]: String(hue) } as React.CSSProperties}
    >
      {(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

function OppCard({ job }: { job: OppJob }) {
  const company = (job.organizationName || '').trim();
  const employment = job.employmentType ? EMPLOYMENT_TYPE_LABELS[job.employmentType] ?? job.employmentType : null;
  const mode = job.workMode ? WORK_MODE_LABELS[job.workMode] ?? job.workMode : null;
  const level = job.experienceLevel ? EXPERIENCE_LABELS[job.experienceLevel] ?? job.experienceLevel : null;
  const posted = formatPosted(job.postedAt || job.createdAt);
  /* Every fact is optional in the payload, so the chip row is built from what
     is there rather than from a fixed set with blanks in it. */
  const facts = [mode, employment, level, job.department].filter(Boolean) as string[];
  const reasons = Array.isArray(job.matchReasons) ? job.matchReasons.filter(Boolean).slice(0, 2) : [];

  return (
    <Link
      href={job.shareUrl || `/jobs/${job.id}`}
      className="dh-opp"
      style={pastelFor(company || job.id)}
    >
      <span className="dh-opp-top">
        <span className="dh-opp-mark">
          {company ? <OppMark name={company} /> : <span className="dh-opp-mono" aria-hidden>?</span>}
        </span>
        <span className="dh-opp-head">
          <span className="dh-opp-t">{job.title || 'Untitled role'}</span>
          {company ? <span className="dh-opp-co">{company}</span> : null}
        </span>
        {typeof job.matchScore === 'number' ? (
          /* The score is the server's own integer and the word is the band it
             falls in — lib/job-match-tone dresses it, nothing here computes it. */
          <span className="dh-opp-score" title={`${getJobMatchLabel(job.matchScore)} match`}>
            {job.matchScore}
            <span className="dh-opp-score-u" aria-hidden>%</span>
          </span>
        ) : null}
      </span>

      {job.location ? (
        <span className="dh-opp-loc">
          <MapPin size={13} aria-hidden />
          <span>{job.location}</span>
        </span>
      ) : null}

      {facts.length ? (
        <span className="dh-opp-facts">
          {facts.map((f) => <span key={f} className="dh-opp-fact">{f}</span>)}
        </span>
      ) : null}

      {reasons.length ? (
        <span className="dh-opp-why">
          {reasons.map((r) => <span key={r} className="dh-opp-r">{r}</span>)}
        </span>
      ) : null}

      <span className="dh-opp-foot">
        {posted ? <span className="dh-opp-when">{posted}</span> : <span />}
        <span className="dh-opp-go">View role <ArrowRight size={13} aria-hidden /></span>
      </span>
    </Link>
  );
}

/** A card-shaped skeleton, so the grid does not jump when the fetch lands. */
function OppSkeleton() {
  return (
    <span className="dh-opp is-skel" aria-hidden>
      <span className="dh-opp-top">
        <span className="dh-opp-mark"><span className="dh-sk dh-sk-mark" /></span>
        <span className="dh-opp-head">
          <span className="dh-sk dh-sk-t" />
          <span className="dh-sk dh-sk-co" />
        </span>
      </span>
      <span className="dh-sk dh-sk-l" />
      <span className="dh-opp-facts">
        <span className="dh-sk dh-sk-f" />
        <span className="dh-sk dh-sk-f" />
      </span>
    </span>
  );
}

/* ── Matched to your profile ── */

function MatchedOpportunities() {
  const [jobs, setJobs] = useState<OppJob[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/recommendations/jobs', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('recs-failed'))))
      .then((d) => { if (live) setJobs(Array.isArray(d?.jobs) ? d.jobs : []); })
      .catch(() => { if (live) setJobs([]); });
    return () => { live = false; };
  }, []);

  /* Matched means matched. A posting counts only if the server attached a score
     to it, which it does only for a profile it could actually score. */
  const matched = (jobs ?? []).filter((j) => typeof j.matchScore === 'number');

  if (jobs === null) {
    return (
      <>
        <div className="dh-pad dh-sec">
          <h2 className="dh-sec-t">Matched to your profile</h2>
          <span className="dh-sec-rule" aria-hidden />
        </div>
        <div className="dh-pad"><div className="dh-opp-g">{[0, 1, 2].map((i) => <OppSkeleton key={i} />)}</div></div>
      </>
    );
  }

  return (
    <>
      <div className="dh-pad dh-sec">
        <h2 className="dh-sec-t">Matched to your profile</h2>
        <span className="dh-sec-rule" aria-hidden />
        {matched.length > 0 ? (
          <Link href="/jobs" className="dh-sec-more">See all matches <ArrowRight size={13} /></Link>
        ) : null}
      </div>
      <div className="dh-pad">
        {matched.length > 0 ? (
          <div className="dh-opp-g">
            {matched.slice(0, 6).map((j) => <OppCard key={j.id} job={j} />)}
          </div>
        ) : (
          /* The honest empty state. It says why there is nothing here and links
             to the one thing that changes it, rather than filling the grid with
             recent postings under a heading that claims they were matched. */
          <div className="dh-opp-none">
            <span className="dh-opp-none-i" aria-hidden><Sparkles size={16} /></span>
            <span className="dh-opp-none-b">
              <span className="dh-opp-none-t">Nothing to match against yet</span>
              <span className="dh-opp-none-s">
                Roles are scored against a published profile — your headline, your skills and
                where you work. Publish yours and this fills in.
              </span>
            </span>
            <Link href="/people" className="dh-opp-none-a">
              Publish your profile <ArrowRight size={13} aria-hidden />
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

/* ── Projects matched to your profile ────────────────────────────────────
   Its own row rather than mixed into the jobs above it, and the reason is
   arithmetic: the scorer sums out of 100 and a project states no experience
   level, so it can never earn the 12 points seniority is worth. Interleaved,
   every project would sit below an equally good job because of a handicap it
   could not avoid. Side by side in their own row, a reader compares projects
   with projects. See lib/server/project-recommend.ts. */

interface MatchedProject {
  id: string;
  title?: string;
  category?: string;
  skills?: string[];
  location?: string;
  workMode?: string;
  projectType?: string;
  createdAt?: string;
  matchScore?: number;
  matchReasons?: string[];
}

function MatchedProjects() {
  const [items, setItems] = useState<MatchedProject[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/recommendations/projects', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('proj-recs-failed'))))
      .then((d) => { if (live) setItems(Array.isArray(d?.projects) ? d.projects : []); })
      .catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, []);

  /* Nothing to say is said by saying nothing: the endpoint returns an empty set
     for a visitor with no profile, and the jobs section above already carries
     the one invitation to publish one. A second empty panel under it would be
     the same sentence twice. */
  const matched = (items ?? []).filter((p) => typeof p.matchScore === 'number');
  if (matched.length === 0) return null;

  return (
    <>
      <div className="dh-pad dh-sec">
        <h2 className="dh-sec-t">Projects matched to your profile</h2>
        <span className="dh-sec-rule" aria-hidden />
        <Link href="/projects" className="dh-sec-more">All projects <ArrowRight size={13} /></Link>
      </div>
      <div className="dh-pad">
        <div className="dh-opp-g">
          {matched.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="dh-opp" style={pastelFor(p.id)}>
              <span className="dh-opp-top">
                <span className="dh-opp-mark">
                  <span className="dh-opp-mono" aria-hidden><Hammer size={16} /></span>
                </span>
                <span className="dh-opp-head">
                  <span className="dh-opp-t">{p.title || 'Untitled project'}</span>
                  <span className="dh-opp-co">Project</span>
                </span>
                {typeof p.matchScore === 'number' ? (
                  <span className="dh-opp-score" title={`${getJobMatchLabel(p.matchScore)} match`}>
                    {p.matchScore}
                    <span className="dh-opp-score-u" aria-hidden>%</span>
                  </span>
                ) : null}
              </span>

              {p.location ? (
                <span className="dh-opp-loc">
                  <MapPin size={13} aria-hidden />
                  <span>{p.location}</span>
                </span>
              ) : null}

              {(() => {
                /* Only what the project states. `projectType` and `workMode`
                   are enums with labels; the skills are the poster's own
                   words and are shown as they were typed. */
                const facts = [
                  p.workMode ? WORK_MODE_LABELS[p.workMode] ?? p.workMode : null,
                  p.projectType ? PROJECT_TYPE_LABELS[p.projectType] ?? p.projectType : null,
                  ...(Array.isArray(p.skills) ? p.skills.slice(0, 2) : []),
                ].filter(Boolean) as string[];
                return facts.length ? (
                  <span className="dh-opp-facts">
                    {facts.map((f) => <span key={f} className="dh-opp-fact">{f}</span>)}
                  </span>
                ) : null;
              })()}

              {Array.isArray(p.matchReasons) && p.matchReasons.length > 0 ? (
                <span className="dh-opp-why">
                  {p.matchReasons.slice(0, 2).map((r) => <span key={r} className="dh-opp-r">{r}</span>)}
                </span>
              ) : null}

              <span className="dh-opp-foot">
                <span className="dh-opp-when">{formatPosted(p.createdAt)}</span>
                <span className="dh-opp-go">View project <ArrowRight size={13} aria-hidden /></span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

/* ── Recent opportunities ── */

function RecentOpportunities() {
  const [jobs, setJobs] = useState<OppJob[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    /* `pageSize`, not `limit`: the route pages on page/pageSize and ignores
       anything else, so `?limit=9` quietly returned the default twenty. */
    fetch('/api/jobs/public?pageSize=9', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('jobs-failed'))))
      .then((d) => {
        if (!live) return;
        setJobs(Array.isArray(d?.items) ? d.items : []);
        setTotal(Number.isFinite(Number(d?.total)) ? Number(d.total) : null);
      })
      .catch(() => { if (live) { setJobs([]); setTotal(null); } });
    return () => { live = false; };
  }, []);

  if (jobs !== null && jobs.length === 0) return null;

  return (
    <>
      <div className="dh-pad dh-sec">
        <h2 className="dh-sec-t">Recent opportunities</h2>
        <span className="dh-sec-rule" aria-hidden />
        <Link href="/jobs" className="dh-sec-more">
          {/* The endpoint's own total, or nothing — never a rounded-up count. */}
          {total !== null ? `All ${total.toLocaleString()} roles` : 'All roles'} <ArrowRight size={13} />
        </Link>
      </div>
      <div className="dh-pad">
        <div className="dh-opp-g">
          {jobs === null
            ? [0, 1, 2, 3, 4, 5].map((i) => <OppSkeleton key={i} />)
            : jobs.map((j) => <OppCard key={j.id} job={j} />)}
        </div>
      </div>
    </>
  );
}

/* ── The deck ─────────────────────────────────────────────────────────────
   The four explanatory panels — the walkthrough, the two ways in, the live
   numbers, the provenance — as one horizontal scroller instead of four
   full-bleed sections stacked on top of each other.

   WHY. Stacked, they were four screens of dark that a reader had to scroll
   past to reach the end of the page, and each one announced itself as a new
   chapter. Side by side they are ONE thing to look at with three more on
   offer, which is a smaller promise and an easier one to keep.

   THE PEEK IS THE AFFORDANCE. A card is deliberately narrower than the rail,
   so the next one is always cut off at the right edge. A scroller whose
   contents end exactly at its edge reads as a page that has finished, and no
   arrow or dot undoes that impression as well as 100px of the next card does.
   `--dh-peek` is that overhang, and it is the only number that decides it.

   EACH CARD KEEPS ITS OWN PASTEL. They were four different surfaces before and
   they still are: same dark family, different orbs, and the walkthrough keeps
   its hairline grid. Four cards cut from one colour would read as one card
   repeated. */

function useDeck() {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const teardown = useRef<(() => void) | null>(null);
  /* `at` mirrors `index` for the callbacks, which would otherwise close over
     the index they were created with and step from the wrong card. */
  const at = useRef(0);
  const [state, setState] = useState({ index: 0, count: 0, start: true, end: true, height: 0 });

  /** A card is snapped to `scroll-padding-inline`, not to 0, so every
      comparison here is against the padding box rather than the scroll origin.
      Getting that wrong parks the active dot one card early at every width. */
  const pad = (el: HTMLDivElement) => parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0;

  const measure = useCallback(() => {
    const el = nodeRef.current;
    if (!el) return;
    /* `Array.from`, not a spread: this project's target does not allow
       iterating an HTMLCollection. */
    const cards = Array.from(el.children) as HTMLElement[];
    const slack = el.scrollWidth - el.clientWidth;
    const target = el.scrollLeft + pad(el);
    let index = 0;
    let best = Infinity;
    cards.forEach((c, i) => {
      const d = Math.abs(c.offsetLeft - target);
      if (d < best) { best = d; index = i; }
    });
    at.current = index;

    /* ── The rail takes the height of the CARD IN VIEW ──
       Every card is stretched to the rail, so without this the rail is as tall
       as the tallest card and every shorter one carries the difference as empty
       ground. On a phone that was ~190px of nothing above and below the numbers
       card, and neither centring it nor spreading its contents out fixed the
       look of it — centred it read as unfinished, spread out it read as three
       disconnected fragments. The height itself was the problem.

       So the rail is told what the open card actually needs and animates to it.
       A card's own height is its CONTENT's height plus its padding: the card is
       stretched, so measuring the card measures the rail, but the child inside
       is not, so measuring the child measures the content. The cards that are
       not in view still stretch to whatever the rail is — they are a 50px
       sliver at the edge, so nobody sees the slack they are carrying. */
    const open = cards[index];
    let height = 0;
    if (open) {
      const inner = open.firstElementChild as HTMLElement | null;
      const cs = getComputedStyle(open);
      const box = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
        + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
      height = Math.ceil((inner ? inner.getBoundingClientRect().height : 0) + box);
    }

    setState({
      index,
      count: cards.length,
      start: el.scrollLeft <= 4,
      end: slack <= 4 || el.scrollLeft >= slack - 4,
      height,
    });
  }, []);

  /* A callback ref for the same reason `useRail` uses one: one of these cards
     renders nothing until a fetch lands, so the rail's children change after
     mount without the rail itself ever resizing. */
  const ref = useCallback((node: HTMLDivElement | null) => {
    teardown.current?.();
    teardown.current = null;
    nodeRef.current = node;
    if (!node) return;

    node.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    const mo = new MutationObserver(measure);
    mo.observe(node, { childList: true });
    /* The walkthrough's stages open and close, which changes that card's own
       height while nothing about the rail changes — so the inner boxes are
       observed too, not just the rail. */
    const inner = new ResizeObserver(measure);
    for (const c2 of Array.from(node.children)) {
      if (c2.firstElementChild) inner.observe(c2.firstElementChild);
    }
    const raf = requestAnimationFrame(measure);

    teardown.current = () => {
      cancelAnimationFrame(raf);
      node.removeEventListener('scroll', measure);
      ro.disconnect();
      mo.disconnect();
      inner.disconnect();
    };
  }, [measure]);

  /* NO `useEffect` CLEANUP HERE, deliberately.
     React calls a callback ref with `null` when the element goes away, and the
     callback tears the previous node down before it returns — so unmount is
     already handled. An effect cleanup that ALSO tore down broke this under
     `reactStrictMode`: the simulated unmount ran the cleanup, disconnected both
     observers and removed the scroll listener, and the remount never re-invoked
     the ref (same node, same callback identity), so nothing reinstalled them.
     The arrows then kept whatever state they had at first paint for the life of
     the page, and a rail that filled from a fetch never noticed. */

  const to = useCallback((i: number) => {
    const el = nodeRef.current;
    if (!el) return;
    const card = el.children[i] as HTMLElement | undefined;
    if (!card) return;
    el.scrollTo({ left: Math.max(0, card.offsetLeft - pad(el)), behavior: 'smooth' });
  }, []);

  /* One card per press, not one viewport: the cards are not all the same
     width, and a viewport-sized nudge leaves the rail between two snap points
     for as long as the scroll takes to settle. */
  const step = useCallback((dir: -1 | 1) => {
    const el = nodeRef.current;
    if (!el) return;
    to(Math.min(el.children.length - 1, Math.max(0, at.current + dir)));
  }, [to]);

  return { ref, to, step, ...state };
}

function Deck({ children }: { children: React.ReactNode }) {
  const { ref, to, step, index, count, start, end, height } = useDeck();
  const label = 'How Docrud works';

  return (
    <section className="dh-deck" aria-label={label}>
      {/* `tabindex` on the scroller itself, so a keyboard reader can pan it
          with the arrow keys the way a pointer pans it with a wheel. The cards
          stay in the DOM and in the tab order whether or not they are in view,
          so nothing here is reachable only by scrolling. */}
      <div
        className="dh-deck-rail"
        ref={ref}
        role="group"
        aria-label={label}
        tabIndex={0}
        /* Left unset until it has been measured, so the rail falls back to its
           natural height — the tallest card — rather than collapsing to nothing
           if this never runs. */
        style={height ? { height } : undefined}
      >
        {children}
      </div>

      <div className="dh-deck-nav">
        <div className="dh-deck-dots">
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              type="button"
              className="dh-deck-dot"
              aria-label={`Show panel ${i + 1} of ${count}`}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => to(i)}
            />
          ))}
        </div>
        <div className="dh-deck-arrows">
          <button
            type="button"
            className="dh-deck-a"
            onClick={() => step(-1)}
            aria-label={`Scroll ${label} left`}
            disabled={start}
          >
            <ChevronLeft size={17} aria-hidden />
          </button>
          <button
            type="button"
            className="dh-deck-a"
            onClick={() => step(1)}
            aria-label={`Scroll ${label} right`}
            disabled={end}
          >
            <ChevronRight size={17} aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * Is the viewport narrow enough that a card has to change shape, not just size?
 *
 * Some of these panels are two ideas side by side, and side by side is what
 * makes them short. Stacked on a phone the two-ways panel was 846px tall — the
 * tallest card in the deck, and every other card stretched to match it. Below
 * this width it becomes two cards instead, which moves that height onto the
 * deck's horizontal axis where there is room for it.
 *
 * Starts `false` so the server and the first client render agree; the effect
 * corrects it on mount. The deck is far below the fold, so the correction lands
 * long before anyone scrolls to it.
 */
function useNarrow(query = '(max-width: 620px)') {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);
  return narrow;
}

function TwoWaysIn() {
  const narrow = useNarrow();

  /* The key lives on the panel itself so `.dh-way` stays the grid's direct
     child — a wrapper around it would have become the grid item and taken the
     two-column layout with it. */
  const panel = (path: typeof PATHS[number]) => (
    <div key={path.k} className="dh-way">
      <span className="dh-way-k">{path.kicker}</span>
      <h2 className="dh-way-t">{path.title}</h2>
      <p className="dh-way-b">{path.blurb}</p>
      <div className="dh-way-l">
        {path.links.map((l) => (
          <Link key={l.href} href={l.href} className="dh-way-a">
            <span className="dh-way-a-b">
              <span className="dh-way-a-t">{l.label}</span>
              <span className="dh-way-a-n">{l.note}</span>
            </span>
            <ArrowRight size={14} className="dh-way-a-i" aria-hidden />
          </Link>
        ))}
      </div>
    </div>
  );

  /* One card per path on a phone. A fragment, so both land in the rail as
     siblings — the deck counts its own children, so the dots follow without
     being told. */
  if (narrow) {
    return (
      <>
        {PATHS.map((path) => (
          <article key={path.k} className="dh-deck-c dh-ways dh-ways-one" aria-label={path.title}>
            <div className="dh-ways-in">{panel(path)}</div>
          </article>
        ))}
      </>
    );
  }

  return (
    <article className="dh-deck-c dh-ways" aria-label="Two ways in">
      <div className="dh-ways-in">
        {PATHS.map(panel)}
      </div>
    </article>
  );
}

/* ── How a role reaches someone: the walkthrough ──────────────────────────
   The one section on this page that TEACHES rather than lists. Three stages,
   and for each one a small screen showing what actually happens — so a first
   visitor can see the shape of the product without signing up for it.

   WHY A TABLIST AND NOT THREE CARDS. Three cards side by side are read as
   three choices; a stepper is read as an order, which is the whole point of
   the section. The stages advance on their own so the animation plays for a
   visitor who never clicks, and the advance stops the instant anyone points at
   it, focuses a tab or picks a stage — an interface that keeps moving under a
   reader's eyes is not sleek, it is rude. Nothing auto-advances for a visitor
   who asked for reduced motion.

   WHAT THE SCREENS MAY SAY. Everything in them is a fact about this software,
   taken from the module that implements it: the composer's seven step labels
   come from `lib/jobs/post-wizard`'s STEPS, the scoring weights and the reason
   strings from `lib/server/job-recommend.ts`. No screen holds a job title, a
   company, a name or a figure about usage — a decorative mock with invented
   data would be a lie told in small type. */

/* The scorer's own weights — `W_SKILLS`…`W_FRESHNESS` in
   lib/server/job-recommend.ts. Restated rather than imported: that module
   reaches into the server's storage and must not enter a client bundle. They
   sum to 100 there, and `dh-tut` asserts that here, so a change on either side
   shows up instead of drifting quietly. */
const TUT_WEIGHTS: Array<[string, number]> = [
  ['Skills', 45], ['Role', 25], ['Seniority', 12], ['Location', 12], ['Freshness', 6],
];

/* The literal lines the scorer writes onto a card. They name no person and no
   employer — they are the same for everyone — so they can be shown verbatim
   rather than paraphrased into something the product does not say. */
const TUT_REASONS = ['Role matches your profile', 'Experience level fits', 'Location compatible', 'Remote-friendly'];

type TutStage = 'compose' | 'score' | 'handoff';

const TUT: Array<{ n: string; t: string; b: string; stage: TutStage }> = [
  {
    n: '01',
    t: 'A role is posted',
    b: 'An employer fills seven short steps — or describes the role in a sentence and edits what AI drafts.',
    stage: 'compose',
  },
  {
    n: '02',
    t: 'It is matched, not blasted',
    b: 'The role is scored against published profiles, and the reasons for a match are shown on the card.',
    stage: 'score',
  },
  {
    n: '03',
    t: 'The candidate applies at the source',
    b: 'Every role links to the employer’s own application, on their own site. Docrud does not sit in the middle.',
    stage: 'handoff',
  },
];

/** How long a stage holds before the walkthrough moves on. Matches the
    progress bar's animation, which is the only thing telling the reader that
    it is about to. */
const TUT_MS = 7000;

function TutChrome({ title }: { title: string }) {
  return (
    <div className="dh-tut-top">
      <span className="dh-tut-dots" aria-hidden><i /><i /><i /></span>
      <span className="dh-tut-scr-h">{title}</span>
    </div>
  );
}

/** Stage 1 — the composer, with its real step labels. */
function TutCompose() {
  return (
    <div className="dh-tut-scr">
      <TutChrome title="Post a role" />
      <ol className="dh-tut-chips">
        {WIZARD_STEPS.map((s, i) => (
          <li
            key={s.id}
            className={`dh-tut-chip${i === 0 ? ' is-on' : ''}`}
            style={{ ['--i' as string]: i } as React.CSSProperties}
          >
            <span className="dh-tut-chip-n" aria-hidden>{i + 1}</span>
            {s.label}
          </li>
        ))}
      </ol>
      <p className="dh-tut-scr-f">
        <Sparkles size={12} aria-hidden />
        AI Fill drafts the wording. Pay, screening and documents stay with the employer.
      </p>
    </div>
  );
}

/** Stage 2 — what the score is made of, and what the card says about it. */
function TutScore() {
  return (
    <div className="dh-tut-scr">
      <TutChrome title="How a match is scored" />
      <ul className="dh-tut-w">
        {TUT_WEIGHTS.map(([label, w], i) => (
          <li
            key={label}
            className="dh-tut-w-r"
            style={{ ['--i' as string]: i, ['--w' as string]: `${w}%` } as React.CSSProperties}
          >
            <span className="dh-tut-w-l">{label}</span>
            <span className="dh-tut-w-t" aria-hidden><span className="dh-tut-w-f" /></span>
            <span className="dh-tut-w-v">{w}</span>
          </li>
        ))}
      </ul>
      <div className="dh-tut-rs">
        {TUT_REASONS.map((r, i) => (
          <span key={r} className="dh-tut-r" style={{ ['--i' as string]: i } as React.CSSProperties}>{r}</span>
        ))}
      </div>
    </div>
  );
}

/** Stage 3 — the handoff, drawn as the two ends it actually has. */
function TutHandoff() {
  return (
    <div className="dh-tut-scr">
      <TutChrome title="On the card" />
      <div className="dh-tut-hop">
        <span className="dh-tut-node">Docrud</span>
        <span className="dh-tut-wire" aria-hidden><span className="dh-tut-run" /></span>
        <span className="dh-tut-node is-out">The employer’s own form</span>
      </div>
      <span className="dh-tut-apply">
        Apply on the employer’s site
        <ExternalLink size={13} aria-hidden />
      </span>
      <p className="dh-tut-scr-f">
        <Plug size={12} aria-hidden />
        Every role keeps the link it was published at.
      </p>
    </div>
  );
}

function TutStage({ stage }: { stage: TutStage }) {
  if (stage === 'compose') return <TutCompose />;
  if (stage === 'score') return <TutScore />;
  return <TutHandoff />;
}

function HowItWorks() {
  const narrow = useNarrow();
  const [active, setActive] = useState(0);
  /* Two separate reasons to stop, because they end differently: a pointer
     leaving resumes the walkthrough, a deliberate pick does not. Collapsing
     them into one flag made hovering kill the animation for good. */
  const [pinned, setPinned] = useState(false);
  const [held, setHeld] = useState(false);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const auto = !pinned && !held;

  useEffect(() => {
    if (!auto) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setTimeout(() => setActive((i) => (i + 1) % TUT.length), TUT_MS);
    return () => window.clearTimeout(id);
  }, [auto, active]);

  const pick = useCallback((i: number) => {
    setActive(i);
    setPinned(true);
  }, []);

  /* The arrow keys a tablist is expected to answer. Without this the only way
     through the stages is a click, which leaves a keyboard reader on step one. */
  const onKey = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const last = TUT.length - 1;
    let next = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = active === last ? 0 : active + 1;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = active === 0 ? last : active - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next < 0) return;
    e.preventDefault();
    pick(next);
    tabs.current[next]?.focus();
  }, [active, pick]);

  /* ── The same walkthrough, laid out across instead of down ──
     On a phone the vertical stepper was what made this the tallest card in the
     deck by 250px: three stacked rows, each with a badge and a title, and the
     open one with its copy as well. Across the top it becomes three numbered
     pips on one line, and the stage being explained puts its title and copy
     just once, under them — the shape every mobile tutorial has, and a third
     of the height.

     What goes on a phone: the section's blurb, which restates the three stages
     the pips now show, and the two closed stages' titles, which arrive as you
     step through. What stays: all three stages, their copy, the screen, and the
     link to the composer. The button's accessible name carries the stage title
     so a pip is never announced as just "01". */
  if (narrow) {
    return (
      <article className="dh-deck-c dh-tut dh-tut-m" aria-label="How a role reaches someone">
        <div className="dh-tut-in">
          <div className="dh-tut-h">
            <span className="dh-tut-k">Walkthrough</span>
            <h2 className="dh-tut-t">How a role reaches someone</h2>
          </div>

          <div
            className="dh-tut-strip"
            role="tablist"
            aria-label="Stages"
            aria-orientation="horizontal"
            onKeyDown={onKey}
          >
            {TUT.map((st, i) => (
              <button
                key={st.n}
                ref={(el) => { tabs.current[i] = el; }}
                type="button"
                role="tab"
                id={`tut-stage-${i}`}
                aria-selected={i === active}
                aria-controls="tut-panel"
                aria-label={`Stage ${Number(st.n)}: ${st.t}`}
                tabIndex={i === active ? 0 : -1}
                className={`dh-tut-pip${i === active ? ' is-on' : ''}${i < active ? ' is-done' : ''}`}
                onClick={() => pick(i)}
              >
                <span className="dh-tut-pip-n" aria-hidden>{st.n}</span>
                {i === active && auto ? <span className="dh-tut-pip-p" aria-hidden /> : null}
              </button>
            ))}
          </div>

          <div
            className="dh-tut-stage"
            role="tabpanel"
            id="tut-panel"
            aria-labelledby={`tut-stage-${active}`}
          >
            <div className="dh-tut-frame" key={TUT[active].stage}>
              <p className="dh-tut-m-t">{TUT[active].t}</p>
              <p className="dh-tut-m-b">{TUT[active].b}</p>
              <TutStage stage={TUT[active].stage} />
              <Link href="/jobs/post" className="dh-tut-m-a">
                Post a role <ArrowRight size={13} aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="dh-deck-c dh-tut" aria-label="How a role reaches someone">
      <div className="dh-tut-in">
        <div className="dh-tut-h">
          <span className="dh-tut-k">Walkthrough</span>
          <h2 className="dh-tut-t">How a role reaches someone</h2>
          <p className="dh-tut-b">
            Three stages, in order — what the employer fills in, what the software does with it,
            and where the candidate ends up.
          </p>
          <Link href="/jobs/post" className="dh-tut-cta">
            Post a role <ArrowRight size={14} aria-hidden />
          </Link>
        </div>

        <div
          className="dh-tut-body"
          onMouseEnter={() => setHeld(true)}
          onMouseLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
        >
          <div
            className="dh-tut-l"
            role="tablist"
            aria-label="Stages"
            aria-orientation="vertical"
            onKeyDown={onKey}
            style={{ ['--fill' as string]: `${((active + 0.5) / TUT.length) * 100}%` } as React.CSSProperties}
          >
            {TUT.map((st, i) => (
              <button
                key={st.n}
                ref={(el) => { tabs.current[i] = el; }}
                type="button"
                role="tab"
                id={`tut-stage-${i}`}
                aria-selected={i === active}
                aria-controls="tut-panel"
                tabIndex={i === active ? 0 : -1}
                className={`dh-tut-s${i === active ? ' is-on' : ''}${i < active ? ' is-done' : ''}`}
                onClick={() => pick(i)}
              >
                <span className="dh-tut-s-n" aria-hidden>{st.n}</span>
                <span className="dh-tut-s-x">
                  <span className="dh-tut-s-t">{st.t}</span>
                  {/* Collapsed on the stages that are not open: the point of a
                      stepper is that one thing is being explained at a time. */}
                  <span className="dh-tut-s-w"><span className="dh-tut-s-b">{st.b}</span></span>
                </span>
                {i === active && auto ? <span className="dh-tut-s-p" aria-hidden /> : null}
              </button>
            ))}
          </div>

          <div
            className="dh-tut-stage"
            role="tabpanel"
            id="tut-panel"
            aria-labelledby={`tut-stage-${active}`}
          >
            {/* Keyed on the stage, so the screen's animations replay on every
                change instead of running once on mount. */}
            <div className="dh-tut-frame" key={TUT[active].stage}>
              <TutStage stage={TUT[active].stage} />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ── Where the roles come from ────────────────────────────────────────────
   The provenance, said plainly and darkly. These are the applicant tracking
   systems `lib/jobs-ui`'s `jobSourceLabel` recognises by name — a fact about
   this software, not a claim about how many roles came from each. Counting
   that needs the whole corpus, which this page never loads; the jobs board
   states the real split when it opens. */

const SOURCES = ['Greenhouse', 'Ashby', 'Lever', 'Workable', 'SmartRecruiters', 'Company career sites'];

function Provenance() {
  return (
    <article className="dh-deck-c dh-prov" aria-label="Where the roles come from">
      <div className="dh-prov-in">
        <div className="dh-prov-h">
          <span className="dh-prov-k">Provenance</span>
          <h2 className="dh-prov-t">Every role links back to where it was published</h2>
          <p className="dh-prov-b">
            Roles are read from company career pages and the applicant tracking systems they
            publish through. Docrud does not scrape partner job boards, and it never stands
            between an applicant and an employer&rsquo;s own form.
          </p>
          <Link href="/jobs" className="dh-prov-a">See the split on the board <ArrowRight size={13} /></Link>
        </div>
        <ul className="dh-prov-l">
          {SOURCES.map((src) => (
            <li key={src} className="dh-prov-i">
              <Plug size={13} aria-hidden />
              {src}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}


/* ── The page ─────────────────────────────────────────────────────────────── */

export interface DiscoverHomeProps {
  softwareName: string;
  guestMode?: boolean;
  banners: HeroBanner[] | null;
  viewer: { name: string | null; email: string | null } | null;
}

export default function DiscoverHome({
  softwareName, guestMode = false, banners, viewer,
}: DiscoverHomeProps) {
  const featured = useMemo(
    () => (banners ?? []).filter((b) => b.active && b.imageUrl).sort((a, b) => a.order - b.order),
    [banners],
  );

  return (
    <DiscoverShell
      softwareName={softwareName}
      guestMode={guestMode}
      viewer={viewer}
      /* Pinned under the bar by the shell — see the note on `topStrip`. */
      topStrip={<CompanyStrip />}
    >
      {/* The bar has no room for it now, and it was never chrome: it is a rail
          of employers that goes somewhere, like every other rail here. */}
      <PostCtas />

      {/* No hero. The page opens straight onto what it is FOR — the rail of
          destinations below — rather than on a sentence about itself. */}

      <Rail label="Explore Docrud">
        {TILES.map((t) => (
          <Link key={t.label} href={t.href} className="dh-tile" style={tileVars(t)}>
            <div className="dh-tile-t">{t.label}</div>
            <div className="dh-tile-n">{t.note}</div>
            <Motif kind={t.motif} c={t.hue[1]} />
          </Link>
        ))}
      </Rail>

      {/* ── Featured ── */}
      {featured.length > 0 && (
        <>
          <div className="dh-pad dh-sec">
            <h2 className="dh-sec-t">Featured</h2>
            <span className="dh-sec-rule" aria-hidden />
            <Link href="/published" className="dh-sec-more">See all <ArrowRight size={13} /></Link>
          </div>
          <Rail label="Featured">
            {featured.map((b) => (
              <Link
                key={b.id}
                href={b.ctaHref || '/'}
                className="dh-card"
                /* Only the accent, and only for the hairline that appears on
                   hover. The banner's background colour is deliberately not
                   used — see the note in discover.css. */
                style={{ ['--c-accent' as string]: b.accentColor || '#2b5ce6' }}
              >
                <div className="dh-card-img">
                  {/* Artwork authored for the dark hero, so it keeps its own
                      ground colour behind it rather than being forced onto
                      white where it would lose all its contrast. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.imageUrl} alt="" loading="lazy" decoding="async" />
                </div>
                {b.ctaLabel && (
                  <div className="dh-chips"><span className="dh-chip" data-k="accent">{b.ctaLabel}</span></div>
                )}
                <div className="dh-card-t">{b.title}</div>
                {b.subtitle && <div className="dh-card-s">{b.subtitle}</div>}
              </Link>
            ))}
          </Rail>
        </>
      )}

      {/* ── Opportunities, matched then recent ──
          Below Featured and before the open-roles rail. The matched grid leads
          because a role scored against your own profile is worth more of the
          fold than the newest one; both sit above the rail, which is the same
          corpus without the grid's detail. */}
      <MatchedOpportunities />
      <MatchedProjects />
      <RecentOpportunities />

      {/* ── Roles ── */}
      <div className="dh-pad dh-sec">
        <h2 className="dh-sec-t">Open roles</h2>
        <span className="dh-sec-rule" aria-hidden />
        <Link href="/jobs" className="dh-sec-more">Browse jobs <ArrowRight size={13} /></Link>
      </div>
      <RolesRail />

      <ExploreCategories />
      <WhyHere softwareName={softwareName} />

      {/* ── Roles by city ── */}
      <div className="dh-pad dh-sec">
        <h2 className="dh-sec-t">Roles by city</h2>
        <span className="dh-sec-rule" aria-hidden />
        <Link href="/jobs" className="dh-sec-more">All locations <ArrowRight size={13} /></Link>
      </div>
      <CityGrid />

      {/* ── Suggested people ── */}
      <div className="dh-pad dh-sec">
        <h2 className="dh-sec-t">Suggested people</h2>
        <span className="dh-sec-rule" aria-hidden />
        <Link href="/people" className="dh-sec-more">See everyone <ArrowRight size={13} /></Link>
      </div>
      <PeopleRail />

      {/* ── Skills ── */}
      <SkillGrid />

      {/* ── The dark passage, as one deck ──
          The four panels side by side in a snapping scroller rather than
          stacked. Stacked they were four screens of dark to scroll past; in a
          deck they are one panel with three more offered, and the next card is
          left peeking so the page does not look finished.

          The walkthrough leads it, and is the only one of the four that is
          interactive: it explains the product, and the three after it state
          facts about it. Explanation before assertion. */}
      <Deck>
        <HowItWorks />
        <TwoWaysIn />
        <NumbersBand />
        <Provenance />
      </Deck>
    </DiscoverShell>
  );
}
