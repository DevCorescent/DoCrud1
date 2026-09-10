/**
 * Four hero banners for the homepage slider, with their artwork.
 *
 * Run: npx tsx scripts/seed-hero-banners.ts
 *
 * ═══ WHAT IT WRITES ═══
 *
 * Two things, because a banner is no use without a picture and a picture is no
 * use on its own:
 *
 *   1. SVG artwork into public/uploads/ad-banners/ — the same directory the
 *      Super Admin uploader writes to, so a seeded banner and an uploaded one
 *      are the same kind of record and either can replace the other.
 *   2. Records in ad-banners.json, through the app's own storage layer, so
 *      this works against MongoDB-backed app_state exactly as it does against
 *      the local JSON file in development.
 *
 * ═══ WHY DRAWN AND NOT PHOTOGRAPHED ═══
 *
 * Vector, a few hundred bytes each, no network fetch, no licence to track, and
 * they stay sharp on a 1600px monitor. They are also deliberately abstract:
 * the headline is live HTML over the top, so text baked into the picture would
 * be a second headline that cannot be edited or translated. The composition
 * puts its light in the top right because the slider's veil darkens the bottom
 * and the left, which is where the words go.
 *
 * ═══ IT DOES NOT OVERWRITE ═══
 *
 * Keyed by id. A banner that is already there — seeded once and then edited in
 * Super Admin — is left exactly as it is, and so is its artwork file. Run it
 * twice and the second run changes nothing. Banners that were not seeded by
 * this script are never touched, and the section heading is left alone.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { readJsonFile, writeJsonFile, adBannersPath } from '../lib/server/storage';
import type { HeroBanner, HeroMotif } from '../lib/hero-banner';

type AdBanner = HeroBanner;
type AdBannersData = { heading?: string; banners: AdBanner[] };

const ART_DIR = path.join(process.cwd(), 'public', 'uploads', 'ad-banners');
const ART_URL = '/uploads/ad-banners';

/* ── The artwork ──
   One composition, four palettes. Everything is soft-edged and low-contrast:
   this is a surface for text to sit on, not a picture competing with it. */
type Palette = {
  /** The ground, bottom-left. */ ground: string;
  /** The far corner, top-right. */ far: string;
  /** The light in that corner. */ glow: string;
  /** What the arcs are drawn in. */ accent: string;
};

function art({ ground: a, far: b, glow: c, accent: d }: Palette): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="700" viewBox="0 0 1600 700" fill="none">
  <defs>
    <linearGradient id="g" x1="0" y1="700" x2="1600" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${a}"/>
      <stop offset="1" stop-color="${b}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0" cy="0" r="1"
      gradientTransform="translate(1210 180) rotate(140) scale(620 520)" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${c}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${c}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="0" cy="0" r="1"
      gradientTransform="translate(240 640) rotate(-40) scale(520 420)" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${d}" stop-opacity="0.30"/>
      <stop offset="1" stop-color="${d}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse">
      <path d="M64 0H0V64" stroke="#ffffff" stroke-opacity="0.045" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="1600" height="700" fill="url(#g)"/>
  <rect width="1600" height="700" fill="url(#grid)"/>
  <rect width="1600" height="700" fill="url(#glow)"/>
  <rect width="1600" height="700" fill="url(#glow2)"/>

  <!-- Concentric arcs off the top-right corner: a shape with a direction to
       it, which a plain gradient does not have. -->
  <g stroke="${d}" fill="none" stroke-linecap="round">
    <circle cx="1250" cy="150" r="210" stroke-opacity="0.22" stroke-width="1.5"/>
    <circle cx="1250" cy="150" r="330" stroke-opacity="0.14" stroke-width="1.5"/>
    <circle cx="1250" cy="150" r="470" stroke-opacity="0.08" stroke-width="1.5"/>
  </g>

  <g fill="${c}">
    <circle cx="1250" cy="150" r="7" fill-opacity="0.85"/>
    <circle cx="1441" cy="64" r="4" fill-opacity="0.5"/>
    <circle cx="1063" cy="330" r="3.5" fill-opacity="0.45"/>
    <circle cx="1520" cy="392" r="3" fill-opacity="0.35"/>
  </g>

  <!-- A horizon line, so the frame has a floor at any crop. -->
  <path d="M0 566H1600" stroke="#ffffff" stroke-opacity="0.05" stroke-width="1"/>
