'use client';

/**
 * The projects board.
 *
 * ═══ THE SAME PAGE AS /jobs, NOT A LOOKALIKE ═══
 *
 * It imports `jobs-board.css` and uses its `jb-*` classes for everything that
 * is board CHROME — the sticky row, the category chips, the filter button, the
 * grid, the empty states, the right rail. Writing a fifth near-identical
 * stylesheet is how two pages that are supposed to match slowly stop matching:
 * one gets a tweak, the other does not, and nobody notices for a month. What
 * this file adds is only what a project card has and a job card does not — a
 * poster, a budget, a deadline — under `pj-*` in projects-board.css.
 *
 * ═══ THE SERVER DOES THE WORK ═══
 *
 * One request per query to /api/projects/discover, which already resolves
 * search, filters, sorting, facet counts and paging. This component holds the
 * query and renders the answer; it does not re-filter or re-sort anything
 * client-side, so the counts on the chips are the counts the server used.
 *
 * ═══ WHAT A CARD MAY SAY ═══
 *
 * Only fields the endpoint returns. A budget shows a figure ONLY when the
 * poster gave one — `negotiable` stores no number, so those cards say
 * "Negotiable" rather than a zero dressed up as a price. A deadline appears
 * only when there is one. The poster's name and avatar come from the
 * endpoint's public-identity projection, which carries no email or role.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight, ArrowUpRight, CalendarClock, Hammer, MapPin, Search, SlidersHorizontal, X,
} from 'lucide-react';
import DiscoverShell from '@/components/home/discover/DiscoverShell';
import { FilterSheet, Group, CheckRow } from '@/components/ui/board/FilterSheet';
import {
  PROJECT_CATEGORIES, BUDGET_TYPE_LABELS, PROJECT_TYPE_LABELS,
  WORK_MODE_LABELS, STATUS_LABELS,
} from '@/lib/projects-ui';
import { formatPosted } from '@/lib/jobs-ui';
import '@/components/jobs/board/jobs-board.css';
import './projects-board.css';

interface Poster { id: string; name: string; avatarUrl: string | null }
export interface ProjectRow {
  id: string;
  title: string;
  description: string;
  category: string;
  skills: string[];
  budgetType: string;
  budgetMin: number;
  budgetMax: number | null;
  currency: string;
  location: string | null;
  workMode: string | null;
  projectType: string;
  deadline: string | null;
  status: string;
  createdAt: string;
  poster: Poster;
}
type Facets = Record<'categories' | 'budgetType' | 'projectType' | 'workMode' | 'status' | 'skills', Record<string, number>>;

const EMPTY_FACETS: Facets = {
  categories: {}, budgetType: {}, projectType: {}, workMode: {}, status: {}, skills: {},
};

const PAGE_SIZE = 24;
const CATEGORY_KEYS = Object.keys(PROJECT_CATEGORIES);
const WORK_MODES = ['remote', 'onsite', 'hybrid'] as const;
const PROJECT_TYPES = ['one_time', 'ongoing', 'contract', 'collaboration'] as const;
const BUDGET_TYPES = ['fixed', 'hourly', 'negotiable'] as const;
const STATUSES = ['open', 'in_progress', 'closed'] as const;

const SORTS: Array<{ id: string; label: string }> = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'newest', label: 'Newest' },
  { id: 'deadline', label: 'Deadline' },
  { id: 'budget_desc', label: 'Budget: high to low' },
  { id: 'budget_asc', label: 'Budget: low to high' },
];

interface Query {
  q: string;
  categories: Set<string>;
  budgetType: Set<string>;
  projectType: Set<string>;
  workMode: Set<string>;
  status: Set<string>;
  sort: string;
}
const EMPTY_QUERY: Query = {
  q: '', categories: new Set(), budgetType: new Set(), projectType: new Set(),
  workMode: new Set(), status: new Set(), sort: 'recommended',
};

/** The money line. Never invents a figure for a budget that has none. */
function budgetLine(p: ProjectRow): string {
  if (p.budgetType === 'negotiable') return 'Negotiable';
  const money = (n: number) => `${p.currency === 'INR' ? '₹' : ''}${n.toLocaleString()}`;
  const per = p.budgetType === 'hourly' ? '/hr' : '';
  if (!p.budgetMin && !p.budgetMax) return BUDGET_TYPE_LABELS[p.budgetType] ?? p.budgetType;
  if (p.budgetMax && p.budgetMax !== p.budgetMin) return `${money(p.budgetMin)}–${money(p.budgetMax)}${per}`;
  return `${money(p.budgetMin)}${per}`;
}

