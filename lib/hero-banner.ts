/**
 * The homepage hero's banners — the shape, and the only place it is decided.
 *
 * Four things read this file: the public route that serves the banners, the
 * Super Admin route that writes them, the slider that draws them, and the
 * command centre that edits them. One definition, so a field cannot mean one
 * thing on the way in and another on the way out.
 *
 * ═══ NOTHING IS SPREAD ═══
 *
 * `normalizeHeroBanner` rebuilds a record field by field. What arrives can be
 * an admin request body, or a row written by a build that had no motif, no
 * mobile image and no colours — and anything unrecognised has to land on a
 * default rather than reach a page. A spread would carry both an old field
 * nobody reads any more and whatever a request happened to include.
 *
 * ═══ IT MERGES ═══
 *
 * `prev` is the record as it stands. A key that is ABSENT from the incoming
 * object keeps its old value; a key that is PRESENT replaces it, validated.
 * That is what lets the older Ad Banner panel — which knows nothing about
 * motifs or mobile artwork — save a title without silently wiping them.
 */

/** The animated graphic beside the words. Drawn, not fetched. */
export type HeroMotif = 'none' | 'orbit' | 'nodes' | 'stack' | 'pulse' | 'spark';

export const HERO_MOTIFS: ReadonlyArray<{ id: HeroMotif; label: string; hint: string }> = [
  { id: 'none',  label: 'None',        hint: 'Artwork only — nothing drawn over it' },
  { id: 'orbit', label: 'Orbit',       hint: 'Rings with points travelling round them — search, discovery' },
  { id: 'nodes', label: 'Network',     hint: 'Points joined by lines, lighting in turn — people, connections' },
  { id: 'stack', label: 'Stack',       hint: 'Layered cards drifting apart — companies, pages, documents' },
  { id: 'pulse', label: 'Pulse',       hint: 'Rings going out from a centre — activity, hiring now' },
  { id: 'spark', label: 'Rise',        hint: 'Points rising and fading — gigs, bids, momentum' },
];

const MOTIF_IDS = new Set<string>(HERO_MOTIFS.map((m) => m.id));

export interface HeroBanner {
  id: string;
  /** The wide artwork. Optional: a banner can be a colour and a motif. */
  imageUrl: string;
  /** The tall artwork, for phones. Falls back to `imageUrl` when unset. */
  imageUrlMobile: string;
  /** Painted under the artwork, and on its own when there is none. */
  backgroundColor: string;
  /** What the motif is drawn in. */
  accentColor: string;
  motif: HeroMotif;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  active: boolean;
  order: number;
  createdAt: string;
}

/** What the two uploads should be, said once so the panel and the docs agree. */
export const HERO_IMAGE_SPEC = {
  desktop: { w: 2400, h: 1000, ratio: '12:5', note: 'Wide. It is cropped to the centre, and the left third sits under the headline.' },
  mobile:  { w: 1080, h: 1200, ratio: '9:10', note: 'Nearly square. A wide image on a phone crops to a thin strip of its middle.' },
} as const;

/** A same-origin path or an https URL. Nothing else — not `javascript:`, not
    a protocol-relative `//host` that leaves the site without looking like it. */
export function safeBannerHref(raw: unknown): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return '';
  if (v.startsWith('/') && !v.startsWith('//')) return v.slice(0, 512);
  if (/^https:\/\//i.test(v)) return v.slice(0, 512);
  return '';
}

/** An image address: the same rule, plus the `data:image/` URIs the seed
    script writes. Anything else is dropped rather than put in a `url()`. */
export function safeImageSrc(raw: unknown): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return '';
  if (v.startsWith('/') && !v.startsWith('//')) return v.slice(0, 4096);
  if (/^https:\/\//i.test(v)) return v.slice(0, 4096);
  if (/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);/i.test(v)) return v.slice(0, 2_000_000);
  return '';
}

/** A 3-, 6- or 8-digit hex colour, normalised to lower case with its hash.
    Only hex: a bare colour keyword or an `rgb()` would also be valid CSS, and
    so would `red; background-image: url(…)`. */
export function safeHexColor(raw: unknown, fallback = ''): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return fallback;
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? v.toLowerCase() : fallback;
}

function str(raw: unknown, max: number, fallback = ''): string {
  return typeof raw === 'string' ? raw.trim().slice(0, max) : fallback;
}

/** The default ground and accent: the page's own dark, and a light that reads
    on it. A banner with neither an image nor a colour is still a surface. */
export const HERO_DEFAULT_BG = '#0e1018';
export const HERO_DEFAULT_ACCENT = '#8aa2ff';

export function normalizeHeroBanner(raw: unknown, prev?: Partial<HeroBanner>): HeroBanner | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const b = raw as Record<string, unknown>;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);

  /* Present replaces, absent keeps. `pick` is that rule; every field below
     goes through it so no caller has to remember it. */
  const pick = <T,>(key: string, read: (v: unknown) => T, keep: T): T =>
    (has(key) ? read(b[key]) : keep);

  const id = str(b.id, 64) || str(prev?.id, 64);
  if (!id) return null;

  const motif = pick<HeroMotif>(
    'motif',
    (v) => (typeof v === 'string' && MOTIF_IDS.has(v) ? (v as HeroMotif) : 'none'),
    (prev?.motif ?? 'none'),
  );

  return {
    id,
    imageUrl:       pick('imageUrl',       safeImageSrc,                   prev?.imageUrl ?? ''),
    imageUrlMobile: pick('imageUrlMobile', safeImageSrc,                   prev?.imageUrlMobile ?? ''),
    backgroundColor: pick('backgroundColor', (v) => safeHexColor(v, ''),   prev?.backgroundColor ?? ''),
    accentColor:    pick('accentColor',    (v) => safeHexColor(v, HERO_DEFAULT_ACCENT), prev?.accentColor ?? HERO_DEFAULT_ACCENT),
    motif,
    title:          pick('title',          (v) => str(v, 120),             prev?.title ?? ''),
    subtitle:       pick('subtitle',       (v) => str(v, 240),             prev?.subtitle ?? ''),
    ctaLabel:       pick('ctaLabel',       (v) => str(v, 48),              prev?.ctaLabel ?? ''),
    ctaHref:        pick('ctaHref',        safeBannerHref,                 prev?.ctaHref ?? ''),
    active:         pick('active',         (v) => v !== false,             prev?.active ?? true),
    order:          pick('order',          (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0), prev?.order ?? 0),
    createdAt:      str(prev?.createdAt, 40) || str(b.createdAt, 40) || new Date().toISOString(),
  };
}

/** A banner with nothing to show is not a slide. One of the two — a picture or
    a colour — has to be there, or the hero renders an empty frame. */
export function heroBannerIsShowable(b: Pick<HeroBanner, 'imageUrl' | 'backgroundColor'>): boolean {
  return Boolean(b.imageUrl || b.backgroundColor);
}
