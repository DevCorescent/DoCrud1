'use client';

/**
 * Talent.
 *
 * ═══ THE SHAPE ═══
 *
 * The jobs and feed boards' system, in this context: the shared app shell, one
 * sticky row carrying the count, the skill buckets and the filter control, a
 * responsive grid of cards, and a right rail led by the one thing this page
 * asks of a visitor.
 *
 * ═══ NOTHING IS INVENTED ═══
 *
 * A directory of people is the surface where invented detail does real harm,
 * so every field on a card is one the member published about themselves:
 *
 *   · No availability, rate, seniority or years of experience. The profile has
 *     no such fields, and a card that guessed at them would be putting words in
 *     a person's mouth to an employer.
 *   · "Open to work" appears only where `profile.openToWork` is actually set.
 *   · Follower, upraise and gig counts render only when non-zero.
 *   · The skill buckets and their counts are counted from the loaded members,
 *     so a skill nobody lists is never offered as a filter.
 *   · The monogram is a fallback for a missing avatar, never a stand-in for a
 *     photo the member did not upload.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  SlidersHorizontal, X, Search, MapPin, Sparkles, ArrowUpRight, LayoutGrid,
  Users, TrendingUp, Star, Briefcase, UserPlus, Zap, ChevronRight,
} from 'lucide-react';
import DiscoverShell from '@/components/home/discover/DiscoverShell';
import { FilterSheet, Group, CheckRow } from '@/components/ui/board/FilterSheet';
import { PUBLIC_FACE_CATEGORY_LABELS } from '@/components/PublicFaceBadge';
import './talent-board.css';

export interface PersonProfile {
  headline?: string;
  bio?: string;
  location?: string;
  avatarUrl?: string;
  skills?: string[];
  openToWork?: boolean;
  pronouns?: string;
}

export interface Person {
  id: string;
  name: string;
  accountType?: string;
  createdAt?: string;
  docrudGo?: boolean;
  publicFace?: { category: string; approvedAt?: string } | null;
  profile?: PersonProfile;
  stats?: { followers?: number; following?: number; gigsCount?: number };
  upraiseCount?: number;
}

const PAGE = 24;
type SortMode = 'upraised' | 'followed' | 'recent' | 'name';

/* Stable per-person hue, so a member's monogram is the same colour everywhere
   without a colour being stored against them. */
function hueOf(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

const initials = (n: string) =>
  n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

/* ── A card ─────────────────────────────────────────────────────────────── */
function PersonCard({ p }: { p: Person }) {
  const [imgFailed, setImgFailed] = useState(false);
  const prof = p.profile ?? {};
  const hue = hueOf(p.id || p.name);
  const skills = (prof.skills ?? []).filter(Boolean);
  const avatar = prof.avatarUrl && !imgFailed ? prof.avatarUrl : null;
  const followers = p.stats?.followers ?? 0;
  const gigs = p.stats?.gigsCount ?? 0;
  const upraise = p.upraiseCount ?? 0;
  const face = p.publicFace?.category
    ? (PUBLIC_FACE_CATEGORY_LABELS as Record<string, string>)[p.publicFace.category] ?? 'Public figure'
    : null;

  return (
    <Link href={`/u/${p.id}`} className="tl-card">
      <span className="tl-head">
        <span
          className="tl-av"
          style={avatar ? undefined : {
            background: `hsl(${hue} 62% 95%)`,
            borderColor: `hsl(${hue} 42% 86%)`,
            color: `hsl(${hue} 40% 34%)`,
          }}
        >
          {avatar ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={avatar} alt="" loading="lazy" decoding="async" onError={() => setImgFailed(true)} />
          ) : initials(p.name)}
        </span>

        <span className="tl-id">
          <span className="tl-n">{p.name}</span>
          {/* Only what the member wrote. There is no fallback headline: an
              invented one would read as their own words. */}
          {prof.headline && <span className="tl-h">{prof.headline}</span>}
        </span>

        {prof.openToWork && (
          <span className="tl-open" title="Open to work"><Zap size={11} strokeWidth={2.4} /></span>
        )}
      </span>

      <span className="tl-tags">
        {face && <span className="tl-face"><Star size={10} strokeWidth={2.4} />{face}</span>}
        {p.accountType === 'business' && <span className="tl-kind"><Briefcase size={10} />Business</span>}
        {prof.location && <span className="tl-loc"><MapPin size={11} />{prof.location}</span>}
      </span>

      {skills.length > 0 && (
        <span className="tl-skills">
          {skills.slice(0, 4).map((s) => <span key={s} className="tl-skill">{s}</span>)}
          {skills.length > 4 && <span className="tl-skill tl-skill-n">+{skills.length - 4}</span>}
        </span>
      )}

      <span className="tl-foot">
        {/* Only when there is something to report — a row of zeroes reads as a
            person nobody rates rather than a profile that is simply new. */}
        {!!followers && <span className="tl-m"><Users size={11} />{followers}</span>}
        {!!upraise && <span className="tl-m"><TrendingUp size={11} />{upraise}</span>}
        {!!gigs && <span className="tl-m"><Briefcase size={11} />{gigs}</span>}
        <span className="tl-view">View profile <ArrowUpRight size={12} /></span>
      </span>
    </Link>
  );
}

