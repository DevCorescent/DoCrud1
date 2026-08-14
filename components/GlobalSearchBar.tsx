'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import { useSearchTracker, SEARCH_CONTEXTS } from '@/lib/search-tracking';
import {
  addRecentSearch,
  clearRecentSearches,
  readRecentSearches,
  type RecentSearch,
} from '@/lib/recent-searches';
import {
  Search,
  X,
  ChevronRight,
  Briefcase,
  FileText,
  BookOpen,
  Newspaper,
  Sparkles,
  File,
  UserRound,
  Globe,
  FileSignature,
  TrendingUp,
  Clock,
  ArrowUpLeft,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SearchMeta {
  skills?: string[];
  tags?: string[];
  budget?: string;
  timeline?: string;
  engagement?: string;
  location?: string;
  headline?: string;
  urgent?: boolean;
  viewCount?: number;
  updatedAt?: string;
  avatarUrl?: string;
}

export interface DbSearchResult {
  /** Entity type from intelligent search (person/service/business/job/…). */
  entity?: string;
  id: string;
  title: string;
  description: string;
  href: string;
  type: 'feature' | 'page' | 'file' | 'article';
  category: string;
  badge?: string;
  scope?: string;
  source?: string;
  meta?: SearchMeta;
  relevance?: number;
}

export interface LocalSearchResult {
  id: string;
  kind: 'tab' | 'template' | 'history' | 'summary';
  title: string;
  subtitle?: string;
  Icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
}

export interface MobileShortcut {
  id: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
  active?: boolean;
  iconBg?: string;
  iconFg?: string;
  dot?: string;
}

interface GlobalSearchBarProps {
  getLocalResults: (query: string) => LocalSearchResult[];
  mobileShortcuts?: MobileShortcut[];
  className?: string;
  placeholder?: string;
  placeholderCycle?: string[];
}

export interface GlobalSearchBarHandle {
  open: () => void;
  openMobile: () => void;
  close: () => void;
  focus: () => void;
}

export type SearchFilter = 'all' | 'people' | 'gigs' | 'docs' | 'files'; // 'files' repurposed as 'feed'

// ─── Client-side result cache (30s TTL) ──────────────────────────────────────

const CACHE_TTL_MS = 30_000;
const resultCache = new Map<string, { results: DbSearchResult[]; ts: number }>();

function getCached(key: string): DbSearchResult[] | null {
  const e = resultCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL_MS) { resultCache.delete(key); return null; }
  return e.results;
}

function setCache(key: string, results: DbSearchResult[]) {
  resultCache.set(key, { results, ts: Date.now() });
  if (resultCache.size > 80) { const k = resultCache.keys().next().value; if (k) resultCache.delete(k); }
}

// ─── Filters ─────────────────────────────────────────────────────────────────

const FILTERS: Array<{ id: SearchFilter; label: string; badges: string[] }> = [
  { id: 'all',    label: 'All',    badges: [] },
  { id: 'people', label: 'People', badges: ['PERSON'] },
  { id: 'gigs',   label: 'Gigs',   badges: ['GIG'] },
  { id: 'docs',   label: 'Docs',   badges: ['DOC', 'SIGNED', 'TPL', 'KB'] },
  { id: 'files',  label: 'Feed',   badges: ['BLOG'] },
];

// ─── Sentiment / intent auto-detect ──────────────────────────────────────────

function detectIntent(q: string): { filter: SearchFilter; label: string } | null {
  const t = q.toLowerCase();
  if (/\b(hire|find|looking for|designer|developer|engineer|writer|marketer|freelancer|talent|expert|consultant|professional|person|who)\b/.test(t))
    return { filter: 'people', label: 'People' };
  if (/\b(gig|job|opportunity|project|contract|remote|opening|apply)\b/.test(t))
    return { filter: 'gigs', label: 'Gigs' };
  if (/\b(doc|document|contract|agreement|template|invoice|nda|letter|sign|signed|esign)\b/.test(t))
    return { filter: 'docs', label: 'Docs' };
  return null;
}

// ─── Icon / colour helpers ────────────────────────────────────────────────────

function badgeColor(badge?: string): string {
  switch ((badge ?? '').toUpperCase()) {
    case 'GIG':     return 'rgba(251,146,60,0.85)';
    case 'RESUME':  return 'rgba(56,189,248,0.85)';
    case 'PERSON':  return 'rgba(167,139,250,0.85)';
    case 'SIGNED':  return 'rgba(52,211,153,0.85)';
    case 'DOC':     return 'rgba(96,165,250,0.85)';
    case 'TPL':     return 'rgba(167,139,250,0.85)';
    case 'KB':      return 'rgba(167,139,250,0.70)';
    case 'BLOG':    return 'rgba(45,212,191,0.80)';
    case 'SOURCE':  return 'rgba(129,140,248,0.80)';
    case 'FILE':
    case 'PUBLIC':
    case 'PRIVATE': return 'var(--gs-w350)';
    default:        return 'var(--gs-w300)';
  }
}

type IconDef = { Icon: React.ComponentType<{ style?: React.CSSProperties }>; bg: string; fg: string };

function getIconDef(r: DbSearchResult): IconDef {
  const b = (r.badge ?? '').toUpperCase();
  if (b === 'GIG')    return { Icon: Briefcase,     bg: 'rgba(251,146,60,0.15)',  fg: 'rgba(253,186,116,0.90)' };
  if (b === 'SIGNED') return { Icon: FileSignature, bg: 'rgba(52,211,153,0.14)',  fg: 'rgba(110,231,183,0.90)' };
  if (b === 'DOC' || b === 'TPL')
                      return { Icon: FileText,       bg: 'rgba(96,165,250,0.14)',  fg: 'rgba(147,197,253,0.90)' };
  if (b === 'KB')     return { Icon: BookOpen,       bg: 'rgba(167,139,250,0.14)', fg: 'rgba(196,181,253,0.90)' };
  if (b === 'BLOG')   return { Icon: Newspaper,      bg: 'rgba(45,212,191,0.13)',  fg: 'rgba(94,234,212,0.88)' };
  if (b === 'SOURCE') return { Icon: Globe,          bg: 'rgba(129,140,248,0.13)', fg: 'rgba(165,180,252,0.88)' };
  if (r.type === 'feature' || b === 'FREE' || b === 'NEW')
                      return { Icon: Sparkles,       bg: 'rgba(167,139,250,0.14)', fg: 'rgba(196,181,253,0.88)' };
  return               { Icon: File,                 bg: 'var(--gs-w070)', fg: 'var(--gs-w450)' };
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ src, name, size = 32, gradient }: { src?: string | null; name?: string; size?: number; gradient?: string }) {
  const [failed, setFailed] = useState(false);
  const initials = (name ?? '?').split(' ').map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 2);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name ?? ''} onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block', flexShrink: 0 }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: gradient ?? 'linear-gradient(135deg,rgba(139,92,246,0.80),rgba(99,102,241,0.80))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.34, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em',
    }}>
      {initials || <UserRound style={{ width: size * 0.5, height: size * 0.5 }} />}
    </div>
  );
}

