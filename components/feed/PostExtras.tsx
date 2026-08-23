'use client';

/**
 * Shared feed post extras: the chart renderer and the publisher CTA button.
 *
 * Extracted so BOTH the homepage feed (PublicHomepage) and the Published/Feed
 * page (PublishedPage) render a chart post identically — the chart is CONTENT
 * inside the normal post card, not a replacement for it. Previously only
 * PublishedPage had these, and it rendered charts in a standalone card with no
 * author/engagement while the homepage showed the raw chart body text.
 *
 * No chart library — hand-rolled SVG/flex, width-relative so it fills any card
 * without a measured container, theme-aware colours.
 */

import { isInternalCtaUrl } from '@/lib/cta';

export type ChartKind = 'bar' | 'line' | 'pie';
export interface ParsedChart { type: ChartKind; points: Array<{ label: string; value: number }>; }

/**
 * Parse the chart the composer serialised into the post body.
 *
 * The composer writes plain text lines:
 *   Chart: <title>
 *   Type: bar | line | pie
 *   Labels: A,B,C
 *   Values: 40,65,30
 * (a two-chart post separates blocks with a line of "==="; the first is used).
 *
 * Everything here is defensive: a missing/empty/mismatched/ non-numeric body
 * yields null, and the card falls back to its old rendering rather than
 * throwing. Only as many pairs as BOTH arrays supply are kept.
 */
export function parseChartBody(body: string): ParsedChart | null {
  if (!body) return null;
  const block = body.split(/^\s*===\s*$/m)[0] ?? body;
  const line = (key: string) => {
    const m = block.match(new RegExp('^\\s*' + key + '\\s*:\\s*(.+)$', 'im'));
    return m ? m[1].trim() : '';
  };
  const rawType = line('Type').toLowerCase();
  const type: ChartKind = rawType === 'line' ? 'line' : rawType === 'pie' ? 'pie' : 'bar';
  const labels = line('Labels').split(',').map((x) => x.trim()).filter(Boolean);
  const values = line('Values').split(',').map((x) => x.trim());
  if (!labels.length || !values.length) return null;
  const n = Math.min(labels.length, values.length);
  const points: Array<{ label: string; value: number }> = [];
  for (let i = 0; i < n; i++) {
    const v = Number(values[i].replace(/[^0-9.\-]/g, ''));
    if (!Number.isFinite(v)) continue;
    points.push({ label: labels[i], value: v });
  }
  return points.length ? { type, points } : null;
}

/* A small, theme-aware palette for pie slices / series accents. Emerald-led to
   match the existing chart card's accent. */
export const CHART_COLORS = ['#34d399', '#60a5fa', '#f59e0b', '#f472b6', '#a78bfa', '#22d3ee', '#fb7185', '#4ade80'];

export function ChartView({ chart }: { chart: ParsedChart }) {
  const { type, points } = chart;
  const max = Math.max(...points.map((p) => p.value), 1);
  const min = Math.min(...points.map((p) => p.value), 0);

  if (type === 'pie') {
    const total = points.reduce((sum, p) => sum + Math.max(0, p.value), 0) || 1;
    let acc = 0;
    const R = 16, C = 2 * Math.PI * R;
    return (
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 40 40" className="h-24 w-24 shrink-0 -rotate-90" role="img" aria-label="Pie chart">
          {points.map((p, i) => {
            const frac = Math.max(0, p.value) / total;
            const dash = `${frac * C} ${C}`;
            const el = (
              <circle key={i} cx="20" cy="20" r={R} fill="none"
                stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth="8"
                strokeDasharray={dash} strokeDashoffset={-acc * C} />
            );
            acc += frac;
            return el;
          })}
        </svg>
        <ul className="min-w-0 flex-1 space-y-1">
          {points.map((p, i) => (
            <li key={i} className="flex items-center gap-2 text-[10.5px]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="min-w-0 flex-1 truncate text-white/55">{p.label}</span>
              <span className="shrink-0 font-bold tabular-nums text-white/80">{p.value}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (type === 'line') {
    const span = max - min || 1;
    const stepX = points.length > 1 ? 100 / (points.length - 1) : 0;
    const xy = (i: number, v: number) => [
      points.length > 1 ? i * stepX : 50,
      100 - ((v - min) / span) * 100,
    ] as const;
    const path = points.map((p, i) => { const [x, y] = xy(i, p.value); return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`; }).join(' ');
    return (
      <div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-28 w-full" role="img" aria-label="Line chart">
          <polyline points="0,100 100,100" stroke="rgba(255,255,255,0.10)" strokeWidth="0.6" fill="none" />
          <path d={path} fill="none" stroke={CHART_COLORS[0]} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => { const [x, y] = xy(i, p.value); return <circle key={i} cx={x} cy={y} r="1.4" fill={CHART_COLORS[0]} vectorEffect="non-scaling-stroke" />; })}
        </svg>
        <div className="mt-1.5 flex justify-between gap-1 text-[9px] text-white/35">
          {points.map((p, i) => <span key={i} className="min-w-0 flex-1 truncate text-center">{p.label}</span>)}
        </div>
      </div>
    );
  }

  /* bar */
  return (
    <div className="space-y-1.5">
      {points.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-20 shrink-0 truncate text-[9.5px] text-white/40">{p.label}</span>
          <div className="flex-1 h-4 rounded-full bg-white/[0.04] overflow-hidden">
            <div className="h-full rounded-full" style={{
              width: `${(Math.max(0, p.value) / max) * 100}%`,
              background: `linear-gradient(90deg, ${CHART_COLORS[i % CHART_COLORS.length]}cc, ${CHART_COLORS[i % CHART_COLORS.length]}88)`,
            }} />
          </div>
          <span className="w-12 shrink-0 text-right text-[9.5px] font-bold tabular-nums text-white/70">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── thread card — instagram-style ─────────────────────────────── */

/**
 * Publisher CTA, shared by every feed card. Renders nothing when absent, stops
 * the click from bubbling into the card\'s own navigation, opens external links
 * in a new tab and navigates internal ones in place. Must sit OUTSIDE the
 * card\'s main <Link> so we never nest <a> inside <a> (that caused a hydration
 * warning).
 */
export function PostCtaButton({
  cta,
  category = 'post',
  surface = 'feed',
}: {
  cta?: { label: string; url: string } | null;
  category?: string;
  surface?: string;
}) {
  if (!cta?.url || !cta.label) return null;
  const track = () => {
    try {
      const raw = localStorage.getItem('pub_cta_analytics') || '{}';
      const data = JSON.parse(raw) as Record<string, Record<string, number>>;
      data[category] ??= {};
      data[category].post_cta = (data[category].post_cta ?? 0) + 1;
      localStorage.setItem('pub_cta_analytics', JSON.stringify(data));
    } catch { /* analytics is best-effort */ }
    void fetch('/api/telemetry/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'cta_click', ctaId: 'post_cta', category, surface }),
    }).catch(() => {});
  };
  return (
    <div className="mt-3">
      <a
        href={cta.url}
        onClick={(e) => { e.stopPropagation(); track(); }}
        {...(isInternalCtaUrl(cta.url) ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
        aria-label={cta.label}
        className="inline-flex max-w-full items-center gap-2 rounded-[12px] border border-white/[0.14] bg-white/[0.08] px-4 py-2.5 text-[13px] font-semibold text-white/90 transition duration-150 hover:border-white/[0.22] hover:bg-white/[0.13] hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <span className="min-w-0 break-words">{cta.label}</span>
        <span aria-hidden className="shrink-0">&rarr;</span>
      </a>
    </div>
  );
}
