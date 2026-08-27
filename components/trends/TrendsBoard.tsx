'use client';

/**
 * Trends — what the market is talking about, priced by the community.
 *
 * Anyone signed in can add a trend; everyone pushes it up or down and the
 * running score is written to a daily close, so each row carries a real
 * stock-style line built from actual votes. A brand-new trend draws a flat
 * line from a single point — movement is never invented to make a chart look
 * alive.
 *
 * Two shapes, one component:
 *   · `variant="home"` — the top few, inside the homepage column.
 *   · `variant="full"` — the whole board on /trends, with the add form open.
 *
 * Voting is optimistic and reconciled against the server's response, so a
 * rejected vote (signed out, rate limited) snaps back rather than lying.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  ArrowRight, ChevronDown, ChevronUp, Flame, Loader2, Plus, TrendingDown, TrendingUp, X,
} from 'lucide-react';

type TrendPoint = { date: string; score: number; up: number; down: number };

export type TrendView = {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  createdByName: string;
  createdAt: string;
  up: number;
  down: number;
  history: TrendPoint[];
  score: number;
  change: number;
  changePercent: number | null;
  myVote: 1 | -1 | 0;
  voterCount: number;
};

const CATEGORIES = [
  'Technology', 'Careers', 'Business', 'Design', 'Finance',
  'Marketing', 'Education', 'Startups', 'Other',
];

const CARD = 'rounded-[20px] border border-white/[0.07] bg-white/[0.025]';
const INPUT =
  'w-full rounded-[11px] border border-white/[0.09] bg-white/[0.04] px-3 py-2.5 text-[13px] text-white placeholder:text-white/22 outline-none transition-colors focus:border-white/22 focus:bg-white/[0.06]';

/* ─── chart ───────────────────────────────────────────────────────────────
   A plain polyline over the daily closes. Green when the line ends above
   where it started, red below, neutral when flat — the same reading a market
   chart gives. Drawn as inline SVG: no chart library, no external request. */