// ─── Relevance bar ────────────────────────────────────────────────────────────

function RelevanceBar({ score }: { score?: number }) {
  if (typeof score !== 'number' || score <= 0) return null;
  const w = Math.max(10, Math.min(100, score));
  const color = score >= 80 ? 'rgba(251,146,60,0.55)' : score >= 50 ? 'var(--gs-w200)' : 'var(--gs-w100)';
  return (
    <div style={{ width: 28, height: 3, borderRadius: 99, background: 'var(--gs-w070)', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 99 }} />
    </div>
  );
}

// ─── Keyword highlighter ─────────────────────────────────────────────────────

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const tokens = query.trim().split(/\s+/).filter((t) => t.length > 1);
  if (!tokens.length) return <>{text}</>;
  const pattern = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const parts = text.split(new RegExp(`(${pattern})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        tokens.some((t) => t.toLowerCase() === part.toLowerCase()) ? (
          <mark key={i} style={{ background: 'rgba(251,146,60,0.22)', color: 'rgba(253,186,116,0.95)', borderRadius: 3, padding: '0 1px', fontWeight: 700 }}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// ─── Related keyword chips ────────────────────────────────────────────────────

function RelatedChips({ r, query }: { r: DbSearchResult; query: string }) {
  const q = query.toLowerCase();
  const all = [...(r.meta?.skills ?? []), ...(r.meta?.tags ?? [])];
  // show chips that are NOT already in the query — only matching/related ones
  const chips = all.filter((t) => {
    const tl = t.toLowerCase();
    return tl !== q && !q.includes(tl) && (
      tl.includes(q) || q.split(/\s+/).some((w) => w.length > 2 && (tl.includes(w) || bigramSimilar(tl, w)))
    );
  }).slice(0, 4);
  if (!chips.length) return null;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
      {chips.map((c) => (
        <span key={c} style={{ fontSize: 9.5, fontWeight: 500, padding: '1px 6px', borderRadius: 20, background: 'var(--gs-w050)', border: '1px solid var(--gs-w080)', color: 'var(--gs-w380)' }}>
          {c}
        </span>
      ))}
    </div>
  );
}

function bigramSimilar(a: string, b: string): boolean {
  if (a.length < 2 || b.length < 2) return false;
  const bigrams = (s: string) => { const set = new Set<string>(); for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2)); return set; };
  const ba = bigrams(a); const bb = bigrams(b); let hits = 0;
  ba.forEach((g) => { if (bb.has(g)) hits++; });
  return (2 * hits) / (ba.size + bb.size) >= 0.45;
}

// ─── Result row — premium glass design ────────────────────────────────────────

function ResultRow({ r, onClose, idx, query }: { r: DbSearchResult; onClose: () => void; idx: number; query: string }) {
  const badge = (r.badge ?? '').toUpperCase();
  const isPerson = badge === 'PERSON';
  const isGig    = badge === 'GIG';
  const bColor   = badgeColor(r.badge);
  const { Icon, bg, fg } = getIconDef(r);
  const delay = `${idx * 0.025}s`;

  return (
    <a
      href={r.href}
      onClick={onClose}
      className="gs-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 11,
        padding: '8px 12px', borderRadius: 12,
        textDecoration: 'none', cursor: 'pointer',
        transition: 'background 120ms ease',
        animation: `gsRowIn 0.20s ${delay} cubic-bezier(0.22,1,0.36,1) both`,
      }}
    >
      {isPerson ? (
        <Avatar src={r.meta?.avatarUrl} name={r.title} size={34}
          gradient="linear-gradient(135deg,rgba(139,92,246,0.75),rgba(99,102,241,0.75))" />
      ) : (
        <div style={{ width: 34, height: 34, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--gs-w060)' }}>
          <Icon style={{ width: 15, height: 15, color: fg }} />
        </div>
      )}

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gs-w880)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
            <Highlight text={r.title} query={query} />
          </span>
          {isGig && r.meta?.urgent && (
            <span style={{ fontSize: 8, fontWeight: 800, color: 'rgba(252,165,165,0.90)', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.20)', borderRadius: 20, padding: '1.5px 5px', flexShrink: 0, letterSpacing: '0.04em' }}>URGENT</span>
          )}
          {isGig && r.meta?.budget && (
            <span style={{ fontSize: 9.5, fontWeight: 650, color: 'rgba(253,186,116,0.85)', background: 'rgba(251,146,60,0.09)', border: '1px solid rgba(251,146,60,0.16)', borderRadius: 20, padding: '1.5px 6px', flexShrink: 0 }}>{r.meta.budget}</span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--gs-w320)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
          <Highlight text={r.meta?.headline || r.description} query={query} />
          {isPerson && r.meta?.location && <span style={{ color: 'var(--gs-w220)', marginLeft: 6 }}>{r.meta.location}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <span style={{ fontSize: 9.5, fontWeight: 600, color: bColor, letterSpacing: '0.04em', opacity: 0.70 }}>{r.category}</span>
        <ChevronRight style={{ width: 11, height: 11, color: 'var(--gs-w140)' }} />
      </div>
    </a>
  );
}

// ─── Local nav row ────────────────────────────────────────────────────────────

function LocalRow({ item, onClose, idx }: { item: LocalSearchResult; onClose: () => void; idx: number }) {
  return (
    <button
      type="button"
      onClick={() => { item.onSelect(); onClose(); }}
      className="gs-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 11, width: '100%',
        padding: '8px 12px', borderRadius: 12, border: 'none', background: 'none',
        textAlign: 'left', cursor: 'pointer', transition: 'background 120ms ease',
        animation: `gsRowIn 0.18s ${idx * 0.022}s cubic-bezier(0.22,1,0.36,1) both`,
      }}
    >
      <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--gs-w050)', border: '1px solid var(--gs-w070)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <item.Icon className="h-3.5 w-3.5 text-white/45" />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--gs-w820)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>{item.title}</p>
        {item.subtitle && <p style={{ margin: 0, fontSize: 11, color: 'var(--gs-w300)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{item.subtitle}</p>}
      </div>
      <ChevronRight style={{ width: 11, height: 11, color: 'var(--gs-w140)', flexShrink: 0 }} />
    </button>
  );
}

// ─── Group label ──────────────────────────────────────────────────────────────

const GROUP_ORDER = ['People', 'Services', 'Businesses', 'Jobs', 'Gigs', 'Products', 'Events', 'Documents', 'Feed & Articles', 'Knowledge', 'Web Sources', 'Features & Pages'];

/* Entity type from intelligent search wins; the badge rules stay as the
   fallback so classic-mode responses group exactly as they did before. */
const ENTITY_GROUP: Record<string, string> = {
  person: 'People', service: 'Services', business: 'Businesses',
  job: 'Jobs', gig: 'Gigs', product: 'Products', event: 'Events',
  post: 'Feed & Articles', file: 'Documents', feature: 'Features & Pages',
};

function groupResults(results: DbSearchResult[]) {
  const map: Record<string, DbSearchResult[]> = {};
  for (const r of results) {
    const b = (r.badge ?? '').toUpperCase();
    let label = r.entity ? ENTITY_GROUP[r.entity] ?? 'Features & Pages' : 'Features & Pages';
    if (!r.entity) {
      if (b === 'PERSON')                                    label = 'People';
      else if (b === 'GIG')                                  label = 'Gigs';
      else if (b === 'DOC' || b === 'SIGNED' || b === 'TPL') label = 'Documents';
      else if (b === 'BLOG' || r.type === 'article')         label = 'Feed & Articles';
      else if (b === 'KB')                                   label = 'Knowledge';
      else if (b === 'SOURCE')                               label = 'Web Sources';
    }
    (map[label] ??= []).push(r);
  }
  return GROUP_ORDER.filter((k) => map[k]).map((k) => ({ label: k, items: map[k] }));
}

/* Chip order mirrors GROUP_ORDER so chips and sections read the same way. */
const ENTITY_CHIP_ORDER: Array<{ id: string; label: string }> = [
  { id: 'person',   label: 'People' },
  { id: 'service',  label: 'Services' },
  { id: 'business', label: 'Businesses' },
  { id: 'job',      label: 'Jobs' },
  { id: 'gig',      label: 'Gigs' },
  { id: 'product',  label: 'Products' },
  { id: 'event',    label: 'Events' },
  { id: 'post',     label: 'Feed' },
  { id: 'file',     label: 'Documents' },
  { id: 'feature',  label: 'Features' },
];

function EntityChips({ chips, counts, active, onChange, total }: {
  chips: Array<{ id: string; label: string }>;
  counts: Map<string, number>;
  active: string;
  onChange: (id: string) => void;
  total: number;
}) {
  const all = [{ id: 'all', label: 'All' }, ...chips];
  return (
    <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none', padding: '0 12px 10px' }}>
      {all.map((c) => {
        const on = active === c.id;
        const n = c.id === 'all' ? total : counts.get(c.id) ?? 0;
        return (
          <button key={c.id} type="button" onClick={() => onChange(c.id)} style={{
            flexShrink: 0, borderRadius: 20, padding: '4px 11px',
            fontSize: 11, fontWeight: on ? 600 : 500,
            background: on ? 'var(--gs-w100)' : 'transparent',
            border: `1px solid ${on ? 'var(--gs-w160)' : 'var(--gs-w060)'}`,
            color: on ? 'var(--gs-w880)' : 'var(--gs-w320)',
            cursor: 'pointer', transition: 'all 140ms ease', letterSpacing: '-0.005em',
            whiteSpace: 'nowrap',
          }}>
            {c.label}
            <span style={{ marginLeft: 5, opacity: 0.55, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Filter chips — minimal pill tabs ────────────────────────────────────────

function FilterChips({ active, onChange }: { active: SearchFilter; onChange: (f: SearchFilter) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none', padding: '0 12px 10px' }}>
      {FILTERS.map((f) => {
        const on = active === f.id;
        return (
          <button key={f.id} type="button" onClick={() => onChange(f.id)} style={{
            flexShrink: 0, borderRadius: 20, padding: '4px 11px',
            fontSize: 11, fontWeight: on ? 600 : 500,
            background: on ? 'var(--gs-w100)' : 'transparent',
            border: `1px solid ${on ? 'var(--gs-w160)' : 'var(--gs-w060)'}`,
            color: on ? 'var(--gs-w880)' : 'var(--gs-w320)',
            cursor: 'pointer', transition: 'all 140ms ease',
            letterSpacing: '-0.005em',
          }}>{f.label}</button>
        );
      })}
    </div>
  );
}

// ─── Discovery (pre-typing) — Most searched + Recent searches ────────────────

/** Module-level so opening the bar a second time does not refetch. */
let trendingCache: { at: number; queries: string[] } | null = null;
const TRENDING_TTL_MS = 5 * 60 * 1000;

function DiscoveryRow({
  label, kind, idx, active, onRun, onHover,
}: {
  label: string;
  kind: 'trending' | 'recent';
  idx: number;
  active: boolean;
  onRun: (query: string) => void;
  onHover: (idx: number) => void;
}) {
  const Icon = kind === 'trending' ? TrendingUp : Clock;
  return (
    <button
      type="button"
      // onMouseDown, not onClick: the input's blur would otherwise fire first
      // and tear the panel down before the click lands.
      onMouseDown={(e) => { e.preventDefault(); onRun(label); }}
      onMouseEnter={() => onHover(idx)}
      className="gs-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 11, width: '100%',
        padding: '8px 12px', borderRadius: 12, border: 'none',
        background: active ? 'var(--gs-w055)' : 'none',
        textAlign: 'left', cursor: 'pointer', transition: 'background 120ms ease',
        animation: `gsRowIn 0.18s ${idx * 0.02}s cubic-bezier(0.22,1,0.36,1) both`,
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: 9, flexShrink: 0,
        background: kind === 'trending' ? 'rgba(251,146,60,0.11)' : 'var(--gs-w050)',
        border: `1px solid ${kind === 'trending' ? 'rgba(251,146,60,0.16)' : 'var(--gs-w070)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon style={{ width: 13, height: 13, color: kind === 'trending' ? 'rgba(253,186,116,0.80)' : 'var(--gs-w400)' }} />
      </div>
      <span style={{
        flex: 1, minWidth: 0, fontSize: 13, fontWeight: 550,
        color: 'var(--gs-w820)', letterSpacing: '-0.01em',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{label}</span>
      <ArrowUpLeft style={{ width: 12, height: 12, color: 'var(--gs-w160)', flexShrink: 0 }} />
    </button>
  );
}

function SectionHeading({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 8px 4px' }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--gs-w220)', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--gs-w050)' }} />
      {action}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p style={{ margin: '2px 12px 8px', fontSize: 11.5, color: 'var(--gs-w240)', letterSpacing: '-0.005em' }}>{text}</p>
  );
}

interface DiscoveryProps {
  trending: string[];
  recent: RecentSearch[];
  activeIdx: number;
  onRun: (query: string) => void;
  onHover: (idx: number) => void;
  onClearRecent: () => void;
}

/**
 * Shown while the input is empty, on both desktop and mobile. Once the user
 * types, the caller swaps this out for the existing results panel — there is
 * only ever one search implementation behind both.
 */
function DiscoveryPanel({ trending, recent, activeIdx, onRun, onHover, onClearRecent }: DiscoveryProps) {
  return (
    <div style={{ overflowY: 'auto', maxHeight: 420, scrollbarWidth: 'none', padding: '0 6px 10px' }}>
      <SectionHeading label="Most searched" />
      {trending.length > 0
        ? trending.map((q, i) => (
            <DiscoveryRow key={`t-${q}`} label={q} kind="trending" idx={i}
              active={activeIdx === i} onRun={onRun} onHover={onHover} />
          ))
        : <EmptyLine text="No popular searches yet." />}

      <div style={{ height: 6 }} />

      <SectionHeading
        label="Recent searches"
        action={recent.length > 0 ? (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onClearRecent(); }}
            style={{
              border: 'none', background: 'none', cursor: 'pointer', padding: '0 2px',
              fontSize: 10, fontWeight: 600, letterSpacing: '0.02em',
              color: 'var(--gs-w300)', transition: 'color 120ms ease',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--gs-w650)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--gs-w300)'; }}
          >
            Clear
          </button>
        ) : undefined}
      />
      {recent.length > 0
        ? recent.map((entry, i) => (
            <DiscoveryRow key={`r-${entry.query}`} label={entry.query} kind="recent"
              idx={trending.length + i} active={activeIdx === trending.length + i}
              onRun={onRun} onHover={onHover} />
          ))
        : <EmptyLine text="No recent searches yet." />}
    </div>
  );
}