/* ── The page ───────────────────────────────────────────────────────────── */
export interface TalentBoardProps {
  softwareName: string;
  guestMode?: boolean;
  viewer: { name: string | null; email: string | null } | null;
}

export default function TalentBoard({ softwareName, guestMode = false, viewer }: TalentBoardProps) {
  const [people, setPeople] = useState<Person[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [sheet, setSheet] = useState(false);
  const [skill, setSkill] = useState('');
  const [sort, setSort] = useState<SortMode>('upraised');
  const [q, setQ] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [kind, setKind] = useState<'' | 'individual' | 'business'>('');
  const [page, setPage] = useState(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const params = useSearchParams();

  /* `?skill=` comes from the homepage's skills grid. Applied once per value so
     the member can still clear it. The skill is only accepted once the
     directory has loaded and actually contains it — an unknown value would
     filter everyone out and read as an empty directory. */
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    const want = (params?.get('skill') ?? '').trim();
    if (!want || seeded.current === want || people.length === 0) return;
    const real = people.some((p) => (p.profile?.skills ?? []).includes(want));
    seeded.current = want;
    if (real) setSkill(want);
  }, [params, people]);

  const load = useCallback(() => {
    setState('loading');
    fetch('/api/public/people', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('people-failed'))))
      .then((d) => {
        setPeople(Array.isArray(d?.people) ? d.people : []);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => { setPage(1); }, [skill, q, sort, openOnly, kind]);

  /* Counted from the loaded members, so a skill nobody lists is never offered
     and the number on a chip is the number that chip will show. */
  const skills = useMemo(() => {
    const by = new Map<string, number>();
    for (const p of people) {
      for (const s of p.profile?.skills ?? []) {
        const t = (s || '').trim();
        if (t) by.set(t, (by.get(t) ?? 0) + 1);
      }
    }
    return Array.from(by.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [people]);

  const locations = useMemo(() => {
    const by = new Map<string, number>();
    for (const p of people) {
      const l = (p.profile?.location || '').trim();
      if (l) by.set(l, (by.get(l) ?? 0) + 1);
    }
    return Array.from(by.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [people]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = people.filter((p) => {
      if (skill && !(p.profile?.skills ?? []).some((s) => s === skill)) return false;
      if (openOnly && !p.profile?.openToWork) return false;
      if (kind && (p.accountType ?? 'individual') !== kind) return false;
      if (needle) {
        const hay = `${p.name} ${p.profile?.headline ?? ''} ${p.profile?.location ?? ''} ${(p.profile?.skills ?? []).join(' ')}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const n = (v?: number) => (typeof v === 'number' ? v : 0);
    if (sort === 'followed') out = out.slice().sort((a, b) => n(b.stats?.followers) - n(a.stats?.followers));
    else if (sort === 'recent') out = out.slice().sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0));
    else if (sort === 'name') out = out.slice().sort((a, b) => a.name.localeCompare(b.name));
    else out = out.slice().sort((a, b) => n(b.upraiseCount) - n(a.upraiseCount));
    return out;
  }, [people, skill, q, sort, openOnly, kind]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const paged = useMemo(() => filtered.slice((page - 1) * PAGE, page * PAGE), [filtered, page]);

  const activeCount =
    (skill ? 1 : 0) + (q.trim() ? 1 : 0) + (sort !== 'upraised' ? 1 : 0) + (openOnly ? 1 : 0) + (kind ? 1 : 0);

  const pills = useMemo(() => {
    const out: Array<{ key: string; label: string; clear: () => void }> = [];
    if (skill) out.push({ key: 'sk', label: skill, clear: () => setSkill('') });
    if (openOnly) out.push({ key: 'ow', label: 'Open to work', clear: () => setOpenOnly(false) });
    if (kind) out.push({ key: 'kd', label: kind === 'business' ? 'Businesses' : 'Individuals', clear: () => setKind('') });
    if (sort !== 'upraised') {
      const lbl = sort === 'followed' ? 'Most followed' : sort === 'recent' ? 'Newest' : 'A–Z';
      out.push({ key: 'so', label: lbl, clear: () => setSort('upraised') });
    }
    if (q.trim()) out.push({ key: 'q', label: `“${q.trim()}”`, clear: () => setQ('') });
    return out;
  }, [skill, q, sort, openOnly, kind]);

  const clearAll = () => { setSkill(''); setQ(''); setSort('upraised'); setOpenOnly(false); setKind(''); };

  const openCount = useMemo(() => people.filter((p) => p.profile?.openToWork).length, [people]);
  const loading = state === 'loading';

  const goPage = useCallback((n: number) => {
    setPage(n);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const pages = useMemo(() => {
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
      <div className="tl" ref={scrollRef}>
        {guestMode && (
          <div className="tl-pad" style={{ paddingTop: 18 }}>
            <div className="dh-guest" style={{ marginInline: 0 }}>
              <Sparkles size={15} />
              <span>
                You are browsing in incognito mode. <Link href="/login">Sign in</Link> to follow people and publish your own profile.
              </span>
            </div>
          </div>
        )}

        {/* ══ One row ══ */}
        <div className="tl-bar">
          <h1 className="tl-title">
            {loading ? <span>Talent</span> : (
              <>
                <b>{filtered.length.toLocaleString()}</b>
                <span>{filtered.length === 1 ? 'person' : 'people'}</span>
              </>
            )}
          </h1>

          <div className="tl-cats" role="tablist" aria-label="Filter by skill">
            <button
              type="button" className="tl-cat" data-on={skill === '' ? '1' : '0'}
              role="tab" aria-selected={skill === ''} onClick={() => setSkill('')}
            >
              <LayoutGrid size={14} strokeWidth={1.9} />
              <span className="tl-cat-l">Everyone</span>
              {!loading && <span className="tl-cat-n">{people.length.toLocaleString()}</span>}
            </button>
            {skills.slice(0, 14).map(([s, n]) => {
              const on = skill === s;
              return (
                <button
                  key={s} type="button" className="tl-cat" data-on={on ? '1' : '0'}
                  role="tab" aria-selected={on} onClick={() => setSkill(on ? '' : s)}
                >
                  <span className="tl-cat-l">{s}</span>
                  <span className="tl-cat-n">{n.toLocaleString()}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button" className="tl-fbtn" data-on={activeCount ? '1' : '0'}
            onClick={() => setSheet(true)} aria-haspopup="dialog" aria-expanded={sheet}
          >
            <SlidersHorizontal size={14} />
            <span className="tl-fbtn-l">Filters</span>
            {activeCount > 0 && <span className="tl-fbtn-n">{activeCount}</span>}
          </button>
        </div>

        <div className="tl-body">
          <div className="tl-main">
            {pills.length > 0 && (
              <div className="tl-active">
                {pills.map((p) => (
                  <button key={p.key} type="button" className="tl-pill" onClick={p.clear}>
                    {p.label}<X size={12} />
                  </button>
                ))}
                <button type="button" className="tl-clear" onClick={clearAll}>Clear all</button>
              </div>
            )}

            {loading ? (
              <div className="tl-grid">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="tl-skel" />)}
              </div>
            ) : state === 'error' ? (
              <div className="tl-empty">
                <div className="tl-empty-t">The directory could not be loaded</div>
                <div className="tl-empty-s">The request failed. Reload the page to try again.</div>
              </div>
            ) : paged.length === 0 ? (
              <div className="tl-empty">
                <div className="tl-empty-t">
                  {people.length === 0 ? 'No public profiles yet' : 'Nobody matches those filters'}
                </div>
                <div className="tl-empty-s">
                  {people.length === 0
                    ? 'When members publish a profile — a headline, their skills and where they work — they appear here.'
                    : 'Clear a filter or widen the skill to see more people.'}
                </div>
                {people.length === 0 && (
                  <Link href="/profile" className="tl-empty-cta">
                    <UserPlus size={14} /> Publish your profile
                  </Link>
                )}
              </div>
            ) : (
              <>
                <div className="tl-grid">
                  {paged.map((p) => <PersonCard key={p.id} p={p} />)}
                </div>

                {totalPages > 1 && (
                  <>
                    <div className="tl-pager">
                      <button
                        type="button" className="tl-pg" onClick={() => goPage(page - 1)}
                        disabled={page <= 1} aria-label="Previous page"
                      ><ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} /></button>
                      {pages.map((n, i) => (n === 'gap' ? (
                        <span key={`g${i}`} className="tl-pg-gap">…</span>
                      ) : (
                        <button
                          key={n} type="button" className="tl-pg" data-on={n === page ? '1' : '0'}
                          onClick={() => goPage(n)} aria-current={n === page ? 'page' : undefined}
                        >{n}</button>
                      )))}
                      <button
                        type="button" className="tl-pg" onClick={() => goPage(page + 1)}
                        disabled={page >= totalPages} aria-label="Next page"
                      ><ChevronRight size={15} /></button>
                    </div>
                    <div className="tl-count">
                      Showing {((page - 1) * PAGE + 1).toLocaleString()}–
                      {Math.min(page * PAGE, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <aside className="tl-rail" aria-label="More on Docrud">
            <div className="tl-panel tl-panel-cta">
              <h2 className="tl-panel-t">Want to be found?</h2>
              <p className="tl-panel-s">A published profile is how employers reach you</p>
              <Link href="/profile" className="tl-cta">
                <span className="tl-cta-mark" aria-hidden><UserPlus size={16} /></span>
                <span className="tl-cta-b">
                  <span className="tl-cta-t">Publish your profile</span>
                  <span className="tl-cta-s">Headline, skills and location</span>
                </span>
                <ArrowUpRight size={15} className="tl-cta-a" aria-hidden />
              </Link>
              <Link href="/jobs" className="tl-row tl-row-quiet">
                <span className="tl-row-mark" aria-hidden><Briefcase size={16} /></span>
                <span className="tl-row-b">
                  <span className="tl-row-t">Browse open roles</span>
                  <span className="tl-row-s">Matched to what you list</span>
                </span>
              </Link>
            </div>

            {skills.length > 0 && (
              <div className="tl-panel">
                <h2 className="tl-panel-t">Skills in the directory</h2>
                <p className="tl-panel-s">Counted from published profiles</p>
                {skills.slice(0, 8).map(([s, n]) => (
                  <button
                    key={s} type="button" className="tl-src" data-on={skill === s ? '1' : '0'}
                    onClick={() => setSkill(skill === s ? '' : s)}
                  >
                    <span className="tl-row-b">
                      <span className="tl-row-t">{s}</span>
                      <span className="tl-row-s">{n.toLocaleString()} {n === 1 ? 'person' : 'people'}</span>
                    </span>
                    <span
                      className="tl-src-bar" aria-hidden
                      style={{ ['--w' as string]: `${Math.max(3, Math.round((n / people.length) * 100))}%` }}
                    />
                  </button>
                ))}
              </div>
            )}

            {locations.length > 0 && (
              <div className="tl-panel">
                <h2 className="tl-panel-t">Where people are</h2>
                <p className="tl-panel-s">From the locations members published</p>
                {locations.map(([l, n]) => (
                  <div key={l} className="tl-row">
                    <span className="tl-row-mark" aria-hidden><MapPin size={15} /></span>
                    <span className="tl-row-b">
                      <span className="tl-row-t">{l}</span>
                      <span className="tl-row-s">{n.toLocaleString()} {n === 1 ? 'person' : 'people'}</span>
                    </span>
                  </div>
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
              Show {filtered.length.toLocaleString()} {filtered.length === 1 ? 'person' : 'people'}
            </button>
          </>
        )}
      >
        <Group label="Keyword">
          <div className="tl-kw">
            <Search size={14} aria-hidden />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Name, headline, skill or place"
              aria-label="Filter these people by keyword"
            />
            {q && <button type="button" onClick={() => setQ('')} aria-label="Clear keyword"><X size={13} /></button>}
          </div>
        </Group>

        <Group label="Sort by">
          <CheckRow on={sort === 'upraised'} label="Most upraised" onClick={() => setSort('upraised')} />
          <CheckRow on={sort === 'followed'} label="Most followed" onClick={() => setSort('followed')} />
          <CheckRow on={sort === 'recent'} label="Newest" onClick={() => setSort('recent')} />
          <CheckRow on={sort === 'name'} label="A–Z" onClick={() => setSort('name')} />
        </Group>

        <Group label="Availability">
          <CheckRow
            on={openOnly} label="Open to work" n={openCount}
            onClick={() => setOpenOnly((v) => !v)}
          />
        </Group>

        <Group label="Account">
          <CheckRow on={kind === ''} label="Everyone" n={people.length} onClick={() => setKind('')} />
          <CheckRow
            on={kind === 'individual'} label="Individuals"
            n={people.filter((p) => (p.accountType ?? 'individual') === 'individual').length}
            onClick={() => setKind(kind === 'individual' ? '' : 'individual')}
          />
          <CheckRow
            on={kind === 'business'} label="Businesses"
            n={people.filter((p) => p.accountType === 'business').length}
            onClick={() => setKind(kind === 'business' ? '' : 'business')}
          />
        </Group>

        <Group label="Skill">
          <CheckRow on={skill === ''} label="Any skill" n={people.length} onClick={() => setSkill('')} />
          {skills.slice(0, 24).map(([s, n]) => (
            <CheckRow key={s} on={skill === s} label={s} n={n} onClick={() => setSkill(skill === s ? '' : s)} />
          ))}
        </Group>
      </FilterSheet>
    </DiscoverShell>
  );
}
