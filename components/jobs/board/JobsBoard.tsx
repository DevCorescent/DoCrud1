'use client';

/**
 * The jobs board.
 *
 * ═══ THE SHAPE ═══
 *
 * The same app shell as the homepage — DiscoverShell — with the panel's header
 * carrying a breadcrumb and the search field, then a heading that states the
 * real count, a scroller of India-first location buckets, a sticky row of
 * filter dropdowns, the results, and a right-hand rail.
 *
 * ═══ NOTHING IS INVENTED ═══
 *
 * Every field on a card is one the employer or the source ATS actually
 * published. In particular:
 *
 *   · There is NO salary on a card. `JobSummary` has no salary field, so a
 *     salary pill here would be a number this software made up about somebody
 *     else's job. The reference design has one; we do not have the data, so we
 *     do not draw it.
 *   · The skills row renders only when `preferredSkills` is non-empty, which
 *     for a scraped role it frequently is not.
 *   · Match % and the why-it-matches reasons appear only on roles the
 *     recommendation endpoint actually scored for this viewer.
 *   · The right rail's "companies hiring" counts are counted from the loaded
 *     roles, not estimated.
 *
 * ═══ SAME DATA AS BEFORE ═══
 *
 * The two endpoints, the filter semantics, the India buckets, the search, the
 * sort and the 24-per-page pagination are the ones components/JobsFeedPage.tsx
 * used. This changes the surface, not the pipeline.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Search, X, SlidersHorizontal, Check, MapPin, Building2, Globe,
  LayoutGrid, Clock, Briefcase, TrendingUp, ArrowUpRight, ChevronLeft,
  ChevronRight, Sparkles, Users, Plug,
} from 'lucide-react';
import DiscoverShell from '@/components/home/discover/DiscoverShell';
import { FilterSheet, Group, CheckRow } from '@/components/ui/board/FilterSheet';
import {
  EMPLOYMENT_TYPE_LABELS, WORK_MODE_LABELS, EXPERIENCE_LABELS,
  jobDetailHref, formatPosted, jobSourceLabel, isValidApplyUrl, companyHue,
} from '@/lib/jobs-ui';
import { getCompanyLogo } from '@/lib/company-logos';
import { companyJobsHref } from '@/lib/company-explorer';
import { matchesIndiaFilter, type IndiaBucket } from '@/lib/server/job-scraper/india';
import { getJobMatchLabel, getJobMatchTone } from '@/lib/job-match-tone';
import type { JobSummary } from '@/components/jobs/JobSummaryCard';
import './jobs-board.css';

const PAGE_SIZE = 24;
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'freelance'] as const;
const WORK_MODES = ['remote', 'hybrid', 'onsite'] as const;
const EXPERIENCE_LEVELS = ['entry', 'associate', 'mid', 'senior', 'lead'] as const;

type SortMode = 'recommended' | 'newest';

/* The applicant tracking systems `jobSourceLabel` knows by name. Anything else
   it returns is the employer's own domain, which is a career page rather than a
   platform — grouping those under one honest label is better than listing
   thirty company names as though each were a separate integration. */
const KNOWN_ATS = new Set(['Ashby', 'Lever', 'Greenhouse', 'Workable', 'SmartRecruiters']);
const OWN_SITE = 'Company career sites';

function platformOf(applyUrl?: string | null): string | null {
  const label = jobSourceLabel(applyUrl);
  if (!label) return null;
  return KNOWN_ATS.has(label) ? label : OWN_SITE;
}

const LOCATION_NAV: Array<{ id: IndiaBucket; label: string; Icon: typeof MapPin }> = [
  { id: '', label: 'All roles', Icon: LayoutGrid },
  { id: 'india', label: 'India', Icon: MapPin },
  { id: 'bengaluru', label: 'Bengaluru', Icon: Building2 },
  { id: 'hyderabad', label: 'Hyderabad', Icon: Building2 },
  { id: 'pune', label: 'Pune', Icon: Building2 },
  { id: 'mumbai', label: 'Mumbai', Icon: Building2 },
  { id: 'delhi-ncr', label: 'Delhi NCR', Icon: Building2 },
  { id: 'chennai', label: 'Chennai', Icon: Building2 },
  { id: 'remote-india', label: 'Remote India', Icon: Globe },
];