// ─── Main dropdown panel ──────────────────────────────────────────────────────

interface DropdownProps {
  query: string;
  localResults: LocalSearchResult[];
  dbResults: DbSearchResult[];
  loading: boolean;
  activeFilter: SearchFilter;
  onFilterChange: (f: SearchFilter) => void;
  onClose: () => void;
  intentHint: { filter: SearchFilter; label: string } | null;
  relaxed?: boolean;
  searchError?: boolean;
}

function DropdownPanel({ query, localResults, dbResults, loading, activeFilter, onFilterChange, onClose, intentHint, relaxed, searchError }: DropdownProps) {
  /* Entity filters are derived from what actually came back, so a category with
     zero results is never offered. Filtering is client-side over the results
     already fetched — no extra request, no extra latency. */
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const entityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of dbResults) if (r.entity) counts.set(r.entity, (counts.get(r.entity) ?? 0) + 1);
    return counts;
  }, [dbResults]);
  const entityChips = useMemo(
    () => ENTITY_CHIP_ORDER.filter((e) => (entityCounts.get(e.id) ?? 0) > 0),
    [entityCounts],
  );
  // Reset when a new query changes the available categories.
  useEffect(() => {
    if (entityFilter !== 'all' && !entityCounts.has(entityFilter)) setEntityFilter('all');
  }, [entityCounts, entityFilter]);

  const visibleResults = useMemo(
    () => (entityFilter === 'all' ? dbResults : dbResults.filter((r) => r.entity === entityFilter)),
    [dbResults, entityFilter],
  );
  const grouped = useMemo(() => groupResults(visibleResults), [visibleResults]);
  const hasLocal = localResults.length > 0;
  const hasDb    = visibleResults.length > 0;
  const hasQuery = query.trim().length > 0;
  let rowIdx = 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* Filter chips — dynamic for intelligent results, classic otherwise */}
      {entityChips.length > 1 ? (
        <EntityChips chips={entityChips} counts={entityCounts} active={entityFilter} onChange={setEntityFilter} total={dbResults.length} />
      ) : (
        <FilterChips active={activeFilter} onChange={onFilterChange} />
      )}

      {/* Intent hint — very subtle */}
      {intentHint && hasDb && activeFilter === 'all' && (
        <button type="button" onClick={() => onFilterChange(intentHint.filter)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, margin: '0 10px 8px',
            borderRadius: 10, padding: '7px 12px',
            border: '1px solid var(--gs-w070)',
            background: 'var(--gs-w040)', cursor: 'pointer', textAlign: 'left',
            transition: 'background 120ms ease',
            animation: 'gsRowIn 0.22s cubic-bezier(0.22,1,0.36,1) both',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--gs-w070)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--gs-w040)'; }}
        >
          <Sparkles style={{ width: 11, height: 11, color: 'var(--gs-w350)', flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: 'var(--gs-w500)', flex: 1 }}>
            Refine by <strong style={{ fontWeight: 650, color: 'var(--gs-w700)' }}>{intentHint.label}</strong>
          </span>
          <ChevronRight style={{ width: 11, height: 11, color: 'var(--gs-w220)' }} />
        </button>
      )}

      {/* Error notice — plain language only */}
      {searchError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7, margin: '0 10px 8px',
          borderRadius: 10, padding: '7px 12px',
          border: '1px solid var(--gs-w140)', background: 'var(--gs-w050)',
        }}>
          <span style={{ fontSize: 11.5, color: 'var(--gs-w550)', lineHeight: 1.4 }}>
            Search is temporarily unavailable. Please try again.
          </span>
        </div>
      )}

      {/* Relaxed-match notice — the user is told when nothing matched exactly */}
      {relaxed && hasDb && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7, margin: '0 10px 8px',
          borderRadius: 10, padding: '7px 12px',
          border: '1px solid rgba(251,191,36,0.16)', background: 'rgba(251,191,36,0.06)',
        }}>
          <Sparkles style={{ width: 11, height: 11, color: 'rgba(251,191,36,0.75)', flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: 'var(--gs-w550)', lineHeight: 1.4 }}>
            No exact matches found. Showing related results.
          </span>
        </div>
      )}

      {/* Results */}
      <div style={{ overflowY: 'auto', maxHeight: 420, scrollbarWidth: 'none', padding: '0 6px 8px' }}>

        {hasLocal && (
          <div style={{ marginBottom: hasDb ? 6 : 0 }}>
            <p style={{ margin: '0 8px 4px', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--gs-w200)' }}>Navigation</p>
            {localResults.map((item) => <LocalRow key={item.id} item={item} onClose={onClose} idx={rowIdx++} />)}
          </div>
        )}

        {hasDb && grouped.map(({ label, items }, gi) => (
          <div key={label} style={{ marginBottom: gi < grouped.length - 1 ? 8 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 8px 4px' }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--gs-w220)', whiteSpace: 'nowrap' }}>{label}</span>
              <div style={{ flex: 1, height: 1, background: 'var(--gs-w050)' }} />
              <span style={{ fontSize: 9.5, color: 'var(--gs-w180)', fontVariantNumeric: 'tabular-nums' }}>{items.length}</span>
            </div>
            {items.map((r) => <ResultRow key={r.id} r={r} onClose={onClose} idx={rowIdx++} query={query} />)}
          </div>
        ))}

        {hasQuery && !hasLocal && !hasDb && !loading && (
          <div style={{ padding: '28px 16px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--gs-w380)', letterSpacing: '-0.01em' }}>No results for &ldquo;{query}&rdquo;</p>
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--gs-w200)', lineHeight: 1.6 }}>Try a different keyword or name</p>
          </div>
        )}

        {!hasQuery && !hasLocal && (
          <div style={{ padding: '22px 16px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--gs-w220)', letterSpacing: '-0.005em' }}>Search people, gigs, docs, feeds & more</p>
          </div>
        )}
      </div>

      {/* Refresh sweep */}
      {loading && hasDb && (
        <div style={{ flexShrink: 0, height: 1.5, overflow: 'hidden', background: 'var(--gs-w040)' }}>
          <div style={{ width: '30%', height: '100%', background: 'linear-gradient(90deg,transparent,var(--gs-w280),transparent)', animation: 'gsSweep 1.1s ease-in-out infinite' }} />
        </div>
      )}
    </div>
  );
}