function TrendChart({ history, height = 40, width = 96, showAxis = false }: {
  history: TrendPoint[]; height?: number; width?: number; showAxis?: boolean;
}) {
  const geometry = useMemo(() => {
    if (history.length === 0) return null;
    const values = history.map((p) => p.score);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pad = 3;
    const usable = height - pad * 2;

    // A single close has no line to draw — it is rendered as a flat mid-line.
    const coords = history.map((p, i) => {
      const x = history.length === 1 ? width / 2 : (i / (history.length - 1)) * width;
      const y = pad + (1 - (p.score - min) / span) * usable;
      return { x, y };
    });

    const path = history.length === 1
      ? `M 0 ${height / 2} L ${width} ${height / 2}`
      : `M ${coords.map((c) => `${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(' L ')}`;
    const area = history.length === 1
      ? ''
      : `${path} L ${width} ${height} L 0 ${height} Z`;

    return { path, area, min, max, first: values[0], last: values[values.length - 1] };
  }, [history, height, width]);

  if (!geometry) return <div style={{ width, height }} aria-hidden />;

  const rising = geometry.last > geometry.first;
  const falling = geometry.last < geometry.first;
  const stroke = rising ? '#34d399' : falling ? '#f87171' : 'rgba(255,255,255,0.32)';
  const fill = rising ? 'rgba(52,211,153,0.13)' : falling ? 'rgba(248,113,113,0.11)' : 'rgba(255,255,255,0.05)';
  const gradientId = `tg-${Math.abs(geometry.first)}-${history.length}-${rising ? 'u' : falling ? 'd' : 'f'}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden
      preserveAspectRatio="none" className="shrink-0 overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
      {showAxis && (
        <line x1="0" y1={height - 0.5} x2={width} y2={height - 0.5} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      )}
      {geometry.area && <path d={geometry.area} fill={`url(#${gradientId})`} />}
      <path d={geometry.path} fill="none" stroke={stroke} strokeWidth="1.75"
        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ─── vote control ──────────────────────────────────────────────────────── */
function VoteStack({
  trend, busy, onVote,
}: {
  trend: TrendView; busy: boolean; onVote: (direction: 1 | -1) => void;
}) {
  const base =
    'flex h-7 w-7 items-center justify-center rounded-[9px] border transition disabled:cursor-not-allowed disabled:opacity-50';
  const idle = 'border-white/[0.09] bg-white/[0.04] text-white/40 hover:text-white/80 hover:bg-white/[0.08]';
  const up = 'border-emerald-400/30 bg-emerald-400/[0.13] text-emerald-300';
  const down = 'border-rose-400/30 bg-rose-400/[0.13] text-rose-300';

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <button type="button" disabled={busy} onClick={() => onVote(1)}
        aria-pressed={trend.myVote === 1} aria-label={`Push ${trend.title} up`}
        className={`${base} ${trend.myVote === 1 ? up : idle}`}>
        <ChevronUp className="h-4 w-4" />
      </button>
      <span className="min-w-[24px] text-center text-[13px] font-bold tabular-nums text-white/80">
        {trend.score}
      </span>
      <button type="button" disabled={busy} onClick={() => onVote(-1)}
        aria-pressed={trend.myVote === -1} aria-label={`Push ${trend.title} down`}
        className={`${base} ${trend.myVote === -1 ? down : idle}`}>
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ─── one row ───────────────────────────────────────────────────────────── */
function TrendRow({
  trend, rank, busy, onVote, expanded,
}: {
  trend: TrendView; rank: number; busy: boolean; onVote: (direction: 1 | -1) => void; expanded: boolean;
}) {
  const rising = trend.change > 0;
  const falling = trend.change < 0;
  const moveColour = rising ? 'text-emerald-300' : falling ? 'text-rose-300' : 'text-white/32';
  const MoveIcon = rising ? TrendingUp : falling ? TrendingDown : null;

  return (
    <li className="flex items-center gap-3 border-t border-white/[0.05] px-4 py-3.5 first:border-t-0">
      <span className="w-5 shrink-0 text-[12px] font-bold tabular-nums text-white/22">{rank}</span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold text-white/85">{trend.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-[3px] text-[10.5px] font-medium text-white/40">
            {trend.category}
          </span>
          <span className={`inline-flex items-center gap-1 text-[11.5px] font-semibold tabular-nums ${moveColour}`}>
            {MoveIcon && <MoveIcon className="h-3 w-3" />}
            {trend.change > 0 ? '+' : ''}{trend.change}
            {trend.changePercent !== null && <span className="text-white/25">({trend.changePercent}%)</span>}
          </span>
          <span className="text-[11.5px] text-white/22">
            {trend.voterCount} {trend.voterCount === 1 ? 'voter' : 'voters'}
          </span>
        </div>
        {expanded && trend.description && (
          <p className="mt-2 text-[12.5px] leading-relaxed text-white/45">{trend.description}</p>
        )}
      </div>

      <TrendChart history={trend.history} width={expanded ? 132 : 84} height={expanded ? 46 : 38} showAxis={expanded} />
      <VoteStack trend={trend} busy={busy} onVote={onVote} />
    </li>
  );
}

/* ─── board ─────────────────────────────────────────────────────────────── */
export default function TrendsBoard({ variant = 'home' }: { variant?: 'home' | 'full' }) {
  const { status } = useSession();
  const full = variant === 'full';

  const [trends, setTrends] = useState<TrendView[] | null>(null);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/trends', { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      setTrends(Array.isArray(data?.trends) ? data.trends : []);
    } catch {
      setTrends([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(''), 3200);
    return () => clearTimeout(timer);
  }, [error]);

  const vote = async (trend: TrendView, direction: 1 | -1) => {
    if (status !== 'authenticated') { setError('Sign in to vote on trends.'); return; }
    setBusyId(trend.id);
    setError('');
    try {
      const response = await fetch(`/api/trends/${trend.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Unable to record that vote.');
      // The server owns the totals; the row is replaced with what it returned.
      setTrends((current) => (current ?? []).map((t) => (t.id === trend.id ? data.trend : t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to record that vote.');
    } finally {
      setBusyId('');
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (status !== 'authenticated') { setError('Sign in to add a trend.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category, description }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Unable to add this trend.');
      setTitle(''); setDescription(''); setAdding(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to add this trend.');
    } finally {
      setSubmitting(false);
    }
  };

  const visible = useMemo(() => {
    const list = trends ?? [];
    return full ? list : list.slice(0, 5);
  }, [trends, full]);

  return (
    <section aria-label="Trends" className="w-full min-w-0">
      {/* ── Heading ──────────────────────────────────────────────────────── */}
      <div className="mb-2.5 flex items-center gap-2">
        <span className="h-3.5 w-[3px] shrink-0 rounded-full bg-amber-400/60" aria-hidden />
        <h2 className="text-[15px] font-bold tracking-[-0.01em] text-white/85">Trends</h2>
        <span className="hidden text-[12px] text-white/28 sm:inline">· what the market is talking about</span>

        <div className="ml-auto flex items-center gap-2">
          {status === 'authenticated' && (
            <button type="button" onClick={() => setAdding((open) => !open)}
              aria-expanded={adding}
              className="inline-flex h-8 items-center gap-1.5 rounded-[11px] border border-white/[0.10] bg-white/[0.05] px-3 text-[12px] font-semibold text-white/60 transition hover:bg-white/[0.09] hover:text-white/90">
              {adding ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {adding ? 'Cancel' : 'Add trend'}
            </button>
          )}
          {!full && (
            <Link href="/trends"
              className="inline-flex h-8 items-center gap-1.5 rounded-[11px] border border-white/[0.10] bg-white/[0.05] px-3 text-[12px] font-semibold text-white/60 transition hover:bg-white/[0.09] hover:text-white/90">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* ── Add form ─────────────────────────────────────────────────────── */}
      {adding && status === 'authenticated' && (
        <form onSubmit={submit} className={`mb-2.5 flex flex-col gap-2.5 p-4 ${CARD}`}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required
            placeholder="What's trending? e.g. AI hiring in fintech" className={INPUT} aria-label="Trend name" />
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className={`${INPUT} sm:max-w-[190px]`} aria-label="Category">
              {CATEGORIES.map((c) => <option key={c} value={c} className="bg-[#111114]">{c}</option>)}
            </select>
            <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={240}
              placeholder="Add context (optional)" className={INPUT} aria-label="Description" />
          </div>
          <div className="flex items-center gap-2.5">
            <button type="submit" disabled={submitting || title.trim().length < 3}
              className="inline-flex h-9 items-center gap-1.5 rounded-[11px] bg-amber-400 px-4 text-[12.5px] font-bold text-[#0A0A0C] transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-55">
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flame className="h-3.5 w-3.5" />}
              Push it live
            </button>
            <span className="text-[11.5px] text-white/25">Your trend starts at +1 — your own vote.</span>
          </div>
        </form>
      )}

      {error && (
        <p role="status" className="mb-2.5 rounded-[12px] border border-rose-400/25 bg-rose-400/[0.07] px-3.5 py-2.5 text-[12.5px] font-medium text-rose-200/90">
          {error}
        </p>
      )}

      {/* ── Board ────────────────────────────────────────────────────────── */}
      <div className={`overflow-hidden ${CARD}`}>
        {trends === null ? (
          <div className="flex items-center gap-2 px-4 py-8 text-[12.5px] text-white/28">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading trends…
          </div>
        ) : visible.length === 0 ? (
          <div className="px-4 py-9 text-center">
            <p className="text-[13.5px] font-semibold text-white/55">No trends yet</p>
            <p className="mx-auto mt-1.5 max-w-[300px] text-[12.5px] leading-relaxed text-white/30">
              {status === 'authenticated'
                ? 'Add the first one and the community decides how far it climbs.'
                : 'Sign in to add the first trend and start voting.'}
            </p>
          </div>
        ) : (
          <ul>
            {visible.map((trend, index) => (
              <TrendRow key={trend.id} trend={trend} rank={index + 1} expanded={full}
                busy={busyId === trend.id} onVote={(direction) => vote(trend, direction)} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
