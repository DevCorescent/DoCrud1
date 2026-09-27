'use client';

/**
 * Companies.
 *
 * ═══ TWO SOURCES, ONE GRID ═══
 *
 * "Company" means two different things in this product and the page has to be
 * straight about which one a card is:
 *
 *   · A BUSINESS PAGE — created by a member, with an industry, a size, a
 *     location and a verification flag. `/api/business-pages`.
 *   · An EMPLOYER on the job board — a name and a logo derived from the roles
 *     we hold, with nothing published about it. `/api/company-explorer`.
 *
 * They are merged on the lowercased name, and a card shows only what its own
 * source actually gave: a page's card carries its industry and its badge and
 * links to the page; an employer's card carries its open-role count and links
 * to those roles. An employer never borrows a page's fields, and a company with
 * no page is never drawn as though it had one.
 *
 * ═══ NOTHING IS INVENTED ═══
 *
 * No rating, no headcount estimate, no founded year unless the page published
 * one, no description unless there is a tagline. Follower and post counts
 * render only when non-zero. The industry chips are counted from the pages that
 * exist, so an industry nobody has published is never offered as a filter.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  SlidersHorizontal, X, Search, MapPin, Sparkles, ArrowUpRight, LayoutGrid,
  Briefcase, BadgeCheck, Users, FileText, Building2, Plus, ChevronRight,
} from 'lucide-react';
import DiscoverShell from '@/components/home/discover/DiscoverShell';
import { FilterSheet, Group, CheckRow } from '@/components/ui/board/FilterSheet';
import { companyJobsHref } from '@/lib/company-explorer';
import './companies-board.css';

interface BizPage {
  id: string; slug: string; name: string; tagline?: string; industry?: string;
  companySize?: string; city?: string; country?: string; logoUrl?: string;
  followerCount?: number; postCount?: number; jobCount?: number;
  verified?: boolean; createdAt?: string; foundedYear?: number;
}
interface Employer { id: string; name: string; logoUrl?: string; jobCount?: number }

/** One row in the grid. `page` is present only when a member made one. */
interface Company {
  key: string;
  name: string;
  logoUrl?: string;
  openRoles: number;
  /** The employer id on the job board, when the name appears there. */
  employerId?: string;
  page?: BizPage;
}

const PAGE = 24;
type SortMode = 'roles' | 'name' | 'followed' | 'newest';

const titleCase = (s: string) =>
  s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function hueOf(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
const initials = (n: string) =>
  n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'C';

/* ── A card ─────────────────────────────────────────────────────────────── */
function CompanyCard({ c }: { c: Company }) {
  const [failed, setFailed] = useState(false);
  const hue = hueOf(c.key);
  const logo = c.logoUrl && !failed ? c.logoUrl : null;
  const p = c.page;
  const place = [p?.city, p?.country].filter(Boolean).join(', ');
  /* A page links to itself; an employer we only know from the board links to
     the roles that told us it exists. Never the other way round. */
  const href = p ? `/businesses/${p.slug}` : companyJobsHref(c.employerId ?? c.key);

  return (
    <Link href={href} className="cp-card">
      <span className="cp-head">
        <span
          className="cp-logo"
          style={logo ? undefined : {
            background: `hsl(${hue} 62% 96%)`,
            borderColor: `hsl(${hue} 42% 87%)`,
            color: `hsl(${hue} 42% 34%)`,
          }}
        >
          {logo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logo} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
          ) : initials(c.name)}
        </span>

        <span className="cp-id">
          <span className="cp-n">
            {c.name}
            {p?.verified && <BadgeCheck size={14} className="cp-vf" aria-label="Verified" />}
          </span>
          {/* Only what the page published. There is no stand-in tagline. */}
          {p?.tagline && <span className="cp-tag">{p.tagline}</span>}
        </span>
      </span>

      <span className="cp-tags">
        {p?.industry && <span className="cp-chip">{titleCase(p.industry)}</span>}
        {p?.companySize && <span className="cp-chip">{titleCase(p.companySize)}</span>}
        {p?.foundedYear && <span className="cp-chip">Est. {p.foundedYear}</span>}
        {place && <span className="cp-loc"><MapPin size={11} />{place}</span>}
        {/* Says which of the two kinds of company this is, so a card is never
            mistaken for something it is not. */}
        {!p && <span className="cp-src">Known from the job board</span>}
      </span>

      <span className="cp-foot">
        {c.openRoles > 0 && (
          <span className="cp-m"><Briefcase size={11} />{c.openRoles.toLocaleString()} open {c.openRoles === 1 ? 'role' : 'roles'}</span>
        )}
        {!!p?.followerCount && <span className="cp-m"><Users size={11} />{p.followerCount.toLocaleString()}</span>}
        {!!p?.postCount && <span className="cp-m"><FileText size={11} />{p.postCount.toLocaleString()}</span>}
        <span className="cp-view">{p ? 'View page' : 'See roles'} <ArrowUpRight size={12} /></span>
      </span>
    </Link>
  );
}