// ─── Placeholder cycler ───────────────────────────────────────────────────────

const DEFAULT_CYCLE = [
  'Search gigs, people, docs…',
  'Find professionals & talent…',
  'Search documents & files…',
  'Explore feeds & articles…',
];

// ─── Main component ───────────────────────────────────────────────────────────

const GlobalSearchBar = forwardRef<GlobalSearchBarHandle, GlobalSearchBarProps>(
  function GlobalSearchBar({ getLocalResults, mobileShortcuts = [], className, placeholder, placeholderCycle }, ref) {

    const [query,        setQuery]        = useState('');
    const [desktopOpen,  setDesktopOpen]  = useState(false);
    const [mobileOpen,   setMobileOpen]   = useState(false);
    const [dbResults,    setDbResults]    = useState<DbSearchResult[]>([]);
    const [loading,      setLoading]      = useState(false);
    const [isMounted,    setIsMounted]    = useState(false);
    const [cycleIdx,     setCycleIdx]     = useState(0);
    const [activeFilter, setActiveFilter] = useState<SearchFilter>('all');
    const [trending,     setTrending]     = useState<string[]>(() => trendingCache?.queries ?? []);
    const [recent,       setRecent]       = useState<RecentSearch[]>([]);
    const [discoveryIdx, setDiscoveryIdx] = useState(-1);

    const { data: session } = useSession();
    const userId = session?.user?.id || null;

    const inputDesktopRef = useRef<HTMLInputElement>(null);
    const inputMobileRef  = useRef<HTMLInputElement>(null);
    const rootRef         = useRef<HTMLDivElement>(null);
    const innerRef        = useRef<HTMLDivElement>(null);
    const portalRef       = useRef<HTMLDivElement>(null);
    const abortRef        = useRef<AbortController | null>(null);
    const debounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [portalRect, setPortalRect] = useState<{ top: number; left: number; width: number } | null>(null);

    useEffect(() => { setIsMounted(true); }, []);

    const cycle = placeholderCycle ?? DEFAULT_CYCLE;

    // Cycle placeholder every 2.6s
    useEffect(() => {
      if (placeholder) return;
      const id = setInterval(() => setCycleIdx((i) => (i + 1) % cycle.length), 2600);
      return () => clearInterval(id);
    }, [placeholder, cycle.length]);

    const closeAll = useCallback(() => {
      setDesktopOpen(false); setMobileOpen(false);
      setQuery(''); setDbResults([]); setLoading(false); setActiveFilter('all'); setDiscoveryIdx(-1);
      if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    }, []);

    useImperativeHandle(ref, () => ({
      open:       () => { setDesktopOpen(true); setTimeout(() => inputDesktopRef.current?.focus(), 10); },
      openMobile: () => { setMobileOpen(true);  setTimeout(() => inputMobileRef.current?.focus(),  10); },
      close:  closeAll,
      focus:  () => inputDesktopRef.current?.focus(),
    }));

    // ── Fast fetch with abort, dedupe and cache ──────────────────────────────
    const fetchDb = useCallback((q: string, filter: SearchFilter = 'all') => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }

      const trimmed = q.trim();
      if (!trimmed) { setDbResults([]); setRelaxed(false); setLoading(false); return; }

      const key = `${trimmed}::${filter}`;
      const hit = getCached(key);
      if (hit) { setDbResults(hit); setLoading(false); return; }

      // Only show loading after 120ms — avoids flash for cache hits and very fast responses
      const loadingTimer = setTimeout(() => setLoading(true), 120);

      debounceRef.current = setTimeout(async () => {
        abortRef.current = new AbortController();
        try {
          const badges = FILTERS.find((f) => f.id === filter)?.badges ?? [];
          const bp = badges.length ? `&badge=${badges.join(',')}` : '';
          /* Natural-language mode. The query is understood server-side (intent,
             skills, location, related concepts) before ranking, so a whole
             sentence works as well as a keyword. `ai` is deliberately absent —
             the optional LLM expansion never runs on a keystroke. */
          const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}&limit=24&mode=intelligent${bp}`, {
            signal: abortRef.current.signal,
          });
          if (!res.ok) throw new Error('search failed');
          setSearchError(false);
          const data = await res.json() as {
            results?: Array<Partial<DbSearchResult> & {
              url?: string; subtitle?: string; why?: string; score?: number;
              image?: string | null; location?: string | null;
            }>;
            relaxed?: boolean;
          };
          /* Map the unified result model onto the shape this panel already
             renders. Falls back cleanly if the endpoint returned classic rows. */
          const LEGACY_TYPE: Record<string, DbSearchResult['type']> = {
            person: 'page', business: 'page', service: 'page', job: 'page',
            gig: 'page', post: 'article', file: 'file', feature: 'feature',
          };
          setRelaxed(Boolean(data.relaxed));
          const results: DbSearchResult[] = (data.results ?? []).map((r) => ({
            entity: typeof r.type === 'string' ? r.type : undefined,
            id: String(r.id ?? r.url ?? r.href ?? ''),
            title: String(r.title ?? ''),
            description: String(r.description || r.subtitle || ''),
            href: String(r.url ?? r.href ?? '#'),
            type: LEGACY_TYPE[String(r.type)] ?? (r.type as DbSearchResult['type']) ?? 'page',
            category: String(r.subtitle || r.category || ''),
            badge: r.badge,
            relevance: typeof r.score === 'number' ? r.score : r.relevance,
            meta: {
              ...(r.meta ?? {}),
              ...(r.location ? { location: r.location } : {}),
              ...(r.image ? { avatarUrl: r.image } : {}),
              // Keep the existing headline when there is one; otherwise the
              // match reason is the most useful second line.
              ...((r.meta as { headline?: string } | undefined)?.headline
                ? {}
                : r.why ? { headline: r.why } : {}),
            },
          }));
          setCache(key, results);
          setDbResults(results);
          trackSearch(trimmed, results.length);
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return;
          // Keep whatever is on screen, but tell the user plainly. No status
          // codes, no database or provider details.
          setSearchError(true);
        } finally {
          clearTimeout(loadingTimer);
          setLoading(false);
        }
      }, 180); // 180ms debounce — reduces in-flight requests without feeling sluggish

      return () => clearTimeout(loadingTimer);
    }, []);

    const trackSearch = useSearchTracker(SEARCH_CONTEXTS.GLOBAL);
    /* True when the backend relaxed its matching — the user is told, not hidden from. */
    const [relaxed, setRelaxed] = useState(false);
    /* Set only when the request itself failed. The API already falls back to
       the lexical engine internally, so this means both paths were unusable. */
    const [searchError, setSearchError] = useState(false);

    const handleQueryChange = useCallback((value: string) => {
      setQuery(value);
      fetchDb(value, activeFilter);
      setDesktopOpen(true);
      setDiscoveryIdx(-1);
    }, [fetchDb, activeFilter]);

    /* ── Discovery data ──────────────────────────────────────────────────── */

    // Recent searches are read from localStorage, so they are on screen in the
    // same frame the panel opens — no request, no spinner.
    const isOpen = desktopOpen || mobileOpen;
    useEffect(() => {
      if (!isOpen) return;
      setRecent(readRecentSearches(userId));
    }, [isOpen, userId]);

    // Most searched comes from the shared telemetry aggregate. Fetched at most
    // once per 5 min per tab, never per keystroke.
    useEffect(() => {
      if (!isOpen) return;
      if (trendingCache && Date.now() - trendingCache.at < TRENDING_TTL_MS) {
        setTrending(trendingCache.queries);
        return;
      }
      let cancelled = false;
      fetch('/api/search/trending')
        .then((res) => (res.ok ? res.json() : { queries: [] }))
        .then((data: { queries?: string[] }) => {
          const queries = Array.isArray(data.queries) ? data.queries : [];
          trendingCache = { at: Date.now(), queries };
          if (!cancelled) setTrending(queries);
        })
        .catch(() => { /* discovery is optional — leave the section empty */ });
      return () => { cancelled = true; };
    }, [isOpen]);

    /**
     * Commit a search — the single place a query is recorded as "the user
     * actually searched this". Called on Enter, on opening a result, and by
     * one-click discovery items. Never on keystrokes.
     */
    const commitSearch = useCallback((value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      setRecent(addRecentSearch(trimmed, userId));
    }, [userId]);

    /**
     * One-click execution for Most searched / Recent searches.
     *
     * Runs exactly the path a typed query takes — same `fetchDb`, same
     * /api/search call, same results panel. The only difference is that the
     * query arrives preselected instead of typed, so no Enter is needed.
     */
    const runSearch = useCallback((value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      setQuery(trimmed);
      setDiscoveryIdx(-1);
      commitSearch(trimmed);
      fetchDb(trimmed, activeFilter);
      if (!mobileOpen) setDesktopOpen(true);
      (mobileOpen ? inputMobileRef : inputDesktopRef).current?.focus();
    }, [commitSearch, fetchDb, activeFilter, mobileOpen]);

    const handleClearRecent = useCallback(() => {
      setRecent(clearRecentSearches(userId));
    }, [userId]);

    const handleFilterChange = useCallback((f: SearchFilter) => {
      setActiveFilter(f);
      if (query.trim()) fetchDb(query, f);
    }, [fetchDb, query]);

    const localResults  = useMemo(() => query.trim() ? getLocalResults(query) : [], [query, getLocalResults]);
    const HIDDEN_BADGES = new Set(['RESUME', 'FILE', 'PUBLIC', 'PRIVATE', 'SVC']);
    const filteredDbResults = useMemo(
      () => dbResults.filter((r) => !HIDDEN_BADGES.has((r.badge ?? '').toUpperCase()) && r.type !== 'file'),
      [dbResults], // eslint-disable-line react-hooks/exhaustive-deps
    );
    const intentHint    = useMemo(() => {
      if (query.trim().length < 3) return null;
      const h = detectIntent(query);
      return h && h.filter !== activeFilter ? h : null;
    }, [query, activeFilter]);

    // Whether to show the dropdown (only when there are results ready OR we need the filter UI)
    const hasQuery   = query.trim().length > 0;
    const hasContent = localResults.length > 0 || filteredDbResults.length > 0 || (!loading && query.trim().length >= 2);
    // Empty input now opens the discovery view instead of nothing at all.
    const dropdownVisible = desktopOpen && (hasContent || !hasQuery);

    const discoveryItems = useMemo(
      () => [...trending, ...recent.map((entry) => entry.query)],
      [trending, recent],
    );

    /**
     * Keyboard: ↑/↓ walk the discovery list and Enter runs the highlighted item
     * (identical to clicking it). With text typed, Enter commits the query the
     * user is already looking at. Escape keeps its existing close behaviour.
     */
    const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') { closeAll(); return; }

      const browsing = !hasQuery && discoveryItems.length > 0;

      if (browsing && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        setDiscoveryIdx((idx) => {
          const step = e.key === 'ArrowDown' ? 1 : -1;
          const next = idx + step;
          if (next < 0) return discoveryItems.length - 1;
          if (next >= discoveryItems.length) return 0;
          return next;
        });
        return;
      }

      if (e.key === 'Enter') {
        if (browsing && discoveryIdx >= 0) {
          e.preventDefault();
          runSearch(discoveryItems[discoveryIdx]);
          return;
        }
        if (hasQuery) commitSearch(query);
      }
    }, [closeAll, hasQuery, discoveryItems, discoveryIdx, runSearch, commitSearch, query]);

    /** Opening a result is a committed search — worth remembering. */
    const handleResultOpen = useCallback(() => {
      if (hasQuery) commitSearch(query);
      closeAll();
    }, [hasQuery, commitSearch, query, closeAll]);

    // Track input bar position for portal
    useEffect(() => {
      if (!desktopOpen || !isMounted) { setPortalRect(null); return; }
      const update = () => {
        if (innerRef.current) {
          const r = innerRef.current.getBoundingClientRect();
          setPortalRect({ top: r.bottom + 5, left: r.left, width: r.width });
        }
      };
      update();
      window.addEventListener('resize', update);
      window.addEventListener('scroll', update, true);
      return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
    }, [desktopOpen, isMounted]);

    // Click-outside
    useEffect(() => {
      if (!desktopOpen) return;
      const onDown = (e: MouseEvent) => {
        if (!rootRef.current?.contains(e.target as Node) && !portalRef.current?.contains(e.target as Node))
          setDesktopOpen(false);
      };
      window.addEventListener('mousedown', onDown);
      return () => window.removeEventListener('mousedown', onDown);
    }, [desktopOpen]);

    // Escape key
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && (desktopOpen || mobileOpen)) closeAll(); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [desktopOpen, mobileOpen, closeAll]);

    const activePlaceholder = placeholder ?? cycle[cycleIdx];
    const dropProps: DropdownProps = {
      query, localResults, dbResults: filteredDbResults, loading, activeFilter,
      onFilterChange: handleFilterChange, onClose: handleResultOpen, intentHint, relaxed, searchError,
    };

    const discoveryProps: DiscoveryProps = {
      trending, recent, activeIdx: discoveryIdx,
      onRun: runSearch, onHover: setDiscoveryIdx, onClearRecent: handleClearRecent,
    };

    // Input border glow when actively loading
    const inputBorder = loading
      ? '1px solid rgba(251,146,60,0.35)'
      : desktopOpen
        ? '1px solid var(--gs-w180)'
        : '1px solid var(--gs-w090)';

    const inputShadow = loading
      ? '0 0 0 3px rgba(251,146,60,0.08), 0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 var(--gs-w050)'
      : desktopOpen
        ? '0 0 0 3px var(--gs-w040), 0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 var(--gs-w050)'
        : '0 2px 10px rgba(0,0,0,0.22), inset 0 1px 0 var(--gs-w040)';

    return (
      <>
        {/* Global styles + keyframes */}
        {isMounted && (
          <style>{`
            .gs-row:hover { background: var(--gs-w055) !important; }
            .gs-row:active { background: var(--gs-w038) !important; }
            @keyframes gsRowIn  { from { opacity:0; transform: translateY(4px); } to { opacity:1; transform:none; } }
            @keyframes gsSweep  { 0%,100%{transform:translateX(-100%)} 50%{transform:translateX(400%)} }
            @keyframes gsPulse  { 0%,100%{opacity:0.4} 50%{opacity:1} }
            @keyframes gsBarSweep { 0%{transform:translateX(-120%)} 100%{transform:translateX(450%)} }
            @keyframes gsFadeIn { from{opacity:0;transform:translateY(-6px) scale(0.98)} to{opacity:1;transform:none} }
            @keyframes gsBackdropIn { from{opacity:0} to{opacity:1} }
          `}</style>
        )}

        {/* ── Desktop bar ── */}
        <div
          ref={rootRef}
          className={`hidden min-w-0 flex-1 px-2 md:flex md:items-center md:justify-center ${className ?? ''}`}
          data-global-search-root
        >
          <div ref={innerRef} className="relative w-full max-w-[560px]">

            {/* Search icon */}
            <Search
              style={{
                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                width: 14, height: 14, pointerEvents: 'none', zIndex: 10,
                color: loading ? 'rgba(251,146,60,0.60)' : desktopOpen ? 'var(--gs-w500)' : 'var(--gs-w320)',
                transition: 'color 200ms ease',
              }}
            />

            {/* Input */}
            <input
              ref={inputDesktopRef}
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onFocus={() => setDesktopOpen(true)}
              onKeyDown={handleInputKeyDown}
              placeholder={activePlaceholder}
              className="[&::placeholder]:text-[color:var(--gs-w350)]"
              style={{
                height: 38, width: '100%', borderRadius: 999,
                paddingLeft: 38, paddingRight: 72,
                fontSize: 13, fontWeight: 500,
                color: 'var(--gs-w850)',
                outline: 'none',
                background: (desktopOpen || loading) ? 'var(--gs-w065)' : 'var(--gs-w045)',
                border: inputBorder,
                backdropFilter: 'blur(28px) saturate(1.5)',
                WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
                boxShadow: inputShadow,
                transition: 'border 200ms ease, box-shadow 200ms ease, background 200ms ease',
              }}
            />

            {/* Loading sweep line on input */}
            {loading && (
              <div style={{
                position: 'absolute', bottom: 0, left: 14, right: 14,
                height: 1.5, borderRadius: 99, overflow: 'hidden',
                background: 'var(--gs-w060)',
              }}>
                <div style={{
                  position: 'absolute', width: '40%', height: '100%',
                  background: 'linear-gradient(90deg,transparent,rgba(251,146,60,0.70),rgba(253,186,116,0.50),transparent)',
                  animation: 'gsBarSweep 0.95s cubic-bezier(0.4,0,0.6,1) infinite',
                }} />
              </div>
            )}

            {/* Right pill: ⌘K or dots-loading */}
            <div style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              display: 'flex', alignItems: 'center', gap: 2.5,
              background: 'var(--gs-w050)', border: '1px solid var(--gs-w070)',
              borderRadius: 999, padding: '3px 8px',
            }}>
              {loading ? (
                /* Three pulsing dots */
                [0, 1, 2].map((i) => (
                  <div key={i} style={{
                    width: 4, height: 4, borderRadius: '50%',
                    background: 'rgba(251,146,60,0.65)',
                    animation: `gsPulse 1.0s ${i * 0.18}s ease-in-out infinite`,
                  }} />
                ))
              ) : (
                <>
                  <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--gs-w280)', letterSpacing: '0.04em' }}>⌘</span>
                  <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--gs-w280)', letterSpacing: '0.04em' }}>K</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Desktop portalled glass panel ── */}
        {isMounted && dropdownVisible && portalRect && createPortal(
          <>
            {/* Subdued backdrop — focuses attention on search without blacking
                out the page.
                Starts just below the search bar so the nav and the input itself
                stay crisp, and is pointer-events:none so the input remains
                clickable no matter how the header stacks. Closing is already
                handled by the click-outside listener. */}
            <div
              style={{
                position: 'fixed', inset: 0, top: Math.max(0, portalRect.top - 5),
                zIndex: 9970, pointerEvents: 'none',
                background: 'rgba(0,0,0,0.34)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                animation: 'gsBackdropIn 0.20s ease both',
              }}
            />
            <div
              ref={portalRef}
              style={{
                position: 'fixed',
                top: portalRect.top,
                left: portalRect.left,
                width: portalRect.width,
                maxWidth: 'calc(100vw - 24px)',
                zIndex: 9980,
                borderRadius: 18,
                overflow: 'hidden',
                background: 'var(--gs-panel-bg)',
                border: '1px solid var(--gs-w100)',
                backdropFilter: 'blur(64px) saturate(2)',
                WebkitBackdropFilter: 'blur(64px) saturate(2)',
                boxShadow: '0 24px 64px rgba(0,0,0,0.70), 0 4px 16px rgba(0,0,0,0.40), inset 0 1px 0 var(--gs-w070)',
                animation: 'gsFadeIn 0.18s cubic-bezier(0.22,1,0.36,1) both',
                paddingTop: 10,
              }}
            >
              {hasQuery ? <DropdownPanel {...dropProps} /> : <DiscoveryPanel {...discoveryProps} />}
            </div>
          </>,
          document.body,
        )}

        {/* ── Mobile overlay — premium full-height panel from header ── */}
        {isMounted && mobileOpen && createPortal(
          <>
            <style>{`
              @keyframes gsm-backdrop { from{opacity:0} to{opacity:1} }
              @keyframes gsm-panel    { from{opacity:0;transform:translateY(-12px) scale(0.98)} to{opacity:1;transform:none} }
              @keyframes gsm-row      { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:none} }
              .gsm-row { transition: background 0.12s ease; -webkit-tap-highlight-color: transparent; }
              .gsm-row:active { background: var(--gs-w070) !important; transform: scale(0.985); transition-duration:0.06s; }
            `}</style>

            {/* Backdrop */}
            <div
              onClick={closeAll}
              style={{ position:'fixed', inset:0, zIndex:9998, background:'var(--gs-scrim)', backdropFilter:'blur(10px)', WebkitBackdropFilter:'blur(10px)', animation:'gsm-backdrop 0.18s ease both' }}
            />

            {/* Panel — drops from just below the nav bar */}
            <div
              style={{
                position: 'fixed', left: 0, right: 0, top: 56,
                bottom: 'env(safe-area-inset-bottom, 0px)',
                zIndex: 9999, display: 'flex', flexDirection: 'column',
                background: 'var(--gs-panel-bg-solid)',
                backdropFilter: 'blur(52px) saturate(1.8)',
                WebkitBackdropFilter: 'blur(52px) saturate(1.8)',
                borderBottom: '1px solid var(--gs-w060)',
                boxShadow: '0 32px 80px rgba(0,0,0,0.85)',
                animation: 'gsm-panel 0.22s cubic-bezier(0.22,1,0.36,1) both',
                overflow: 'hidden',
              }}
            >
              {/* Thin amber progress bar */}
              <div style={{ height: 2, flexShrink: 0, background: 'var(--gs-w040)', overflow: 'hidden' }}>
                {loading && <div style={{ height: '100%', width: '40%', background: 'linear-gradient(90deg,transparent,rgba(251,146,60,0.80),transparent)', animation: 'gsBarSweep 0.9s cubic-bezier(0.4,0,0.6,1) infinite' }} />}
              </div>

              {/* Search input row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--gs-w060)', flexShrink: 0 }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--gs-w050)', border: '1px solid var(--gs-w080)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Search style={{ width: 15, height: 15, color: loading ? 'rgba(251,146,60,0.70)' : 'var(--gs-w400)' }} />
                </div>
                <input
                  ref={inputMobileRef}
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  placeholder={activePlaceholder}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  onKeyDown={handleInputKeyDown}
                  className="[&::placeholder]:text-[color:var(--gs-w350)]"
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    fontSize: 17, fontWeight: 500, color: 'var(--gs-w900)',
                    caretColor: 'rgba(251,146,60,0.80)', fontFamily: 'inherit', letterSpacing: '-0.01em',
                  }}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => handleQueryChange('')}
                    style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'var(--gs-w070)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: 'var(--gs-w450)' }}
                  >
                    <X style={{ width: 12, height: 12 }} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeAll}
                  style={{ height: 34, borderRadius: 9, border: '1px solid var(--gs-w090)', background: 'var(--gs-w040)', padding: '0 12px', cursor: 'pointer', flexShrink: 0, fontSize: 13, fontWeight: 600, color: 'var(--gs-w450)', letterSpacing: '-0.01em' }}
                >
                  Cancel
                </button>
              </div>

              {/* Scrollable results */}
              <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
                {/* Loading skeleton */}
                {loading && !dbResults.length && query.trim().length > 0 && (
                  <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Skeleton rows: fixed heights so nothing jumps when the
                        real rows arrive. Tint comes from theme tokens; the
                        per-row fade is opacity, which works in both themes. */}
                    {[1, 0.8, 0.6].map((op, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: op }}>
                        <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--gs-w060)', flexShrink: 0 }} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ height: 13, borderRadius: 5, background: 'var(--gs-w070)', width: `${60 + i * 12}%` }} />
                          <div style={{ height: 10, borderRadius: 4, background: 'var(--gs-w040)', width: `${40 + i * 8}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty state — Most searched + Recent searches (same
                    discovery view as desktop, same one-click execution) */}
                {!hasQuery && (
                  <div style={{ padding: '10px 8px 4px' }}>
                    <DiscoveryPanel {...discoveryProps} />
                  </div>
                )}

                {/* Results from GlobalSearchBar engine */}
                {query.trim() && (
                  <div style={{ paddingTop: 8, paddingBottom: 24 }}>
                    <DropdownPanel {...dropProps} />
                  </div>
                )}
              </div>

              {/* Bottom hint */}
              {!query.trim() && (
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--gs-w050)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Search style={{ width: 10, height: 10, color: 'var(--gs-w180)' } as React.CSSProperties} />
                  <span style={{ fontSize: 11, color: 'var(--gs-w200)', letterSpacing: '0.02em' }}>Search documents, people, gigs and more</span>
                </div>
              )}
            </div>
          </>,
          document.body,
        )}
      </>
    );
  },
);

export default GlobalSearchBar;