</svg>
`;
}

/** Written out one by one rather than generated from a loop: four specific
    messages read as four messages, four permutations of a template read as
    test data. Every CTA points at a route that exists. */
const SEED: Array<{
  key: string;
  palette: Palette;
  motif: HeroMotif;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
}> = [
  {
    key: 'people',
    motif: 'nodes',
    palette: { ground: '#0b1020', far: '#1e2a5e', glow: '#6f8cff', accent: '#8aa2ff' },
    title: 'Find people by what they can do',
    subtitle: 'Search the directory by skill, role and availability — and see who is open to work right now.',
    ctaLabel: 'Browse people',
    ctaHref: '/people',
  },
  {
    key: 'companies',
    motif: 'stack',
    palette: { ground: '#08120f', far: '#123b39', glow: '#4fd6c0', accent: '#63e0cb' },
    title: 'The companies hiring on Docrud',
    subtitle: 'Company pages, open roles and the teams behind them, in one directory.',
    ctaLabel: 'Explore companies',
    ctaHref: '/businesses',
  },
  {
    key: 'jobs',
    motif: 'orbit',
    palette: { ground: '#140f08', far: '#4a3113', glow: '#f0c07a', accent: '#ffd39a' },
    title: 'Roles matched to your profile',
    subtitle: 'The more your profile says, the closer the match. Above 95% complete, you are indexed better.',
    ctaLabel: 'See open roles',
    ctaHref: '/jobs',
  },
  {
    key: 'gigs',
    motif: 'spark',
    palette: { ground: '#150a14', far: '#4a1740', glow: '#e888c8', accent: '#f4a3d8' },
    title: 'Post a gig, get bids on it',
    subtitle: 'Describe the work in a sentence. The people who do it come to you.',
    ctaLabel: 'Post a gig',
    ctaHref: '/gigs',
  },
];

(async () => {
  const raw = await readJsonFile<AdBanner[] | AdBannersData>(adBannersPath, []);
  const data: AdBannersData = Array.isArray(raw) ? { banners: raw } : (raw ?? { banners: [] });
  if (!Array.isArray(data.banners)) data.banners = [];

  const existing = new Set(data.banners.map((b) => b.id));
  await fs.mkdir(ART_DIR, { recursive: true });

  console.log(`Seeding hero banners — ${data.banners.length} already on this instance.\n`);

  const now = Date.now();
  let added = 0;
  let upgraded = 0;

  for (let i = 0; i < SEED.length; i += 1) {
    const seed = SEED[i];
    const id = `seed_hero_${seed.key}`;
    const file = `seed-hero-${seed.key}.svg`;

    /* The artwork first, and only if it is not already there: a file that has
       been replaced by hand should survive a re-run. */
    const artPath = path.join(ART_DIR, file);
    const haveArt = await fs.access(artPath).then(() => true).catch(() => false);
    if (!haveArt) await fs.writeFile(artPath, art(seed.palette), 'utf8');

    /* Already here. Not overwritten — but fields that did not exist when it
       was seeded ARE filled in, because an empty motif is a field nobody
       chose rather than a choice somebody made. Anything already set, whether
       by an earlier run or by hand in Super Admin, is left exactly as it is. */
    const already = data.banners.find((b) => b.id === id);
    if (already) {
      const filled: string[] = [];
      const fill = <K extends keyof AdBanner>(k: K, v: AdBanner[K]) => {
        if (already[k] === undefined || already[k] === '' || already[k] === null) {
          already[k] = v;
          filled.push(String(k));
        }
      };
      fill('motif', seed.motif);
      fill('backgroundColor', seed.palette.ground);
      fill('accentColor', seed.palette.accent);
      /* Not `imageUrlMobile`: empty is its correct value — it means "use the
         wide artwork" — so filling it in would report a change on every run
         and this script would never be idempotent again. */
      if (filled.length > 0) {
        upgraded += 1;
        console.log(`  ↑ ${seed.title} — filled in ${filled.join(', ')}`);
      } else {
        console.log(`  · ${seed.title} — already here, left alone`);
      }
      continue;
    }

    data.banners.push({
      id,
      imageUrl: `${ART_URL}/${file}`,
      /* No second upload: these four are vector, so the same file is sharp at
         any shape and the phone can have the wide one. A photograph would want
         its own crop — that is what the mobile slot in Super Admin is for. */
      imageUrlMobile: '',
      backgroundColor: seed.palette.ground,
      accentColor: seed.palette.accent,
      motif: seed.motif,
      title: seed.title,
      subtitle: seed.subtitle,
      ctaLabel: seed.ctaLabel,
      ctaHref: seed.ctaHref,
      active: true,
      /* After anything already there, so a real banner somebody configured
         keeps its place at the front of the slider. */
      order: data.banners.length,
      createdAt: new Date(now - (SEED.length - i) * 60_000).toISOString(),
    });
    added += 1;
    console.log(`  ✓ ${seed.title}  →  ${seed.ctaHref}   [${seed.motif}]`);
  }

  if (added === 0 && upgraded === 0) {
    console.log('\nNothing to do — all four are already here and complete.');
    return;
  }

  await writeJsonFile(adBannersPath, data);
  console.log(
    `\n${added} banner${added === 1 ? '' : 's'} added`
    + (upgraded > 0 ? `, ${upgraded} filled in` : '')
    + `. Total: ${data.banners.length}.`,
  );
  console.log('Artwork: public/uploads/ad-banners/seed-hero-*.svg');
  console.log('Edit or replace them in Super Admin → the ad banners section.');
})().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