/* ── The page ───────────────────────────────────────────────────────────── */
export interface CompaniesBoardProps {
  softwareName: string;
  guestMode?: boolean;
  viewer: { name: string | null; email: string | null } | null;
}

export default function CompaniesBoard({ softwareName, guestMode = false, viewer }: CompaniesBoardProps) {
  const [pages, setPages] = useState<BizPage[]>([]);
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [sheet, setSheet] = useState(false);
  const [industry, setIndustry] = useState('');
  const [hiringOnly, setHiringOnly] = useState(false);
  const [pagedOnly, setPagedOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sort, setSort] = useState<SortMode>('roles');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let live = true;
    setState('loading');
    Promise.allSettled([
      fetch('/api/business-pages?limit=200&offset=0', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch('/api/company-explorer', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject())),
    ]).then(([bp, ce]) => {
      if (!live) return;
      const ps = bp.status === 'fulfilled' && Array.isArray(bp.value?.pages) ? (bp.value.pages as BizPage[]) : [];
      const es = ce.status === 'fulfilled' && Array.isArray(ce.value?.companies) ? (ce.value.companies as Employer[]) : [];
      setPages(ps);
      setEmployers(es);
      /* Only a total failure of both is an error. One source being empty is a
         normal state — there may be no business pages yet. */
      setState(bp.status === 'rejected' && ce.status === 'rejected' ? 'error' : 'ready');
    });
    return () => { live = false; };
  }, []);

  useEffect(() => { setPage(1); }, [industry, hiringOnly, pagedOnly, verifiedOnly, sort, q]);

  /* Merged on the lowercased name — the only key the two sources share. */
  const companies = useMemo<Company[]>(() => {
    const by = new Map<string, Company>();
    for (const e of employers) {
      const key = (e.name || '').trim().toLowerCase();
      if (!key) continue;
      by.set(key, {
        key, name: e.name, logoUrl: e.logoUrl,
        openRoles: e.jobCount ?? 0, employerId: e.id,
      });
    }
    for (const p of pages) {
      const key = (p.name || '').trim().toLowerCase();
      if (!key) continue;
      const prev = by.get(key);
      by.set(key, {
        key,
        name: p.name,
        /* The page's own logo wins — a member uploaded it deliberately. */
        logoUrl: p.logoUrl || prev?.logoUrl,
        openRoles: Math.max(p.jobCount ?? 0, prev?.openRoles ?? 0),
        employerId: prev?.employerId,
        page: p,
      });
    }
    return Array.from(by.values());
  }, [pages, employers]);

  const industries = useMemo(() => {
    const by = new Map<string, number>();
    for (const c of companies) {
      const i = (c.page?.industry || '').trim();
      if (i) by.set(i, (by.get(i) ?? 0) + 1);
    }
    return Array.from(by.entries()).sort((a, b) => b[1] - a[1]);
  }, [companies]);

  const hiringCount = useMemo(() => companies.filter((c) => c.openRoles > 0).length, [companies]);
  const pagedCount = useMemo(() => companies.filter((c) => c.page).length, [companies]);
  const verifiedCount = useMemo(() => companies.filter((c) => c.page?.verified).length, [companies]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = companies.filter((c) => {
      if (industry && c.page?.industry !== industry) return false;
      if (hiringOnly && c.openRoles <= 0) return false;
      if (pagedOnly && !c.page) return false;
      if (verifiedOnly && !c.page?.verified) return false;
      if (needle) {
        const hay = `${c.name} ${c.page?.tagline ?? ''} ${c.page?.industry ?? ''} ${c.page?.city ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    if (sort === 'name') out = out.slice().sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'followed') out = out.slice().sort((a, b) => (b.page?.followerCount ?? 0) - (a.page?.followerCount ?? 0));
    else if (sort === 'newest') out = out.slice().sort((a, b) => (Date.parse(b.page?.createdAt || '') || 0) - (Date.parse(a.page?.createdAt || '') || 0));
    else out = out.slice().sort((a, b) => b.openRoles - a.openRoles || a.name.localeCompare(b.name));
    return out;
  }, [companies, industry, hiringOnly, pagedOnly, verifiedOnly, sort, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const paged = useMemo(() => filtered.slice((page - 1) * PAGE, page * PAGE), [filtered, page]);

  const activeCount =
    (industry ? 1 : 0) + (hiringOnly ? 1 : 0) + (pagedOnly ? 1 : 0)
    + (verifiedOnly ? 1 : 0) + (sort !== 'roles' ? 1 : 0) + (q.trim() ? 1 : 0);

  const pills = useMemo(() => {
    const out: Array<{ key: string; label: string; clear: () => void }> = [];
    if (industry) out.push({ key: 'in', label: titleCase(industry), clear: () => setIndustry('') });
    if (hiringOnly) out.push({ key: 'hi', label: 'Hiring now', clear: () => setHiringOnly(false) });
    if (pagedOnly) out.push({ key: 'pg', label: 'Has a page', clear: () => setPagedOnly(false) });
    if (verifiedOnly) out.push({ key: 'vf', label: 'Verified', clear: () => setVerifiedOnly(false) });
    if (sort !== 'roles') {
      const l = sort === 'name' ? 'A–Z' : sort === 'followed' ? 'Most followed' : 'Newest';
      out.push({ key: 'so', label: l, clear: () => setSort('roles') });
    }
    if (q.trim()) out.push({ key: 'q', label: `“${q.trim()}”`, clear: () => setQ('') });
    return out;
  }, [industry, hiringOnly, pagedOnly, verifiedOnly, sort, q]);

  const clearAll = () => {
    setIndustry(''); setHiringOnly(false); setPagedOnly(false);
    setVerifiedOnly(false); setSort('roles'); setQ('');
  };

  const topHiring = useMemo(
    () => companies.filter((c) => c.openRoles > 0).sort((a, b) => b.openRoles - a.openRoles).slice(0, 6),
    [companies],
  );

  const loading = state === 'loading';
  const goPage = useCallback((n: number) => {
    setPage(n);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const pageNums = useMemo(() => {
    const out: number[] = [];
    const push = (n: number) => { if (n >= 1 && n <= totalPages && !out.includes(n)) out.push(n); };
    push(1);
    for (let n = page - 1; n <= page + 1; n += 1) push(n);
    push(totalPages);
    out.sort((a, b) => a - b);
    const withGaps: Array<number | 'gap'> = [];
    out.forEach((n, i) => { if (i > 0 && n - out[i - 1] > 1) withGaps.push('gap'); withGaps.push(n); });
    return withGaps;
  }, [page, totalPages]);

  return (
    <DiscoverShell softwareName={softwareName} guestMode={guestMode} viewer={viewer} bare>
      <div className="cp" ref={scrollRef}>
        {guestMode && (
          <div className="cp-pad" style={{ paddingTop: 18 }}>
            <div className="dh-guest" style={{ marginInline: 0 }}>
              <Sparkles size={15} />
              <span>
                You are browsing in incognito mode. <Link href="/login">Sign in</Link> to follow companies and create a page.
              </span>
            </div>
          </div>
        )}

        <div className="cp-bar">
          <h1 className="cp-title">
            {loading ? <span>Companies</span> : (
              <>
                <b>{filtered.length.toLocaleString()}</b>
                <span>{filtered.length === 1 ? 'company' : 'companies'}</span>
              </>
            )}
          </h1>

          <div className="cp-cats" role="tablist" aria-label="Filter companies">
            <button
              type="button" className="cp-cat" role="tab"
              data-on={!industry && !hiringOnly ? '1' : '0'}
              aria-selected={!industry && !hiringOnly}
              onClick={() => { setIndustry(''); setHiringOnly(false); }}
            >
              <LayoutGrid size={14} strokeWidth={1.9} />
              <span className="cp-cat-l">All companies</span>
              {!loading && <span className="cp-cat-n">{companies.length.toLocaleString()}</span>}
            </button>

            <button
              type="button" className="cp-cat" role="tab"
              data-on={hiringOnly ? '1' : '0'} aria-selected={hiringOnly}
              onClick={() => setHiringOnly((v) => !v)}
            >
              <Briefcase size={14} strokeWidth={1.9} />
              <span className="cp-cat-l">Hiring now</span>
              {!loading && <span className="cp-cat-n">{hiringCount.toLocaleString()}</span>}
            </button>

            {industries.map(([i, n]) => {
              const on = industry === i;
              return (
                <button
                  key={i} type="button" className="cp-cat" role="tab"
                  data-on={on ? '1' : '0'} aria-selected={on}
                  onClick={() => setIndustry(on ? '' : i)}
                >
                  <span className="cp-cat-l">{titleCase(i)}</span>
                  <span className="cp-cat-n">{n.toLocaleString()}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button" className="cp-fbtn" data-on={activeCount ? '1' : '0'}
            onClick={() => setSheet(true)} aria-haspopup="dialog" aria-expanded={sheet}
          >
            <SlidersHorizontal size={14} />
            <span className="cp-fbtn-l">Filters</span>
            {activeCount > 0 && <span className="cp-fbtn-n">{activeCount}</span>}
          </button>
        </div>

        <div className="cp-body">
          <div className="cp-main">
            {pills.length > 0 && (
              <div className="cp-active">
                {pills.map((p) => (
                  <button key={p.key} type="button" className="cp-pill" onClick={p.clear}>
                    {p.label}<X size={12} />
                  </button>
                ))}
                <button type="button" className="cp-clear" onClick={clearAll}>Clear all</button>
              </div>
            )}

            {loading ? (
              <div className="cp-grid">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="cp-skel" />)}
              </div>
            ) : state === 'error' ? (
              <div className="cp-empty">
                <div className="cp-empty-t">Companies could not be loaded</div>
                <div className="cp-empty-s">Both requests failed. Reload the page to try again.</div>
              </div>
            ) : paged.length === 0 ? (
              <div className="cp-empty">
                <div className="cp-empty-t">
                  {companies.length === 0 ? 'No companies yet' : 'No companies match those filters'}
                </div>
                <div className="cp-empty-s">
                  {companies.length === 0
                    ? 'Companies appear here when they publish a page, or when roles of theirs reach the job board.'
                    : 'Clear a filter or widen the industry to see more.'}
                </div>
                {companies.length === 0 && (
                  <Link href="/businesses/create" className="cp-empty-cta">
                    <Plus size={14} /> Create a company page
                  </Link>
                )}
              </div>
            ) : (
              <>
                <div className="cp-grid">
                  {paged.map((c) => <CompanyCard key={c.key} c={c} />)}
                </div>

                {totalPages > 1 && (
                  <>
                    <div className="cp-pager">
                      <button
                        type="button" className="cp-pg" onClick={() => goPage(page - 1)}
                        disabled={page <= 1} aria-label="Previous page"
                      ><ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} /></button>
                      {pageNums.map((n, i) => (n === 'gap' ? (
                        <span key={`g${i}`} className="cp-pg-gap">…</span>
                      ) : (
                        <button
                          key={n} type="button" className="cp-pg" data-on={n === page ? '1' : '0'}
                          onClick={() => goPage(n)} aria-current={n === page ? 'page' : undefined}
                        >{n}</button>
                      )))}
                      <button
                        type="button" className="cp-pg" onClick={() => goPage(page + 1)}
                        disabled={page >= totalPages} aria-label="Next page"
                      ><ChevronRight size={15} /></button>
                    </div>
                    <div className="cp-count">
                      Showing {((page - 1) * PAGE + 1).toLocaleString()}–
                      {Math.min(page * PAGE, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <aside className="cp-rail" aria-label="More on Docrud">
            <div className="cp-panel cp-panel-cta">
              <h2 className="cp-panel-t">Run a company?</h2>
              <p className="cp-panel-s">A page is how people find and follow you</p>
              <Link href="/businesses/create" className="cp-cta">
                <span className="cp-cta-mark" aria-hidden><Building2 size={16} /></span>
                <span className="cp-cta-b">
                  <span className="cp-cta-t">Create a company page</span>
                  <span className="cp-cta-s">Industry, location and open roles</span>
                </span>
                <ArrowUpRight size={15} className="cp-cta-a" aria-hidden />
              </Link>
              <Link href="/jobs/post" className="cp-row cp-row-quiet">
                <span className="cp-row-mark" aria-hidden><Briefcase size={16} /></span>
                <span className="cp-row-b">
                  <span className="cp-row-t">Post a role</span>
                  <span className="cp-row-s">Reach matched candidates</span>
                </span>
              </Link>
            </div>

            {topHiring.length > 0 && (
              <div className="cp-panel">
                <h2 className="cp-panel-t">Hiring the most</h2>
                <p className="cp-panel-s">Counted from roles on the job board</p>
                {topHiring.map((c) => (
                  <Link
                    key={c.key}
                    href={c.page ? `/businesses/${c.page.slug}` : companyJobsHref(c.employerId ?? c.key)}
                    className="cp-row"
                  >
                    <span className="cp-row-b">
                      <span className="cp-row-t">{c.name}</span>
                      <span className="cp-row-s">{c.openRoles.toLocaleString()} open {c.openRoles === 1 ? 'role' : 'roles'}</span>
                    </span>
                    <span
                      className="cp-src-bar" aria-hidden
                      style={{ ['--w' as string]: `${Math.max(3, Math.round((c.openRoles / (topHiring[0]?.openRoles || 1)) * 100))}%` }}
                    />
                  </Link>
                ))}
              </div>
            )}

            {industries.length > 0 && (
              <div className="cp-panel">
                <h2 className="cp-panel-t">Industries</h2>
                <p className="cp-panel-s">From the pages companies published</p>
                {industries.slice(0, 7).map(([i, n]) => (
                  <button
                    key={i} type="button" className="cp-row cp-row-btn"
                    data-on={industry === i ? '1' : '0'}
                    onClick={() => setIndustry(industry === i ? '' : i)}
                  >
                    <span className="cp-row-b">
                      <span className="cp-row-t">{titleCase(i)}</span>
                      <span className="cp-row-s">{n.toLocaleString()} {n === 1 ? 'company' : 'companies'}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>

      <FilterSheet
        open={sheet}
        onClose={() => setSheet(false)}
        count={activeCount}
        footer={(
          <>
            <button type="button" className="bd-sheet-clear" onClick={clearAll} disabled={activeCount === 0}>
              Clear all
            </button>
            <button type="button" className="bd-sheet-go" onClick={() => setSheet(false)}>
              Show {filtered.length.toLocaleString()} {filtered.length === 1 ? 'company' : 'companies'}
            </button>
          </>
        )}
      >
        <Group label="Keyword">
          <div className="cp-kw">
            <Search size={14} aria-hidden />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Name, industry or city"
              aria-label="Filter these companies by keyword"
            />
            {q && <button type="button" onClick={() => setQ('')} aria-label="Clear keyword"><X size={13} /></button>}
          </div>
        </Group>

        <Group label="Sort by">
          <CheckRow on={sort === 'roles'} label="Most open roles" onClick={() => setSort('roles')} />
          <CheckRow on={sort === 'name'} label="A–Z" onClick={() => setSort('name')} />
          <CheckRow on={sort === 'followed'} label="Most followed" onClick={() => setSort('followed')} />
          <CheckRow on={sort === 'newest'} label="Newest page" onClick={() => setSort('newest')} />
        </Group>

        <Group label="Show">
          <CheckRow on={hiringOnly} label="Hiring now" n={hiringCount} onClick={() => setHiringOnly((v) => !v)} />
          <CheckRow on={pagedOnly} label="Has a company page" n={pagedCount} onClick={() => setPagedOnly((v) => !v)} />
          <CheckRow on={verifiedOnly} label="Verified only" n={verifiedCount} onClick={() => setVerifiedOnly((v) => !v)} />
        </Group>

        {industries.length > 0 && (
          <Group label="Industry">
            <CheckRow on={industry === ''} label="Any industry" n={companies.length} onClick={() => setIndustry('')} />
            {industries.map(([i, n]) => (
              <CheckRow key={i} on={industry === i} label={titleCase(i)} n={n} onClick={() => setIndustry(industry === i ? '' : i)} />
            ))}
          </Group>
        )}
      </FilterSheet>
    </DiscoverShell>
  );
}