interface FilterState {
  sort: SortMode;
  search: string;
  employment: Set<string>;
  workMode: Set<string>;
  experience: Set<string>;
  india: IndiaBucket;
}

const DEFAULT_FILTERS: FilterState = {
  sort: 'recommended', search: '', employment: new Set(), workMode: new Set(),
  experience: new Set(), india: '',
};

/* ── A company mark ───────────────────────────────────────────────────────
   The employer's verified local logo, or a deterministic monogram. Never a
   third-party request while the list renders.

   The monogram is authored for a LIGHT surface here. JobSummaryCard's is
   `hsl(h 45% 16%)` on a dark card; reusing it on glass gave a black tile. */
function Mark({ company, cls }: { company: string; cls: string }) {
  const logo = getCompanyLogo(company);
  const [failed, setFailed] = useState(false);

  if (logo && !failed) {
    return (
      <span className={cls}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo.src} alt="" width={54} height={54} loading="lazy" decoding="async"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  const initials = company.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'C';
  const hue = companyHue(company);
  return (
    <span
      className={cls}
      style={{
        background: `hsl(${hue} 62% 96%)`,
        borderColor: `hsl(${hue} 44% 86%)`,
        color: `hsl(${hue} 42% 34%)`,
      }}
      role="img"
      aria-label={`${company} logo`}
    >
      <span className="jb-mark-txt">{initials}</span>
    </span>
  );
}

/* ── A card ───────────────────────────────────────────────────────────────── */
function JobCard({ job, rank }: { job: JobSummary; rank?: boolean }) {
  const company = job.organizationName || 'Company';
  const employment = job.employmentType ? EMPLOYMENT_TYPE_LABELS[job.employmentType] ?? job.employmentType : null;
  const mode = job.workMode ? WORK_MODE_LABELS[job.workMode] ?? job.workMode : null;
  const level = job.experienceLevel ? EXPERIENCE_LABELS[job.experienceLevel] ?? job.experienceLevel : null;
  const source = jobSourceLabel(job.applyUrl);
  const skills = (job.preferredSkills ?? []).filter(Boolean);
  const tags = (job.targetRoleKeywords ?? []).filter(Boolean).slice(0, 3);
  const canApply = isValidApplyUrl(job.applyUrl);
  const score = typeof job.matchScore === 'number' ? job.matchScore : null;
  const reasons = rank ? (job.matchReasons ?? []).filter(Boolean).slice(0, 2) : [];

  /* A grid cell, not a wide row: the mark leads, the title takes two lines at
     most so that every card in a row breaks at the same place, and the footer
     is pushed to the bottom so the actions line up across the row however
     little the employer published. */
  return (
    <Link href={jobDetailHref(job.id)} className="jb-card">
      <div className="jb-card-head">
        <Mark company={company} cls="jb-mark" />
        <div className="jb-card-id">
          <h3 className="jb-card-t">{job.title}</h3>
          <p className="jb-card-co">
            {company}
            {source && <span> · via {source}</span>}
          </p>
        </div>
        {rank && score !== null && (
          <span className="jb-match" style={matchTint(score)}>{score}%</span>
        )}
      </div>

      <div className="jb-meta">
        {employment && <span className="jb-m"><Briefcase size={12} />{employment}</span>}
        {mode && <span className="jb-m"><Globe size={12} />{mode}</span>}
        {level && <span className="jb-m"><TrendingUp size={12} />{level}</span>}
      </div>

      {/* Its own row, and clamped: a role listing six US states in one string
          would otherwise set the whole card's width. */}
      {job.location && (
        <p className="jb-loc">
          <MapPin size={12} />
          {/* The text needs its own box: a bare text node beside the icon is an
              anonymous flex item, and `text-overflow` does not apply to one. */}
          <span>{job.location}</span>
        </p>
      )}

      {/* Only when the employer stated skills. A scraped role often has none,
          and an empty row is worse than no row. */}
      {skills.length > 0 && (
        <div className="jb-skills">
          {skills.slice(0, 3).map((sk, i) => (
            <span key={sk}>{i > 0 && <i>· </i>}{sk}</span>
          ))}
          {skills.length > 3 && <i>+{skills.length - 3}</i>}
        </div>
      )}

      {tags.length > 0 && (
        <div className="jb-tags">
          {tags.slice(0, 2).map((t) => <span key={t} className="jb-tag">{t}</span>)}
        </div>
      )}

      {reasons.length > 0 && (
        <div className="jb-why">
          {reasons.map((r) => (
            <span key={r} className="jb-why-r"><Check size={11} strokeWidth={3} />{r}</span>
          ))}
        </div>
      )}

      <div className="jb-foot">
        {job.createdAt && <span className="jb-foot-m"><Clock size={12} />{formatPosted(job.createdAt)}</span>}
        {canApply && (
          <span
            className="jb-apply"
            role="button"
            tabIndex={0}
            /* The card is the link to the detail page, so the action that
               leaves for the employer's own site has to stop the event or it
               opens the wrong thing. */
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(job.applyUrl!, '_blank', 'noopener,noreferrer'); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault(); e.stopPropagation();
                window.open(job.applyUrl!, '_blank', 'noopener,noreferrer');
              }
            }}
          >
            Apply <ArrowUpRight size={12} />
          </span>
        )}
      </div>
    </Link>
  );
}