export default function ProjectsBoard({
  softwareName = 'Docrud', guestMode = false, viewer = null,
}: {
  softwareName?: string;
  guestMode?: boolean;
  viewer?: { name: string | null; email: string | null } | null;
}) {
  const params = useSearchParams();
  const [query, setQuery] = useState<Query>(EMPTY_QUERY);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [facets, setFacets] = useState<Facets>(EMPTY_FACETS);
  const [total, setTotal] = useState(0);
  const [libraryTotal, setLibraryTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [sheet, setSheet] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  /* `?skill=` and `?category=` land here from the homepage. Applied once per
     value so the filter can still be cleared without snapping back — the same
     rule the jobs board's seeding follows. */
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    const cat = (params?.get('category') ?? '').trim();
    const q = (params?.get('q') ?? '').trim();
    const key = `${cat}|${q}`;
    if ((!cat && !q) || seeded.current === key) return;
    seeded.current = key;
    /* Only a category the API knows; an unknown one would empty the board and
       read as "no projects". */
    const known = CATEGORY_KEYS.includes(cat) ? cat : '';
    if (q) setSearch(q);
    setQuery((prev) => ({
      ...prev,
      ...(q ? { q } : {}),
      ...(known ? { categories: new Set([known]) } : {}),
    }));
  }, [params]);

  /* One debounce, on the text only. The chips apply immediately: a filter that
     waits 300ms after a click feels broken in a way a search box does not. */
  useEffect(() => {
    const id = window.setTimeout(() => setQuery((prev) => (prev.q === search ? prev : { ...prev, q: search })), 280);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => { setPage(1); }, [query]);

  useEffect(() => {
    let live = true;
    setState((s) => (s === 'ready' ? s : 'loading'));
    const sp = new URLSearchParams();
    if (query.q) sp.set('q', query.q);
    if (query.categories.size) sp.set('categories', Array.from(query.categories).join(','));
    if (query.budgetType.size) sp.set('budgetType', Array.from(query.budgetType).join(','));
    if (query.projectType.size) sp.set('projectType', Array.from(query.projectType).join(','));
    if (query.workMode.size) sp.set('workMode', Array.from(query.workMode).join(','));
    if (query.status.size) sp.set('status', Array.from(query.status).join(','));
    sp.set('sort', query.sort);
    sp.set('page', String(page));
    sp.set('limit', String(PAGE_SIZE));

    fetch(`/api/projects/discover?${sp.toString()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('discover-failed'))))
      .then((d) => {
        if (!live) return;
        setRows(Array.isArray(d.projects) ? d.projects : []);
        setFacets(d.facets ?? EMPTY_FACETS);
        setTotal(Number(d.total) || 0);
        setLibraryTotal(Number(d.libraryTotal) || 0);
        setState('ready');
      })
      .catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [query, page]);

  const toggle = useCallback((key: 'categories' | 'budgetType' | 'projectType' | 'workMode' | 'status', v: string) => {
    setQuery((prev) => {
      const next = new Set(prev[key]);
      if (next.has(v)) next.delete(v); else next.add(v);
      return { ...prev, [key]: next };
    });
  }, []);

  const applied = useMemo(() => {
    const out: Array<{ key: string; label: string; remove: () => void }> = [];
    if (query.q) out.push({ key: 'q', label: `“${query.q}”`, remove: () => { setSearch(''); setQuery((p) => ({ ...p, q: '' })); } });
    const push = (k: 'categories' | 'budgetType' | 'projectType' | 'workMode' | 'status', labels: Record<string, string>) => {
      /* `Array.from`, not a spread or a bare for-of: this project's TS target
         does not allow iterating a Set directly. */
      for (const v of Array.from(query[k])) {
        out.push({ key: `${k}-${v}`, label: labels[v] ?? v, remove: () => toggle(k, v) });
      }
    };
    push('categories', Object.fromEntries(CATEGORY_KEYS.map((k) => [k, PROJECT_CATEGORIES[k].label])));
    push('budgetType', BUDGET_TYPE_LABELS);
    push('projectType', PROJECT_TYPE_LABELS);
    push('workMode', WORK_MODE_LABELS);
    push('status', STATUS_LABELS);
    return out;
  }, [query, toggle]);

  const clearAll = () => { setSearch(''); setQuery(EMPTY_QUERY); };
  const sheetCount = applied.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <DiscoverShell
      softwareName={softwareName}
      guestMode={guestMode}
      viewer={viewer}
      searchPlaceholder="Search projects, skills, posters…"
    >
      {/* ── One sticky row: count, categories, filters, sort ── */}
      <div className="jb-bar">
        {/* `<b>` and `<span>`, which is what `.jb-title` styles — the jobs
            board's own markup, so the two headings are the same size and
            baseline rather than approximately the same. */}
        <h1 className="jb-title">
          <b>{state === 'ready' ? total.toLocaleString() : '—'}</b>
          <span>{total === 1 ? 'project' : 'projects'}</span>
        </h1>

        <div className="jb-cats" role="group" aria-label="Category">
          <button
            type="button" className="jb-cat" data-on={query.categories.size === 0 ? '1' : '0'}
            onClick={() => setQuery((p) => ({ ...p, categories: new Set() }))}
          >
            <span className="jb-cat-l">All projects</span>
            {state === 'ready' && <span className="jb-cat-n">{libraryTotal}</span>}
          </button>
          {CATEGORY_KEYS.map((k) => {
            const n = facets.categories[k] ?? 0;
            if (!n && !query.categories.has(k)) return null;
            return (
              <button
                key={k} type="button" className="jb-cat"
                data-on={query.categories.has(k) ? '1' : '0'}
                onClick={() => toggle('categories', k)}
              >
                <span className="jb-cat-l">{PROJECT_CATEGORIES[k].label}</span>
                <span className="jb-cat-n">{n}</span>
              </button>
            );
          })}
        </div>

        <div className="pj-bar-end">
          <label className="pj-find">
            <Search size={14} aria-hidden />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects"
              aria-label="Search projects"
            />
            {search && (
              <button type="button" onClick={() => { setSearch(''); searchRef.current?.focus(); }} aria-label="Clear search">
                <X size={13} aria-hidden />
              </button>
            )}
          </label>

          <label className="pj-sort">
            <span className="pj-sort-l">Sort</span>
            <select
              value={query.sort}
              onChange={(e) => setQuery((p) => ({ ...p, sort: e.target.value }))}
              aria-label="Sort projects"
            >
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>

          <button type="button" className="jb-fbtn" onClick={() => setSheet(true)} aria-haspopup="dialog">
            <SlidersHorizontal size={14} aria-hidden />
            Filters
            {sheetCount > 0 && <span className="jb-fbtn-n">{sheetCount}</span>}
          </button>
        </div>
      </div>

      {applied.length > 0 && (
        <div className="jb-active">
          {applied.map((a) => (
            <button key={a.key} type="button" className="jb-pill" onClick={a.remove}>
              {a.label}
              <X size={11} aria-hidden />
            </button>
          ))}
          <button type="button" className="jb-clear" onClick={clearAll}>Clear all</button>
        </div>
      )}

      <div className="jb-body">
        <div className="jb-main">
          {state === 'loading' && (
            <div className="jb-list">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="jb-card pj-skel" aria-hidden>
                  <div className="pj-sk pj-sk-t" />
                  <div className="pj-sk pj-sk-s" />
                  <div className="pj-sk pj-sk-r" />
                </div>
              ))}
            </div>
          )}

          {state === 'error' && (
            <div className="jb-empty">
              <div className="jb-empty-t">Projects could not be loaded</div>
              <div className="jb-empty-s">The request failed. Reload the page to try again.</div>
            </div>
          )}

          {state === 'ready' && rows.length === 0 && (
            <div className="jb-empty">
              {/* The endpoint distinguishes these two, so the page should. */}
              <div className="jb-empty-t">
                {libraryTotal === 0 ? 'No projects posted yet' : 'No projects match those filters'}
              </div>
              <div className="jb-empty-s">
                {libraryTotal === 0
                  ? 'Post the first one and it will appear here.'
                  : 'Clear a filter or widen the search to see more.'}
              </div>
              {libraryTotal === 0
                ? <Link href="/projects/create" className="pj-link">Post a project <ArrowRight size={13} /></Link>
                : <button type="button" className="pj-link" onClick={clearAll}>Clear all filters</button>}
            </div>
          )}

          {state === 'ready' && rows.length > 0 && (
            <>
              <div className="jb-list">
                {rows.map((p) => (
                  <Link key={p.id} href={`/projects/${p.id}`} className="jb-card pj-card">
                    <div className="jb-card-head">
                      <span className="pj-mark" aria-hidden>
                        {p.poster.avatarUrl
                          /* eslint-disable-next-line @next/next/no-img-element */
                          ? <img src={p.poster.avatarUrl} alt="" loading="lazy" decoding="async" />
                          : <Hammer size={15} />}
                      </span>
                      <span className="jb-card-id">
                        <span className="jb-card-t">{p.title}</span>
                        <span className="jb-card-co">{p.poster.name}</span>
                      </span>
                      {p.status !== 'open' && (
                        <span className="pj-status" data-s={p.status}>{STATUS_LABELS[p.status] ?? p.status}</span>
                      )}
                    </div>

                    {p.description && <p className="pj-desc">{p.description}</p>}

                    <div className="jb-meta">
                      <span className="pj-budget">{budgetLine(p)}</span>
                      {p.workMode && <span className="jb-m">{WORK_MODE_LABELS[p.workMode] ?? p.workMode}</span>}
                      <span className="jb-m">{PROJECT_TYPE_LABELS[p.projectType] ?? p.projectType}</span>
                    </div>

                    {(p.location || p.deadline) && (
                      <div className="pj-sub">
                        {p.location && (
                          <span className="jb-loc"><MapPin size={12} aria-hidden />{p.location}</span>
                        )}
                        {p.deadline && (
                          <span className="jb-loc"><CalendarClock size={12} aria-hidden />
                            {new Date(p.deadline).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                    )}

                    {p.skills.length > 0 && (
                      <div className="jb-tags">
                        {p.skills.slice(0, 4).map((s) => <span key={s} className="jb-tag">{s}</span>)}
                        {p.skills.length > 4 && <span className="jb-tag">+{p.skills.length - 4}</span>}
                      </div>
                    )}

                    <div className="jb-foot">
                      <span className="jb-foot-m">{formatPosted(p.createdAt)}</span>
                      <span className="pj-go">View project <ArrowRight size={13} aria-hidden /></span>
                    </div>
                  </Link>
                ))}
              </div>

              {pages > 1 && (
                <div className="pj-pages">
                  <button
                    type="button" className="jb-fbtn" disabled={page <= 1}
                    onClick={() => setPage((n) => Math.max(1, n - 1))}
                  >
                    Previous
                  </button>
                  <span className="pj-pages-n">Page {page} of {pages}</span>
                  <button
                    type="button" className="jb-fbtn" disabled={page >= pages}
                    onClick={() => setPage((n) => Math.min(pages, n + 1))}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <aside className="jb-rail" aria-label="More on Docrud">
          {/* The jobs board's own rail block, down to `.jb-cta` — the panel
              the user asked to be highlighted on /jobs is the same panel
              here. */}
          <div className="jb-panel jb-panel-cta">
            <h2 className="jb-panel-t">Work to hand out?</h2>
            <p className="jb-panel-s">Post a brief and get it matched</p>

            <Link href="/projects/create" className="jb-cta">
              <span className="jb-cta-mark" aria-hidden><Hammer size={16} /></span>
              <span className="jb-cta-b">
                <span className="jb-cta-t">Post a project</span>
                <span className="jb-cta-s">Fixed or hourly, one-off or ongoing</span>
              </span>
              <ArrowUpRight size={15} className="jb-cta-a" aria-hidden />
            </Link>
          </div>

          <div className="jb-panel">
            <h2 className="jb-panel-t">Looking for a role instead?</h2>
            <p className="jb-panel-s">Open roles, internships and the companies hiring right now</p>
            <Link href="/jobs" className="pj-link">
              Browse open roles <ArrowRight size={13} aria-hidden />
            </Link>
          </div>
        </aside>
      </div>

      <FilterSheet
        open={sheet}
        onClose={() => setSheet(false)}
        count={sheetCount}
        footer={
          <>
            <button type="button" className="bd-quiet" onClick={clearAll}>Clear all</button>
            <button type="button" className="bd-go" onClick={() => setSheet(false)}>
              Show {total.toLocaleString()} {total === 1 ? 'project' : 'projects'}
            </button>
          </>
        }
      >
        <Group label="Status">
          {STATUSES.map((v) => (
            <CheckRow
              key={v} on={query.status.has(v)} label={STATUS_LABELS[v] ?? v}
              n={facets.status[v]} onClick={() => toggle('status', v)}
            />
          ))}
        </Group>
        <Group label="Budget">
          {BUDGET_TYPES.map((v) => (
            <CheckRow
              key={v} on={query.budgetType.has(v)} label={BUDGET_TYPE_LABELS[v] ?? v}
              n={facets.budgetType[v]} onClick={() => toggle('budgetType', v)}
            />
          ))}
        </Group>
        <Group label="Project type">
          {PROJECT_TYPES.map((v) => (
            <CheckRow
              key={v} on={query.projectType.has(v)} label={PROJECT_TYPE_LABELS[v] ?? v}
              n={facets.projectType[v]} onClick={() => toggle('projectType', v)}
            />
          ))}
        </Group>
        <Group label="Remote or on-site">
          {WORK_MODES.map((v) => (
            <CheckRow
              key={v} on={query.workMode.has(v)} label={WORK_MODE_LABELS[v] ?? v}
              n={facets.workMode[v]} onClick={() => toggle('workMode', v)}
            />
          ))}
        </Group>
      </FilterSheet>
    </DiscoverShell>
  );
}