/* The badge's colour comes from the shared tone scale, so a 31% match is the
   same colour here as everywhere else in the product. */
function matchTint(score: number): React.CSSProperties {
  /* `ScoreTone` is a colour name, not a band name — 'green' | 'blue' |
     'yellow' | 'red'. The hue is derived from it so this badge can never drift
     out of agreement with the badge the ATS draws for the same score. */
  const hue = { green: 150, blue: 205, yellow: 42, red: 12 }[getJobMatchTone(score)];
  return {
    background: `hsl(${hue} 68% 95%)`,
    border: `1px solid hsl(${hue} 52% 86%)`,
    color: `hsl(${hue} 46% 30%)`,
  };
}

/* ── The page ─────────────────────────────────────────────────────────────── */

export interface JobsBoardProps {
  softwareName: string;
  guestMode?: boolean;
  viewer: { name: string | null; email: string | null } | null;
}

export default function JobsBoard({ softwareName, guestMode = false, viewer }: JobsBoardProps) {
  const [all, setAll] = useState<JobSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [recommended, setRecommended] = useState<JobSummary[]>([]);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [sheet, setSheet] = useState(false);
  const params = useSearchParams();

  /* view=list drops description/responsibilities/requirements — megabytes the
     cards never render. Every field used below survives that view. */
  useEffect(() => {
    let active = true;
    fetch('/api/public/hiring/jobs?view=list', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load-failed'))))
      .then((d) => { if (active) { setAll(Array.isArray(d) ? d : []); setState('ready'); } })
      .catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, []);

  /* Session-scoped. A signed-out viewer, or one with no profile, gets [] and
     the section simply does not appear. */
  useEffect(() => {
    let active = true;
    fetch('/api/recommendations/jobs', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('rec-failed'))))
      .then((d) => {
        if (!active) return;
        setRecommended((Array.isArray(d?.jobs) ? (d.jobs as JobSummary[]) : [])
          .filter((j) => typeof j.matchScore === 'number'));
      })
      .catch(() => { /* No matches shown is the correct rendering of a failure here. */ });
    return () => { active = false; };
  }, []);

  /* `?q=` comes from the navbar's "see all matching roles" row and `?loc=`
     from the homepage's city grid. Reading them here is what makes those links
     go somewhere real rather than to an unfiltered board. Applied once per
     value, not clamped every render, so the member can still clear the filter
     without it snapping back. */
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    const q = (params?.get('q') ?? '').trim();
    const loc = (params?.get('loc') ?? '').trim();
    /* `?employment=` is what the homepage's Internships tile links to. An
       internship is not a separate corpus in this product — it is an employment
       type on a job — so the tile lands here with the filter already applied
       rather than on an unfiltered board that promised internships. */
    const emp = (params?.get('employment') ?? '').trim();
    const key = `${q}|${loc}|${emp}`;
    if ((!q && !loc && !emp) || seeded.current === key) return;
    seeded.current = key;
    /* Only a bucket this board actually has — an unknown value would filter
       everything out and look like an empty board. */
    const bucket = LOCATION_NAV.some((b) => b.id === loc) ? (loc as IndiaBucket) : '';
    /* Same rule for the employment type: only one the board recognises. An
       unknown value would hide every posting and read as "no internships". */
    const employment = Object.prototype.hasOwnProperty.call(EMPLOYMENT_TYPE_LABELS, emp) ? emp : '';
    setFilters((prev) => ({
      ...prev,
      ...(q ? { search: q } : {}),
      ...(bucket ? { india: bucket } : {}),
      ...(employment ? { employment: new Set([employment]) } : {}),
    }));
  }, [params]);

  useEffect(() => { setPage(1); }, [filters]);

  const setFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggle = useCallback((key: 'employment' | 'workMode' | 'experience', v: string) => {
    setFilters((prev) => {
      const next = new Set(prev[key]);
      if (next.has(v)) next.delete(v); else next.add(v);
      return { ...prev, [key]: next };
    });
  }, []);

  const facets = useMemo(() => {
    const emp: Record<string, number> = {}, wm: Record<string, number> = {}, exp: Record<string, number> = {};
    for (const j of all) {
      if (j.employmentType) emp[j.employmentType] = (emp[j.employmentType] ?? 0) + 1;
      if (j.workMode) wm[j.workMode] = (wm[j.workMode] ?? 0) + 1;
      if (j.experienceLevel) exp[j.experienceLevel] = (exp[j.experienceLevel] ?? 0) + 1;
    }
    return { emp, wm, exp };
  }, [all]);

  /* Per-bucket counts for the category rail, so a chip that would return
     nothing says so before it is pressed. */
  const bucketCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const b of LOCATION_NAV) {
      out[b.id || 'all'] = b.id
        ? all.filter((j) => matchesIndiaFilter(j.location || '', j.workMode || undefined, b.id)).length
        : all.length;
    }
    return out;
  }, [all]);

  const activePills = useMemo(() => {
    const out: Array<{ key: string; label: string; remove: () => void }> = [];
    const drop = (k: 'employment' | 'workMode' | 'experience', v: string) => () =>
      setFilters((prev) => { const n = new Set(prev[k]); n.delete(v); return { ...prev, [k]: n }; });
    for (const v of Array.from(filters.employment)) {
      out.push({ key: `emp-${v}`, label: EMPLOYMENT_TYPE_LABELS[v] ?? v, remove: drop('employment', v) });
    }
    for (const v of Array.from(filters.workMode)) {
      out.push({ key: `wm-${v}`, label: WORK_MODE_LABELS[v] ?? v, remove: drop('workMode', v) });
    }
    for (const v of Array.from(filters.experience)) {
      out.push({ key: `exp-${v}`, label: EXPERIENCE_LABELS[v] ?? v, remove: drop('experience', v) });
    }
    if (filters.sort === 'newest') {
      out.push({ key: 'sort', label: 'Latest first', remove: () => setFilters((p) => ({ ...p, sort: 'recommended' })) });
    }
    if (filters.search.trim()) {
      out.push({
        key: 'kw',
        label: `“${filters.search.trim()}”`,
        remove: () => setFilters((p) => ({ ...p, search: '' })),
      });
    }
    return out;
  }, [filters]);

  /* Counted from the roles actually loaded, by the apply URL's host. Nothing
     here is a declared integration list — if a platform stops appearing in the
     data it stops appearing here. */
  const platforms = useMemo(() => {
    const by = new Map<string, number>();
    for (const j of all) {
      const pl = platformOf(j.applyUrl);
      if (pl) by.set(pl, (by.get(pl) ?? 0) + 1);
    }
    /* Career sites last however large: it is the catch-all, not a platform. */
    return Array.from(by.entries()).sort((a, b) => {
      if (a[0] === OWN_SITE) return 1;
      if (b[0] === OWN_SITE) return -1;
      return b[1] - a[1];
    });
  }, [all]);

  const activeFilterCount = useMemo(() =>
    filters.employment.size + filters.workMode.size + filters.experience.size
    + (filters.india ? 1 : 0) + (filters.sort !== 'recommended' ? 1 : 0)
    + (filters.search.trim() ? 1 : 0),
  [filters]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    let out = all.filter((j) => {
      if (filters.employment.size && !filters.employment.has(j.employmentType || '')) return false;
      if (filters.workMode.size && !filters.workMode.has(j.workMode || '')) return false;
      if (filters.experience.size && !filters.experience.has(j.experienceLevel || '')) return false;
      if (filters.india && !matchesIndiaFilter(j.location || '', j.workMode || undefined, filters.india)) return false;
      if (q) {
        const hay = `${j.title} ${j.organizationName || ''} ${j.location || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (filters.sort === 'newest') {
      const ts = (j: JobSummary) => Date.parse(j.createdAt || '') || 0;
      out = out.slice().sort((a, b) => ts(b) - ts(a));
    }
    return out;
  }, [all, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const companies = useMemo(
    () => new Set(all.map((j) => (j.organizationName || '').toLowerCase()).filter(Boolean)).size,
    [all],
  );
  const remoteCount = useMemo(() => all.filter((j) => j.workMode === 'remote').length, [all]);

  /* Counted, not estimated. */
  const topCompanies = useMemo(() => {
    const by = new Map<string, number>();
    for (const j of all) {
      const n = (j.organizationName || '').trim();
      if (n) by.set(n, (by.get(n) ?? 0) + 1);
    }
    return Array.from(by.entries()).sort((a, b) => b[1] - a[1]).slice(0, 7);
  }, [all]);

  const goPage = useCallback((n: number) => {
    setPage(n);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const loading = state === 'loading';
  const showRecommended = recommended.length > 0 && !filters.search.trim() && activeFilterCount === 0;

  const pages = useMemo(() => {
    const out: Array<number | 'gap'> = [];
    const push = (n: number) => { if (!out.includes(n)) out.push(n); };
    push(1);
    for (let n = page - 1; n <= page + 1; n += 1) if (n > 1 && n < totalPages) push(n);
    if (totalPages > 1) push(totalPages);
    const sorted = (out.filter((x) => typeof x === 'number') as number[]).sort((a, b) => a - b);
    const withGaps: Array<number | 'gap'> = [];
    sorted.forEach((n, i) => {
      if (i > 0 && n - sorted[i - 1] > 1) withGaps.push('gap');
      withGaps.push(n);
    });
    return withGaps;
  }, [page, totalPages]);

  return (
    <DiscoverShell
      softwareName={softwareName}
      guestMode={guestMode}
      viewer={viewer}
      bare
      /* The bar's search is the shell's now, and it searches everything. This
         board narrows itself through its own controls — the location chips and
         the Keyword field in the filter sheet — so it is always clear which
         list a query applies to. */
      searchPlaceholder="Search roles, people, companies…"
    >
      <div className="jb" ref={scrollRef}>
        {guestMode && (
          <div className="jb-pad" style={{ paddingTop: 18 }}>
            <div className="dh-guest" style={{ marginInline: 0 }}>
              <Sparkles size={15} />
              <span>
                You are browsing in incognito mode. <Link href="/login">Sign in</Link> to apply and to see roles matched to you.
              </span>
            </div>
          </div>
        )}

        {/* ══ Heading ══ */}
        {/* ══ One row ══
            The heading, the location buckets and the filter control on a
            single line. Stacked, these were an eyebrow, a 42px headline, a
            two-line paragraph, a facts line and a chip rail — a little over
            300px of chrome before the first role.

            Nothing informative was dropped to get here. The per-bucket counts
            were already on the chips; "remote" and the employment breakdown are
            in the sheet with their own counts; the company and platform totals
            are in the right rail, which states the provenance the paragraph
            used to claim; and every card names the system it came from. */}
        <div className="jb-bar">
          <h1 className="jb-title">
            {loading ? <span>Open roles</span> : (
              <>
                <b>{filtered.length.toLocaleString()}</b>
                <span>{filtered.length === 1 ? 'role' : 'roles'}</span>
              </>
            )}
          </h1>

          <div className="jb-cats" role="tablist" aria-label="Filter by location">
            {LOCATION_NAV.map((bkt) => {
              const on = filters.india === bkt.id;
              const n = bucketCounts[bkt.id || 'all'];
              return (
                <button
                  key={bkt.id || 'all'}
                  type="button"
                  className="jb-cat"
                  data-on={on ? '1' : '0'}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setFilter('india', bkt.id)}
                >
                  <bkt.Icon size={14} strokeWidth={1.9} />
                  <span className="jb-cat-l">{bkt.label}</span>
                  {!loading && typeof n === 'number' && <span className="jb-cat-n">{n.toLocaleString()}</span>}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="jb-fbtn"
            data-on={activeFilterCount ? '1' : '0'}
            onClick={() => setSheet(true)}
            aria-haspopup="dialog"
            aria-expanded={sheet}
          >
            <SlidersHorizontal size={14} />
            <span className="jb-fbtn-l">Filters</span>
            {activeFilterCount > 0 && <span className="jb-fbtn-n">{activeFilterCount}</span>}
          </button>
        </div>

        <div className="jb-body">
          <div className="jb-main">
            {/* A second line only when there is something on it to show. */}
            {activePills.length > 0 && (
              <div className="jb-active">
                {activePills.map((pill) => (
                  <button key={pill.key} type="button" className="jb-pill" onClick={pill.remove}>
                    {pill.label}
                    <X size={12} />
                  </button>
                ))}
                <button type="button" className="jb-clear" onClick={() => setFilters(DEFAULT_FILTERS)}>
                  Clear all
                </button>
              </div>
            )}

            {/* ══ Recommended ══ */}
            {showRecommended && (
              <>
                <div className="jb-sec">
                  <h2 className="jb-sec-t">Matched to your profile</h2>
                  <span className="jb-sec-n">{recommended.length}</span>
                  <span className="jb-sec-rule" aria-hidden />
                </div>
                <div className="jb-list">
                  {recommended.slice(0, 3).map((j) => <JobCard key={`r-${j.id}`} job={j} rank />)}
                </div>
              </>
            )}

            {/* ══ Results ══ */}
            {showRecommended && (
              <div className="jb-sec">
                <h2 className="jb-sec-t">All roles</h2>
                {!loading && <span className="jb-sec-n">{filtered.length.toLocaleString()}</span>}
                <span className="jb-sec-rule" aria-hidden />
              </div>
            )}

            {loading ? (
              <div className="jb-list">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="jb-skel" />)}
              </div>
            ) : state === 'error' ? (
              <div className="jb-empty">
                <div className="jb-empty-t">Roles could not be loaded</div>
                <div className="jb-empty-s">The request failed. Reload the page to try again.</div>
              </div>
            ) : paginated.length === 0 ? (
              <div className="jb-empty">
                <div className="jb-empty-t">No roles match those filters</div>
                <div className="jb-empty-s">Clear a filter or widen the location to see more.</div>
              </div>
            ) : (
              <>
                <div className="jb-list">
                  {paginated.map((j) => <JobCard key={j.id} job={j} />)}
                </div>

                {totalPages > 1 && (
                  <>
                    <div className="jb-pager">
                      <button
                        type="button" className="jb-pg" onClick={() => goPage(page - 1)}
                        disabled={page <= 1} aria-label="Previous page"
                      >
                        <ChevronLeft size={15} />
                      </button>
                      {pages.map((n, i) => (n === 'gap' ? (
                        <span key={`g${i}`} className="jb-pg-gap">…</span>
                      ) : (
                        <button
                          key={n} type="button" className="jb-pg" data-on={n === page ? '1' : '0'}
                          onClick={() => goPage(n)} aria-current={n === page ? 'page' : undefined}
                        >
                          {n}
                        </button>
                      )))}
                      <button
                        type="button" className="jb-pg" onClick={() => goPage(page + 1)}
                        disabled={page >= totalPages} aria-label="Next page"
                      >
                        <ChevronRight size={15} />
                      </button>
                    </div>
                    <div className="jb-count">
                      Showing {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–
                      {Math.min(page * PAGE_SIZE, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* ══ The right rail ══ */}
          <aside className="jb-rail" aria-label="More on Docrud">
            {/* First in the rail, and the only panel here that asks for something
                rather than describing something. Everything below it reports on
                the board; this is the one action an employer came for, so it
                gets the accent and the top of the column. */}
            <div className="jb-panel jb-panel-cta">
              <h2 className="jb-panel-t">Hiring on Docrud?</h2>
              <p className="jb-panel-s">Post a role and track applicants</p>

              <Link href="/jobs/post" className="jb-cta">
                <span className="jb-cta-mark" aria-hidden><Briefcase size={16} /></span>
                <span className="jb-cta-b">
                  <span className="jb-cta-t">Post a job</span>
                  <span className="jb-cta-s">Reach matched candidates</span>
                </span>
                <ArrowUpRight size={15} className="jb-cta-a" aria-hidden />
              </Link>

              <Link href="/jobs/my" className="jb-row jb-row-quiet">
                <span className="jb-row-mark" aria-hidden><Users size={16} /></span>
                <span className="jb-row-b">
                  <span className="jb-row-t">My jobs</span>
                  <span className="jb-row-s">Posted roles and applications</span>
                </span>
              </Link>
            </div>

            {/* Where the data comes from, counted rather than declared. */}
            {platforms.length > 0 && (
              <div className="jb-panel">
                <h2 className="jb-panel-t">Where these roles come from</h2>
                <p className="jb-panel-s">
                  Every role links back to the system it was published in
                </p>
                {platforms.map(([name, n]) => (
                  <div key={name} className="jb-src">
                    <span className="jb-src-mark" aria-hidden><Plug size={14} /></span>
                    <span className="jb-row-b">
                      <span className="jb-row-t">{name}</span>
                      <span className="jb-row-s">{n.toLocaleString()} role{n === 1 ? '' : 's'}</span>
                    </span>
                    {/* The share of the board, drawn rather than stated twice. */}
                    <span
                      className="jb-src-bar"
                      aria-hidden
                      style={{ ['--w' as string]: `${Math.max(3, Math.round((n / all.length) * 100))}%` }}
                    />
                  </div>
                ))}
                <p className="jb-src-note">
                  Docrud does not scrape partner job boards. These are company career
                  pages and the applicant tracking systems they publish through.
                </p>
              </div>
            )}

            {topCompanies.length > 0 && (
              <div className="jb-panel">
                <h2 className="jb-panel-t">Companies hiring</h2>
                <p className="jb-panel-s">Counted from the roles on this board</p>
                {topCompanies.map(([name, n]) => (
                  <Link key={name} href={companyJobsHref(name)} className="jb-row">
                    <Mark company={name} cls="jb-row-mark" />
                    <span className="jb-row-b">
                      <span className="jb-row-t">{name}</span>
                      <span className="jb-row-s">{n} open role{n === 1 ? '' : 's'}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}

            {recommended.length > 0 && (
              <div className="jb-panel">
                <h2 className="jb-panel-t">Matched to you</h2>
                <p className="jb-panel-s">Scored against your profile</p>
                {recommended.slice(0, 5).map((j) => (
                  <Link key={`s-${j.id}`} href={jobDetailHref(j.id)} className="jb-row">
                    <Mark company={j.organizationName || 'Company'} cls="jb-row-mark" />
                    <span className="jb-row-b">
                      <span className="jb-row-t">{j.title}</span>
                      <span className="jb-row-s">
                        {typeof j.matchScore === 'number' ? `${j.matchScore}% match · ` : ''}
                        {j.organizationName || ''}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}

          </aside>
        </div>
      </div>

      <FilterSheet
        open={sheet}
        onClose={() => setSheet(false)}
        count={activeFilterCount}
        footer={(
          <>
            <button
              type="button" className="bd-sheet-clear"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              disabled={activeFilterCount === 0}
            >
              Clear all
            </button>
            <button type="button" className="bd-sheet-go" onClick={() => setSheet(false)}>
              Show {filtered.length.toLocaleString()} role{filtered.length === 1 ? '' : 's'}
            </button>
          </>
        )}
      >
        <Group label="Keyword">
          <div className="jb-kw">
            <Search size={14} aria-hidden />
            <input
              ref={searchRef}
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
              placeholder="Title, company or location"
              aria-label="Filter these roles by keyword"
            />
            {filters.search && (
              <button type="button" onClick={() => setFilter('search', '')} aria-label="Clear keyword">
                <X size={13} />
              </button>
            )}
          </div>
        </Group>

        <Group label="Sort by">
          <CheckRow
            on={filters.sort === 'recommended'} label="Best match"
            onClick={() => setFilter('sort', 'recommended')}
          />
          <CheckRow
            on={filters.sort === 'newest'} label="Latest first"
            onClick={() => setFilter('sort', 'newest')}
          />
        </Group>

        <Group label="Employment type">
          {EMPLOYMENT_TYPES.map((v) => (
            <CheckRow
              key={v} on={filters.employment.has(v)} label={EMPLOYMENT_TYPE_LABELS[v] ?? v}
              n={facets.emp[v] ?? 0} onClick={() => toggle('employment', v)}
            />
          ))}
        </Group>

        <Group label="Remote / on-site">
          {WORK_MODES.map((v) => (
            <CheckRow
              key={v} on={filters.workMode.has(v)} label={WORK_MODE_LABELS[v] ?? v}
              n={facets.wm[v] ?? 0} onClick={() => toggle('workMode', v)}
            />
          ))}
        </Group>

        <Group label="Experience level">
          {EXPERIENCE_LEVELS.map((v) => (
            <CheckRow
              key={v} on={filters.experience.has(v)} label={EXPERIENCE_LABELS[v] ?? v}
              n={facets.exp[v] ?? 0} onClick={() => toggle('experience', v)}
            />
          ))}
        </Group>

        {/* The location buckets are chips on the page as well, because they are
            the product's first cut. They are repeated here so the sheet is the
            whole filter state rather than most of it. */}
        <Group label="Location">
          {LOCATION_NAV.map((bkt) => (
            <CheckRow
              key={bkt.id || 'all'} on={filters.india === bkt.id} label={bkt.label}
              n={bucketCounts[bkt.id || 'all']} onClick={() => setFilter('india', bkt.id)}
            />
          ))}
        </Group>
      </FilterSheet>
    </DiscoverShell>
  );
}
